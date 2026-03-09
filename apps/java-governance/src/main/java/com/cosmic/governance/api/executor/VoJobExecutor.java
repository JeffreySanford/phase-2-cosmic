package com.cosmic.governance.api.executor;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.cosmic.governance.api.service.GovernanceRuntimeMetricsService;
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
    private final GovernanceRuntimeMetricsService governanceRuntimeMetricsService;

    public VoJobExecutor(@Autowired RedisMarshaller marshaller,
                         @Autowired ObjectMapper objectMapper,
                         @Autowired GovernanceRuntimeMetricsService governanceRuntimeMetricsService) {
        this.marshaller = marshaller;
        this.objectMapper = objectMapper;
        this.governanceRuntimeMetricsService = governanceRuntimeMetricsService;
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
            writeRedisValue(jobKey, redisTemplate, r);
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
                String content = objectMapper.writeValueAsString(result);
                Files.writeString(file, content);
                recordObjectWrite("artifact-file", artifactName, "vo", content);

                String artKey = jobKey + ":artifacts";
                var artifact = Map.of(
                    "name", artifactName,
                    "url", "/api/v1/jobs/" + r.getJobId() + "/artifacts/" + artifactName
                );
                writeRedisValue(artKey, redisTemplate, artifact);

                // Transition to COMPLETED
                r = reload(jobKey, redisTemplate);
                if (r == null) return;
                Instant completedAt = Instant.now();
                Duration runtime = durationBetween(r.getUpdatedAt(), completedAt);
                r.setState(JobState.COMPLETED);
                r.setUpdatedAt(completedAt.toString());
                r.setVersion(r.getVersion() + 1);
                writeRedisValue(jobKey, redisTemplate, r);
                recordTerminalState(r.getWorkflow(), "vo", JobState.COMPLETED, runtime);
                pushLog(jobKey, redisTemplate, "VO executor: completed " + workflow
                    + " — " + fieldsSummary(result));

            } catch (Exception e) {
                pushLog(jobKey, redisTemplate, "VO executor: error — " + e.getMessage());
                JobRecord failed = reload(jobKey, redisTemplate);
                if (failed != null) {
                    Instant failedAt = Instant.now();
                    Duration runtime = durationBetween(failed.getUpdatedAt(), failedAt);
                    failed.setState(JobState.FAILED);
                    failed.setUpdatedAt(failedAt.toString());
                    failed.setVersion(failed.getVersion() + 1);
                    writeRedisValue(jobKey, redisTemplate, failed);
                    recordTerminalState(failed.getWorkflow(), "vo", JobState.FAILED, runtime);
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

        String body = httpGet("adql_query", url, Map.of("tapUrl", tapUrl, "limit", limit));
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
        String body = httpGet("obscore_search", url, params);
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
        String body = httpGet("cone_search", url, params);
        return parseVotable(body);
    }

    // ── VOTable direct fetch ──────────────────────────────────────────────────

    private Map<String, Object> runVotableFetch(Map<String, Object> params,
                                                String jobKey, RedisTemplate<String, Object> rt)
            throws Exception {
        String votableUrl = str(params, "votableUrl");
        pushLog(jobKey, rt, "VO/VOTable fetch → " + votableUrl);
        String body = httpGet("votable_fetch", votableUrl, params);
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
        String body = httpGet("datalink_resolve", url, params);
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
        recordExternalAdapterRequest("product_fetch", productUrl, params, true, null, Duration.ZERO);
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

        recordExternalAdapterRequest("soda_cutout", sb.toString(), params, true, null, Duration.ZERO);
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
        recordExternalAdapterRequest("preview_fetch", previewUrl, params, true, null, Duration.ZERO);
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

    private String httpGet(String operation, String url, Object payload) throws Exception {
        Instant startedAt = Instant.now();
        HttpClient client = HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .build();
        HttpRequest req = HttpRequest.newBuilder()
                .uri(URI.create(url))
                .timeout(Duration.ofSeconds(TIMEOUT_SECONDS))
                .GET()
                .build();
        try {
            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
            Duration duration = Duration.between(startedAt, Instant.now());
            if (resp.statusCode() >= 400) {
                recordExternalAdapterRequest(operation, url, payload, false, httpErrorClass(resp.statusCode()), duration);
                throw new RuntimeException("HTTP " + resp.statusCode() + " from " + url);
            }
            recordExternalAdapterRequest(operation, url, payload, true, null, duration);
            return resp.body();
        } catch (Exception ex) {
            recordExternalAdapterRequest(operation, url, payload, false, externalErrorClass(ex), Duration.between(startedAt, Instant.now()));
            throw ex;
        }
    }

    // ── Utility helpers ───────────────────────────────────────────────────────

    private JobRecord reload(String jobKey, RedisTemplate<String, Object> rt) {
        Instant startedAt = Instant.now();
        Object o = rt.opsForValue().get(jobKey);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisRead("redis", keyspaceOf(jobKey), o, true, Duration.between(startedAt, Instant.now()));
        }
        return marshaller.toJobRecord(o);
    }

    private void pushLog(String jobKey, RedisTemplate<String, Object> rt, String msg) {
        Instant startedAt = Instant.now();
        rt.opsForList().rightPush(jobKey + ":logs", msg);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisWrite("redis", keyspaceOf(jobKey + ":logs"), msg, true, Duration.between(startedAt, Instant.now()));
        }
    }

    private void writeRedisValue(String key, RedisTemplate<String, Object> rt, Object value) {
        Instant startedAt = Instant.now();
        rt.opsForValue().set(key, value);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisWrite("redis", keyspaceOf(key), value, true, Duration.between(startedAt, Instant.now()));
        }
    }

    private void recordObjectWrite(String storage, String objectKind, String executor, Object payload) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordObjectWrite(storage, objectKind, executor, payload);
        }
    }

    private void recordExternalAdapterRequest(
            String operation,
            String target,
            Object payload,
            boolean success,
            String errorClass,
            Duration duration
    ) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordExternalAdapterRequest(
                    "vo",
                    operation,
                    target,
                    payload,
                    success,
                    errorClass,
                    duration
            );
        }
    }

    private void recordTerminalState(String workflow, String executor, JobState state, Duration runtime) {
        if (governanceRuntimeMetricsService == null) {
            return;
        }
        governanceRuntimeMetricsService.recordJobTerminalState(workflow, executor, state.name(), runtime);
        governanceRuntimeMetricsService.recordWorkflowRuntime(workflow, executor, state.name(), runtime);
    }

    private Duration durationBetween(String startedAt, Instant finishedAt) {
        try {
            return Duration.between(Instant.parse(startedAt), finishedAt);
        } catch (Exception ex) {
            return Duration.ZERO;
        }
    }

    private String keyspaceOf(String key) {
        if (key == null || key.isBlank()) {
            return "unknown";
        }
        int idx = key.indexOf(':');
        return idx > 0 ? key.substring(0, idx) : key;
    }

    private String httpErrorClass(int statusCode) {
        if (statusCode >= 500) {
            return "http_5xx";
        }
        if (statusCode >= 400) {
            return "http_4xx";
        }
        return "http_other";
    }

    private String externalErrorClass(Exception ex) {
        if (ex == null) {
            return "unknown";
        }
        String simple = ex.getClass().getSimpleName();
        return switch (simple) {
            case "HttpTimeoutException" -> "timeout";
            case "ConnectException" -> "connect";
            case "IllegalArgumentException" -> "invalid_request";
            default -> simple == null || simple.isBlank() ? "unknown" : simple;
        };
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
