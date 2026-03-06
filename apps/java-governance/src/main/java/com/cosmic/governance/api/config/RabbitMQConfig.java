package com.cosmic.governance.api.config;

import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.rabbit.listener.SimpleMessageListenerContainer;
import org.springframework.amqp.rabbit.listener.adapter.MessageListenerAdapter;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;

@Configuration
@ConditionalOnProperty(name = "governance.messaging.enabled", havingValue = "true", matchIfMissing = true)
public class RabbitMQConfig {

    @Value("${spring.rabbitmq.host:localhost}")
    private String rabbitHost;

    @Value("${spring.rabbitmq.port:5672}")
    private int rabbitPort;

    @Value("${spring.rabbitmq.username:guest}")
    private String rabbitUsername;

    @Value("${spring.rabbitmq.password:guest}")
    private String rabbitPassword;

    public static final String AUDIT_EXCHANGE = "cosmic.audit.exchange";
    public static final String AUDIT_QUEUE = "cosmic.audit.queue";
    public static final String AUDIT_ROUTING_KEY = "audit.#";

    public static final String CONTROL_EXCHANGE = "cosmic.control.exchange";
    public static final String CONTROL_QUEUE = "cosmic.control.queue";
    public static final String CONTROL_ROUTING_KEY = "control.#";

    @Bean
    public Queue auditQueue() {
        return QueueBuilder.durable(AUDIT_QUEUE).build();
    }

    @Bean
    public Queue controlQueue() {
        return QueueBuilder.durable(CONTROL_QUEUE).build();
    }

    @Bean
    public TopicExchange auditExchange() {
        return new TopicExchange(AUDIT_EXCHANGE);
    }

    @Bean
    public TopicExchange controlExchange() {
        return new TopicExchange(CONTROL_EXCHANGE);
    }

    @Bean
    public Binding auditBinding(Queue auditQueue, TopicExchange auditExchange) {
        return BindingBuilder.bind(auditQueue).to(auditExchange).with(AUDIT_ROUTING_KEY);
    }

    @Bean
    public Binding controlBinding(Queue controlQueue, TopicExchange controlExchange) {
        return BindingBuilder.bind(controlQueue).to(controlExchange).with(CONTROL_ROUTING_KEY);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate rabbitTemplate = new RabbitTemplate(connectionFactory);
        rabbitTemplate.setMessageConverter(jsonMessageConverter());
        return rabbitTemplate;
    }
}