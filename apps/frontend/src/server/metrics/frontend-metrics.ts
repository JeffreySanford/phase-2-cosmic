const DURATION_BUCKETS = [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5];

const frontendRequestsTotal: Record<string, number> = {};
const frontendResponseBytesTotal: Record<string, number> = {};
const frontendDurationBucketCounts: Record<string, number[]> = {};
const frontendDurationCount: Record<string, number> = {};
const frontendDurationSum: Record<string, number> = {};
const frontendApiRequestsTotal: Record<string, number> = {};
const frontendApiResponseBytesTotal: Record<string, number> = {};
const frontendApiDurationBucketCounts: Record<string, number[]> = {};
const frontendApiDurationCount: Record<string, number> = {};
const frontendApiDurationSum: Record<string, number> = {};

function frontendRequestKey(
  routeGroup: string,
  method: string,
  statusClass: string
): string {
  return `${routeGroup}|${method}|${statusClass}`;
}

function frontendApiKey(
  apiGroup: string,
  method: string,
  statusClass: string
): string {
  return `${apiGroup}|${method}|${statusClass}`;
}

function observeFrontendRequestDuration(
  routeGroup: string,
  method: string,
  statusClass: string,
  seconds: number
): void {
  const key = frontendRequestKey(routeGroup, method, statusClass);
  const buckets =
    frontendDurationBucketCounts[key] ??
    new Array(DURATION_BUCKETS.length + 1).fill(0);
  frontendDurationBucketCounts[key] = buckets;
  frontendDurationCount[key] = (frontendDurationCount[key] ?? 0) + 1;
  frontendDurationSum[key] = (frontendDurationSum[key] ?? 0) + seconds;
  const idx = DURATION_BUCKETS.findIndex((bucket) => seconds <= bucket);
  buckets[idx === -1 ? buckets.length - 1 : idx] += 1;
}

function observeFrontendApiDuration(
  apiGroup: string,
  method: string,
  statusClass: string,
  seconds: number
): void {
  const key = frontendApiKey(apiGroup, method, statusClass);
  const buckets =
    frontendApiDurationBucketCounts[key] ??
    new Array(DURATION_BUCKETS.length + 1).fill(0);
  frontendApiDurationBucketCounts[key] = buckets;
  frontendApiDurationCount[key] = (frontendApiDurationCount[key] ?? 0) + 1;
  frontendApiDurationSum[key] = (frontendApiDurationSum[key] ?? 0) + seconds;
  const idx = DURATION_BUCKETS.findIndex((bucket) => seconds <= bucket);
  buckets[idx === -1 ? buckets.length - 1 : idx] += 1;
}

export function recordFrontendRequestMetrics(
  routeGroup: string,
  method: string,
  status: number,
  responseBytes: number,
  durationSeconds: number
): void {
  const statusClass =
    status >= 500
      ? "5xx"
      : status >= 400
      ? "4xx"
      : status >= 300
      ? "3xx"
      : "2xx";
  const key = frontendRequestKey(routeGroup, method.toUpperCase(), statusClass);
  frontendRequestsTotal[key] = (frontendRequestsTotal[key] ?? 0) + 1;
  frontendResponseBytesTotal[key] =
    (frontendResponseBytesTotal[key] ?? 0) + Math.max(0, responseBytes);
  observeFrontendRequestDuration(
    routeGroup,
    method.toUpperCase(),
    statusClass,
    durationSeconds
  );
}

export function recordFrontendApiMetrics(
  apiGroup: string,
  method: string,
  status: number,
  responseBytes: number,
  durationSeconds: number
): void {
  const statusClass =
    status >= 500
      ? "5xx"
      : status >= 400
      ? "4xx"
      : status >= 300
      ? "3xx"
      : "2xx";
  const key = frontendApiKey(apiGroup, method.toUpperCase(), statusClass);
  frontendApiRequestsTotal[key] = (frontendApiRequestsTotal[key] ?? 0) + 1;
  frontendApiResponseBytesTotal[key] =
    (frontendApiResponseBytesTotal[key] ?? 0) + Math.max(0, responseBytes);
  observeFrontendApiDuration(
    apiGroup,
    method.toUpperCase(),
    statusClass,
    durationSeconds
  );
}

export function classifyFrontendRoute(path: string): string {
  if (!path || path === "/") return "landing";
  const normalized = path.split("?")[0].toLowerCase();
  if (normalized.startsWith("/dashboard")) return "dashboard";
  if (normalized.startsWith("/forge")) return "forge";
  if (normalized.startsWith("/telemetry")) return "telemetry";
  if (normalized.startsWith("/topology")) return "topology";
  if (normalized.startsWith("/jobs")) return "jobs";
  if (normalized.startsWith("/viewer")) return "viewer";
  if (normalized.startsWith("/datasets")) return "datasets";
  if (normalized.startsWith("/diagnostics")) return "diagnostics";
  if (normalized.startsWith("/settings")) return "settings";
  return "other";
}

export function classifyFrontendApiRoute(path: string): string {
  if (!path) return "other";
  const normalized = path.split("?")[0].toLowerCase();
  if (normalized.startsWith("/api/forge")) return "forge";
  if (normalized === "/api/v1/telemetry/infrastructure") return "telemetry";
  if (normalized.startsWith("/api/v1/alerts")) return "alerts";
  if (normalized.startsWith("/api/v1/broker-events")) return "broker_events";
  if (normalized.startsWith("/api/v1/commissioning")) return "commissioning";
  if (normalized.startsWith("/api/v1/health")) return "health";
  if (normalized.startsWith("/api/v1/pulsar")) return "pulsar";
  if (normalized.startsWith("/api/v1/rabbitmq")) return "rabbitmq";
  if (normalized.startsWith("/api/v1/vo")) return "vo";
  if (normalized.startsWith("/api/v1/jobs")) return "jobs";
  if (normalized.startsWith("/api/v1/admin")) return "admin";
  if (normalized.startsWith("/api/v1/public-sources")) return "public_sources";
  return "other";
}

