package com.cosmic.governance.api.executor;

import com.cosmic.governance.api.model.JobRecord;
import org.springframework.data.redis.core.RedisTemplate;

public interface JobExecutor {
    /** logical name for selecting this executor */
    String name();

    /** execute the job asynchronously; implementations should update job state in Redis */
    void execute(JobRecord record, RedisTemplate<String, Object> redisTemplate);
}
