#!/usr/bin/env node
const fs = require("fs");
const path = require("path");

function findYamls() {
  const { execSync } = require("child_process");
  try {
    const out = execSync("git ls-files -- '*.yml' '*.yaml' || true", {
      encoding: "utf8",
    }).trim();
    if (out) return out.split(/\r?\n/).filter(Boolean);
  } catch (e) {
    // ignore errors when git is not available in the environment
    // (e may contain details but is intentionally not rethrown)
    void e;
  }
  const walk = (dir) => {
    let res = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "node_modules" || entry.name === ".git") continue;
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
let changed = [];
for (const f of files) {
  let txt = fs.readFileSync(f, "utf8");
  const orig = txt;
  // Normalize to LF
  txt = txt.replace(/\r\n/g, "\n");
  // Ensure doc start
  const lines = txt.split("\n");
  let i = 0;
  // skip initial blank lines
  while (i < lines.length && lines[i].trim() === "") i++;
  if (i < lines.length && lines[i].trim() !== "---") {
    lines.splice(i, 0, "---");
  }
  // Ensure newline at EOF
  if (lines[lines.length - 1] !== "") lines.push("");
  const out = lines.join("\n");
  if (out !== orig) {
    fs.writeFileSync(f, out, "utf8");
    changed.push(f);
  }
}
console.log("yaml-fix-docstart: fixed", changed.length, "files");
changed.forEach((f) => console.log(" -", f));
process.exit(0);
