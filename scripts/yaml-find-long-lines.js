const fs = require("fs");
const path = require("path");

function walk(dir) {
  let out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === ".git" || name === "node_modules" || name === "pnpm-store")
        continue;
      out.push(...walk(full));
    } else if (/\.(ya?ml)$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

const ROOT = path.resolve(__dirname, "..");
const files = walk(ROOT);
let total = 0;
for (const f of files) {
  const content = fs.readFileSync(f, "utf8");
  const lines = content.split(/\r?\n/);
  const long = [];
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.length > 80)
      long.push({ line: i + 1, len: l.length, text: l.slice(0, 200) });
  }
  if (long.length) {
    console.log("\nFile:", path.relative(ROOT, f));
    for (const entry of long.slice(0, 30)) {
      console.log(`  ${entry.line}:${entry.len}  ${entry.text}`);
    }
    if (long.length > 30) console.log(`  ... ${long.length - 30} more lines`);
    total += long.length;
  }
}
console.log("\nTotal long lines >80 chars:", total);
