package com.cosmic.governance.api.controller;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.Map;

/**
 * SSE endpoint for broadcasting broker/control-plane events to frontend clients.
 * Other services may inject this controller and call {@link #publish(Map)} when
 * events occur (job submissions, state transitions, etc.).
 */
@RestController
public class BrokerEventsController {
    final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    @GetMapping("/api/v1/broker-events")
    public SseEmitter stream() {
        SseEmitter emitter = new SseEmitter(Long.MAX_VALUE);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        return emitter;
    }

    /**
     * Publish an arbitrary event object to all connected clients.
     */
    public void publish(Map<String,Object> event) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(event);
            } catch (Exception ex) {
                emitters.remove(emitter);
            }
        }
    }
}
