import { Injectable } from "@nestjs/common";
import { Request, Response } from "express";
import { Observable, defer, from, of } from "rxjs";
import { catchError, map, switchMap, tap } from "rxjs/operators";

type ForgeMetricsRecorder = (
  method: string,
  status: number,
  responseBytes: number,
  durationSeconds: number
) => void;

@Injectable()
export class ForgeProxyService {
  handle(
    req: Request,
    res: Response,
    recordMetrics: ForgeMetricsRecorder
  ): Observable<unknown> {
    const requestPath = req.path as string;
    const method = (req.method || "GET").toUpperCase();

    if (requestPath === "/api/forge/health" && method === "GET") {
      const targetUrls = this.forgeBaseCandidates().map(
        (baseUrl) => `${baseUrl}/health`
      );
      const started = Date.now();

      return defer(() =>
        from(
          this.fetchWithFallback(
            targetUrls,
            {
              method: "GET",
              headers: { Accept: "application/json" },
            },
            3000
          )
        )
      ).pipe(
        switchMap((response) =>
          from(response.json()).pipe(map((body) => ({ response, body })))
        ),
        tap(({ response, body }) => {
          recordMetrics(
            method,
            response.status,
            Buffer.byteLength(JSON.stringify(body), "utf8"),
            (Date.now() - started) / 1000
          );
          res.status(response.status);
        }),
        map(({ body }) => body),
        catchError((error: unknown) => {
          this.logProxyError("Error proxying to Forge API:", error);
          recordMetrics(method, 502, 0, 0);
          res.status(502);
          return of({
            error: "forge_proxy_error",
            message: "Unable to reach Cosmic Forge API",
          });
        })
      );
    }

    if (requestPath === "/api/forge/graphql" && method === "POST") {
      const targetUrls = this.forgeBaseCandidates().map(
        (baseUrl) => `${baseUrl}/graphql`
      );
      const started = Date.now();

      return defer(() =>
        from(
          this.fetchWithFallback(
            targetUrls,
            {
              method: "POST",
              headers: {
                Accept: "application/json",
                "Content-Type": "application/json",
              },
              body: JSON.stringify(req.body ?? {}),
            },
            3000
          )
        )
      ).pipe(
        switchMap((response) =>
          from(response.json()).pipe(map((body) => ({ response, body })))
        ),
        tap(({ response, body }) => {
          recordMetrics(
            method,
            response.status,
            Buffer.byteLength(JSON.stringify(body), "utf8"),
            (Date.now() - started) / 1000
          );
          res.status(response.status);
        }),
        map(({ body }) => body),
        catchError((error: unknown) => {
          this.logProxyError("Error proxying Forge GraphQL:", error);
          recordMetrics(method, 502, 0, 0);
          res.status(502);
          return of({
            error: "forge_graphql_proxy_error",
            message: "Unable to reach Cosmic Forge GraphQL endpoint",
          });
        })
      );
    }

    if (requestPath === "/api/forge/resolve-target" && method === "GET") {
      const targetUrls = this.forgeBaseCandidates().map((baseUrl) => {
        const search = req.url.includes("?")
          ? req.url.slice(req.url.indexOf("?"))
          : "";
        return `${baseUrl}/resolve-target${search}`;
      });
      const started = Date.now();

      return defer(() =>
        from(
          this.fetchWithFallback(
            targetUrls,
            {
              method: "GET",
              headers: { Accept: "application/json" },
            },
            5000
          )
        )
      ).pipe(
        switchMap((response) =>
          from(response.json()).pipe(map((body) => ({ response, body })))
        ),
        tap(({ response, body }) => {
          recordMetrics(
            method,
            response.status,
            Buffer.byteLength(JSON.stringify(body), "utf8"),
            (Date.now() - started) / 1000
          );
          res.status(response.status);
        }),
        map(({ body }) => body),
        catchError((error: unknown) => {
          this.logProxyError("Error proxying Forge target resolution:", error);
          recordMetrics(method, 502, 0, 0);
          res.status(502);
          return of({
            error: "forge_target_resolution_proxy_error",
            message: "Unable to reach Cosmic Forge target resolution endpoint",
          });
        })
      );
    }

    if (requestPath.startsWith("/api/forge/artifacts/") && method === "GET") {
      const targetUrls = this.forgeBaseCandidates().map(
        (baseUrl) => `${baseUrl}${requestPath.replace("/api/forge", "")}`
      );
      const started = Date.now();

      return defer(() =>
        from(
          this.fetchWithFallback(
            targetUrls,
            {
              method: "GET",
              headers: { Accept: "*/*" },
            },
            5000
          )
        )
      ).pipe(
        switchMap((response) =>
          from(response.arrayBuffer()).pipe(
            map((body) => ({
              response,
              body: Buffer.from(body),
            }))
          )
        ),
        tap(({ response, body }) => {
          recordMetrics(
            method,
            response.status,
            body.byteLength,
            (Date.now() - started) / 1000
          );
          res.status(response.status);
          res.setHeader(
            "Content-Type",
            response.headers.get("content-type") || "application/octet-stream"
          );
          res.setHeader("Content-Length", String(body.byteLength));
          res.send(body);
        }),
        map(() => null),
        catchError((error: unknown) => {
          this.logProxyError("Error proxying Forge artifact:", error);
          recordMetrics(method, 502, 0, 0);
          res.status(502).json({
            error: "forge_artifact_proxy_error",
            message: "Unable to reach cached Cosmic Forge artifact",
          });
          return of(null);
        })
      );
    }

    res.status(501);
    return of({
      error: "forge_not_implemented",
      message: "Forge route reserved but not yet implemented",
      path: requestPath,
      method,
    });
  }

  private async fetchWithTimeout(
    url: string,
    init: RequestInit,
    timeoutMs = 7000
  ): Promise<globalThis.Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async fetchWithFallback(
    urls: readonly string[],
    init: RequestInit,
    timeoutMs = 7000
  ): Promise<globalThis.Response> {
    let lastError: unknown;
    for (const url of urls) {
      try {
        return await this.fetchWithTimeout(url, init, timeoutMs);
      } catch (error) {
        lastError = error;
      }
    }

    throw lastError ?? new Error("fetch_failed");
  }

  private forgeBaseCandidates(): string[] {
    const forgeBase =
      process.env["FORGE_API_URL"] ||
      `http://127.0.0.1:${process.env["FORGE_API_HOST_PORT"] || "4101"}`;
    return this.buildBaseCandidates(forgeBase);
  }

  private buildBaseCandidates(baseUrl: string): string[] {
    const out = [baseUrl];
    try {
      const url = new URL(baseUrl);
      if (url.hostname === "localhost") {
        const ipv4Url = new URL(baseUrl);
        ipv4Url.hostname = "127.0.0.1";
        out.push(ipv4Url.toString().replace(/\/$/, ""));
      } else if (url.hostname === "127.0.0.1") {
        const localhostUrl = new URL(baseUrl);
        localhostUrl.hostname = "localhost";
        out.push(localhostUrl.toString().replace(/\/$/, ""));
      }
    } catch {
      // Ignore malformed base URL and use the original only.
    }

    return Array.from(new Set(out));
  }

  private logProxyError(message: string, error: unknown): void {
    if (process.env["USE_EMBEDDED_E2E_BACKEND"] === "true") {
      return;
    }

    console.error(message, error);
  }
}
