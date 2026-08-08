import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const repoRoot = path.resolve(path.dirname(__filename), "../..");
const outputRoot = path.join(repoRoot, "tmp", "lakehouse", "pr41-delta");
const manifestPath = path.join(outputRoot, "manifest.json");

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
  const deltaLog = path.join(
    tablePath,
    "_delta_log",
    "00000000000000000000.json"
  );
  const parquet = path.join(tablePath, "part-00000.parquet");
  if (!fs.existsSync(deltaLog)) {
    fail(`${name} missing Delta log ${deltaLog}`);
  }
  if (!fs.existsSync(parquet)) {
    fail(`${name} missing Parquet file ${parquet}`);
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

const manifest = readJson(manifestPath);

assertTable("bronze.observation_events", 5);
assertTable("silver.observations", 3);
assertTable("silver.quarantine", 2);
assertTable("gold.observation_summary", 1);

if (
  !manifest.evidence?.hasSilverQuarantine ||
  !manifest.evidence?.hasGoldAggregate
) {
  fail("manifest evidence flags do not show quarantine and Gold aggregate");
}

console.log("[lakehouse-pr41] MVP Lakehouse artifacts verified");
