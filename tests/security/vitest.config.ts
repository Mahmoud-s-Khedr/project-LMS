import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const pgPath = fileURLToPath(new URL('../../apps/api/node_modules/pg', import.meta.url));

export default defineConfig({
  root: rootDir,
  resolve: {
    alias: {
      pg: pgPath,
    },
  },
  test: {
    environment: 'node',
    include: ['tests/security/**/*.test.ts'],
    setupFiles: ['tests/security/setup.ts'],
    testTimeout: 30000,
    hookTimeout: 30000,
    clearMocks: true,
    fileParallelism: false,
    maxConcurrency: 1,
  },
});
