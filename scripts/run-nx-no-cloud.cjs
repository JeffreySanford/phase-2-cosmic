const { spawnSync } = require('node:child_process');

// When invoked via `pnpm run nx -- ...`, pnpm passes a leading `--` as an arg.
// Strip it to avoid passing extra `--` into `nx` itself.
const rawArgs = process.argv.slice(2);
const args = rawArgs[0] === "--" ? rawArgs.slice(1) : rawArgs;

if (args.length === 0) {
  console.error('Usage: node scripts/run-nx-no-cloud.cjs <nx args...>');
  process.exit(1);
}

const result = spawnSync('pnpm', ['nx', ...args], {
  stdio: 'inherit',
  shell: true,
  env: {
    ...process.env,
    // Prevent Nx Cloud from attempting to upload run data or requiring auth.
    NX_NO_CLOUD: 'true',
    NX_CLOUD_AUTH_TOKEN: '',
    NX_CLOUD_ACCESS_TOKEN: '',
    NX_CLOUD_ID: '',
    NX_CLOUD_DISABLE_METRICS_COLLECTION: 'true',
  },
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
