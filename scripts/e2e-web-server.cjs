#!/usr/bin/env node
/**
 * Runs the SSR server and the Angular dev server together for the Cypress e2e
 * target, and reports failure only when one of them actually fails.
 *
 * This replaces `concurrently --kill-others-on-fail --success first`. That
 * combination took the job's exit status from the first process to exit — but
 * both processes here are servers that are *supposed* to be killed once Cypress
 * finishes. Whichever one lost the teardown race exited via SIGTERM, concurrently
 * read that as a failure, and the whole e2e target failed while every spec had
 * passed ("Failing: 0", "Run Finished"). Concurrently cannot tell the two cases
 * apart because it collapses both into its own exit code, so the distinction has
 * to be made here, where each child's exit signal is visible:
 *
 *   terminated by a signal        -> expected teardown, success
 *   exited non-zero on its own    -> genuine crash, propagate the code
 *
 * A server that never starts is still caught: Cypress fails on its own
 * webServerConfig timeout with an accurate "server never became available".
 *
 * Usage: node scripts/e2e-web-server.cjs "<command>" "<command>" [...]
 */
const { spawn } = require("node:child_process");

const commands = process.argv.slice(2).filter((arg) => arg.trim() !== "");
if (commands.length === 0) {
  console.error("[e2e-web-server] no commands supplied");
  process.exit(1);
}

// A child spawned through a shell does not surface its signal: the shell absorbs
// SIGTERM and exits 128+N instead, so `signal` arrives null and the code looks
// like an ordinary failure. These codes only ever come from termination, never
// from a server crashing on its own, so treating them as expected is safe.
const SIGNAL_EXIT_CODES = new Set([
  129, // SIGHUP
  130, // SIGINT
  131, // SIGQUIT
  143, // SIGTERM
]);

const labelFor = (index) => `[${index}]`;
let shuttingDown = false;
let exitCode = 0;

const children = commands.map((command, index) => {
  const label = labelFor(index);
  const child = spawn(command, { shell: true, stdio: ["ignore", "pipe", "pipe"] });

  const forward = (stream, sink) => {
    stream.on("data", (chunk) => {
      for (const line of chunk.toString().split(/\r?\n/)) {
        if (line !== "") sink.write(`${label} ${line}\n`);
      }
    });
  };
  forward(child.stdout, process.stdout);
  forward(child.stderr, process.stderr);

  child.on("exit", (code, signal) => {
    if (signal || SIGNAL_EXIT_CODES.has(code) || shuttingDown) {
      // Killed — by our own teardown or by the runner killing the process group.
      console.log(`${label} terminated by ${signal ?? `code ${code}`} (expected at teardown)`);
    } else if (code !== 0) {
      console.error(`${label} exited with code ${code}`);
      exitCode = code ?? 1;
    }
    shutdown();
  });

  child.on("error", (error) => {
    console.error(`${label} failed to start: ${error.message}`);
    exitCode = 1;
    shutdown();
  });

  return child;
});

function killAll() {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      try {
        child.kill("SIGTERM");
      } catch {
        // already gone
      }
    }
  }
}

/**
 * Settle on a status and stop.
 *
 * `process.exitCode` is assigned as well as scheduling the explicit exit: the
 * timer must not be unref'd, because once the children are gone nothing holds
 * the event loop open and the process would otherwise exit naturally with 0 —
 * silently discarding a genuine failure code.
 */
function finish(code) {
  process.exitCode = code;
  setTimeout(() => process.exit(code), 500);
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  killAll();
  // Give the servers a moment to close listeners before the process ends.
  finish(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    // The runner is tearing us down after the specs finished; this is success.
    if (shuttingDown) return;
    shuttingDown = true;
    killAll();
    finish(0);
  });
}
