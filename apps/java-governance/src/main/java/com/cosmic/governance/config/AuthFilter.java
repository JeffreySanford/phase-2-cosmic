package com.cosmic.governance.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * Very lightweight authentication shim.
 * When the property `governance.auth.enabled` is set to true this filter
 * enforces the presence of an Authorization header (Bearer).
 * In dev mode the property is unset/false and requests are passed through.
 *
 * Production "policy hooks" can later be wired into a PolicyEnforcer bean.
 */
@Component
@Order(1)
public class AuthFilter extends OncePerRequestFilter {
    private static final Logger log = LoggerFactory.getLogger(AuthFilter.class);

    // we evaluate the flag at request time so that tests and runtime
    // overrides (system properties, config server, etc.) are honored dynamically.
    @Autowired
    private org.springframework.core.env.Environment env;

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain filterChain)
            throws ServletException, IOException {
        boolean enabled = Boolean.parseBoolean(env.getProperty("governance.auth.enabled","false"));
        if (!enabled) {
            filterChain.doFilter(request, response);
            return;
        }
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || authHeader.isBlank()) {
            log.debug("rejecting request due to missing Authorization header");
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"unauthorized\"}");
            return;
        }
        // TODO: add token validation/claims extraction or policy checks here
        filterChain.doFilter(request, response);
    }
}
