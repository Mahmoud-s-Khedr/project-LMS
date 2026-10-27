import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const require = createRequire(new URL('../apps/api/package.json', import.meta.url));
require('dotenv').config({ path: '.env', quiet: true });
const { Pool } = require('pg');
const maintenance = new URL(process.env.DATABASE_URL);
maintenance.pathname = '/postgres';
maintenance.search = '';
const name = `lms_p5_checks_${randomUUID().replaceAll('-', '')}`;
const pool = new Pool({ connectionString: maintenance.href, max: 1 });
const isolated = new URL(maintenance); isolated.pathname = `/${name}`;
try {
  await pool.query(`CREATE DATABASE "${name}"`);
  const env = { ...process.env, NODE_ENV: 'test' };
  for (const prefix of ['IDENTITY', 'TENANCY', 'ASSESSMENTS', 'COMMERCE', 'FULFILLMENT', 'ADMINISTRATION'])
    env[`${prefix}_TEST_DATABASE_URL`] = isolated.href;
  for (const prefix of ['CONTENT', 'LEARNING', 'ENGAGEMENT', 'ANALYTICS'])
    env[`${prefix}_TEST_DATABASE_URL`] = maintenance.href;
  env.ENGAGEMENT_TEST_SMTP = '1'; env.ENGAGEMENT_TEST_STORAGE = '1';
  console.log(`Postgres checks: isolated ${name}; maintenance database /postgres for database-creating suites`);
  const child = spawn('pnpm', ['-r', 'test'], { env, stdio: 'inherit' });
  const code = await new Promise((resolve, reject) => { child.on('error', reject); child.on('exit', resolve); });
  process.exitCode = code ?? 1;
} finally {
  await pool.query(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await pool.end();
}
