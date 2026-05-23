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
import com.cosmic.governance.api.service.GovernanceRuntimeMetricsService;
import com.cosmic.governance.api.util.RedisMarshaller;
import org.springframework.beans.factory.annotation.Autowired;

@Service
public class SimulatorExecutor implements JobExecutor {
    private static final ScheduledExecutorService EXEC = Executors.newScheduledThreadPool(2);
    private final RedisMarshaller marshaller;
    private final GovernanceRuntimeMetricsService governanceRuntimeMetricsService;
    @Value("${executor.network.enabled:false}")
    private boolean networkEnabled;

    public SimulatorExecutor(@Autowired RedisMarshaller marshaller,
                             @Autowired GovernanceRuntimeMetricsService governanceRuntimeMetricsService) {
        this.marshaller = marshaller;
        this.governanceRuntimeMetricsService = governanceRuntimeMetricsService;
    }

    @Override
    public String name() { return "simulator"; }

    @Override
    public void execute(JobRecord record, RedisTemplate<String, Object> redisTemplate) {
        String jobKey = "job:" + record.getJobId();
        int complexity = complexity(record);
        // target sub‑second behavior: each job should finish within ~300ms
        // longer complexity gives later finish but still <=300ms
        int minMs = Math.max(100, complexity * 100);  // at least complexity*100ms
        // allow significantly longer runs for UI debugging
        int maxMs = 2000;
        int completionDelayMs = minMs + java.util.concurrent.ThreadLocalRandom.current().nextInt(maxMs - minMs + 1);
        int startDelayMs = 0;
        // schedule running transition
        EXEC.schedule(() -> {
            Object o = readRedisValue(redisTemplate, jobKey);
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
                writeRedisValue(redisTemplate, jobKey, r);
                // push a running log
                pushRedisLog(redisTemplate, jobKey + ":logs", "Simulator: job running (complexity=" + complexity + ")");
            }
        }, startDelayMs, TimeUnit.MILLISECONDS);

        EXEC.schedule(() -> {
            Object o = readRedisValue(redisTemplate, jobKey);
            JobRecord r2 = null;
            r2 = marshaller.toJobRecord(o);
            if (r2 != null) {
                Instant completedAt = Instant.now();
                Duration runtime = durationBetween(r2.getUpdatedAt(), completedAt);
                r2.setState(JobState.COMPLETED);
                r2.setUpdatedAt(completedAt.toString());
                r2.setVersion(r2.getVersion() + 1);
                var newParams = r2.getParameters() == null ? new java.util.HashMap<String, Object>() : new java.util.HashMap<String, Object>(r2.getParameters());
                newParams.put("completedAt", completedAt.toString());
                r2.setParameters(newParams);
                writeRedisValue(redisTemplate, jobKey, r2);
                recordTerminalState(r2.getWorkflow(), "simulator", JobState.COMPLETED, runtime);
                pushRedisLog(redisTemplate, jobKey + ":logs", "Simulator: job completed (complexity=" + complexity + ")");
                // create a small artifact marker and write a file to tmp artifact store
                String artKey = jobKey + ":artifacts";
                String name = "result.txt";
                var artifact = Map.of("name", name, "url", "/api/v1/jobs/" + r2.getJobId() + "/artifacts/" + name);
                writeRedisValue(redisTemplate, artKey, artifact);
                try {
                    java.nio.file.Path base = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", r2.getJobId());
                    java.nio.file.Files.createDirectories(base);
                    java.nio.file.Path file = base.resolve(name);
                    String content = "Simulator artifact for job " + r2.getJobId() + "\nOK\n";
                    java.nio.file.Files.writeString(file, content);
                    recordObjectWrite("artifact-file", name, "simulator", content);
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
                                    Document doc = secureDocumentBuilderFactory().newDocumentBuilder().parse(new InputSource(new StringReader(body)));
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
                                        writeRedisValue(redisTemplate, cacheKey, external);
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
                            pushRedisLog(redisTemplate, externalArtifactsKey, external);
                        } catch (Exception ignored) {}
                        try {
                            java.nio.file.Path base = java.nio.file.Paths.get(System.getProperty("java.io.tmpdir"), "governance-artifacts", r2.getJobId());
                            java.nio.file.Files.createDirectories(base);
                            java.nio.file.Path file = base.resolve(jsonName);
                            com.fasterxml.jackson.databind.ObjectMapper om = new com.fasterxml.jackson.databind.ObjectMapper();
                            String content = om.writerWithDefaultPrettyPrinter().writeValueAsString(external);
                            java.nio.file.Files.writeString(file, content);
                            recordObjectWrite("artifact-file", jsonName, "simulator", content);
                        } catch (Exception ignored) {}
                    }
                } catch (Exception ignored) {}
            }
        }, completionDelayMs, TimeUnit.MILLISECONDS);
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

    private static DocumentBuilderFactory secureDocumentBuilderFactory() throws javax.xml.parsers.ParserConfigurationException {
        DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
        dbf.setFeature("http://apache.org/xml/features/disallow-doctype-decl", true);
        dbf.setFeature("http://xml.org/sax/features/external-general-entities", false);
        dbf.setFeature("http://xml.org/sax/features/external-parameter-entities", false);
        dbf.setFeature("http://apache.org/xml/features/nonvalidating/load-external-dtd", false);
        dbf.setXIncludeAware(false);
        dbf.setExpandEntityReferences(false);
        return dbf;
    }

    private Object readRedisValue(RedisTemplate<String, Object> redisTemplate, String key) {
        Instant startedAt = Instant.now();
        Object value = redisTemplate.opsForValue().get(key);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisRead("redis", keyspaceOf(key), value, true, Duration.between(startedAt, Instant.now()));
        }
        return value;
    }

    private void writeRedisValue(RedisTemplate<String, Object> redisTemplate, String key, Object value) {
        Instant startedAt = Instant.now();
        redisTemplate.opsForValue().set(key, value);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisWrite("redis", keyspaceOf(key), value, true, Duration.between(startedAt, Instant.now()));
        }
    }

    private void pushRedisLog(RedisTemplate<String, Object> redisTemplate, String key, Object value) {
        Instant startedAt = Instant.now();
        redisTemplate.opsForList().rightPush(key, value);
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordRedisWrite("redis", keyspaceOf(key), value, true, Duration.between(startedAt, Instant.now()));
        }
    }

    private void recordObjectWrite(String storage, String objectKind, String executor, Object payload) {
        if (governanceRuntimeMetricsService != null) {
            governanceRuntimeMetricsService.recordObjectWrite(storage, objectKind, executor, payload);
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
}
