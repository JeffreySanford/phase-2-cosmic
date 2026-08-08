import { GovernanceUpstreamService } from "./governance-upstream.service";

describe("GovernanceUpstreamService", () => {
  it("returns a truthful warming topology payload when governance is still starting", async () => {
    const service = new GovernanceUpstreamService();
    jest
      .spyOn(service, "fetchWithTimeout")
      .mockRejectedValue(new Error("governance unavailable"));

    const response = await service.fetchWithFallback(
      [
        "http://127.0.0.1:8082/api/v1/metrics/topology",
        "http://localhost:8082/api/v1/metrics/topology",
      ],
      { method: "GET" },
      7000
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual(
      expect.objectContaining({
        source: "warming",
        links: {},
        cache: expect.objectContaining({
          state: "warming",
          reason: "governance_startup",
        }),
      })
    );
    expect(service.fetchWithTimeout).toHaveBeenNthCalledWith(
      1,
      "http://127.0.0.1:8082/api/v1/metrics/topology",
      { method: "GET" },
      1000
    );
  });

  it("still throws for non-topology upstream failures", async () => {
    const service = new GovernanceUpstreamService();
    jest
      .spyOn(service, "fetchWithTimeout")
      .mockRejectedValue(new Error("upstream failed"));

    await expect(
      service.fetchWithFallback(
        ["http://127.0.0.1:8082/api/v1/jobs"],
        { method: "GET" },
        7000
      )
    ).rejects.toThrow("upstream failed");
  });
});