export function appendFrontendMetrics(lines: string[]): void {
  lines.push(
    "# HELP frontend_ssr_frontend_requests_total Total frontend-originated page requests handled by Nest SSR.",
    "# TYPE frontend_ssr_frontend_requests_total counter"
  );
  for (const [key, value] of Object.entries(frontendRequestsTotal)) {
    const [routeGroup, method, statusClass] = key.split("|");
    lines.push(
      `frontend_ssr_frontend_requests_total{route_group="${routeGroup}",method="${method}",status_class="${statusClass}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_frontend_response_bytes_total Total response bytes served by Nest SSR for frontend page requests.",
    "# TYPE frontend_ssr_frontend_response_bytes_total counter"
  );
  for (const [key, value] of Object.entries(frontendResponseBytesTotal)) {
    const [routeGroup, method, statusClass] = key.split("|");
    lines.push(
      `frontend_ssr_frontend_response_bytes_total{route_group="${routeGroup}",method="${method}",status_class="${statusClass}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_frontend_request_duration_seconds Duration of frontend page requests handled by Nest SSR.",
    "# TYPE frontend_ssr_frontend_request_duration_seconds histogram"
  );
  for (const key of Object.keys(frontendDurationBucketCounts)) {
    const [routeGroup, method, statusClass] = key.split("|");
    const buckets = frontendDurationBucketCounts[key];
    let bucketCumulative = 0;
    DURATION_BUCKETS.forEach((bucket, index) => {
      bucketCumulative += buckets[index] ?? 0;
      lines.push(
        `frontend_ssr_frontend_request_duration_seconds_bucket{route_group="${routeGroup}",method="${method}",status_class="${statusClass}",le="${bucket}"} ${bucketCumulative}`
      );
    });
    bucketCumulative += buckets[buckets.length - 1] ?? 0;
    lines.push(
      `frontend_ssr_frontend_request_duration_seconds_bucket{route_group="${routeGroup}",method="${method}",status_class="${statusClass}",le="+Inf"} ${bucketCumulative}`,
      `frontend_ssr_frontend_request_duration_seconds_sum{route_group="${routeGroup}",method="${method}",status_class="${statusClass}"} ${
        frontendDurationSum[key] ?? 0
      }`,
      `frontend_ssr_frontend_request_duration_seconds_count{route_group="${routeGroup}",method="${method}",status_class="${statusClass}"} ${
        frontendDurationCount[key] ?? 0
      }`
    );
  }

  lines.push(
    "# HELP frontend_ssr_frontend_api_requests_total Total frontend-originated API requests handled by Nest SSR.",
    "# TYPE frontend_ssr_frontend_api_requests_total counter"
  );
  for (const [key, value] of Object.entries(frontendApiRequestsTotal)) {
    const [apiGroup, method, statusClass] = key.split("|");
    lines.push(
      `frontend_ssr_frontend_api_requests_total{api_group="${apiGroup}",method="${method}",status_class="${statusClass}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_frontend_api_response_bytes_total Total response bytes served by Nest SSR for frontend-originated API requests.",
    "# TYPE frontend_ssr_frontend_api_response_bytes_total counter"
  );
  for (const [key, value] of Object.entries(frontendApiResponseBytesTotal)) {
    const [apiGroup, method, statusClass] = key.split("|");
    lines.push(
      `frontend_ssr_frontend_api_response_bytes_total{api_group="${apiGroup}",method="${method}",status_class="${statusClass}"} ${value}`
    );
  }

  lines.push(
    "# HELP frontend_ssr_frontend_api_request_duration_seconds Duration of frontend-originated API requests handled by Nest SSR.",
    "# TYPE frontend_ssr_frontend_api_request_duration_seconds histogram"
  );
  for (const key of Object.keys(frontendApiDurationBucketCounts)) {
    const [apiGroup, method, statusClass] = key.split("|");
    const buckets = frontendApiDurationBucketCounts[key];
    let bucketCumulative = 0;
    DURATION_BUCKETS.forEach((bucket, index) => {
      bucketCumulative += buckets[index] ?? 0;
      lines.push(
        `frontend_ssr_frontend_api_request_duration_seconds_bucket{api_group="${apiGroup}",method="${method}",status_class="${statusClass}",le="${bucket}"} ${bucketCumulative}`
      );
    });
    bucketCumulative += buckets[buckets.length - 1] ?? 0;
    lines.push(
      `frontend_ssr_frontend_api_request_duration_seconds_bucket{api_group="${apiGroup}",method="${method}",status_class="${statusClass}",le="+Inf"} ${bucketCumulative}`,
      `frontend_ssr_frontend_api_request_duration_seconds_sum{api_group="${apiGroup}",method="${method}",status_class="${statusClass}"} ${
        frontendApiDurationSum[key] ?? 0
      }`,
      `frontend_ssr_frontend_api_request_duration_seconds_count{api_group="${apiGroup}",method="${method}",status_class="${statusClass}"} ${
        frontendApiDurationCount[key] ?? 0
      }`
    );
  }
}
