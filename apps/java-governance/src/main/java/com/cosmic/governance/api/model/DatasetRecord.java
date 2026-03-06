package com.cosmic.governance.api.model;

import java.util.Map;

public class DatasetRecord {
    private String id;
    private String name;
    private String description;
    private String createdAt;
    private Map<String, Object> metadata;
    private Map<String, Object> manifest;

    public DatasetRecord() {}

    public DatasetRecord(String id, String name, String description, String createdAt, Map<String, Object> metadata, Map<String, Object> manifest) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.createdAt = createdAt;
        this.metadata = metadata;
        this.manifest = manifest;
    }

    public String getId() { return id; }
    public void setId(String id) { this.id = id; }
    public String getName() { return name; }
    public void setName(String name) { this.name = name; }
    public String getDescription() { return description; }
    public void setDescription(String description) { this.description = description; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public Map<String, Object> getMetadata() { return metadata; }
    public void setMetadata(Map<String, Object> metadata) { this.metadata = metadata; }
    public Map<String, Object> getManifest() { return manifest; }
    public void setManifest(Map<String, Object> manifest) { this.manifest = manifest; }
}
