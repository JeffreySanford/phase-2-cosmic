package com.cosmic.governance.api.model;

import java.util.Map;

public class DatasetRecord {
    private String id;
    private String name;
    private String description;
    private String createdAt;
    private Map<String, Object> metadata;

    public DatasetRecord() {}

    public DatasetRecord(String id, String name, String description, String createdAt, Map<String, Object> metadata) {
        this.id = id;
        this.name = name;
        this.description = description;
        this.createdAt = createdAt;
        this.metadata = metadata;
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
}
