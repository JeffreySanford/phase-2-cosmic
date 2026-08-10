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
const activeStates = new Set(registry.selectionPolicy.activeStates);
const inactiveStates = new Set(registry.selectionPolicy.inactiveStates);
if (!registry.bundles[registry.defaultBundle]) {
  fail(`defaultBundle ${registry.defaultBundle} is not defined in bundles`);
}

for (const state of activeStates) {
  if (inactiveStates.has(state)) {
    fail(`selectionPolicy state ${state} cannot be both active and inactive`);
  }
}

for (const [bundleName, bundle] of Object.entries(registry.bundles)) {
  const activeProfileRefs = [];
  for (const profileRef of bundle.profileRefs) {
    if (!profileNames.has(profileRef)) {
      fail(`bundle ${bundleName} references unknown profile ${profileRef}`);
    }
    const profile = registry.profiles[profileRef];
    if (activeStates.has(profile.activationState)) {
      activeProfileRefs.push(profileRef);
    }
  }

  if (!activeProfileRefs.length) {
    fail(`bundle ${bundleName} has no active fixture/included profile`);
  }
}

const canonicalFields = registry.adapterContract.canonicalFields;

for (const [profileName, profile] of Object.entries(registry.profiles)) {
  if (profile.includeByDefault && profile.activationState === "planned") {
    fail(`planned profile ${profileName} cannot be included by default`);
  }
  if (profile.kind === "vo-tap" && (!profile.endpoint || !profile.query)) {
    fail(`VO/TAP profile ${profileName} must define endpoint and query`);
  }

  const isActive = activeStates.has(profile.activationState);

  // Active profiles must be able to produce rows through the shared adapter
  // contract. Inactive profiles are documentation-only and must not carry an
  // adapter that implies they run.
  if (isActive && !profile.adapter) {
    fail(`active profile ${profileName} must define an adapter`);
  }
  if (!isActive && profile.adapter) {
    fail(
      `inactive profile ${profileName} must not define an adapter; an adapter implies the profile produces rows`
    );
  }

  if (!profile.adapter) {
    continue;
  }

  if (profile.adapter.contract !== registry.adapterContract.id) {
    fail(
      `profile ${profileName} uses adapter contract ${profile.adapter.contract} instead of the registered ${registry.adapterContract.id}`
    );
  }

  const missing = canonicalFields.filter(
    (field) => !profile.adapter.fieldMap[field]
  );
  if (missing.length > 0) {
    fail(
      `profile ${profileName} adapter fieldMap is missing canonical field(s): ${missing.join(
        ", "
      )}`
    );
  }

  const fixturePath = path.join(
    repoRoot,
    "tools",
    "lakehouse-mvp",
    profile.adapter.fixturePath
  );
  if (!fs.existsSync(fixturePath)) {
    fail(
      `profile ${profileName} references missing fixture ${profile.adapter.fixturePath}`
    );
  }

  const fixture = readJson(fixturePath);
  if (!Array.isArray(fixture.rows) || fixture.rows.length === 0) {
    fail(`fixture ${profile.adapter.fixturePath} must contain rows`);
  }
  if (fixture.contract !== registry.adapterContract.id) {
    fail(
      `fixture ${profile.adapter.fixturePath} declares contract ${fixture.contract} instead of ${registry.adapterContract.id}`
    );
  }

  // The field map must actually address the fixture's column vocabulary,
  // otherwise canonicalization would silently produce empty records.
  const fixtureColumns = new Set(Object.keys(fixture.rows[0]));
  const unmapped = canonicalFields.filter(
    (field) => !fixtureColumns.has(profile.adapter.fieldMap[field])
  );
  if (unmapped.length > 0) {
    fail(
      `profile ${profileName} fieldMap targets column(s) absent from ${
        profile.adapter.fixturePath
      }: ${unmapped
        .map((field) => `${field} -> ${profile.adapter.fieldMap[field]}`)
        .join(", ")}`
    );
  }
}

console.log("[lakehouse-pr41] source registry verified");
