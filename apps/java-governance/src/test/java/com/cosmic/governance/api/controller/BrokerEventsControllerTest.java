package com.cosmic.governance.api.controller;

import org.junit.jupiter.api.Test;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.util.Map;
import java.util.concurrent.CopyOnWriteArrayList;

import static org.junit.jupiter.api.Assertions.*;

class BrokerEventsControllerTest {

    @Test
    void publishDeliversToConnectedEmitter() throws Exception {
        BrokerEventsController ctrl = new BrokerEventsController();
        SseEmitter emitter = ctrl.stream();
        // internal list should contain the emitter
        assertFalse(ctrl.emitters.isEmpty());
        // use custom subclass to capture sent data
        class SpyEmitter extends SseEmitter {
            Object last;
            SpyEmitter() {
                super();
            }
            @Override
            public void send(Object obj) {
                last = obj;
            }
        }
        SpyEmitter spy = new SpyEmitter();
        ctrl.emitters.clear();
        ctrl.emitters.add(spy);
        Map<String,Object> event = Map.of("foo","bar");
        ctrl.publish(event);
        assertEquals(event, spy.last);
    }
}
