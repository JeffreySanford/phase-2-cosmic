package com.cosmic.governance.api.service;

import jakarta.annotation.PostConstruct;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ThreadFactory;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicReference;

/**
 * Keeps infrastructure telemetry collection off the request path.
 *
 * <p>The underlying {@link InfrastructureTelemetryService} performs a broad set
 * of Prometheus/admin queries. Running that work synchronously for every HTTP
 * request made the frontend proxy time out and previously caused live mode to
 * display synthetic fallback data. This cache performs one readiness-time warmup,
 * then refreshes measured telemetry in the background so controller reads stay
 * cheap and truthful.</p>
 */
@Service
public class InfrastructureTelemetryCacheService {
    private static final Logger log = LoggerFactory.getLogger(InfrastructureTelemetryCacheService.class);
    private static final List<String> SERVICE_NAMES = List.of(
            "redis",
            "rabbitmq",
            "minio",
            "nginx",
            "frontendSsr",
            "dataGenerator",
            "kafka",
            "javaIngest",
            "pulsar",
            "grafana",
            "loki",
            "alertmanager",
            "governanceRuntime"
    );

    private final InfrastructureTelemetryService collector;
    private final AtomicReference<Map<String, Object>> cachedSnapshot =
            new AtomicReference<>(warmingSnapshot());
    private final ScheduledExecutorService refreshExecutor;

    @Value("${telemetry.infrastructure.refresh-interval-ms:15000}")
    private long refreshIntervalMs;

    /**
     * Defaults to one blocking warmup so application readiness means a complete
     * measured snapshot exists. Operators can disable it explicitly if startup
     * latency matters more than having telemetry ready immediately.
     */
    @Value("${telemetry.infrastructure.initial-blocking:true}")
    private boolean initialBlocking;

    public InfrastructureTelemetryCacheService(InfrastructureTelemetryService collector) {
        this.collector = collector;
        ThreadFactory threadFactory = runnable -> {
            Thread thread = new Thread(runnable, "infrastructure-telemetry-refresh");
            thread.setDaemon(true);
            return thread;
        };
        this.refreshExecutor = Executors.newSingleThreadScheduledExecutor(threadFactory);
    }

    @PostConstruct
    void startRefreshing() {
        long interval = Math.max(1_000L, refreshIntervalMs);
        if (initialBlocking) {
            refreshSafely();
        }
        long initialDelay = initialBlocking ? interval : 0L;
        refreshExecutor.scheduleWithFixedDelay(
                this::refreshSafely,
                initialDelay,
                interval,
                TimeUnit.MILLISECONDS
        );
    }

    @PreDestroy
    void stopRefreshing() {
        refreshExecutor.shutdownNow();
    }

    /**
     * Returns immediately with either the latest measured snapshot or an
     * explicit unavailable/warming snapshot. It never fabricates telemetry.
     */
    public Map<String, Object> snapshot() {
        return cachedSnapshot.get();
    }

    private void refreshSafely() {
        long startedNanos = System.nanoTime();
        try {
            Map<String, Object> measured = new LinkedHashMap<>(collector.snapshot());
            Map<String, Object> cacheMetadata = new LinkedHashMap<>();
            cacheMetadata.put("state", "ready");
            cacheMetadata.put("refreshedAt", Instant.now().toString());
            cacheMetadata.put("refreshIntervalMs", Math.max(1_000L, refreshIntervalMs));
            cacheMetadata.put(
                    "collectionDurationMs",
                    Math.round((System.nanoTime() - startedNanos) / 1_000_000.0d)
            );
            measured.put("cache", Collections.unmodifiableMap(cacheMetadata));
            cachedSnapshot.set(Collections.unmodifiableMap(measured));
        } catch (Exception error) {
            log.warn("Infrastructure telemetry background refresh failed: {}", error.toString());
            Map<String, Object> current = cachedSnapshot.get();
            Map<String, Object> next = new LinkedHashMap<>(current);
            Map<String, Object> cacheMetadata = new LinkedHashMap<>();
            cacheMetadata.put(
                    "state",
                    "unavailable".equals(String.valueOf(current.get("source"))) ? "error" : "stale"
            );
            cacheMetadata.put("failedAt", Instant.now().toString());
            cacheMetadata.put("lastError", error.getClass().getSimpleName());
            cacheMetadata.put("refreshIntervalMs", Math.max(1_000L, refreshIntervalMs));
            next.put("cache", Collections.unmodifiableMap(cacheMetadata));
            cachedSnapshot.set(Collections.unmodifiableMap(next));
        }
    }

    private static Map<String, Object> warmingSnapshot() {
        Map<String, Object> services = new LinkedHashMap<>();
        for (String serviceName : SERVICE_NAMES) {
            services.put(serviceName, Map.of("source", "unavailable"));
        }

        Map<String, Object> cacheMetadata = new LinkedHashMap<>();
        cacheMetadata.put("state", "warming");
        cacheMetadata.put("startedAt", Instant.now().toString());

        Map<String, Object> snapshot = new LinkedHashMap<>();
        snapshot.put("measuredAt", Instant.now().toString());
        snapshot.put("source", "unavailable");
        snapshot.put("services", Collections.unmodifiableMap(services));
        snapshot.put("cache", Collections.unmodifiableMap(cacheMetadata));
        return Collections.unmodifiableMap(snapshot);
    }
}
