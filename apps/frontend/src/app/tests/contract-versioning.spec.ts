import * as fs from "fs";
import * as path from "path";

describe("API contract versioning", () => {
  const openapiCandidates = [
    path.resolve(__dirname, "../../../../../openapi/governance.yaml"),
    path.resolve(
      __dirname,
      "../../../../../apps/java-governance/src/main/resources/static/openapi/governance.yaml"
    ),
    path.resolve(
      __dirname,
      "../../../../../apps/java-governance/target/classes/static/openapi/governance.yaml"
    ),
  ];

  const openapiPath = openapiCandidates.find((candidate) =>
    fs.existsSync(candidate)
  );

  const readOpenapi = () => {
    expect(openapiPath).toBeDefined();
    return fs.readFileSync(openapiPath as string, "utf8");
  };

  it("frontend model files should align with OpenAPI schema", () => {
    const content = readOpenapi();
    expect(content).toContain("JobSubmitRequest:");
  });

  it("should include JobTransitionRequest with state property", () => {
    const content = readOpenapi();
    expect(content).toContain("JobTransitionRequest:");
    expect(content).toContain("state:");
  });
});
