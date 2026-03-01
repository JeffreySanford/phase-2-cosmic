#!/usr/bin/env node
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

function timestamp() {
  const d = new Date();
  const YYYY = d.getFullYear();
  const MM = String(d.getMonth() + 1).padStart(2, '0');
  const DD = String(d.getDate()).padStart(2, '0');
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return `${YYYY}${MM}${DD}T${hh}${mm}${ss}`;
}

function usage() {
  console.error('Usage: node tools/run-with-logs.js "<command>" [log-prefix]');
  process.exit(2);
}

const argv = process.argv.slice(2);
if (!argv[0]) usage();
const command = argv[0];
const prefix = argv[1] || 'start-all-reset';

const logsDir = path.join(process.cwd(), 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logfile = path.join(logsDir, `${prefix}-${timestamp()}.log`);
const out = fs.createWriteStream(logfile, { flags: 'a' });

console.log(`Running: ${command}`);
console.log(`Logging to: ${logfile}`);

const child = spawn(command, { shell: true });

child.stdout.on('data', (chunk) => {
  process.stdout.write(chunk);
  out.write(chunk);
});

child.stderr.on('data', (chunk) => {
  process.stderr.write(chunk);
  out.write(chunk);
});

child.on('close', (code, signal) => {
  out.end();
  if (signal) {
    console.error(`Process terminated with signal ${signal}`);
    process.exit(1);
  }
  process.exit(code);
});
