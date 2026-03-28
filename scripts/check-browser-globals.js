#!/usr/bin/env node
// Simple scan to prevent direct usage of browser globals in frontend application code.
// Used to enforce Angular browser-safety standards.

const fs = require("fs");
const path = require("path");

const root = path.resolve(__dirname, "..");
const scanDir = path.join(root, "apps", "frontend", "src", "app");

const patterns = [
  /\bwindow\s*\./,
  /\bdocument\s*\./,
  /\blocalStorage\s*\./,
  /\bquerySelector(All)?\s*\(/,
];

const ignoreDirs = new Set(["node_modules", "dist", "coverage"]);
const ignoredFiles = new Set([
  "browser-platform.service.ts",
  "promql-card.component.ts",
]);

function isIgnored(filePath) {
  const parts = filePath.split(path.sep);
  if (parts.some((p) => ignoreDirs.has(p))) return true;
  return false;
}

function scanFile(filePath) {
  if (ignoredFiles.has(path.basename(filePath))) return [];

  const text = fs.readFileSync(filePath, "utf8");
  const issues = [];
  const lines = text.split(/\r?\n/);
  lines.forEach((line, idx) => {
    // Ignore local variables shadowing window/document (common in small helpers)
    if (/\b(const|let|var)\s+(window|document)\b/.test(line)) return;

    patterns.forEach((pattern) => {
      if (pattern.test(line)) {
        issues.push({ line: idx + 1, text: line.trim() });
      }
    });
  });
  return issues;
}

function walk(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const results = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (isIgnored(full)) continue;
      results.push(...walk(full));
    } else if (
      entry.isFile() &&
      full.endsWith(".ts") &&
      !full.endsWith(".spec.ts")
    ) {
      if (isIgnored(full)) continue;
      results.push(full);
    }
  }
  return results;
}

const files = walk(scanDir);
const violations = [];
for (const file of files) {
  const issues = scanFile(file);
  if (issues.length) {
    violations.push({ file, issues });
  }
}

if (violations.length) {
  console.error("Browser global pattern violations found:");
  violations.forEach((v) => {
    console.error(`\n  ${v.file}`);
    v.issues.forEach((issue) => {
      console.error(`    ${issue.line}: ${issue.text}`);
    });
  });
  process.exit(1);
}

console.log("No browser-global pattern violations found.");
