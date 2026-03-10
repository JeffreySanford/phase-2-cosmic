package com.cosmic.governance.api.service;

import org.json.JSONObject;
import org.json.JSONTokener;
import org.everit.json.schema.Schema;
import org.everit.json.schema.loader.SchemaLoader;
import org.springframework.stereotype.Service;

import java.io.InputStream;
import java.lang.reflect.Method;
import java.util.HashMap;
import java.util.Map;

@Service
public class SchemaService {
    private final Map<String, Object> schemas = new HashMap<>();
    private final boolean everitAvailable;

    public SchemaService() {
        boolean available;
        try {
            Class.forName("org.everit.json.schema.Schema");
            available = true;
        } catch (ClassNotFoundException e) {
            available = false;
        }
        this.everitAvailable = available;

        String[] builtins = new String[]{
            "ingest", "export", "reindex", "cleanup", "diagnostics",
            "vo.cone-search", "vo.adql.query", "vo.obscore.search", "vo.votable.fetch",
            "vo.datalink.resolve", "vo.product.fetch", "vo.soda.cutout", "vo.preview.fetch"
        };
        // include Trident schemas added in Sprint 1
        String[] trident = new String[]{
            "trident.scheduling-block",
            "trident.execution-block",
            "trident.subarray-configuration",
            "trident.spectral-configuration",
            "trident.fsp-allocation-plan"
        };
        for (String t : builtins) {
            String path = "/schemas/" + t + ".json";
            try (InputStream is = getClass().getResourceAsStream(path)) {
                if (is == null) continue;
                JSONObject raw = new JSONObject(new JSONTokener(is));
                if (everitAvailable) {
                    try {
                        // remove explicit $schema declaration to avoid remote meta-schema resolution
                        if (raw.has("$schema")) {
                            raw.remove("$schema");
                        }
                        Schema schema = SchemaLoader.builder()
                                .schemaJson(raw)
                                .draftV7Support()
                                .build()
                                .load()
                                .build();
                        schemas.put(t, schema);
                    } catch (Exception ex) {
                        // if reflection fails, treat as no schema available
                        schemas.put(t, null);
                        System.err.println("Failed to load schema " + t + ": " + ex.getMessage());
                    }
                } else {
                    // store raw JSONObject for reference but mark validation as unavailable
                    schemas.put(t, raw);
                }
            } catch (Exception e) {
                // ignore missing or invalid schemas
            }
        }
        // Load any additional trident schemas
        for (String t : trident) {
            String path = "/schemas/" + t + ".json";
            try (InputStream is = getClass().getResourceAsStream(path)) {
                if (is == null) continue;
                JSONObject raw = new JSONObject(new JSONTokener(is));
                if (everitAvailable) {
                    try {
                        if (raw.has("$schema")) {
                            raw.remove("$schema");
                        }
                        Schema schema = SchemaLoader.builder()
                                .schemaJson(raw)
                                .draftV7Support()
                                .build()
                                .load()
                                .build();
                        schemas.put(t, schema);
                    } catch (Exception ex) {
                        schemas.put(t, null);
                        System.err.println("Failed to load trident schema " + t + ": " + ex.getMessage());
                    }
                } else {
                    schemas.put(t, raw);
                }
            } catch (Exception e) {
                // ignore
            }
        }
    }

    public void register(String type, Object schema) {
        schemas.put(type, schema);
    }

    public ValidationResult validate(String type, Object payload) {
        Object s = schemas.get(type);
        if (s == null) return ValidationResult.ofNoSchema();
        if (!everitAvailable) return ValidationResult.ofNoSchema();
        try {
            JSONObject obj;
            if (payload == null) {
                obj = new JSONObject();
            } else if (payload instanceof java.util.Map<?, ?> m) {
                obj = new JSONObject(m);
            } else if (payload instanceof String str) {
                obj = new JSONObject(str);
            } else {
                obj = new JSONObject(payload);
            }
            // s should be an Everit Schema instance
            if (s instanceof Schema schema) {
                schema.validate(obj);
                return ValidationResult.ofValid();
            } else {
                // unexpected type, treat as no schema
                return ValidationResult.ofNoSchema();
            }
        } catch (Exception e) {
            // capture full stacktrace for diagnostics
            try (java.io.StringWriter sw = new java.io.StringWriter(); java.io.PrintWriter pw = new java.io.PrintWriter(sw)) {
                e.printStackTrace(pw);
                pw.flush();
                String trace = sw.toString();
                return ValidationResult.ofInvalid(trace);
            } catch (Exception ex) {
                return ValidationResult.ofInvalid(e.getMessage());
            }
        }
    }

    public static record ValidationResult(boolean valid, boolean schemaFound, String message) {
        public static ValidationResult ofValid() { return new ValidationResult(true, true, null); }
        public static ValidationResult ofNoSchema() { return new ValidationResult(true, false, null); }
        public static ValidationResult ofInvalid(String msg) { return new ValidationResult(false, true, msg); }
    }
}
