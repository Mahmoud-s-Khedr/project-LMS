import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

export function configureSwagger(app: INestApplication, enabled: boolean): void {
  if (!enabled) return;
  const config = new DocumentBuilder()
    .setTitle('LMS API')
    .setDescription('Versioned LMS and course commerce API')
    .setVersion('1.0')
    .addBearerAuth()
    .addCookieAuth('lms_refresh')
    .build();
  SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
}
