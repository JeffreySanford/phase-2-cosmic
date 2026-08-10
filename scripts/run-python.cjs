const { spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

// Resolves a Python interpreter that can actually run the PR41 Lakehouse MVP
// runner, then execs it. Bare `python` is not portable: Windows commonly
// resolves it to an interpreter without pyarrow (or to the Microsoft Store
// stub), and Ubuntu CI runners frequently expose only `python3`.
//
// Usage: node scripts/run-python.cjs <script.py> [args...]

const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

if (args.length === 0) {
  console.error("Usage: node scripts/run-python.cjs <script.py> [args...]");
  process.exit(1);
}

const isWindows = process.platform === "win32";
const requiredModule = "pyarrow";

// Every PATH entry matching `name`, not just the first. A workstation can
// easily have several interpreters called `python` where only a later one
// (for example a conda environment) has pyarrow installed.
function pathMatches(name) {
  const extensions = isWindows ? [".exe", ".bat", ".cmd", ""] : [""];
  const directories = (process.env.PATH || "").split(path.delimiter);
  const found = [];

  for (const directory of directories) {
    if (!directory) {
      continue;
    }
    for (const extension of extensions) {
      const candidate = path.join(directory, name + extension);
      if (fs.existsSync(candidate) && !found.includes(candidate)) {
        found.push(candidate);
      }
    }
  }
  return found;
}

function candidates() {
  const resolved = [];
  const explicit = process.env.LAKEHOUSE_PYTHON || process.env.PYTHON;

  if (explicit) {
    resolved.push({ command: explicit, prefix: [] });
  }
  for (const name of ["python3", "python"]) {
    for (const match of pathMatches(name)) {
      resolved.push({ command: match, prefix: [] });
    }
  }
  if (isWindows) {
    resolved.push({ command: "py", prefix: ["-3"] });
  }
  return resolved;
}

function probe(candidate, code) {
  const result = spawnSync(
    candidate.command,
    [...candidate.prefix, "-c", code],
    {
      stdio: "ignore",
      windowsHide: true,
    }
  );
  return !result.error && result.status === 0;
}

function describe(candidate) {
  return [candidate.command, ...candidate.prefix].join(" ");
}

const available = candidates().filter((candidate) =>
  probe(candidate, "import sys; sys.exit(0)")
);

if (available.length === 0) {
  console.error(
    "[lakehouse-pr41] no usable Python interpreter found (tried: " +
      candidates().map(describe).join(", ") +
      ").\n" +
      "[lakehouse-pr41] install Python 3, or set LAKEHOUSE_PYTHON to an interpreter path."
  );
  process.exit(1);
}

const withModule = available.find((candidate) =>
  probe(candidate, `import ${requiredModule}`)
);

if (!withModule) {
  console.error(
    `[lakehouse-pr41] found Python (${describe(
      available[0]
    )}) but ${requiredModule} is not installed.\n` +
      "[lakehouse-pr41] install it with:\n" +
      `[lakehouse-pr41]   ${describe(
        available[0]
      )} -m pip install -r tools/lakehouse-mvp/requirements.txt`
  );
  process.exit(1);
}

const result = spawnSync(withModule.command, [...withModule.prefix, ...args], {
  stdio: "inherit",
  windowsHide: true,
});

if (result.error) {
  console.error(`[lakehouse-pr41] ${result.error.message}`);
  process.exit(1);
}

process.exit(result.status ?? 1);
