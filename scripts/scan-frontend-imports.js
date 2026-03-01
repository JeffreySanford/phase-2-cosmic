const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'apps', 'frontend', 'src');
const NMODULES = path.join(ROOT, 'node_modules');

function walk(dir, exts = ['.ts', '.js', '.tsx', '.jsx']) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
      out.push(...walk(full, exts));
    } else if (exts.includes(path.extname(name))) {
      out.push(full);
    }
  }
  return out;
}

function parseImports(file) {
  const txt = fs.readFileSync(file, 'utf8');
  const re = /from\s+['"]([^'"\\.][^'"`]*)['"]/g;
  const set = new Set();
  let m;
  while ((m = re.exec(txt))) {
    set.add(m[1]);
  }
  return Array.from(set);
}

function pkgSize(pkg) {
  // try node_modules/<pkg>
  const p1 = path.join(NMODULES, pkg);
  if (fs.existsSync(p1)) return dirSize(p1);
  // pnpm style: node_modules/.pnpm/<pkg>@* /node_modules/<pkg>
  const pnpmDir = path.join(NMODULES, '.pnpm');
  if (fs.existsSync(pnpmDir)) {
    const entries = fs.readdirSync(pnpmDir).filter(n => n.startsWith(pkg + '@') || n.startsWith(pkg.replace('/', '+') + '@'));
    for (const e of entries) {
      const candidate = path.join(pnpmDir, e, 'node_modules', pkg);
      if (fs.existsSync(candidate)) return dirSize(candidate);
    }
  }
  // fallback: try workspace libs
  const workspaceCandidate = path.join(ROOT, 'libs', pkg);
  if (fs.existsSync(workspaceCandidate)) return dirSize(workspaceCandidate);
  return 0;
}

function dirSize(dir) {
  let total = 0;
  const stack = [dir];
  while (stack.length) {
    const d = stack.pop();
    for (const name of fs.readdirSync(d)) {
      const f = path.join(d, name);
      try {
        const s = fs.statSync(f);
        if (s.isDirectory()) stack.push(f);
        else total += s.size;
      } catch {}
    }
  }
  return total;
}

function human(n) {
  if (n === 0) return '0 B';
  const units = ['B','KB','MB','GB'];
  let i = 0; let v = n;
  while (v >= 1024 && i < units.length-1) { v /= 1024; i++; }
  return `${v.toFixed(2)} ${units[i]}`;
}

function main() {
  if (!fs.existsSync(SRC)) { console.error('Frontend src not found at', SRC); process.exit(2); }
  const files = walk(SRC);
  const pkgCount = new Map();
  for (const f of files) {
    const imps = parseImports(f);
    for (const imp of imps) {
      // normalize scoped packages and path imports like @scope/pkg/sub
      const pkg = imp.startsWith('@') ? imp.split('/').slice(0,2).join('/') : imp.split('/')[0];
      pkgCount.set(pkg, (pkgCount.get(pkg) || 0) + 1);
    }
  }
  const results = [];
  for (const [pkg, cnt] of pkgCount.entries()) {
    const size = pkgSize(pkg);
    results.push({ pkg, cnt, size });
  }
  results.sort((a,b) => b.size - a.size || b.cnt - a.cnt);
  console.log('Top external packages imported by frontend:');
  for (const r of results.slice(0,40)) {
    console.log(`${r.pkg.padEnd(30)} imports=${String(r.cnt).padEnd(5)} size=${human(r.size)}`);
  }
}

main();
