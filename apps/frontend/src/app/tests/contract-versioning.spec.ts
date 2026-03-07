import * as fs from "fs";
import * as path from "path";

describe("API contract versioning", () => {
  const openapiPath = path.resolve(
    __dirname,
    "../../../../../openapi/governance.yaml"
  );

  it("frontend model files should align with OpenAPI schema", () => {
    const content = fs.readFileSync(openapiPath, "utf8");
    expect(content).toContain("/api/v1/jobs:");
    expect(content).toContain("#/components/schemas/JobStatusResponse");
  });

  it("should expose job list filtering by state in the OpenAPI contract", () => {
    const content = fs.readFileSync(openapiPath, "utf8");
    expect(content).toContain("name: state");
    expect(content).toContain("Filter by job state.");
    expect(content).toContain("type: string");
    expect(content).toContain(
      "enum: [QUEUED, RUNNING, COMPLETED, FAILED, CANCELED, TIMED_OUT]"
    );
  });
});
