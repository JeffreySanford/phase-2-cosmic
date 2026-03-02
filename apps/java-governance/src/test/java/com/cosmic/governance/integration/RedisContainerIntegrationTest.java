package com.cosmic.governance.integration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.data.redis.core.RedisTemplate;
import com.cosmic.governance.test.AbstractRedisTest;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest
public class RedisContainerIntegrationTest extends AbstractRedisTest {

    @Autowired
    private RedisTemplate<String, Object> redisTemplate;

    @Test
    public void testRedisWriteRead() {
        // ensure Spring Boot test context started and RedisTemplate is available
        assertThat(redisTemplate).isNotNull();

        String key = "test:container:foo";
        redisTemplate.opsForValue().set(key, "bar");
        Object v = redisTemplate.opsForValue().get(key);
        assertThat(v).isEqualTo("bar");
    }
}
