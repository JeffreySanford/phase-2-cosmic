#!/usr/bin/env node
// Cross-platform helper to stop local Java/data-generator processes
// and clear common local dev ports used by SSR/frontend/hmr.
const { execSync } = require('child_process');
const os = require('os');

function tryCmd(cmd) {
  try {
    // run silently to avoid noisy "process not found" messages
    execSync(cmd, { stdio: 'ignore' });
  } catch (e) {
    // ignore errors
  }
}

function runText(cmd) {
  try {
    return execSync(cmd, { stdio: ['ignore', 'pipe', 'ignore'] }).toString();
  } catch {
    return '';
  }
}

function unique(arr) {
  return Array.from(new Set(arr));
}

function killPortsWindows(ports) {
  const pids = [];
  for (const port of ports) {
    const out = runText(`netstat -ano -p tcp | findstr :${port}`);
    const lines = out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const parts = line.split(/\s+/);
      const state = parts[3];
      const pid = parts[4];
      // Keep to LISTENING entries to avoid killing unrelated short-lived clients.
      if (state && state.toUpperCase() === 'LISTENING' && pid && /^\d+$/.test(pid)) {
        pids.push(pid);
      }
    }
  }
  for (const pid of unique(pids)) {
    tryCmd(`taskkill /F /PID ${pid} /T`);
  }
}

function killPortsUnix(ports) {
  for (const port of ports) {
    const out = runText(`lsof -ti tcp:${port}`);
    const pids = unique(out.split(/\r?\n/).map((x) => x.trim()).filter((x) => /^\d+$/.test(x)));
    for (const pid of pids) {
      tryCmd(`kill -9 ${pid}`);
    }
  }
}

if (os.platform() === 'win32') {
  // try to kill java and data-generator.exe
  tryCmd('taskkill /F /IM java.exe /T');
  tryCmd('taskkill /F /IM data-generator.exe /T');
  // in case go processes are running as 'data-generator' without .exe
  tryCmd('taskkill /F /IM data-generator /T');
  killPortsWindows([4000, 4200, 24678]);
} else {
  // unix: attempt pkill
  tryCmd('pkill -f "java" || true');
  tryCmd('pkill -f "data-generator" || true');
  killPortsUnix([4000, 4200, 24678]);
}
console.log('stop-local-services: attempted to stop local services/processes and clear ports 4000/4200/24678 (errors ignored).');
