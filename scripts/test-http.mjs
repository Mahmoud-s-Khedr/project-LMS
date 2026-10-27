// Own fresh processes per suite: throttle state never leaks between QA runs.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { openSync, closeSync } from 'node:fs';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
require('dotenv').config({ path: '.env', quiet: true });
const suite = process.argv[2];
if (!['security', 'e2e'].includes(suite)) throw new Error('Expected security or e2e');
const children = [];
async function free(port) {
  await new Promise((resolve, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(port, () => server.close(resolve));
  });
}
async function ready(url, child) {
  for (let i = 0; i < 120; i++) {
    if (child.exitCode !== null) throw new Error(`${url} process exited: ${child.exitCode}`);
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* booting */
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`Timed out waiting for ${url}`);
}
const env = {
  ...process.env,
  NODE_ENV: 'test',
  STRIPE_WEBHOOK_SECRET:
    suite === 'security'
      ? 'whsec_test_secret_for_qa_testing_only_12345'
      : process.env.STRIPE_WEBHOOK_SECRET || '',
  ...(suite === 'security' ? { STRIPE_SECRET_KEY: 'sk_test_local_fixture' } : {}),
  ...(suite === 'e2e' ? { MEDIA_SCANNER_MODE: 'development-bypass' } : {}),
};
function start(args, name, extraEnv = {}, cwd = process.cwd()) {
  const log = openSync(`/tmp/lms-${suite}-${name}.log`, 'w');
  const child = spawn(process.execPath, args, {
    cwd,
    env: { ...env, ...extraEnv },
    stdio: ['ignore', log, log],
  });
  closeSync(log);
  children.push(child);
  console.log(`${name} PID ${child.pid}; log /tmp/lms-${suite}-${name}.log`);
  return child;
}
async function stop() {
  for (const child of children.toReversed()) {
    if (child.exitCode !== null || child.signalCode !== null) continue;
    child.kill('SIGTERM');
    await Promise.race([
      new Promise((resolve) => child.once('exit', resolve)),
      new Promise((resolve) => setTimeout(resolve, 5000)),
    ]);
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGKILL');
      await new Promise((resolve) => child.once('exit', resolve));
    }
  }
}
for (const signal of ['SIGINT', 'SIGTERM'])
  process.once(signal, () => {
    void stop().then(() => process.exit(1));
  });
try {
  await free(4100);
  if (suite === 'e2e') await free(3100);
  const api = start(['apps/api/dist/main.js'], 'api');
  await ready('http://localhost:4100/api/v1/health', api);
  if (suite === 'e2e') {
    start(['apps/api/dist/workers/main.js'], 'worker');
    const web = start(
      ['node_modules/next/dist/bin/next', 'start', '--port', '3100'],
      'web',
      { NODE_ENV: 'production' },
      `${process.cwd()}/apps/web`,
    );
    await ready('http://localhost:3100/login', web);
  }
  const args =
    suite === 'security'
      ? [
          'apps/web/node_modules/vitest/vitest.mjs',
          'run',
          '--config',
          'tests/security/vitest.config.ts',
        ]
      : [
          'node_modules/@playwright/test/cli.js',
          'test',
          '--config',
          'tests/e2e/playwright.config.ts',
        ];
  const child = spawn(process.execPath, [...args, ...process.argv.slice(3)], {
    env: {
      ...env,
      NODE_PATH: `${process.cwd()}/apps/web/node_modules${process.env.NODE_PATH ? `:${process.env.NODE_PATH}` : ''}`,
    },
    cwd: process.cwd(),
    stdio: 'inherit',
  });
  children.push(child);
  process.exitCode = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('exit', (code) => resolve(code ?? 1));
  });
} finally {
  await stop();
  await free(4100);
  if (suite === 'e2e') await free(3100);
}
