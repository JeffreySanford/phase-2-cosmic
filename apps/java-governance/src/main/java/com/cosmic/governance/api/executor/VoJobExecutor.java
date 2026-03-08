package com.cosmic.governance.api.executor;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.cosmic.governance.api.util.RedisMarshaller;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

import javax.xml.parsers.DocumentBuilderFactory;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.time.Duration;
import java.time.Instant;
import java.util.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;

/**
 * Executor for all {@code vo.*} workflow families.
 * Dispatches to the appropriate VO/IVOA protocol based on the job workflow type,
 * parses the response into a {@code {fields, rows, links}} JSON artifact, and
 * transitions the job through RUNNING → COMPLETED (or FAILED).
 */
@Service
public class VoJobExecutor implements JobExecutor {

    private static final ScheduledExecutorService EXEC = Executors.newScheduledThreadPool(2);
    private static final int TIMEOUT_SECONDS = 30;

    private final RedisMarshaller marshaller;
    private final ObjectMapper objectMapper;

    public VoJobExecutor(@Autowired RedisMarshaller marshaller,
                         @Autowired ObjectMapper objectMapper) {
        this.marshaller = marshaller;
        this.objectMapper = objectMapper;
    }

    @Override
    public String name() {
        return "vo";
    }

    @Override
    public void execute(JobRecord record, RedisTemplate<String, Object> redisTemplate) {
        String jobKey = "job:" + record.getJobId();
        String workflow = record.getWorkflow();

        // Transition to RUNNING immediately
        EXEC.schedule(() -> {
            JobRecord r = reload(jobKey, redisTemplate);
            if (r == null) return;
            r.setState(JobState.RUNNING);
            r.setUpdatedAt(Instant.now().toString());
            r.setVersion(r.getVersion() + 1);
            var params = mutableParams(r);
            params.put("executor", name());
            r.setParameters(params);
            redisTemplate.opsForValue().set(jobKey, r);
            pushLog(jobKey, redisTemplate, "VO executor: starting " + workflow);
        }, 1, TimeUnit.SECONDS);

        // Execute asynchronously and write artifact on completion
        EXEC.schedule(() -> {
            JobRecord r = reload(jobKey, redisTemplate);
            if (r == null) return;
            try {
                Map<String, Object> params = r.getParameters() == null ? Map.of() : r.getParameters();
                Map<String, Object> result = dispatch(workflow, params, jobKey, redisTemplate);

                // Write result.json artifact
                String artifactName = "result.json";
                Path base = Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", r.getJobId());
                Files.createDirectories(base);
                Path file = base.resolve(artifactName);
                Files.writeString(file, objectMapper.writeValueAsString(result));

                String artKey = jobKey + ":artifacts";
                var artifact = Map.of(
                    "name", artifactName,
                    "url", "/api/v1/jobs/" + r.getJobId() + "/artifacts/" + artifactName
                );
                redisTemplate.opsForValue().set(artKey, artifact);

                // Transition to COMPLETED
                r = reload(jobKey, redisTemplate);
                if (r == null) return;
                r.setState(JobState.COMPLETED);
                r.setUpdatedAt(Instant.now().toString());
                r.setVersion(r.getVersion() + 1);
                redisTemplate.opsForValue().set(jobKey, r);
                pushLog(jobKey, redisTemplate, "VO executor: completed " + workflow
                    + " — " + fieldsSummary(result));

            } catch (Exception e) {
                pushLog(jobKey, redisTemplate, "VO executor: error — " + e.getMessage());
                JobRecord failed = reload(jobKey, redisTemplate);
                if (failed != null) {
                    failed.setState(JobState.FAILED);
                    failed.setUpdatedAt(Instant.now().toString());
                    failed.setVersion(failed.getVersion() + 1);
                    redisTemplate.opsForValue().set(jobKey, failed);
                }
            }
        }, 3, TimeUnit.SECONDS);
    }

    // ── Dispatch by workflow type ─────────────────────────────────────────────

    private Map<String, Object> dispatch(String workflow, Map<String, Object> params,
                                         String jobKey, RedisTemplate<String, Object> rt)
            throws Exception {
        return switch (workflow) {
            case "vo.adql.query"      -> runAdql(params, jobKey, rt);
            case "vo.obscore.search"  -> runObscore(params, jobKey, rt);
            case "vo.cone-search"     -> runConeSearch(params, jobKey, rt);
            case "vo.votable.fetch"   -> runVotableFetch(params, jobKey, rt);
            case "vo.datalink.resolve"-> runDatalink(params, jobKey, rt);
            case "vo.product.fetch"   -> runProductFetch(params, jobKey, rt);
            case "vo.soda.cutout"     -> runSodaCutout(params, jobKey, rt);
            case "vo.preview.fetch"   -> runPreviewFetch(params, jobKey, rt);
            default -> {
                pushLog(jobKey, rt, "VO executor: unknown workflow '" + workflow + "', returning stub");
                yield stub(workflow);
            }
        };
    }

