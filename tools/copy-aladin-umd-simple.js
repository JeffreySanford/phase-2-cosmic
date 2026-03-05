const fs = require("fs");
const path = require("path");

function findInNodeModules() {
  const root = path.resolve(__dirname, "..");
  const nm = path.join(root, "node_modules");
  const candidates = [
    "aladin-lite/dist/aladin.umd.min.js",
    "aladin-lite/dist/aladin.min.js",
    "aladin-lite/dist/aladin.js",
  ];

  // try require.resolve first (fast)
  for (const c of candidates) {
    try {
      const p = require.resolve(c);
      if (fs.existsSync(p)) return p;
    } catch (e) {
      // ignore
    }
  }

  // fallback: scan node_modules and .pnpm folders for a matching path
  const scanDirs = [nm, path.join(root, "node_modules", ".pnpm")];
  for (const base of scanDirs) {
    if (!fs.existsSync(base)) continue;
    const stack = [base];
    while (stack.length) {
      const cur = stack.pop();
      try {
        const entries = fs.readdirSync(cur, { withFileTypes: true });
        for (const e of entries) {
          const fp = path.join(cur, e.name);
          if (e.isDirectory()) {
            // quick check: if path contains aladin-lite and dist file exists
            if (e.name === "aladin-lite") {
              for (const cand of candidates) {
                const candPath = path.join(fp, "dist", path.basename(cand));
                if (fs.existsSync(candPath)) return candPath;
              }
            }
            stack.push(fp);
          }
        }
      } catch (err) {
        // ignore permission or symlink errors
      }
    }
  }

  return null;
}

const src = findInNodeModules();
if (!src) {
  console.error(
    "Could not find aladin-lite dist file in node_modules. Tried:",
    candidates.join(", ")
  );
  process.exitCode = 2;
  process.exit(2);
}

const destDir = path.resolve(
  __dirname,
  "..",
  "apps",
  "frontend",
  "src",
  "assets"
);
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
const dest = path.join(destDir, "aladin.umd.min.js");

try {
  fs.copyFileSync(src, dest);
  console.log("Copied", src, "->", dest);
} catch (e) {
  console.error("Failed to copy file:", e);
  process.exitCode = 3;
  process.exit(3);
}
