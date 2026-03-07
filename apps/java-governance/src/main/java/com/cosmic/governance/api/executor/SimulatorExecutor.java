package com.cosmic.governance.api.executor;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import java.time.Instant;
import java.util.Map;
import java.util.ArrayList;
import java.util.HashMap;
import java.time.Duration;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URI;
import java.io.StringReader;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.NodeList;
import org.w3c.dom.Element;
import org.xml.sax.InputSource;
import org.springframework.beans.factory.annotation.Value;
import java.util.UUID;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Service;
import com.cosmic.governance.api.util.RedisMarshaller;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class SimulatorExecutor implements JobExecutor {
    private static final ScheduledExecutorService EXEC = Executors.newScheduledThreadPool(2);
    private final RedisMarshaller marshaller;
    @Value("${executor.network.enabled:false}")
    private boolean networkEnabled = false;

    public SimulatorExecutor(@Autowired RedisMarshaller marshaller) {
        this.marshaller = marshaller;
    }

    @Override
    public String name() { return "simulator"; }

    @Override
    public void execute(JobRecord record, RedisTemplate<String, Object> redisTemplate) {
        String jobKey = "job:" + record.getJobId();
        int complexity = complexity(record);
        int startDelaySeconds = Math.max(1, complexity);
        int completionDelaySeconds = Math.max(startDelaySeconds + 2, 2 + (complexity * 2));
        // schedule running
        EXEC.schedule(() -> {
            Object o = redisTemplate.opsForValue().get(jobKey);
            JobRecord r = null;
            r = marshaller.toJobRecord(o);
            if (r != null) {
                r.setState(JobState.RUNNING);
                r.setUpdatedAt(Instant.now().toString());
                r.setVersion(r.getVersion() + 1);
                var newParams = r.getParameters() == null ? new java.util.HashMap<String, Object>() : new java.util.HashMap<String, Object>(r.getParameters());
                newParams.put("externalJobId", "sim-" + UUID.randomUUID());
                newParams.put("executor", name());
                newParams.put("complexity", complexity);
                r.setParameters(newParams);
                redisTemplate.opsForValue().set(jobKey, r);
                // push a running log
                redisTemplate.opsForList().rightPush(jobKey + ":logs", "Simulator: job running (complexity=" + complexity + ")");
            }
        }, startDelaySeconds, TimeUnit.SECONDS);

        EXEC.schedule(() -> {
            Object o = redisTemplate.opsForValue().get(jobKey);
            JobRecord r2 = null;
            r2 = marshaller.toJobRecord(o);
            if (r2 != null) {
                r2.setState(JobState.COMPLETED);
                r2.setUpdatedAt(Instant.now().toString());
                r2.setVersion(r2.getVersion() + 1);
                var newParams = r2.getParameters() == null ? new java.util.HashMap<String, Object>() : new java.util.HashMap<String, Object>(r2.getParameters());
                newParams.put("completedAt", Instant.now().toString());
                r2.setParameters(newParams);
                redisTemplate.opsForValue().set(jobKey, r2);
                redisTemplate.opsForList().rightPush(jobKey + ":logs", "Simulator: job completed (complexity=" + complexity + ")");
                // create a small artifact marker and write a file to tmp artifact store
                String artKey = jobKey + ":artifacts";
                String name = "result.txt";
                var artifact = Map.of("name", name, "url", "/api/v1/jobs/" + r2.getJobId() + "/artifacts/" + name);
                redisTemplate.opsForValue().set(artKey, artifact);
                try {
                    java.nio.file.Path base = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", r2.getJobId());
                    java.nio.file.Files.createDirectories(base);
                    java.nio.file.Path file = base.resolve(name);
                    java.nio.file.Files.writeString(file, "Simulator artifact for job " + r2.getJobId() + "\nOK\n");
                } catch (Exception ignored) {}
                // Optionally perform VO/TAP harvesting when requested by job parameters
                try {
                    Map<String, Object> params = r2.getParameters();
                    boolean wantsHarvest = false;
                    if (params != null) {
                        Object hv = params.get("harvestVo");
                        if (hv instanceof Boolean) wantsHarvest = (Boolean) hv;
                        else if (hv != null) wantsHarvest = "true".equalsIgnoreCase(String.valueOf(hv));
                        if (params.containsKey("voQuery") || params.containsKey("externalSources")) wantsHarvest = true;
                    }
                    if (wantsHarvest) {
                        String jsonName = "external-sources.json";
                        Map<String,Object> external = null;
                        // If network calls are enabled, attempt real TAP/VOTable harvest
                        if (networkEnabled) {
                            try {
                                String tapUrl = params != null && params.get("tapUrl") != null ? String.valueOf(params.get("tapUrl")) : "https://heasarc.gsfc.nasa.gov/xamin";
                                String voQuery = params != null && params.get("voQuery") != null ? String.valueOf(params.get("voQuery")) : null;
                                if (voQuery == null) {
                                    // fallback simple example query for demonstration
                                    voQuery = "table=chanmaster&position=3c273&format=stream";
                                }
                                String fullUrl = tapUrl.endsWith("/") ? tapUrl + "query?" + voQuery : tapUrl + "/query?" + voQuery;
                                HttpClient hc = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();
                                HttpRequest req = HttpRequest.newBuilder().uri(URI.create(fullUrl)).timeout(Duration.ofSeconds(15)).GET().build();
                                HttpResponse<String> resp = hc.send(req, HttpResponse.BodyHandlers.ofString());
                                String body = resp.body();
                                java.util.List<String> sampleFields = new ArrayList<>();
                                java.util.List<Map<String,Object>> sampleRows = new ArrayList<>();
                                if (body != null && body.contains("<VOTABLE")) {
                                    // parse VOTable (simple DOM parse of first TABLE)
                                    Document doc = DocumentBuilderFactory.newInstance().newDocumentBuilder().parse(new InputSource(new StringReader(body)));
                                    NodeList fieldNodes = doc.getElementsByTagName("FIELD");
                                    for (int i=0;i<fieldNodes.getLength();i++) {
                                        Element f = (Element) fieldNodes.item(i);
                                        String fname = f.getAttribute("name");
                                        if (fname == null || fname.isBlank()) fname = f.getAttribute("ID");
                                        sampleFields.add(fname == null ? "col"+i : fname);
                                    }
                                    NodeList trNodes = doc.getElementsByTagName("TR");
                                    for (int i=0;i<trNodes.getLength() && i<5;i++) {
                                        Element tr = (Element) trNodes.item(i);
                                        NodeList td = tr.getElementsByTagName("TD");
                                        Map<String,Object> row = new HashMap<>();
                                        for (int j=0;j<td.getLength();j++) {
                                            String val = td.item(j).getTextContent();
                                            String key = j < sampleFields.size() ? sampleFields.get(j) : "col"+j;
                                            row.put(key, val);
                                        }
                                        sampleRows.add(row);
                                    }
                                } else {
                                    // assume stream format: header|col1|col2\nrows
                                    String[] lines = body.split("\\r?\\n");
                                    String header = null;
                                    for (String L : lines) {
                                        if (L == null) continue;
                                        String t = L.trim();
                                        if (t.isEmpty()) continue;
                                        if (t.startsWith("#")) continue;
                                        if (header == null) { header = t; continue; }
                                        // process a data line
                                        String[] parts = t.split("\\\\|");
                                        if (sampleFields.isEmpty() && header != null) {
                                            sampleFields.addAll(java.util.Arrays.asList(header.split("\\\\|")));
                                        }
                                        Map<String,Object> row = new HashMap<>();
                                        for (int j=0;j<parts.length;j++) {
                                            String key = j < sampleFields.size() ? sampleFields.get(j) : "col"+j;
                                            row.put(key, parts[j]);
                                        }
                                        sampleRows.add(row);
                                        if (sampleRows.size() >= 5) break;
                                    }
                                }
                                external = new HashMap<>();
                                external.put("name", jsonName);
                                external.put("url", "/api/v1/jobs/" + r2.getJobId() + "/artifacts/" + jsonName);
                                external.put("type", "external-source");
                                external.put("provider", params != null && params.get("provider") != null ? String.valueOf(params.get("provider")) : "vo-tap");
                                external.put("tapUrl", fullUrl);
                                external.put("citationUrl", tapUrl);
                                external.put("links", java.util.List.of(tapUrl));
                                external.put("sampleFields", sampleFields);
                                external.put("sampleRows", sampleRows);
                                // cache the harvested result for short TTL to reduce repeated TAP queries
                                try {
                                    if (redisTemplate != null) {
                                        String cacheKey = "vo:cache:" + java.util.Base64.getUrlEncoder().withoutPadding().encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(fullUrl.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
                                        redisTemplate.opsForValue().set(cacheKey, external);
                                        try { redisTemplate.expire(cacheKey, 300, java.util.concurrent.TimeUnit.SECONDS); } catch (Exception ignored) {}
                                    }
                                } catch (Exception ignored) {}
                            } catch (Exception ex) {
                                // network harvest failed; fall back to simulated payload below
                                external = null;
                            }
                        }
                        if (external == null) {
                            external = new HashMap<>();
                            external.put("name", jsonName);
                            external.put("url", "/api/v1/jobs/" + r2.getJobId() + "/artifacts/" + jsonName);
                            external.put("type", "external-source");
                            external.put(
                                "provider",
                                params != null && params.get("provider") != null
                                    ? String.valueOf(params.get("provider"))
                                    : "simulated-vo"
                            );
                            external.put(
                                "tapUrl",
                                params != null && params.get("tapUrl") != null
                                    ? String.valueOf(params.get("tapUrl"))
                                    : "https://heasarc.gsfc.nasa.gov/xamin"
                            );
                            external.put("citationUrl", "https://heasarc.gsfc.nasa.gov");
                            external.put("links", java.util.List.of("https://heasarc.gsfc.nasa.gov"));
                            external.put("sampleFields", java.util.List.of("ra", "dec", "obs_id", "title"));
                            external.put(
                                "sampleRows",
                                java.util.List.of(
                                    new HashMap<String, Object>(Map.of(
                                        "ra", 123.45,
                                        "dec", -22.1,
                                        "obs_id", "obs-001",
                                        "title", "Simulated Source A"
                                    )),
                                    new HashMap<String, Object>(Map.of(
                                        "ra", 124.12,
                                        "dec", -21.9,
                                        "obs_id", "obs-002",
                                        "title", "Simulated Source B"
                                    ))
                                )
                            );
                        }
                        // persist artifact map and write JSON file so API can serve content
                        String externalArtifactsKey = jobKey + ":artifacts";
                        try {
                            redisTemplate.opsForList().rightPush(externalArtifactsKey, external);
                        } catch (Exception ignored) {}
                        try {
                            java.nio.file.Path base = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", r2.getJobId());
                            java.nio.file.Files.createDirectories(base);
                            java.nio.file.Path file = base.resolve(jsonName);
                            com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                            java.nio.file.Files.writeString(file, om.writerWithDefaultPrettyPrinter().writeValueAsString(external));
                        } catch (Exception ignored) {}
                    }
                } catch (Exception ignored) {}
            }
        }, completionDelaySeconds, TimeUnit.SECONDS);
    }

    private int complexity(JobRecord record) {
        try {
            Map<String, Object> params = record.getParameters();
            if (params == null) return 1;
            Object raw = params.get("complexity");
            if (raw == null) return 1;
            return Math.max(1, Math.min(5, Integer.parseInt(String.valueOf(raw))));
        } catch (Exception ignored) {
            return 1;
        }
    }
}
