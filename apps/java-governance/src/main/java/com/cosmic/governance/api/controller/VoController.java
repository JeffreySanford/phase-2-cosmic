package com.cosmic.governance.api.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.Map;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.HashMap;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import java.util.concurrent.ConcurrentHashMap;
import java.time.Instant;
import javax.xml.parsers.DocumentBuilder;
import javax.xml.parsers.DocumentBuilderFactory;
import org.w3c.dom.Document;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

@RestController
@RequestMapping("/api/v1/vo")
public class VoController {

    @Value("${governance.vo.tap-url:}")
    private String tapUrl;

    @Value("${governance.vo.data-link-url:}")
    private String dataLinkUrl;

    private volatile long cacheTtlSeconds = 300; // 5 minutes, adjustable at runtime
    private final ConcurrentHashMap<String, CacheEntry> votableCache = new ConcurrentHashMap<>();

    private static class CacheEntry {
        final Map<String, Object> value;
        final Instant created;
        CacheEntry(Map<String, Object> value) { this.value = value; this.created = Instant.now(); }
        boolean isExpired(long ttlSeconds) { return Instant.now().isAfter(created.plusSeconds(ttlSeconds)); }
    }

    @GetMapping("/services")
    public ResponseEntity<Map<String, String>> services() {
        Map<String, String> resp = new HashMap<>();
        if (tapUrl != null && !tapUrl.isBlank()) resp.put("tapUrl", tapUrl);
        if (dataLinkUrl != null && !dataLinkUrl.isBlank()) resp.put("dataLinkUrl", dataLinkUrl);
        return ResponseEntity.ok(resp);
    }

    @GetMapping("/cached-samples")
    public ResponseEntity<Map<String, Object>> cachedSamples() {
        Map<String, Object> samples = new LinkedHashMap<>();
        samples.put("vo.cone-search", sampleOf(
                "provider", "SIMBAD",
                "serviceUrl", "https://simbad.cds.unistra.fr/simbad/sim-tap/sync",
                "target", "M42",
                "ra", 83.8221,
                "dec", -5.3911,
                "radius", 0.5,
                "format", "votable",
                "liveMode", true,
                "_description", "Cone search around Orion Nebula (M42), radius 0.5\u00b0"
        ));
        samples.put("vo.adql.query", sampleOf(
                "provider", "HEASARC",
                "tapUrl", "https://heasarc.gsfc.nasa.gov/xamin/tap/sync",
                "adql", "SELECT TOP 10 target_name, ra, dec, exposure FROM chanmaster ORDER BY exposure DESC",
                "limit", 10,
                "liveMode", true,
                "_description", "Top 10 longest Chandra observations (HEASARC TAP)"
        ));
        samples.put("vo.obscore.search", sampleOf(
                "provider", "ESO",
                "tapUrl", "https://archive.eso.org/tap_obs/sync",
                "dataproductType", "image",
                "spatialBoundsRa", 187.277915,
                "spatialBoundsDec", 2.052389,
                "spatialBoundsRadius", 0.5,
                "limit", 20,
                "liveMode", true,
                "_description", "ESO ObsCore image search around quasar 3C 273 (r=0.5\u00b0)"
        ));
        samples.put("vo.votable.fetch", sampleOf(
                "provider", "HEASARC",
                "votableUrl", "https://heasarc.gsfc.nasa.gov/xamin/query?table=chanmaster&position=3c273&format=votable",
                "format", "votable",
                "liveMode", true,
                "_description", "Chandra observations of quasar 3C 273 as VOTable"
        ));
        samples.put("vo.datalink.resolve", sampleOf(
                "provider", "CADC",
                "datalinkUrl", "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/datalink",
                "datasetIdentifier", "ivo://cadc.nrc.ca/CFHT?2459817",
                "liveMode", true,
                "_description", "DataLink products for CFHT MegaCam observation 2459817"
        ));
        samples.put("vo.product.fetch", sampleOf(
                "provider", "HEASARC",
                "productUrl", "https://heasarc.gsfc.nasa.gov/FTP/chandra/data/byobsid/2/21843/primary/acisf21843N002_evt2.fits.gz",
                "expectedMimeType", "application/fits",
                "liveMode", true,
                "_description", "Chandra ACIS event file \u2014 Cas A supernova remnant (obs 21843)"
        ));
        samples.put("vo.soda.cutout", sampleOf(
                "provider", "CADC",
                "sodaUrl", "https://ws.cadc-ccda.hia-iha.nrc-cnrc.gc.ca/caom2ops/soda",
                "datasetIdentifier", "ivo://cadc.nrc.ca/CFHT?2459817",
                "spatialBoundsRa", 187.277915,
                "spatialBoundsDec", 2.052389,
                "spatialBoundsRadius", 0.1,
                "outputFormat", "fits",
                "liveMode", true,
                "_description", "CADC SODA cutout centered on 3C 273 (r=0.1\u00b0, CFHT obs 2459817)"
        ));
        samples.put("vo.preview.fetch", sampleOf(
                "provider", "ESASky",
                "previewUrl", "https://sky.esa.int/esasky-tap/tap/sync?REQUEST=doQuery&LANG=ADQL&FORMAT=votable&QUERY=SELECT+TOP+5+*+FROM+mv_xsa_obs+WHERE+target_name+LIKE+%2527%2525Crab%2525%2527",
                "liveMode", true,
                "_description", "ESASky XMM-Newton observations matching 'Crab' target (top 5)"
        ));
        return ResponseEntity.ok(samples);
    }

