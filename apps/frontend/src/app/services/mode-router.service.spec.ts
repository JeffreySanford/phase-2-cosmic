import { ModeRouterService, JobMode } from "./mode-router.service";

describe("ModeRouterService", () => {
  let router: ModeRouterService;
  beforeEach(() => {
    router = new ModeRouterService();
  });

  it("returns appropriate template for each valid mode", () => {
    const modes: JobMode[] = [
      "VLBI",
      "PULSAR_TIMING",
      "PULSAR_SEARCH",
      "CORRELATION",
    ];
    modes.forEach((m) => {
      const tmpl = router.selectTemplate(m);
      // convert mode constant to a loose pattern (allow dash or underscore)
      const pattern = m.toLowerCase().replace(/_/g, "[-_]");
      expect(tmpl.name).toMatch(new RegExp(pattern));
    });
  });

  it("throws on unknown mode", () => {
    // @ts-ignore
    expect(() => router.selectTemplate("UNKNOWN")).toThrow("unsupported mode");
  });
});