    // ── ADQL via TAP sync ────────────────────────────────────────────────────

    private Map<String, Object> runAdql(Map<String, Object> params,
                                        String jobKey, RedisTemplate<String, Object> rt)
            throws Exception {
        String tapUrl = str(params, "tapUrl");
        String adql   = str(params, "adql");
        int    limit  = intOrDefault(params, "limit", 100);
        pushLog(jobKey, rt, "VO/TAP ADQL query → " + tapUrl);

        String queryAdql = adql.contains("TOP") ? adql : adql.replaceFirst("(?i)SELECT", "SELECT TOP " + limit);
        String url = tapUrl + "?REQUEST=doQuery&LANG=ADQL&FORMAT=votable"
            + "&QUERY=" + URLEncoder.encode(queryAdql, StandardCharsets.UTF_8);

        String body = httpGet(url);
        return parseVotable(body);
    }

    // ── ObsCore via TAP sync ──────────────────────────────────────────────────

    private Map<String, Object> runObscore(Map<String, Object> params,
                                           String jobKey, RedisTemplate<String, Object> rt)
            throws Exception {
        String tapUrl = str(params, "tapUrl");
        int limit = intOrDefault(params, "limit", 100);
        pushLog(jobKey, rt, "VO/ObsCore search → " + tapUrl);

        StringBuilder adql = new StringBuilder("SELECT TOP " + limit + " * FROM ivoa.obscore WHERE 1=1");
        if (params.containsKey("dataproductType"))
            adql.append(" AND dataproduct_type='").append(params.get("dataproductType")).append("'");
        if (params.containsKey("spatialBoundsRa") && params.containsKey("spatialBoundsDec")
                && params.containsKey("spatialBoundsRadius")) {
            adql.append(" AND 1=CONTAINS(POINT('ICRS',s_ra,s_dec),CIRCLE('ICRS',")
                .append(params.get("spatialBoundsRa")).append(",")
                .append(params.get("spatialBoundsDec")).append(",")
                .append(params.get("spatialBoundsRadius")).append("))");
        }
        if (params.containsKey("spectralMin"))
            adql.append(" AND em_min>=").append(params.get("spectralMin"));
        if (params.containsKey("spectralMax"))
            adql.append(" AND em_max<=").append(params.get("spectralMax"));

        String url = tapUrl + "?REQUEST=doQuery&LANG=ADQL&FORMAT=votable"
            + "&QUERY=" + URLEncoder.encode(adql.toString(), StandardCharsets.UTF_8);
        String body = httpGet(url);
        return parseVotable(body);
    }

    // ── Simple cone search ────────────────────────────────────────────────────

    private Map<String, Object> runConeSearch(Map<String, Object> params,
                                              String jobKey, RedisTemplate<String, Object> rt)
            throws Exception {
        String serviceUrl = str(params, "serviceUrl");
        double ra     = doubleOrDefault(params, "ra", 0.0);
        double dec    = doubleOrDefault(params, "dec", 0.0);
        double radius = doubleOrDefault(params, "radius", 0.1);
        pushLog(jobKey, rt, "VO/ConeSearch → " + serviceUrl);

        String url = serviceUrl + "?RA=" + ra + "&DEC=" + dec + "&SR=" + radius + "&FORMAT=votable";
        String body = httpGet(url);
        return parseVotable(body);
    }

    // ── VOTable direct fetch ──────────────────────────────────────────────────

    private Map<String, Object> runVotableFetch(Map<String, Object> params,
                                                String jobKey, RedisTemplate<String, Object> rt)
            throws Exception {
        String votableUrl = str(params, "votableUrl");
        pushLog(jobKey, rt, "VO/VOTable fetch → " + votableUrl);
        String body = httpGet(votableUrl);
        return parseVotable(body);
    }

    // ── DataLink resolve ──────────────────────────────────────────────────────

    private Map<String, Object> runDatalink(Map<String, Object> params,
                                            String jobKey, RedisTemplate<String, Object> rt)
            throws Exception {
        String datalinkUrl = str(params, "datalinkUrl");
        String id          = str(params, "datasetIdentifier");
        pushLog(jobKey, rt, "VO/DataLink resolve → " + datalinkUrl);

        String url = datalinkUrl + "?ID=" + URLEncoder.encode(id, StandardCharsets.UTF_8);
        String body = httpGet(url);
        // DataLink response is VOTable; links point to access_url
        Map<String, Object> parsed = parseVotable(body);
        // Promote access_url column values into structured links list
        parsed.put("links", extractDatalinkLinks(parsed));
        return parsed;
    }

