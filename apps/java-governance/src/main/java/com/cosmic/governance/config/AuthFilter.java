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

    // optional hook, may be null in tests or dev mode
    @Autowired(required = false)
    private PolicyEnforcer policyEnforcer;

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

        // strip off the bearer prefix and validate basic structure
        String token = authHeader;
        if (token.toLowerCase().startsWith("bearer ")) {
            token = token.substring(7).trim();
        }

        if (token.isEmpty()) {
            log.debug("rejecting request due to empty bearer token");
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType("application/json");
            response.getWriter().write("{\"error\":\"unauthorized\"}");
            return;
        }

        // try to extract JWT-style claims if present; failure is non-fatal
        try {
            String[] parts = token.split("\\.");
            if (parts.length >= 2) {
                String payload = new String(java.util.Base64.getUrlDecoder().decode(parts[1]));
                org.json.JSONObject claims = new org.json.JSONObject(payload);
                request.setAttribute("auth.claims", claims.toMap());
            }
        } catch (IllegalArgumentException | org.json.JSONException ex) {
            // not a JWT, ignore
            log.debug("could not parse token as JWT for claim extraction", ex);
        }

        // policy hook allows production components to enforce rules
        if (policyEnforcer != null) {
            boolean permitted;
            try {
                permitted = policyEnforcer.permit(token, request);
            } catch (Exception e) {
                log.warn("policy enforcer threw, rejecting request", e);
                permitted = false;
            }
            if (!permitted) {
                log.debug("policy enforcer rejected token");
                response.setStatus(HttpServletResponse.SC_FORBIDDEN);
                response.setContentType("application/json");
                response.getWriter().write("{\"error\":\"forbidden\"}");
                return;
            }
        }

        filterChain.doFilter(request, response);
    }
}
