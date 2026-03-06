package com.cosmic.governance.api.service;

import com.cosmic.governance.api.dto.DatasetRequest;
import com.cosmic.governance.api.dto.DatasetResponse;
import com.cosmic.governance.api.model.DatasetRecord;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.Test;
import org.mockito.Mockito;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.core.ValueOperations;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class DatasetServiceTest {

    @Test
    void createFallsBackToInMemoryStoreAndInjectsManifestIntoMetadata() {
        DatasetService service = new DatasetService(null);

        DatasetResponse created = service.create(new DatasetRequest(
                null,
                "Dataset 1",
                "description",
                Map.of("workflow", "spectral-line"),
                Map.of("job", "job-1", "version", 1)
        ));

        assertEquals("Dataset 1", created.name());
        assertNotNull(created.id());
        assertNotNull(created.createdAt());
        assertEquals("spectral-line", created.metadata().get("workflow"));
        assertEquals(Map.of("job", "job-1", "version", 1), created.manifest());
        assertEquals(Map.of("job", "job-1", "version", 1), created.metadata().get("manifest"));

        Optional<DatasetResponse> loaded = service.get(created.id());
        assertTrue(loaded.isPresent());
        assertEquals(created.id(), loaded.get().id());

        List<DatasetResponse> all = service.listAll();
        assertEquals(1, all.size());
        assertEquals(created.id(), all.get(0).id());
    }

    @Test
    void createUsesRedisWhenAvailable() {
        @SuppressWarnings("unchecked")
        RedisTemplate<String, Object> redisTemplate = Mockito.mock(RedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, Object> valueOps = Mockito.mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);

        DatasetService service = new DatasetService(redisTemplate);
        DatasetResponse created = service.create(new DatasetRequest(
                "dataset-redis",
                "Dataset Redis",
                "stored in redis",
                null,
                null
        ));

        verify(valueOps).set(eq("dataset:dataset-redis"), any(DatasetRecord.class));
        assertEquals("dataset-redis", created.id());
        assertEquals("Dataset Redis", created.name());
    }

    @Test
    void listAllReadsDatasetRecordsFromRedisKeys() {
        @SuppressWarnings("unchecked")
        RedisTemplate<String, Object> redisTemplate = Mockito.mock(RedisTemplate.class);
        @SuppressWarnings("unchecked")
        ValueOperations<String, Object> valueOps = Mockito.mock(ValueOperations.class);
        when(redisTemplate.opsForValue()).thenReturn(valueOps);
        when(redisTemplate.keys("dataset:*")).thenReturn(java.util.Set.of("dataset:one"));
        when(valueOps.get("dataset:one")).thenReturn(new DatasetRecord(
                "one",
                "Dataset One",
                "from redis",
                "2026-03-06T12:00:00Z",
                Map.of(),
                null
        ));

        DatasetService service = new DatasetService(redisTemplate);
        List<DatasetResponse> all = service.listAll();

        assertEquals(1, all.size());
        assertEquals("one", all.get(0).id());
        assertEquals("Dataset One", all.get(0).name());
    }
}
