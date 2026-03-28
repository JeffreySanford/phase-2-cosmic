import { Injectable } from "@nestjs/common";

@Injectable()
export class GovernanceUpstreamService {
  buildBaseCandidates(baseUrl: string): string[] {
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

  governanceBaseCandidates(): string[] {
    const governanceBase =
      process.env["GOVERNANCE_API_URL"] || "http://127.0.0.1:8082";
    return this.buildBaseCandidates(governanceBase);
  }

  async fetchWithTimeout(
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

  async fetchWithFallback(
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
}
