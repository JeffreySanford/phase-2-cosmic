import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");
const outputRoot = path.join(repoRoot, "tmp", "lakehouse", "pr41-delta");
const manifestPath = path.join(outputRoot, "manifest.json");
const scaleProfilesPath = path.join(
  repoRoot,
  "tools",
  "lakehouse-mvp",
  "scale-profiles.json"
);
const sourceRegistryPath = path.join(
  repoRoot,
  "tools",
  "lakehouse-mvp",
  "source-registry.example.json"
);
const args = process.argv.slice(2);
const profileArgIndex = args.indexOf("--profile");
const expectedProfile =
  profileArgIndex >= 0 ? args[profileArgIndex + 1] : "tiny";

function fail(message) {
  console.error(`[lakehouse-pr41] ${message}`);
  process.exit(1);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function assertTable(name, expectedMinRows) {
  const table = manifest.tables[name];
  if (!table) {
    fail(`missing manifest entry for ${name}`);
  }
  if (table.rows < expectedMinRows) {
    fail(
      `${name} expected at least ${expectedMinRows} row(s), found ${table.rows}`
    );
  }

  const tablePath = path.join(outputRoot, table.path);
  const deltaLog = path.join(outputRoot, table.deltaLogPath || "");
  const parquet = path.join(outputRoot, table.parquetPath || "");
  if (!fs.existsSync(deltaLog)) {
    fail(`${name} missing Delta log ${deltaLog}`);
  }
  if (!fs.existsSync(parquet)) {
    fail(`${name} missing Parquet file ${parquet}`);
  }
  if (!fs.existsSync(tablePath)) {
    fail(`${name} missing table directory ${tablePath}`);
  }
  if (!Number.isFinite(table.bytes) || table.bytes <= 0) {
    fail(`${name} manifest has invalid byte count ${table.bytes}`);
  }
  const actualBytes = fs.statSync(parquet).size;
  if (actualBytes !== table.bytes) {
    fail(`${name} manifest bytes ${table.bytes} did not match ${actualBytes}`);
  }

  const actions = fs
    .readFileSync(deltaLog, "utf8")
    .trim()
    .split(/\r?\n/)
    .map((line) => JSON.parse(line));
  if (!actions.some((action) => action.protocol)) {
    fail(`${name} Delta log has no protocol action`);
  }
  if (!actions.some((action) => action.metaData?.name === name)) {
    fail(`${name} Delta log has no matching metadata action`);
  }
  if (!actions.some((action) => action.add?.path === "part-00000.parquet")) {
    fail(`${name} Delta log has no parquet add action`);
  }
}

if (!fs.existsSync(manifestPath)) {
  fail(
    `manifest not found at ${manifestPath}; run pnpm nx run lakehouse-mvp:run first`
  );
}

if (!expectedProfile) {
  fail("--profile was provided without a profile value");
}

const registry = readJson(scaleProfilesPath);
const sourceRegistry = readJson(sourceRegistryPath);
const registryProfiles = registry.profiles || {};
if (registry.defaultProfile !== "tiny") {
  fail(
    `scale registry defaultProfile must be tiny, found ${registry.defaultProfile}`
  );
}
for (const profileName of ["tiny", "10gb", "100gb", "1tb"]) {
  if (!registryProfiles[profileName]) {
    fail(`scale registry missing required profile ${profileName}`);
  }
}
for (const profileName of ["10gb", "100gb", "1tb"]) {
  if (!registryProfiles[profileName].requiresExplicitApproval) {
    fail(`large profile ${profileName} must require explicit approval`);
  }
}

const manifest = readJson(manifestPath);

if (manifest.scaleProfile?.name !== expectedProfile) {
  fail(
    `PR41 verifier expected ${expectedProfile} profile artifacts, found ${
      manifest.scaleProfile?.name || "unknown"
    }`
  );
}
if (!sourceRegistry.bundles?.[manifest.sourceBundle?.name]) {
  fail(
    `manifest sourceBundle ${
      manifest.sourceBundle?.name || "unknown"
    } is missing from source registry`
  );
}
for (const profileRef of manifest.sourceBundle?.profileRefs || []) {
  if (!sourceRegistry.profiles?.[profileRef]) {
    fail(
      `manifest sourceBundle references unknown source profile ${profileRef}`
    );
  }
}
if (!manifest.sourceBundle?.activeProfileRefs?.length) {
  fail("manifest sourceBundle must include at least one activeProfileRef");
}
const activeStates = new Set(
  sourceRegistry.selectionPolicy?.activeStates || []
);
for (const profileRef of manifest.sourceBundle.activeProfileRefs) {
  const profile = sourceRegistry.profiles?.[profileRef];
  if (!profile) {
    fail(
      `manifest sourceBundle activeProfileRefs references unknown profile ${profileRef}`
    );
  }
  if (!activeStates.has(profile.activationState)) {
    fail(
      `manifest sourceBundle active profile ${profileRef} has inactive state ${profile.activationState}`
    );
  }
}
if (!registryProfiles[manifest.scaleProfile.name]) {
  fail(
    `manifest uses profile missing from registry: ${manifest.scaleProfile.name}`
  );
}
if (manifest.diagnosticState !== "local_mvp_verified") {
  fail(
    `manifest diagnosticState must be local_mvp_verified, found ${manifest.diagnosticState}`
  );
}
if (manifest.evidenceSource !== "pr41-local-manifest") {
  fail(
    `manifest evidenceSource must be pr41-local-manifest, found ${manifest.evidenceSource}`
  );
}
if (manifest.artifactKind !== "generated-local-mvp") {
  fail(
    `manifest artifactKind must be generated-local-mvp, found ${manifest.artifactKind}`
  );
}
if (!manifest.reproductionCommand?.includes("lakehouse-mvp:test")) {
  fail(
    "manifest reproductionCommand must describe the lakehouse MVP test command"
  );
}

assertTable("bronze.observation_events", 5);
assertTable("silver.observations", 3);
assertTable("silver.quarantine", 2);
assertTable("gold.observation_summary", 1);

for (const layerName of ["bronze", "silver", "gold"]) {
  if (!Number.isFinite(manifest.bytesByLayer?.[layerName])) {
    fail(`manifest missing bytesByLayer.${layerName}`);
  }
}

if (
  !manifest.evidence?.hasSilverQuarantine ||
  !manifest.evidence?.hasGoldAggregate
) {
  fail("manifest evidence flags do not show quarantine and Gold aggregate");
}

console.log("[lakehouse-pr41] MVP Lakehouse artifacts verified");
