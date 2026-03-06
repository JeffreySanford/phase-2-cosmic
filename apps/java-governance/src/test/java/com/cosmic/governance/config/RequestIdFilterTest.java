package com.cosmic.governance.config;

import jakarta.servlet.ServletException;
import java.io.IOException;
import org.junit.jupiter.api.Test;
import org.slf4j.MDC;
import org.springframework.mock.web.MockFilterChain;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.mock.web.MockHttpServletResponse;

import static org.junit.jupiter.api.Assertions.*;

class RequestIdFilterTest {
    private final RequestIdFilter filter = new RequestIdFilter();

    @Test
    void propagatesProvidedRequestAndTraceIds() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        request.addHeader("X-Request-Id", "req-123");
        request.addHeader("X-Trace-Id", "trace-456");
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        assertEquals("req-123", response.getHeader("X-Request-Id"));
        assertEquals("trace-456", response.getHeader("X-Trace-Id"));
        assertNull(MDC.get("requestId"));
        assertNull(MDC.get("traceId"));
    }

    @Test
    void generatesIdsWhenHeadersAreMissing() throws ServletException, IOException {
        MockHttpServletRequest request = new MockHttpServletRequest();
        MockHttpServletResponse response = new MockHttpServletResponse();

        filter.doFilter(request, response, new MockFilterChain());

        String requestId = response.getHeader("X-Request-Id");
        String traceId = response.getHeader("X-Trace-Id");
        assertNotNull(requestId);
        assertFalse(requestId.isBlank());
        assertNotNull(traceId);
        assertFalse(traceId.isBlank());
        assertNotEquals(requestId, traceId);
        assertNull(MDC.get("requestId"));
        assertNull(MDC.get("traceId"));
    }
}