    // ── Product fetch (metadata only — no binary download) ───────────────────

    private Map<String, Object> runProductFetch(Map<String, Object> params,
                                                String jobKey, RedisTemplate<String, Object> rt) {
        String productUrl = str(params, "productUrl");
        String mimeType   = (String) params.getOrDefault("expectedMimeType", "application/octet-stream");
        pushLog(jobKey, rt, "VO/ProductFetch recorded → " + productUrl);
        // Record the product reference without downloading the binary payload
        Map<String, Object> result = new HashMap<>();
        result.put("fields", List.of("accessUrl", "mimeType", "retrievedAt"));
        result.put("rows",   List.of(List.of(productUrl, mimeType, Instant.now().toString())));
        result.put("links",  List.of(Map.of("accessUrl", productUrl, "semantics", "#this", "contentType", mimeType)));
        return result;
    }

    // ── SODA cutout ──────────────────────────────────────────────────────────

    private Map<String, Object> runSodaCutout(Map<String, Object> params,
                                              String jobKey, RedisTemplate<String, Object> rt)
            throws Exception {
        String sodaUrl = str(params, "sodaUrl");
        String id      = str(params, "datasetIdentifier");
        pushLog(jobKey, rt, "VO/SODA cutout → " + sodaUrl);

        StringBuilder sb = new StringBuilder(sodaUrl + "?ID=" + URLEncoder.encode(id, StandardCharsets.UTF_8));
        if (params.containsKey("spatialBoundsRa") && params.containsKey("spatialBoundsDec")
                && params.containsKey("spatialBoundsRadius")) {
            sb.append("&CIRCLE=").append(params.get("spatialBoundsRa")).append(" ")
              .append(params.get("spatialBoundsDec")).append(" ")
              .append(params.get("spatialBoundsRadius"));
        }
        if (params.containsKey("outputFormat"))
            sb.append("&FORMAT=").append(URLEncoder.encode(str(params, "outputFormat"), StandardCharsets.UTF_8));

        // SODA sync returns a binary product; we record the request as a product link
        Map<String, Object> result = new HashMap<>();
        result.put("fields", List.of("requestUrl", "format", "requestedAt"));
        result.put("rows",   List.of(List.of(sb.toString(),
                                             params.getOrDefault("outputFormat", "fits"),
                                             Instant.now().toString())));
        result.put("links",  List.of(Map.of("accessUrl", sb.toString(),
                                            "semantics", "#cutout",
                                            "contentType", "application/fits")));
        return result;
    }

    // ── Preview fetch ─────────────────────────────────────────────────────────

    private Map<String, Object> runPreviewFetch(Map<String, Object> params,
                                                String jobKey, RedisTemplate<String, Object> rt) {
        String previewUrl = str(params, "previewUrl");
        pushLog(jobKey, rt, "VO/PreviewFetch recorded → " + previewUrl);
        Map<String, Object> result = new HashMap<>();
        result.put("fields", List.of("previewUrl", "retrievedAt"));
        result.put("rows",   List.of(List.of(previewUrl, Instant.now().toString())));
        result.put("links",  List.of(Map.of("accessUrl", previewUrl,
                                            "semantics", "#preview",
                                            "contentType", "image/jpeg")));
        return result;
    }

    // ── VOTable XML parsing ───────────────────────────────────────────────────

    private Map<String, Object> parseVotable(String xml) throws Exception {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setNamespaceAware(true);
        // Disable external entity processing (XXE hardening)
        dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
        dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        Document doc = dbf.newDocumentBuilder()
                .parse(new java.io.ByteArrayInputStream(xml.getBytes(StandardCharsets.UTF_8)));

        // FIELD names
        List<String> fields = new ArrayList<>();
        NodeList fieldNodes = doc.getElementsByTagName("FIELD");
        for (int i = 0; i < fieldNodes.getLength(); i++) {
            Element f = (Element) fieldNodes.item(i);
            String name = f.getAttribute("name");
            if (name == null || name.isBlank()) name = f.getAttribute("ID");
            fields.add(name == null ? "" : name);
        }

        // TABLEDATA rows
        List<List<String>> rows = new ArrayList<>();
        NodeList trNodes = doc.getElementsByTagName("TR");
        for (int i = 0; i < trNodes.getLength(); i++) {
            Element tr = (Element) trNodes.item(i);
            NodeList tdNodes = tr.getElementsByTagName("TD");
            List<String> row = new ArrayList<>();
            for (int j = 0; j < tdNodes.getLength(); j++)
                row.add(tdNodes.item(j).getTextContent());
            if (!row.isEmpty()) rows.add(row);
        }

        // LINK hrefs + accessURL text nodes
        List<Map<String, String>> links = new ArrayList<>();
        NodeList linkNodes = doc.getElementsByTagName("LINK");
        for (int i = 0; i < linkNodes.getLength(); i++) {
            Element l = (Element) linkNodes.item(i);
            String href = l.getAttribute("href");
            if (href == null || href.isBlank()) href = l.getAttribute("xlink:href");
            if (href != null && !href.isBlank())
                links.add(Map.of("accessUrl", href, "semantics", "#link", "contentType", ""));
        }
        NodeList accessNodes = doc.getElementsByTagName("accessURL");
        for (int i = 0; i < accessNodes.getLength(); i++) {
            String text = accessNodes.item(i).getTextContent();
            if (text != null && !text.isBlank())
                links.add(Map.of("accessUrl", text.trim(), "semantics", "#access", "contentType", ""));
        }

        Map<String, Object> out = new HashMap<>();
        out.put("fields", fields);
        out.put("rows", rows);
        out.put("links", links);
        return out;
    }

