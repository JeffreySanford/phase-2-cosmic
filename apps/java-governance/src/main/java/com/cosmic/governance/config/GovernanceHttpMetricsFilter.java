package com.cosmic.governance.config;

import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.DistributionSummary;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.time.Duration;

@Component
@Order(2)
public class GovernanceHttpMetricsFilter extends OncePerRequestFilter {
    private final MeterRegistry meterRegistry;

    public GovernanceHttpMetricsFilter(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        String path = request.getRequestURI();
        return path == null
                || path.startsWith("/actuator")
                || path.startsWith("/swagger-ui")
                || path.startsWith("/v3/api-docs")
                || path.startsWith("/webjars");
    }

    @Override
    protected void doFilterInternal(
            HttpServletRequest request,
            HttpServletResponse response,
            FilterChain filterChain
    ) throws ServletException, IOException {
        long start = System.nanoTime();
        try {
            filterChain.doFilter(request, response);
        } finally {
            String routeFamily = classifyRouteFamily(request.getRequestURI());
            String method = safe(request.getMethod()).toUpperCase();
            String statusClass = statusClass(response.getStatus());
            Duration duration = Duration.ofNanos(Math.max(System.nanoTime() - start, 0L));

            Counter.builder("governance_http_requests_total")
                    .tag("route_family", routeFamily)
                    .tag("method", method)
                    .tag("status_class", statusClass)
                    .register(meterRegistry)
                    .increment();

            Timer.builder("governance_http_request_duration_seconds")
                    .publishPercentileHistogram()
                    .tag("route_family", routeFamily)
                    .tag("method", method)
                    .tag("status_class", statusClass)
                    .register(meterRegistry)
                    .record(duration);

            double contentLength = responseBytes(response);
            if (contentLength > 0) {
                DistributionSummary.builder("governance_http_response_bytes")
                        .baseUnit("bytes")
                        .tag("route_family", routeFamily)
                        .tag("method", method)
                        .tag("status_class", statusClass)
                        .register(meterRegistry)
                        .record(contentLength);
            }
        }
    }

    private String classifyRouteFamily(String path) {
        if (path == null || path.isBlank()) {
            return "unknown";
        }
        if (path.startsWith("/api/v1/jobs")) return "jobs";
        if (path.startsWith("/api/v1/datasets")) return "datasets";
        if (path.startsWith("/api/v1/telemetry")) return "telemetry";
        if (path.startsWith("/api/v1/metrics")) return "metrics";
        if (path.startsWith("/api/v1/alerts")) return "alerts";
        if (path.startsWith("/api/v1/broker")) return "broker";
        if (path.startsWith("/api/v1/rabbitmq")) return "rabbitmq";
        if (path.startsWith("/api/v1/pulsar")) return "pulsar";
        if (path.startsWith("/api/v1/vo")) return "vo";
        if (path.startsWith("/api/v1/archive")) return "archive";
        if (path.startsWith("/api/v1/admin")) return "admin";
        if (path.startsWith("/api/v1")) return "api_other";
        return "other";
    }

    private String statusClass(int status) {
        if (status >= 500) return "5xx";
        if (status >= 400) return "4xx";
        if (status >= 300) return "3xx";
        if (status >= 200) return "2xx";
        return "1xx";
    }

    private String safe(String value) {
        if (value == null || value.isBlank()) {
            return "unknown";
        }
        return value;
    }

    private double responseBytes(HttpServletResponse response) {
        String value = response.getHeader("Content-Length");
        if (value == null || value.isBlank()) {
            return 0.0d;
        }
        try {
            return Double.parseDouble(value);
        } catch (NumberFormatException ignored) {
            return 0.0d;
        }
    }
}