    private static Map<String, Object> sampleOf(Object... kvPairs) {
        Map<String, Object> map = new LinkedHashMap<>();
        for (int i = 0; i + 1 < kvPairs.length; i += 2) {
            map.put(String.valueOf(kvPairs[i]), kvPairs[i + 1]);
        }
        return map;
    }

    @GetMapping("/query")
    public ResponseEntity<List<List<String>>> query(@RequestParam(required = false) String table, @RequestParam(required = false) String position) {
        String queryBase = "https://heasarc.gsfc.nasa.gov/xamin/query";
        try {
            String params = "table=" + URLEncoder.encode(table == null ? "" : table, StandardCharsets.UTF_8)
                    + "&position=" + URLEncoder.encode(position == null ? "" : position, StandardCharsets.UTF_8)
                    + "&format=stream";
            String url = queryBase + "?" + params;

            HttpClient client = HttpClient.newHttpClient();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .GET()
                    .build();

            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
            String body = resp.body();

            List<List<String>> rows = new ArrayList<>();
            for (String line : body.split("\n")) {
                line = line.trim();
                if (line.isEmpty()) continue;
                // stream format is pipe-delimited
                String[] parts = line.split("\\|", -1);
                List<String> row = new ArrayList<>();
                for (String p : parts) row.add(p);
                rows.add(row);
            }

            return ResponseEntity.ok(rows);
        } catch (Exception e) {
            return ResponseEntity.status(500).body(List.of(List.of("error", e.getMessage())));
        }
    }

