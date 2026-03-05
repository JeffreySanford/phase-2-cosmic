package com.cosmic.governance.api.service;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

import java.util.*;

@Service
public class VisualizationMetricsService {
    private final RestTemplate rest = new RestTemplate();

    @Value("${prometheus.baseUrl:}")
    private String prometheusBaseUrl;

    public Map<String, Object> getVisualizationMetrics() {
        // Try Prometheus if configured — build a shaped payload the frontend expects
        if (prometheusBaseUrl != null && !prometheusBaseUrl.isBlank()) {
            try {
                long nowSec = System.currentTimeMillis() / 1000L;

                // 1) throughput (instant)
                double throughput = 0.0;
                try {
                    String q1 = "sum(rate(application_network_bytes_total[1m]))";
                    String url1 = prometheusBaseUrl + "/api/v1/query?query=" + java.net.URLEncoder.encode(q1, java.nio.charset.StandardCharsets.UTF_8);
                    ResponseEntity<Map> r1 = rest.getForEntity(url1, Map.class);
                    if (r1.getStatusCode().is2xxSuccessful() && r1.getBody() != null) {
                        Map b = r1.getBody();
                        Map data = (Map) b.get("data");
                        List results = (List) data.get("result");
                        if (results != null && !results.isEmpty()) {
                            Map first = (Map) results.get(0);
                            List value = (List) first.get("value");
                            if (value != null && value.size() > 1) {
                                throughput = Double.parseDouble(value.get(1).toString());
                            }
                        }
                    }
                } catch (Exception ignored) { }

                // 2) sparkline (range query, 40 points @ 1s step)
                List<Map<String, Object>> spark = new ArrayList<>();
                try {
                    String q2 = "sum(rate(application_network_bytes_total[1m]))";
                    long start = Math.max(0, nowSec - 39);
                    long end = nowSec;
                    String url2 = prometheusBaseUrl + "/api/v1/query_range?query=" + java.net.URLEncoder.encode(q2, java.nio.charset.StandardCharsets.UTF_8)
                            + "&start=" + start + "&end=" + end + "&step=1";
                    ResponseEntity<Map> r2 = rest.getForEntity(url2, Map.class);
                    if (r2.getStatusCode().is2xxSuccessful() && r2.getBody() != null) {
                        Map b2 = r2.getBody();
                        Map d2 = (Map) b2.get("data");
                        List results2 = (List) d2.get("result");
                        if (results2 != null && !results2.isEmpty()) {
                            Map series = (Map) results2.get(0);
                            List values = (List) series.get("values");
                            for (Object vv : values) {
                                List pair = (List) vv;
                                double ts = Double.parseDouble(pair.get(0).toString());
                                double val = Double.parseDouble(pair.get(1).toString());
                                Map<String, Object> pt = new HashMap<>();
                                pt.put("t", (long) (ts * 1000L));
                                pt.put("v", val);
                                spark.add(pt);
                            }
                        }
                    }
                } catch (Exception ignored) { }

                // 3) histogram buckets (increase over 1m grouped by le)
                List<Number> histogram = new ArrayList<>();
                try {
                    String q3 = "sum(increase(application_request_duration_seconds_bucket[1m])) by (le)";
                    String url3 = prometheusBaseUrl + "/api/v1/query?query=" + java.net.URLEncoder.encode(q3, java.nio.charset.StandardCharsets.UTF_8);
                    ResponseEntity<Map> r3 = rest.getForEntity(url3, Map.class);
                    if (r3.getStatusCode().is2xxSuccessful() && r3.getBody() != null) {
                        Map b3 = r3.getBody();
                        Map d3 = (Map) b3.get("data");
                        List results3 = (List) d3.get("result");
                        // collect le->value
                        List<Map.Entry<Double, Double>> bucketPairs = new ArrayList<>();
                        for (Object obj : results3) {
                            Map item = (Map) obj;
                            Map metric = (Map) item.get("metric");
                            String leStr = (String) metric.get("le");
                            double le = leStr.equals("+Inf") ? Double.POSITIVE_INFINITY : Double.parseDouble(leStr);
                            List value = (List) item.get("value");
                            double v = Double.parseDouble(value.get(1).toString());
                            bucketPairs.add(new AbstractMap.SimpleEntry<>(le, v));
                        }
                        // sort by le and map counts
                        bucketPairs.sort(Comparator.comparingDouble(Map.Entry::getKey));
                        for (Map.Entry<Double, Double> e : bucketPairs) histogram.add(e.getValue());
                    }
                } catch (Exception ignored) { }

                // 4) scatter — not always available; fall back to synthetic
                List<Map<String, Object>> scatter = new ArrayList<>();
                try {
                    // Map X = network rate per job, Y = average request duration per job
                    String qx = "sum by (job) (rate(application_network_bytes_total[1m]))";
                    String qy = "sum by (job) (rate(application_request_duration_seconds_sum[1m])) / sum by (job) (rate(application_request_duration_seconds_count[1m]))";

                    Map<String, Double> xMap = new HashMap<>();
                    Map<String, Double> yMap = new HashMap<>();

                    // query X
                    try {
                        String urlx = prometheusBaseUrl + "/api/v1/query?query=" + java.net.URLEncoder.encode(qx, java.nio.charset.StandardCharsets.UTF_8);
                        ResponseEntity<Map> rx = rest.getForEntity(urlx, Map.class);
                        if (rx.getStatusCode().is2xxSuccessful() && rx.getBody() != null) {
                            Map bx = rx.getBody();
                            Map dx = (Map) bx.get("data");
                            List resultsx = (List) dx.get("result");
                            for (Object o : resultsx) {
                                Map it = (Map) o;
                                Map metric = (Map) it.get("metric");
                                // prefer instance label for per-instance mapping, fall back to job
                                String job = metric.get("instance") != null ? metric.get("instance").toString() : (metric.get("job") != null ? metric.get("job").toString() : UUID.randomUUID().toString());
                                List value = (List) it.get("value");
                                double v = Double.parseDouble(value.get(1).toString());
                                xMap.put(job, v);
                            }
                        }
                    } catch (Exception ignored) { }

                    // query Y
                    try {
                        String urly = prometheusBaseUrl + "/api/v1/query?query=" + java.net.URLEncoder.encode(qy, java.nio.charset.StandardCharsets.UTF_8);
                        ResponseEntity<Map> ry = rest.getForEntity(urly, Map.class);
                        if (ry.getStatusCode().is2xxSuccessful() && ry.getBody() != null) {
                            Map by = ry.getBody();
                            Map dy = (Map) by.get("data");
                            List resultsy = (List) dy.get("result");
                            for (Object o : resultsy) {
                                Map it = (Map) o;
                                    Map metric = (Map) it.get("metric");
                                    // prefer instance label for per-instance mapping, fall back to job
                                    String job = metric.get("instance") != null ? metric.get("instance").toString() : (metric.get("job") != null ? metric.get("job").toString() : UUID.randomUUID().toString());
                                List value = (List) it.get("value");
                                double v = Double.parseDouble(value.get(1).toString());
                                yMap.put(job, v);
                            }
                        }
                    } catch (Exception ignored) { }

                    // produce paired points for jobs present in both maps
                    Set<String> jobs = new HashSet<>(xMap.keySet());
                    jobs.retainAll(yMap.keySet());
                    if (!jobs.isEmpty()) {
                        double minX = Double.POSITIVE_INFINITY, maxX = Double.NEGATIVE_INFINITY;
                        double minY = Double.POSITIVE_INFINITY, maxY = Double.NEGATIVE_INFINITY;
                        for (String j : jobs) {
                            double xv = xMap.get(j);
                            double yv = yMap.get(j);
                            minX = Math.min(minX, xv); maxX = Math.max(maxX, xv);
                            minY = Math.min(minY, yv); maxY = Math.max(maxY, yv);
                        }
                        // normalize to 0-100
                        for (String j : jobs) {
                            double xv = xMap.get(j);
                            double yv = yMap.get(j);
                            double nx = (maxX == minX) ? 50.0 : ((xv - minX) / (maxX - minX)) * 100.0;
                            double ny = (maxY == minY) ? 50.0 : ((yv - minY) / (maxY - minY)) * 100.0;
                            Map<String, Object> p = new HashMap<>();
                            p.put("x", nx);
                            p.put("y", ny);
                            scatter.add(p);
                        }
                    }
                } catch (Exception ignored) {
                    // keep scatter empty to use fallback later
                }
                if (scatter.isEmpty()) {
                    // fallback synthetic scatter
                    for (int i = 0; i < 60; i++) {
                        Map<String, Object> p = new HashMap<>();
                        p.put("x", Math.random() * 100);
                        p.put("y", Math.random() * 100);
                        scatter.add(p);
                    }
                }

                Map<String, Object> payload = new HashMap<>();
                payload.put("throughput", throughput);
                payload.put("errorRate", 0.0);
                payload.put("queueDepth", 0);
                payload.put("sparkline", spark);
                payload.put("histogram", histogram);
                payload.put("scatter", scatter);

                Map<String, Object> out = new HashMap<>();
                out.put("source", "prometheus");
                out.put("data", payload);
                return out;
            } catch (Exception e) {
                e.printStackTrace();
            }
        }

        // Fallback synthetic payload matching frontend expectations
        Map<String, Object> payload = new HashMap<>();
        payload.put("throughput", 240.7);
        payload.put("errorRate", 1.14);
        payload.put("queueDepth", 45);

        List<Map<String, Object>> spark = new ArrayList<>();
        long now = System.currentTimeMillis();
        for (int i = 0; i < 40; i++) {
            Map<String, Object> pt = new HashMap<>();
            pt.put("t", now - (40 - i) * 1000);
            pt.put("v", 20 + Math.random() * 60);
            spark.add(pt);
        }
        payload.put("sparkline", spark);

        payload.put("histogram", Arrays.asList(0,0,1,0,1,0,6,0,0,2));

        List<Map<String, Object>> scatter = new ArrayList<>();
        for (int i=0;i<60;i++){ Map<String,Object> p = new HashMap<>(); p.put("x", Math.random()*100); p.put("y", Math.random()*100); scatter.add(p);}        
        payload.put("scatter", scatter);

        Map<String, Object> out = new HashMap<>();
        out.put("source", "fallback");
        out.put("data", payload);
        return out;
    }
}
