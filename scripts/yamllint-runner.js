#!/usr/bin/env node
// Find YAML files and run yamllint via Docker image cytopia/yamllint
const { spawnSync } = require("child_process");
const { join } = require("path");
const fs = require("fs");

const ignoredDirs = new Set([
  ".git",
  ".nx",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "test-results",
  "tmp",
  "tools/codeql",
  "validation-output",
]);

function shouldSkipDir(dir) {
  const rel = require("path").relative(process.cwd(), dir).replace(/\\/g, "/");
  return ignoredDirs.has(rel) || ignoredDirs.has(rel.split("/")[0]);
}

function findYamls() {
  const { execSync } = require("child_process");
  try {
    const out = execSync("git ls-files -- '*.yml' '*.yaml' || true", {
      encoding: "utf8",
    }).trim();
    if (out) return out.split(/\r?\n/).filter(Boolean);
  } catch (e) {}
  const walk = (dir) => {
    let res = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (shouldSkipDir(p)) continue;
        res = res.concat(walk(p));
      } else if (
        entry.isFile() &&
        (entry.name.endsWith(".yml") || entry.name.endsWith(".yaml"))
      ) {
        res.push(p);
      }
    }
    return res;
  };
  return walk(process.cwd());
}

const files = findYamls();
if (!files || files.length === 0) {
  console.log("No YAML files found.");
  process.exit(0);
}

console.log("Found YAML files:", files.length);
for (const f of files) {
  const rel = require("path").relative(process.cwd(), f).replace(/\\/g, "/");
  // Skip large generated or lock files that should not be linted/modified
  const skip = ["pnpm-lock.yaml", "yarn.lock", "package-lock.json"];
  if (skip.includes(rel) || rel.endsWith("/pnpm-lock.yaml")) {
    console.log("\nSkipping (generated):", rel);
    continue;
  }
  console.log("\nRunning yamllint on", rel);
  // Use a small Python image and install yamllint at runtime to avoid registry auth issues
  const cmd = `bash -lc \"pip install --no-cache-dir yamllint >/dev/null 2>&1 || true; yamllint ${rel}\"`;
  // For workflow files we relax a few rules that conflict with GitHub Actions formatting
  const isWorkflow = rel.startsWith(".github/workflows/");
  const yamllintCmd = isWorkflow
    ? `pip install --no-cache-dir yamllint >/dev/null 2>&1 || true; yamllint -d '{rules: {truthy: disable, new-lines: disable, brackets: disable, commas: disable}}' ${rel}`
    : `pip install --no-cache-dir yamllint >/dev/null 2>&1 || true; yamllint ${rel}`;
  const args = [
    "run",
    "--rm",
    "-v",
    `${process.cwd()}:/workdir`,
    "-w",
    "/workdir",
    "python:3.11-slim",
    "bash",
    "-lc",
    yamllintCmd,
  ];
  const r = spawnSync("docker", args, { stdio: "inherit" });
  if (r.error) {
    console.error("Failed to run docker/yamllint:", r.error);
    process.exit(2);
  }
  if (r.status !== 0) {
    console.error("yamllint reported issues for", rel);
    process.exit(r.status || 3);
  }
}
console.log("\nyamllint: all YAML files passed");
process.exit(0);
