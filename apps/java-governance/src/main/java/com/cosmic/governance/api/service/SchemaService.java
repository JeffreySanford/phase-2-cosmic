package com.cosmic.governance.api.service;

import org.json.JSONObject;
import org.json.JSONTokener;
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
        for (String t : builtins) {
            String path = "/schemas/" + t + ".json";
            try (InputStream is = getClass().getResourceAsStream(path)) {
                if (is == null) continue;
                JSONObject raw = new JSONObject(new JSONTokener(is));
                if (everitAvailable) {
                    try {
                        Class<?> loaderClass = Class.forName("org.everit.json.schema.loader.SchemaLoader");
                        Method load = loaderClass.getMethod("load", JSONObject.class);
                        Object schema = load.invoke(null, raw);
                        schemas.put(t, schema);
                    } catch (Exception ex) {
                        // if reflection fails, treat as no schema available
                        schemas.put(t, null);
                    }
                } else {
                    // store raw JSONObject for reference but mark validation as unavailable
                    schemas.put(t, raw);
                }
            } catch (Exception e) {
                // ignore missing or invalid schemas
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
            Method validate = s.getClass().getMethod("validate", Object.class);
            validate.invoke(s, obj);
            return ValidationResult.ofValid();
        } catch (Exception e) {
            return ValidationResult.ofInvalid(e.getMessage());
        }
    }

    public static record ValidationResult(boolean valid, boolean schemaFound, String message) {
        public static ValidationResult ofValid() { return new ValidationResult(true, true, null); }
        public static ValidationResult ofNoSchema() { return new ValidationResult(true, false, null); }
        public static ValidationResult ofInvalid(String msg) { return new ValidationResult(false, true, msg); }
    }
}
