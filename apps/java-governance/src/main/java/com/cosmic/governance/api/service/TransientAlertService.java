package com.cosmic.governance.api.service;

import com.cosmic.governance.api.model.AlertSloMetrics;
import com.cosmic.governance.api.model.TransientAlert;
import io.micrometer.core.instrument.Counter;
import io.micrometer.core.instrument.Gauge;
import io.micrometer.core.instrument.MeterRegistry;
import io.micrometer.core.instrument.Timer;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.atomic.AtomicLong;

@Service
public class TransientAlertService {

    private final Counter alertIngestedCounter;
    private final Counter replaysCounter;
    private final MeterRegistry meterRegistry;

    // In-memory DLQ store (finite bound, evict oldest on overflow)
    private static final int DLQ_MAX = 500;
    private final CopyOnWriteArrayList<TransientAlert> dlqStore = new CopyOnWriteArrayList<>();

    // Latency samples (ms) — last 1000 ingest events
    private final CopyOnWriteArrayList<Double> latencySamples = new CopyOnWriteArrayList<>();
    private static final int LATENCY_SAMPLES_MAX = 1000;

    private final AtomicLong alertTotal = new AtomicLong(0);
    private final AtomicLong replayTotal = new AtomicLong(0);

    public TransientAlertService(MeterRegistry meterRegistry) {
        this.meterRegistry = meterRegistry;
        this.alertIngestedCounter = Counter.builder("alert_ingested_total")
                .description("Total transient alerts ingested")
                .register(meterRegistry);
        this.replaysCounter = Counter.builder("alert_replays_total")
                .description("Total alerts replayed from DLQ")
                .register(meterRegistry);
        Gauge.builder("alert_dlq_depth", dlqStore, List::size)
                .description("Current transient alert DLQ depth")
                .register(meterRegistry);
    }

    public TransientAlert ingest(String eventType, String severity, String sourceSystem,
                                  String correlationId, String message, List<String> tags,
                                  double latencyMs) {
        TransientAlert alert = new TransientAlert(
                UUID.randomUUID().toString(),
                eventType,
                severity,
                sourceSystem,
                correlationId != null ? correlationId : UUID.randomUUID().toString(),
                message,
                Instant.now().toString(),
                false,
                tags != null ? List.copyOf(tags) : List.of());

        alertIngestedCounter.increment();
        alertTotal.incrementAndGet();
        recordLatency(latencyMs);
        return alert;
    }

    public void sendToDlq(TransientAlert alert) {
        if (dlqStore.size() >= DLQ_MAX) {
            dlqStore.remove(0);
        }
        dlqStore.add(alert);
    }

    public List<TransientAlert> getDlq() {
        return Collections.unmodifiableList(new ArrayList<>(dlqStore));
    }

    public Optional<TransientAlert> replayFromDlq(String alertId) {
        long startedAt = System.nanoTime();
        for (TransientAlert a : dlqStore) {
            if (a.id().equals(alertId)) {
                dlqStore.remove(a);
                TransientAlert replayed = new TransientAlert(
                        a.id(), a.eventType(), a.severity(), a.sourceSystem(),
                        a.correlationId(), a.message(), a.issuedAt(), true, a.tags());
                replaysCounter.increment();
                replayTotal.incrementAndGet();
                recordReplayMetric("single", "success", 1, startedAt);
                return Optional.of(replayed);
            }
        }
        recordReplayMetric("single", "miss", 0, startedAt);
        return Optional.empty();
    }

    public int replayAllFromDlq() {
        long startedAt = System.nanoTime();
        List<TransientAlert> pending = new ArrayList<>(dlqStore);
        dlqStore.clear();
        int count = pending.size();
        replaysCounter.increment(count);
        replayTotal.addAndGet(count);
        recordReplayMetric("all", count > 0 ? "success" : "empty", count, startedAt);
        return count;
    }

    public AlertSloMetrics getMetrics() {
        List<Double> samples = new ArrayList<>(latencySamples);
        return new AlertSloMetrics(
                alertTotal.get(),
                percentile(samples, 50),
                percentile(samples, 95),
                percentile(samples, 99),
                dlqStore.size(),
                replayTotal.get(),
                Instant.now().toString());
    }

    private void recordLatency(double ms) {
        if (ms < 0) return;
        if (latencySamples.size() >= LATENCY_SAMPLES_MAX) {
            latencySamples.remove(0);
        }
        latencySamples.add(ms);
    }

    private double percentile(List<Double> sorted, int pct) {
        if (sorted.isEmpty()) return 0.0;
        List<Double> s = new ArrayList<>(sorted);
        Collections.sort(s);
        int index = (int) Math.ceil(pct / 100.0 * s.size()) - 1;
        return s.get(Math.max(0, Math.min(index, s.size() - 1)));
    }

    private void recordReplayMetric(String path, String result, int replayCount, long startedAtNanos) {
        Counter.builder("alert_replay_attempts_total")
                .description("Total transient alert replay attempts by path and outcome")
                .tag("path", path)
                .tag("result", result)
                .register(meterRegistry)
                .increment();
        Counter.builder("alert_replay_items_total")
                .description("Total transient alerts replayed by path and outcome")
                .tag("path", path)
                .tag("result", result)
                .register(meterRegistry)
                .increment(replayCount);
        Timer.builder("alert_replay_duration_seconds")
                .description("Transient alert replay duration by path and outcome")
                .tag("path", path)
                .tag("result", result)
                .register(meterRegistry)
                .record(System.nanoTime() - startedAtNanos, java.util.concurrent.TimeUnit.NANOSECONDS);
    }
}
