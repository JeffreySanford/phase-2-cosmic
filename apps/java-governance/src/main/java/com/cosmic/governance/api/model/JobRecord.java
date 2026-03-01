package com.cosmic.governance.api.model;

import java.util.Map;

public class JobRecord {
    private String jobId;
    private String workflow;
    private String datasetId;
    private JobState state;
    private String createdAt;
    private String updatedAt;
    private Map<String, Object> parameters;
    private String requestedBy;

    public JobRecord() {}

    public JobRecord(String jobId, String workflow, String datasetId, JobState state, String createdAt, String updatedAt,
                     Map<String, Object> parameters, String requestedBy) {
        this.jobId = jobId;
        this.workflow = workflow;
        this.datasetId = datasetId;
        this.state = state;
        this.createdAt = createdAt;
        this.updatedAt = updatedAt;
        this.parameters = parameters;
        this.requestedBy = requestedBy;
    }

    // getters and setters
    public String getJobId() { return jobId; }
    public void setJobId(String jobId) { this.jobId = jobId; }
    public String getWorkflow() { return workflow; }
    public void setWorkflow(String workflow) { this.workflow = workflow; }
    public String getDatasetId() { return datasetId; }
    public void setDatasetId(String datasetId) { this.datasetId = datasetId; }
    public JobState getState() { return state; }
    public void setState(JobState state) { this.state = state; }
    public String getCreatedAt() { return createdAt; }
    public void setCreatedAt(String createdAt) { this.createdAt = createdAt; }
    public String getUpdatedAt() { return updatedAt; }
    public void setUpdatedAt(String updatedAt) { this.updatedAt = updatedAt; }
    public Map<String, Object> getParameters() { return parameters; }
    public void setParameters(Map<String, Object> parameters) { this.parameters = parameters; }
    public String getRequestedBy() { return requestedBy; }
    public void setRequestedBy(String requestedBy) { this.requestedBy = requestedBy; }
}
