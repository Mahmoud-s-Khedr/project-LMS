import { createHash, randomBytes } from 'node:crypto';
export const hashToken = (token: string): string =>
  createHash('sha256').update(token).digest('hex');
export const newToken = (): string => randomBytes(32).toString('hex');
