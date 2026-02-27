#!/usr/bin/env node
// Cross-platform helper to stop local Java and data-generator processes.
// On Windows it uses taskkill; on Unix it uses pkill.
const { execSync } = require('child_process');
const os = require('os');
function tryCmd(cmd) {
  try {
    execSync(cmd, { stdio: 'inherit' });
  } catch (e) {
    // ignore errors
  }
}
if (os.platform() === 'win32') {
  // try to kill java and data-generator.exe
  tryCmd('taskkill /F /IM java.exe /T');
  tryCmd('taskkill /F /IM data-generator.exe /T');
  // in case go processes are running as 'data-generator' without .exe
  tryCmd('taskkill /F /IM data-generator /T');
} else {
  // unix: attempt pkill
  tryCmd('pkill -f "java" || true');
  tryCmd('pkill -f "data-generator" || true');
}
console.log('stop-local-services: attempted to stop local Java and data-generator processes (errors ignored).');