    @GetMapping("/votable")
    public ResponseEntity<Map<String, Object>> votable(@RequestParam(required = false) String table, @RequestParam(required = false) String position) {
        String queryBase = "https://heasarc.gsfc.nasa.gov/xamin/query";
        try {
            String cacheKey = "votable:" + (table == null ? "" : table) + ":" + (position == null ? "" : position);
            CacheEntry cached = votableCache.get(cacheKey);
            if (cached != null) {
                if (!cached.isExpired(cacheTtlSeconds)) {
                    return ResponseEntity.ok(cached.value);
                } else {
                    votableCache.remove(cacheKey);
                }
            }

            String params = "table=" + URLEncoder.encode(table == null ? "" : table, StandardCharsets.UTF_8)
                    + "&position=" + URLEncoder.encode(position == null ? "" : position, StandardCharsets.UTF_8)
                    + "&format=votable";
            String url = queryBase + "?" + params;

            HttpClient client = HttpClient.newHttpClient();
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(url))
                    .GET()
                    .build();

            HttpResponse<String> resp = client.send(req, HttpResponse.BodyHandlers.ofString());
            String body = resp.body();

            DocumentBuilderFactory dbf = DocumentBuilderFactory.newInstance();
            dbf.setNamespaceAware(true);
            DocumentBuilder db = dbf.newDocumentBuilder();
            Document doc = db.parse(new java.io.ByteArrayInputStream(body.getBytes(StandardCharsets.UTF_8)));

            // Extract FIELD names
            List<String> fields = new ArrayList<>();
            NodeList fieldNodes = doc.getElementsByTagName("FIELD");
            for (int i = 0; i < fieldNodes.getLength(); i++) {
                Element f = (Element) fieldNodes.item(i);
                String name = f.getAttribute("name");
                if (name == null || name.isBlank()) name = f.getAttribute("ID");
                fields.add(name == null ? "" : name);
            }

            // Extract rows from TABLEDATA/TR/TD
            List<List<String>> rows = new ArrayList<>();
            NodeList trNodes = doc.getElementsByTagName("TR");
            for (int i = 0; i < trNodes.getLength(); i++) {
                Element tr = (Element) trNodes.item(i);
                NodeList tdNodes = tr.getElementsByTagName("TD");
                List<String> row = new ArrayList<>();
                for (int j = 0; j < tdNodes.getLength(); j++) {
                    Node td = tdNodes.item(j);
                    row.add(td.getTextContent());
                }
                if (!row.isEmpty()) rows.add(row);
            }

            // Extract LINK hrefs and accessURL elements
            List<String> links = new ArrayList<>();
            NodeList linkNodes = doc.getElementsByTagName("LINK");
            for (int i = 0; i < linkNodes.getLength(); i++) {
                Element l = (Element) linkNodes.item(i);
                String href = l.getAttribute("href");
                if (href == null || href.isBlank()) href = l.getAttribute("xlink:href");
                if (href != null && !href.isBlank()) links.add(href);
            }
            NodeList accessNodes = doc.getElementsByTagName("accessURL");
            for (int i = 0; i < accessNodes.getLength(); i++) {
                Node n = accessNodes.item(i);
                String text = n.getTextContent();
                if (text != null && !text.isBlank()) links.add(text.trim());
            }

            Map<String, Object> out = new HashMap<>();
            out.put("fields", fields);
            out.put("rows", rows);
            out.put("links", links);

            // store in cache
            votableCache.put(cacheKey, new CacheEntry(out));

            return ResponseEntity.ok(out);
        } catch (Exception e) {
            Map<String, Object> err = new HashMap<>();
            err.put("error", e.getMessage());
            return ResponseEntity.status(500).body(err);
        }
    }

    @PostMapping("/cache/clear")
    public ResponseEntity<Map<String, Object>> clearCache() {
        votableCache.clear();
        return ResponseEntity.ok(Map.of("cleared", true));
    }

    @PostMapping("/cache/invalidate")
    public ResponseEntity<Map<String, Object>> invalidateCache(@RequestParam(required = false) String table, @RequestParam(required = false) String position) {
        String cacheKey = "votable:" + (table == null ? "" : table) + ":" + (position == null ? "" : position);
        boolean removed = votableCache.remove(cacheKey) != null;
        return ResponseEntity.ok(Map.of("removed", removed, "key", cacheKey));
    }

    @PostMapping("/cache/ttl")
    public ResponseEntity<Map<String, Object>> setCacheTtl(@RequestParam long seconds) {
        if (seconds <= 0) return ResponseEntity.badRequest().body(Map.of("error", "ttl must be > 0"));
        cacheTtlSeconds = seconds;
        return ResponseEntity.ok(Map.of("ttl_seconds", cacheTtlSeconds));
    }

}
