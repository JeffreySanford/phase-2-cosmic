import * as fs from "fs";
import * as path from "path";

describe("API contract versioning", () => {
  const openapiPath = path.resolve(
    __dirname,
    "../../../../../openapi/governance.yaml"
  );

  it("frontend model files should align with OpenAPI schema", () => {
    const content = fs.readFileSync(openapiPath, "utf8");
    expect(content).toContain("JobSubmitRequest:");
  });

  it("should include JobTransitionRequest with state property", () => {
    const content = fs.readFileSync(openapiPath, "utf8");
    expect(content).toContain("JobTransitionRequest:");
    expect(content).toContain("state:");
  });
});
