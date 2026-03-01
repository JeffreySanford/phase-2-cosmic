const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const EXCLUDE_DIRS = ['.git', 'node_modules', 'pnpm-store', 'pnpm-store', '.venv', '.pytest_cache'];

function walk(dir) {
  const res = [];
  for (const name of fs.readdirSync(dir)) {
    const full = path.join(dir, name);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (EXCLUDE_DIRS.includes(name)) continue;
      res.push(...walk(full));
    } else if (/\.(ya?ml)$/.test(name)) {
      res.push(full);
    }
  }
  return res;
}

function convertFlowSeqs(content) {
  // Match lines like: "  key: [a, b, c]" where the bracketed content contains no newlines
  const regex = /^(\s*[^\n:]+:\s*)\[(.*?)\](?=\s*(#.*)?$)/gm;
  let changed = false;
  const out = content.replace(regex, (match, prefix, items) => {
    // Split items on commas, ignoring simple empty entries
    const parts = items.split(',').map(s => s.trim()).filter(s => s.length > 0);
    if (parts.length <= 1) return match; // nothing to gain
    // Determine indentation (number of spaces at start of prefix)
    const m = prefix.match(/^(\s*)/);
    const baseIndent = m ? m[1] : '';
    // Key (prefix) without trailing spaces
    const key = prefix.trimRight();
    const indent = baseIndent + '  ';
    const lines = parts.map(p => `${indent}- ${p}`);
    changed = true;
    return `${key}\n${lines.join('\n')}`;
  });
  return { changed, out };
}

function main() {
  const files = walk(ROOT);
  let modified = 0;
  for (const f of files) {
    try {
      const content = fs.readFileSync(f, 'utf8');
      const { changed, out } = convertFlowSeqs(content);
      if (changed) {
        fs.writeFileSync(f, out, 'utf8');
        modified++;
        console.log('Updated:', path.relative(ROOT, f));
      }
    } catch (e) {
      console.error('Error processing', f, e.message);
    }
  }
  console.log(`Done. Files modified: ${modified}`);
}

if (require.main === module) main();
