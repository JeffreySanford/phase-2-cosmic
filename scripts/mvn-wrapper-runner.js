#!/usr/bin/env node
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const cwd = process.cwd();
const args = process.argv.slice(2);

function exists(p) {
  try { return fs.existsSync(p); } catch { return false; }
}

function runSync(cmd, cmdArgs, options = {}) {
  const useShell = options.shell ?? (process.platform === 'win32');
  const r = spawnSync(cmd, cmdArgs, { stdio: 'inherit', shell: useShell });
  process.exit(r.status ?? 1);
}

// Prefer project-local mvnw (Unix or Windows)
const mvnwUnix = path.join(cwd, 'mvnw');
const mvnwWin = path.join(cwd, 'mvnw.cmd');
if (exists(mvnwUnix) || exists(mvnwWin)) {
  const mvnCmd = exists(mvnwUnix) ? mvnwUnix : mvnwWin;
  runSync(mvnCmd, args);
}

// Next, prefer system mvn
try {
  const probe = spawnSync('mvn', ['-v'], { stdio: 'ignore', shell: process.platform === 'win32' });
  if (probe.status === 0) {
    runSync('mvn', args);
  }
} catch (e) {
  // continue to docker fallback
}

// Docker fallback
// Build a platform-friendly volume path for Docker
let volPath = cwd.replace(/\\/g, '/');
// On Windows, ensure drive letter has a leading slash if Docker expects it (MINGW vs Docker Desktop may vary)
if (/^[A-Za-z]:\//.test(volPath)) {
  // convert C:/path to /c/path for some environments
  // But Docker on Windows accepts C:/... as well; keep as-is
}

const dockerImage = 'maven:3.8.8-jdk-17';
const dockerCmd = [
  'run', '--rm', '-v', `${volPath}:/workspace`, '-w', '/workspace', dockerImage,
  'mvn', ...args
];

console.log('No local mvnw/mvn found — running Maven in Docker:', dockerImage);
runSync('docker', dockerCmd, { shell: true });
