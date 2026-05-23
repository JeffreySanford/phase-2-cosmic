#!/usr/bin/env node
const { spawnSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const cwd = process.cwd();
let args = process.argv.slice(2);
// support a flag to force using the docker/compose network
const useComposeIdx = args.indexOf("--use-compose");
const useCompose = useComposeIdx !== -1;
if (useCompose) {
  args = args.slice(0, useComposeIdx).concat(args.slice(useComposeIdx + 1));
}

function exists(p) {
  try {
    return fs.existsSync(p);
  } catch {
    return false;
  }
}

function runSync(cmd, cmdArgs, options = {}) {
  // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
  const r = spawnSync(cmd, cmdArgs, { stdio: "inherit" });
  process.exit(r.status ?? 1);
}

function runCapture(cmd, cmdArgs) {
  try {
    // nosemgrep: javascript.lang.security.detect-child-process.detect-child-process
    const r = spawnSync(cmd, cmdArgs, { encoding: "utf8" });
    if (r.status !== 0) return null;
    return (r.stdout || "").toString().trim();
  } catch (e) {
    return null;
  }
}

// Prepare a platform-friendly volume path for Docker (used below if we need Docker)
let volPath = cwd.replace(/\\/g, "/");
if (/^[A-Za-z]:\//.test(volPath)) {
  // keep as-is; Docker on Windows accepts C:/... paths
}

// Maven Docker image candidates to try (will prefer local image, then pull)
const dockerImageCandidates = [
  "phase2/maven-test:17",
  "maven:3.9.4-eclipse-temurin-17",
  "maven:3.9.4-jdk-17",
  "maven:3.8.8-jdk-17",
  "maven:3.8.8-jdk-17-slim",
];
let dockerImage = null;
for (const candidate of dockerImageCandidates) {
  // prefer locally built image if present
  const localId = runCapture("docker", ["images", "-q", candidate]);
  if (localId) {
    console.log("Using local Docker image", candidate);
    dockerImage = candidate;
    break;
  }
  console.log("Attempting to pull Docker image", candidate);
  const pull = runCapture("docker", ["pull", candidate]);
  if (pull !== null) {
    dockerImage = candidate;
    break;
  }
}
if (!dockerImage) {
  // fallback to a safe default (this may still fail if not available)
  dockerImage = "maven:3.8.8-jdk-17";
}

// If this is a Maven 'test' run for the java-governance module, force Docker so
// the container can join the compose network and resolve the hostname `redis`.
const fIndex = args.indexOf("-f");
const isJavaGovernanceTest =
  args.includes("test") &&
  fIndex !== -1 &&
  args[fIndex + 1] &&
  args[fIndex + 1].includes("apps/java-governance");
if (isJavaGovernanceTest || useCompose) {
  console.log(
    "Forcing Maven in Docker for java-governance test so redis resolves on the compose network"
  );
  // try to discover the compose network by inspecting the running redis container
  let redisContainerId = runCapture("docker", [
    "ps",
    "--filter",
    "name=redis",
    "--format",
    "{{.ID}}",
  ]);
  let networkArg = null;
  if (redisContainerId) {
    const netnames = runCapture("docker", [
      "inspect",
      "-f",
      "{{range $k,$v := .NetworkSettings.Networks}}{{$k}} {{end}}",
      redisContainerId,
    ]);
    if (netnames) {
      const firstNet = netnames.split(/\s+/)[0];
      if (firstNet) networkArg = ["--network", firstNet];
    }
  }

  const mvnCommand = `cd /workspace && mvn ${args
    .map((a) => (a.includes(" ") ? '"' + a.replace(/"/g, '\\"') + '"' : a))
    .join(" ")}`;
  const dockerCmd = ["run", "--rm"];
  if (networkArg) dockerCmd.push(...networkArg);
  dockerCmd.push(
    "-v",
    `${volPath}:/workspace`,
    "-w",
    "/workspace",
    dockerImage,
    "bash",
    "-lc",
    mvnCommand
  );
  console.log(
    "Running Maven in Docker image",
    dockerImage,
    "network:",
    networkArg ? networkArg[1] : "(default)"
  );
  runSync("docker", dockerCmd);
}

// Prefer project-local mvnw (Unix or Windows)
const mvnwUnix = path.join(cwd, "mvnw");
const mvnwWin = path.join(cwd, "mvnw.cmd");
if (exists(mvnwUnix) || exists(mvnwWin)) {
  const mvnCmd = exists(mvnwUnix) ? mvnwUnix : mvnwWin;
  runSync(mvnCmd, args);
}

// Next, prefer system mvn
try {
  const mvnCommand = process.platform === "win32" ? "mvn.cmd" : "mvn";
  const probe = spawnSync(mvnCommand, ["-v"], {
    stdio: "ignore",
  });
  if (probe.status === 0) {
    runSync(mvnCommand, args);
  }
} catch (e) {
  // continue to docker fallback
}

// Docker fallback
const dockerCmdFinal = [
  "run",
  "--rm",
  "-v",
  `${volPath}:/workspace`,
  "-w",
  "/workspace",
  dockerImage,
  "mvn",
  ...args,
];

console.log("No local mvnw/mvn found — running Maven in Docker:", dockerImage);
runSync("docker", dockerCmdFinal);
