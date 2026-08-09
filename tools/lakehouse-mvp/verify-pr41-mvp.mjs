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

// `--require-fresh` asserts the manifest was produced by a recent run. The
// quality gate runs the writer immediately before the verifier, so a stale
// manifest there means the writer silently failed and the verifier would
// otherwise pass against a previous run's artifacts.
const requireFresh = args.includes("--require-fresh");
const maxAgeSecondsIndex = args.indexOf("--max-age-seconds");
const maxAgeSeconds = Number(
  maxAgeSecondsIndex >= 0
    ? args[maxAgeSecondsIndex + 1]
    : process.env.LAKEHOUSE_MAX_MANIFEST_AGE_SECONDS ?? 3600
);

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

if (requireFresh) {
  if (!Number.isFinite(maxAgeSeconds) || maxAgeSeconds <= 0) {
    fail(`--max-age-seconds must be a positive number, got ${maxAgeSeconds}`);
  }
  const generatedAt = Date.parse(manifest.generatedAt ?? "");
  if (!Number.isFinite(generatedAt)) {
    fail(
      `manifest generatedAt is not a parsable timestamp: ${manifest.generatedAt}`
    );
  }
  const ageSeconds = Math.round((Date.now() - generatedAt) / 1000);
  if (ageSeconds > maxAgeSeconds) {
    fail(
      `manifest is ${ageSeconds}s old which exceeds the ${maxAgeSeconds}s freshness budget; ` +
        "the writer likely did not run, so these artifacts are from a previous run"
    );
  }
}

// The adapter contract keeps Lakehouse entities provider-neutral. A bundle that
// reports active profiles must say which providers and contracts produced them.
const adapterContract = sourceRegistry.adapterContract || {};
const canonicalFields = adapterContract.canonicalFields || [];
if (canonicalFields.length === 0) {
  fail("source registry must declare adapterContract.canonicalFields");
}
if (!manifest.sourceBundle?.providers?.length) {
  fail("manifest sourceBundle must record the providers that produced rows");
}
if (!manifest.sourceBundle?.adapterContracts?.length) {
  fail("manifest sourceBundle must record the adapter contracts it used");
}
for (const contractId of manifest.sourceBundle.adapterContracts) {
  if (contractId !== adapterContract.id) {
    fail(
      `manifest sourceBundle uses adapter contract ${contractId} that is not the registered ${adapterContract.id}`
    );
  }
}
// Source-mode truthfulness: the manifest must state how each profile's rows
// were obtained, and a CI run must never claim a live archive query.
const validModes = new Set(["auto", "live", "fixture"]);
const validResolvedModes = new Set(["live", "fixture", "fixture-fallback"]);
if (!validModes.has(manifest.sourceBundle?.requestedMode)) {
  fail(
    `manifest sourceBundle.requestedMode must be one of ${[...validModes].join(
      ", "
    )}, found ${manifest.sourceBundle?.requestedMode}`
  );
}
if (!manifest.sourceBundle?.resolvedProfiles?.length) {
  fail(
    "manifest sourceBundle must record how each active profile was resolved"
  );
}
for (const resolved of manifest.sourceBundle.resolvedProfiles) {
  if (!validResolvedModes.has(resolved.mode)) {
    fail(
      `manifest resolved profile ${resolved.ref} has unknown mode ${resolved.mode}`
    );
  }
  if (resolved.mode !== "live" && !resolved.reason) {
    fail(
      `manifest resolved profile ${resolved.ref} used ${resolved.mode} without recording a reason`
    );
  }
}
const claimsLive = manifest.sourceBundle.resolvedProfiles.some(
  (resolved) => resolved.mode === "live"
);
if (claimsLive !== Boolean(manifest.sourceBundle.hasLiveRows)) {
  fail(
    `manifest hasLiveRows=${manifest.sourceBundle.hasLiveRows} contradicts the resolved profile modes`
  );
}
if (process.env.CI && claimsLive) {
  fail(
    "a CI run must not report live archive rows; CI is expected to resolve every profile to a fixture"
  );
}

for (const profileRef of manifest.sourceBundle.activeProfileRefs) {
  const profile = sourceRegistry.profiles?.[profileRef];
  const fieldMap = profile?.adapter?.fieldMap;
  if (!fieldMap) {
    fail(`active source profile ${profileRef} has no adapter fieldMap`);
  }
  const missing = canonicalFields.filter((field) => !fieldMap[field]);
  if (missing.length > 0) {
    fail(
      `active source profile ${profileRef} adapter fieldMap is missing canonical field(s): ${missing.join(
        ", "
      )}`
    );
  }
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
