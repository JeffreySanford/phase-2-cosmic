package com.cosmic.governance.api.util;

import com.cosmic.governance.api.model.JobRecord;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.Map;

@Service
public class RedisMarshaller {
    private final ObjectMapper mapper;

    public RedisMarshaller(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    public JobRecord toJobRecord(Object o) {
        if (o == null) return null;
        if (o instanceof JobRecord) return (JobRecord) o;
        try {
            if (o instanceof Map) {
                @SuppressWarnings("unchecked")
                Map<String, Object> m = (Map<String, Object>) o;
                return mapper.convertValue(m, JobRecord.class);
            }
            if (o instanceof String) {
                return mapper.readValue((String) o, JobRecord.class);
            }
        } catch (Exception ignored) {}
        return null;
    }
}
