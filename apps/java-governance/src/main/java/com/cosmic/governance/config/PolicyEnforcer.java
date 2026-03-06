package com.cosmic.governance.config;

import jakarta.servlet.http.HttpServletRequest;

/**
 * Optional hook for production authorization or token policy checks.
 *
 * In the early MVP stage the filter only requires a bearer token header; a
 * real deployment can wire a bean implementing this interface to inspect the
 * raw token, the request details, or any extracted claims and decide whether
 * the request is permitted.  A `null` bean means no additional checks are
 * performed (development mode).
 */
public interface PolicyEnforcer {
    /**
     * Evaluate whether the request should be allowed to proceed.
     *
     * @param token the raw bearer token string (without the "Bearer " prefix)
     * @param request the current servlet request
     * @return true if the request is allowed, false to reject it with HTTP 403
     */
    boolean permit(String token, HttpServletRequest request);
}
