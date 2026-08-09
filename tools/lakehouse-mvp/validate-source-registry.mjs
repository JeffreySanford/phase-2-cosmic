import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv2020 from "ajv/dist/2020.js";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");
const schemaPath = path.join(
  repoRoot,
  "tools",
  "lakehouse-mvp",
  "source-registry.schema.json"
);
const registryPath = path.join(
  repoRoot,
  "tools",
  "lakehouse-mvp",
  "source-registry.example.json"
);

function fail(message) {
  console.error(`[lakehouse-pr41] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

const schema = readJson(schemaPath);
const registry = readJson(registryPath);
const ajv = new Ajv2020({ allErrors: true, strict: true });
const validate = ajv.compile(schema);

if (!validate(registry)) {
  fail(
    `source registry schema validation failed: ${ajv.errorsText(
      validate.errors
    )}`
  );
}

const profileNames = new Set(Object.keys(registry.profiles));
if (!registry.bundles[registry.defaultBundle]) {
  fail(`defaultBundle ${registry.defaultBundle} is not defined in bundles`);
}

for (const [bundleName, bundle] of Object.entries(registry.bundles)) {
  for (const profileRef of bundle.profileRefs) {
    if (!profileNames.has(profileRef)) {
      fail(`bundle ${bundleName} references unknown profile ${profileRef}`);
    }
  }
}

for (const [profileName, profile] of Object.entries(registry.profiles)) {
  if (profile.includeByDefault && profile.activationState === "planned") {
    fail(`planned profile ${profileName} cannot be included by default`);
  }
  if (profile.kind === "vo-tap" && (!profile.endpoint || !profile.query)) {
    fail(`VO/TAP profile ${profileName} must define endpoint and query`);
  }
}

console.log("[lakehouse-pr41] source registry verified");
