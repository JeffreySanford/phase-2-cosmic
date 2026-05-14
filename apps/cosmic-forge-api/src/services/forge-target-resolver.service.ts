const SESAME_URL_PREFIX = "https://cds.unistra.fr/cgi-bin/nph-sesame/-oxp/SNV?";

export type ForgeTargetResolutionResponse = {
  status: number;
  body: unknown;
};

type ResolvedTarget = {
  query: string;
  canonicalName: string;
  providerName: string;
  sourceUrl: string;
  ra: number;
  dec: number;
  suggestedRadiusArcmin: number;
};

export class ForgeTargetResolverService {
  async resolve(query: string): Promise<ForgeTargetResolutionResponse> {
    const normalizedQuery = String(query ?? "").trim();
    if (!normalizedQuery) {
      return {
        status: 400,
        body: {
          error: "forge_target_resolution_bad_request",
          message: "Target query is required for Forge target resolution.",
        },
      };
    }

    const targetUrl = `${SESAME_URL_PREFIX}${encodeURIComponent(
      normalizedQuery
    )}`;
    try {
      const response = await this.fetchWithTimeout(targetUrl, 5000);
      if (!response.ok) {
        return {
          status: 502,
          body: {
            error: "forge_target_resolution_upstream_error",
            message: `Target resolution upstream returned ${response.status}.`,
          },
        };
      }

      const xml = await response.text();
      const resolvedTarget = this.parseSesameXml(
        normalizedQuery,
        targetUrl,
        xml
      );
      if (!resolvedTarget) {
        return {
          status: 404,
          body: {
            error: "forge_target_not_found",
            message: `No target coordinates were resolved for "${normalizedQuery}".`,
          },
        };
      }

      return {
        status: 200,
        body: {
          data: resolvedTarget,
        },
      };
    } catch (error) {
      return {
        status: 502,
        body: {
          error: "forge_target_resolution_unavailable",
          message: "Forge target resolution is unavailable right now.",
          details: error instanceof Error ? error.message : String(error),
        },
      };
    }
  }

  private async fetchWithTimeout(
    url: string,
    timeoutMs: number
  ): Promise<globalThis.Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort("timeout"), timeoutMs);
    try {
      return await fetch(url, {
        method: "GET",
        headers: { Accept: "application/xml, text/xml, text/plain" },
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  }

  private parseSesameXml(
    query: string,
    sourceUrl: string,
    xml: string
  ): ResolvedTarget | null {
    const ra = this.extractTagValue(xml, "jradeg");
    const dec = this.extractTagValue(xml, "jdedeg");
    if (ra === null || dec === null) {
      return null;
    }

    const canonicalName =
      this.extractTextTagValue(xml, "oname") ??
      this.extractTextTagValue(xml, "name") ??
      query;

    return {
      query,
      canonicalName,
      providerName: "CDS Sesame / SIMBAD",
      sourceUrl,
      ra,
      dec,
      suggestedRadiusArcmin: this.suggestRadiusArcmin(canonicalName),
    };
  }

  private extractTagValue(xml: string, tagName: string): number | null {
    const match = new RegExp(`<${tagName}>([^<]+)</${tagName}>`, "i").exec(xml);
    if (!match) {
      return null;
    }

    const value = Number(match[1]);
    return Number.isFinite(value) ? value : null;
  }

  private extractTextTagValue(xml: string, tagName: string): string | null {
    const match = new RegExp(`<${tagName}>([^<]+)</${tagName}>`, "i").exec(xml);
    return match?.[1]?.trim() || null;
  }

  private suggestRadiusArcmin(targetName: string): number {
    const normalized = targetName.trim().toLowerCase();
    switch (normalized) {
      case "m 87":
      case "m87":
      case "virgo a":
        return 15;
      case "cygnus a":
      case "mcg+07-41-003":
        return 12;
      case "ngc 1275":
      case "perseus a":
        return 12;
      case "eta carinae":
        return 20;
      case "horsehead":
      case "horsehead nebula":
        return 18;
      default:
        return 15;
    }
  }
}
