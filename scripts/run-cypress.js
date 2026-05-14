const { spawn } = require("node:child_process");
const path = require("node:path");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-cypress.js <cypress args...>");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const cypressBin = path.join(
  path.dirname(require.resolve("cypress/package.json")),
  "bin",
  "cypress"
);

const child = spawn(process.execPath, [cypressBin, ...args], {
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});
