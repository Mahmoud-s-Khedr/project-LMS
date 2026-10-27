import 'reflect-metadata';
import { Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { configureSwagger } from './swagger';

@Module({})
class TestModule {}

describe('Swagger HTTP endpoints', () => {
  it.each([false, true])('mounts endpoints only when enabled=%s', async (enabled) => {
    const app = await NestFactory.create(TestModule, { logger: false });
    configureSwagger(app, enabled);
    await app.listen(0, '127.0.0.1');
    try {
      const address = await app.getUrl();
      for (const path of ['/api/docs', '/api/docs-json']) {
        const response = await fetch(`${address}${path}`, { redirect: 'manual' });
        expect(response.status).toBe(enabled ? 200 : 404);
      }
    } finally {
      await app.close();
    }
  });
});
