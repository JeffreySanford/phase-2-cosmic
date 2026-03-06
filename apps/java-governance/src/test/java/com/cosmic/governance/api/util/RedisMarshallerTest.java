package com.cosmic.governance.api.util;

import com.cosmic.governance.api.model.JobRecord;
import com.cosmic.governance.api.model.JobState;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.util.Map;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class RedisMarshallerTest {
    private final RedisMarshaller marshaller = new RedisMarshaller(new ObjectMapper());

    @Test
    void returnsNullForNullAndUnsupportedValues() {
        assertNull(marshaller.toJobRecord(null));
        assertNull(marshaller.toJobRecord(42));
    }

    @Test
    void returnsExistingJobRecordInstancesDirectly() {
        JobRecord record = new JobRecord();
        record.setJobId("job-1");

        assertSame(record, marshaller.toJobRecord(record));
    }

    @Test
    void convertsMapsIntoJobRecords() {
        JobRecord record = marshaller.toJobRecord(Map.of(
                "jobId", "job-2",
                "workflow", "spectral-line",
                "state", "QUEUED"
        ));

        assertNotNull(record);
        assertEquals("job-2", record.getJobId());
        assertEquals("spectral-line", record.getWorkflow());
        assertEquals(JobState.QUEUED, record.getState());
    }

    @Test
    void convertsJsonStringsIntoJobRecords() {
        JobRecord record = marshaller.toJobRecord("""
                {"jobId":"job-3","workflow":"continuum","state":"RUNNING"}
                """);

        assertNotNull(record);
        assertEquals("job-3", record.getJobId());
        assertEquals("continuum", record.getWorkflow());
        assertEquals(JobState.RUNNING, record.getState());
    }

    @Test
    void returnsNullForInvalidJson() {
        assertNull(marshaller.toJobRecord("{not-json}"));
    }
}