    /** Promote row values under the 'access_url' column into the links list. */
    @SuppressWarnings("unchecked")
    private List<Map<String, String>> extractDatalinkLinks(Map<String, Object> parsed) {
        List<String> fields = (List<String>) parsed.getOrDefault("fields", List.of());
        List<List<String>> rows = (List<List<String>>) parsed.getOrDefault("rows", List.of());
        int urlIdx = -1, semIdx = -1, typeIdx = -1;
        for (int i = 0; i < fields.size(); i++) {
            String f = fields.get(i).toLowerCase();
            if (f.contains("access_url"))  urlIdx  = i;
            if (f.contains("semantics"))   semIdx  = i;
            if (f.contains("content_type") || f.contains("contenttype")) typeIdx = i;
        }
        List<Map<String, String>> links = new ArrayList<>();
        if (urlIdx < 0) return links;
        for (List<String> row : rows) {
            if (urlIdx >= row.size()) continue;
            String url  = row.get(urlIdx);
            String sem  = semIdx  >= 0 && semIdx  < row.size() ? row.get(semIdx)  : "#this";
            String type = typeIdx >= 0 && typeIdx < row.size() ? row.get(typeIdx) : "";
            if (url != null && !url.isBlank())
                links.add(Map.of("accessUrl", url, "semantics", sem, "contentType", type));
        }
        return links;
    }

    // ── HTTP helper ───────────────────────────────────────────────────────────

    private String httpGet(String url) throws Exception {
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .build();
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .GET()
                .build();
        HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
        if (resp.statusCode() >= 400)
            throw new RuntimeException("HTTP " + resp.statusCode() + " from " + url);
        return resp.body();
    }

    // ── Utility helpers ───────────────────────────────────────────────────────

    private JobRecord reload(String jobKey, RedisTemplate<String, Object> rt) {
        Object o = rt.opsForValue().get(jobKey);
        return marshaller.toJobRecord(o);
    }

    private void pushLog(String jobKey, RedisTemplate<String, Object> rt, String msg) {
        rt.opsForList().rightPush(jobKey + ":logs", msg);
    }

    private Map<String, Object> mutableParams(JobRecord r) {
        return r.getParameters() == null ? new HashMap<>() : new HashMap<>(r.getParameters());
    }

    private String str(Map<String, Object> params, String key) {
        Object v = params.get(key);
        return v == null ? "" : v.toString();
    }

    private int intOrDefault(Map<String, Object> params, String key, int def) {
        Object v = params.get(key);
        if (v == null) return def;
        try { return Integer.parseInt(v.toString()); } catch (NumberFormatException e) { return def; }
    }

    private double doubleOrDefault(Map<String, Object> params, String key, double def) {
        Object v = params.get(key);
        if (v == null) return def;
        try { return Double.parseDouble(v.toString()); } catch (NumberFormatException e) { return def; }
    }

    @SuppressWarnings("unchecked")
    private String fieldsSummary(Map<String, Object> result) {
        Object fields = result.get("fields");
        Object rows   = result.get("rows");
        int fc = fields instanceof List ? ((List<?>) fields).size() : 0;
        int rc = rows   instanceof List ? ((List<?>) rows).size()   : 0;
        return fc + " fields, " + rc + " rows";
    }

    private Map<String, Object> stub(String workflow) {
        Map<String, Object> result = new HashMap<>();
        result.put("fields", List.of("note"));
        result.put("rows",   List.of(List.of("No executor for " + workflow)));
        result.put("links",  List.of());
        return result;
    }
}
