import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { seedDevelopment } from './fixtures/seed';

config({ path: ['.env', '../../.env'] });

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is required');
  if (!['development', 'test'].includes(process.env.NODE_ENV ?? 'development')) {
    throw new Error('Demo fixtures are permitted only in development or test');
  }
  const target = new URL(url);
  if (!['localhost', '127.0.0.1', '[::1]', 'postgres'].includes(target.hostname)) {
    throw new Error('Demo fixtures require a local PostgreSQL database');
  }
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    await seedDevelopment(prisma);
    console.info('Development fixtures seeded (existing fixture records preserved).');
  } finally {
    await prisma.$disconnect();
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
