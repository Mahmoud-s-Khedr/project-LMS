import { z } from 'zod';

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4100),
  WEB_ORIGIN: z.url().default('http://localhost:3100'),
  DATABASE_URL: z.url(),
  REDIS_URL: z.url().default('redis://localhost:56379'),
  S3_ENDPOINT: z.url().default('http://localhost:59000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(8),
  S3_PRIVATE_BUCKET: z.string().default('lms-private'),
  S3_PUBLIC_BUCKET: z.string().default('lms-public'),
  S3_FORCE_PATH_STYLE: booleanString.default(true),
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(51025),
  SMTP_SECURE: booleanString.default(false),
  SMTP_FROM: z.string().default('LMS <noreply@lms.local>'),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  JWT_ACCESS_SECRET: z.string().min(32),
  REFRESH_REUSE_GRACE_SECONDS: z.coerce.number().int().min(0).max(300).default(30),
  JWT_REFRESH_SECRET: z.string().min(32),
  TENANCY_MAIL_KEY: z
    .string()
    .regex(/^[A-Za-z0-9+/]{43}=$/)
    .default('MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY='),
  TENANCY_MAIL_KEY_ID: z.string().min(1).default('v1'),
  TENANCY_MAIL_PREVIOUS_KEYS: z.string().optional(),
  AUDIT_IP_HASH_SECRET: z.string().min(16).optional(),
  STRIPE_SECRET_KEY: z
    .string()
    .regex(/^$|^sk_test_/)
    .optional(),
  STRIPE_WEBHOOK_SECRET: z
    .string()
    .regex(/^$|^whsec_/)
    .optional(),
  COMMERCE_CURRENCIES: z.string().default('usd,eur,gbp,egp'),
  CONTENT_HOST_KEY: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .optional(),
  CONTENT_EMBED_ORIGINS: z
    .string()
    .default('https://www.youtube-nocookie.com,https://player.vimeo.com,https://www.h5p.com'),
  CONTENT_WORKSPACE_QUOTA_BYTES: z
    .string()
    .regex(/^[1-9][0-9]*$/)
    .default('107374182400'),
  CONTENT_PUBLIC_ORIGIN: z.url().optional(),
  API_INTERNAL_ORIGIN: z.url().default('http://localhost:4100'),
  CERTIFICATE_CHROMIUM_PATH: z.string().startsWith('/').default('/usr/bin/google-chrome'),
  API_PUBLIC_ORIGIN: z.url().default('http://localhost:4100'),
  MEDIA_SCANNER_MODE: z.enum(['clamav', 'development-bypass']).default('clamav'),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
});

export type Environment = z.infer<typeof envSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  const parsed = envSchema.safeParse(input);
  if (!parsed.success) {
    const fields = parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`);
    throw new Error(`Invalid environment configuration:\n${fields.join('\n')}`);
  }
  if (parsed.data.NODE_ENV === 'production' && parsed.data.MEDIA_SCANNER_MODE !== 'clamav') {
    throw new Error('Development scanner mode is forbidden in production');
  }
  return parsed.data;
}
