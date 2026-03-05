#!/usr/bin/env node
// Find Dockerfiles in the repo and run hadolint in Docker for each.
// Exits non-zero on first failure to surface lint errors.
const { spawnSync } = require("child_process");
const { existsSync } = require("fs");
const { join } = require("path");

function findDockerfiles() {
  const { execSync } = require("child_process");
  try {
    // prefer git-tracked files
    const out = execSync("git ls-files -- '*/Dockerfile' || true", {
      encoding: "utf8",
    }).trim();
    if (out) return out.split(/\r?\n/).filter(Boolean);
  } catch (e) {
    // ignore
  }
  // fallback: simple filesystem search (may be slower)
  const walk = (dir) => {
    const fs = require("fs");
    let res = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
        res = res.concat(walk(p));
      } else if (entry.isFile() && entry.name === "Dockerfile") {
        res.push(p);
      }
    }
    return res;
  };
  return walk(process.cwd());
}

const files = findDockerfiles();
if (!files || files.length === 0) {
  console.log("No Dockerfiles found.");
  process.exit(0);
}

console.log("Found Dockerfiles:");
files.forEach((f) => console.log(" -", f));

for (const f of files) {
  console.log("\nRunning hadolint on", f);
  const args = [
    "run",
    "--rm",
    "-v",
    `${process.cwd()}:/workdir`,
    "-w",
    "/workdir",
    "hadolint/hadolint",
    "hadolint",
    f.replace(/\\/g, "/"),
  ];
  // Convert file path to repository-relative POSIX path so it resolves inside the container
  const rel = require("path").relative(process.cwd(), f).replace(/\\/g, "/");
  const argsPosix = [
    "run",
    "--rm",
    "-v",
    `${process.cwd()}:/workdir`,
    "-w",
    "/workdir",
    "hadolint/hadolint",
    "hadolint",
    rel,
  ];
  const r = spawnSync("docker", argsPosix, { stdio: "inherit" });
  if (r.error) {
    console.error("Failed to run docker/hadolint:", r.error);
    process.exit(2);
  }
  if (r.status !== 0) {
    console.error("hadolint reported issues for", f);
    process.exit(r.status || 3);
  }
}

console.log("\nhadolint: all Dockerfiles passed");
process.exit(0);
