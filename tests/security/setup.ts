import { afterAll } from 'vitest';
import { cleanupDirectTestUsers } from '../fixtures/auth';

afterAll(async () => {
  await cleanupDirectTestUsers();
});
