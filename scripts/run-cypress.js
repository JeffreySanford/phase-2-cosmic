const { spawn } = require("node:child_process");

const args = process.argv.slice(2);

if (args.length === 0) {
  console.error("Usage: node scripts/run-cypress.js <cypress args...>");
  process.exit(1);
}

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;
delete env.ELECTRON_NO_ATTACH_CONSOLE;

const child =
  process.platform === "win32"
    ? spawn(
        "cmd.exe",
        [
          "/d",
          "/s",
          "/c",
          `pnpm exec cypress ${args
            .map((arg) =>
              /[\s"]/u.test(arg)
                ? `"${arg.replace(/"/g, '\\"')}"`
                : arg
            )
            .join(" ")}`,
        ],
        {
          stdio: "inherit",
          env,
        }
      )
    : spawn("pnpm", ["exec", "cypress", ...args], {
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
