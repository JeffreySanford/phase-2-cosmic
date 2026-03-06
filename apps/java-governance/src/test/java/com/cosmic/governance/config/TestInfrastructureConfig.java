package com.cosmic.governance.config;

import org.mockito.Mockito;
import org.springframework.amqp.core.AmqpAdmin;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.kafka.core.KafkaTemplate;
import com.cosmic.governance.api.service.AuditService;

@Configuration
public class TestInfrastructureConfig {

    @Configuration
    @ConditionalOnProperty(name = "governance.redis.enabled", havingValue = "false")
    static class NoOpRedisConfig {
        @Bean
        public RedisConnectionFactory redisConnectionFactory() {
            return Mockito.mock(RedisConnectionFactory.class);
        }

        @Bean
        @SuppressWarnings({"rawtypes","unchecked"})
        public RedisTemplate redisTemplate(RedisConnectionFactory factory) {
            RedisTemplate rt = new RedisTemplate();
            rt.setConnectionFactory(factory);
            return rt;
        }
    }

    @Configuration
    @ConditionalOnProperty(name = "governance.messaging.enabled", havingValue = "false")
    static class NoOpMessagingConfig {
        @Bean
        public RabbitTemplate rabbitTemplate() {
            return Mockito.mock(RabbitTemplate.class);
        }

        @Bean
        public AmqpAdmin amqpAdmin() {
            return Mockito.mock(AmqpAdmin.class);
        }

        @Bean
        public AuditService auditService() {
            return Mockito.mock(AuditService.class);
        }

        @Bean
        @SuppressWarnings({"rawtypes","unchecked"})
        public KafkaTemplate kafkaTemplate() {
            return Mockito.mock(KafkaTemplate.class);
        }
    }
}
