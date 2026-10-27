import { z } from 'zod';

export const CONTRACT_REVISION = 'p1-c.v1' as const;
export const uuidSchema = z.uuid();
/** Wire values only: serializers must explicitly call toISOString()/toString(). */
export const timestampSchema = z.iso.datetime();
export const dateSchema = z.iso.date();
export const digitStringSchema = z
  .string()
  .regex(/^(0|[1-9]\d*)$/)
  .max(19)
  .pipe(
    z.string().refine((v) => BigInt(v) <= 9223372036854775807n, 'Exceeds signed BigInt storage'),
  );
export const decimalSchema = z
  .string()
  .regex(/^-?(0|[1-9]\d*)(\.\d{1,3})?$/)
  .max(16);
export const pointsSchema = decimalSchema.pipe(
  z
    .string()
    .refine(
      (v) => !v.startsWith('-') && decimalUnits(v) <= 999999999999n,
      'Expected nonnegative decimal points',
    ),
);
export function decimalUnits(value: string): bigint {
  const [whole = '0', fraction = ''] = value.split('.');
  return (
    BigInt(whole) * 1000n + BigInt(fraction.padEnd(3, '0')) * (value.startsWith('-') ? -1n : 1n)
  );
}
export const percentSchema = z
  .string()
  .regex(/^(0|[1-9]\d{0,2})(\.\d{1,2})?$/)
  .pipe(z.string().refine((v) => decimalUnits(v) <= 100000n, 'Expected 0..100'));
export const moneySchema = z.number().int().min(0).max(2147483647);
/** Lowercase ISO 4217 code format; commerce enforces its configured supported currencies. */
export const currencySchema = z.string().regex(/^[a-z]{3}$/);
export const versionSchema = z.number().int().min(1).max(2147483647);
export const positionSchema = z.number().int().min(0).max(2147483647);
export const titleSchema = z.string().trim().min(1).max(240);
export const nameSchema = z.string().trim().min(1).max(160);
export const reasonSchema = z.string().trim().min(1).max(1000);
export const slugSchema = z
  .string()
  .min(1)
  .max(140)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
export const searchSchema = z.string().trim().min(1).max(200);
export const timezoneSchema = z
  .string()
  .min(1)
  .max(64)
  .refine((v) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: v });
      return true;
    } catch {
      return false;
    }
  }, 'Expected an IANA timezone');
export const localeSchema = z
  .string()
  .min(2)
  .max(20)
  .regex(/^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/);
export const httpsUrlSchema = z
  .url()
  .max(2048)
  .pipe(
    z.string().refine((v) => {
      const u = new URL(v);
      return u.protocol === 'https:' && !u.username && !u.password;
    }, 'Expected HTTPS URL without credentials'),
  );
export const applicationPathSchema = z
  .string()
  .min(1)
  .max(1000)
  .regex(/^\/(?!\/)/)
  .refine(
    (v) =>
      !/[\\#]/.test(v) &&
      !Array.from(v).some((char) => char.charCodeAt(0) <= 32) &&
      !/%(?:2f|5c|0[0-9a-f]|1[0-9a-f]|20)/i.test(v) &&
      /^\/(?:student|instructor|admin|catalog|checkout|learn|orders|subscriptions|settings)(?:[/?]|$)/.test(
        v,
      ),
    'Expected an allowlisted application path',
  )
  .refine((v) => {
    try {
      const url = new URL(v, 'https://lms.invalid');
      return url.origin === 'https://lms.invalid' && url.pathname === v.split('?')[0];
    } catch {
      return false;
    }
  }, 'Application path must be canonical');
export const idempotencyKeySchema = z
  .string()
  .min(16)
  .max(128)
  .regex(/^[A-Za-z0-9._:-]+$/);
export const idempotencyHeadersSchema = z.strictObject({ 'Idempotency-Key': idempotencyKeySchema });
export const ifMatchSchema = z
  .string()
  .min(3)
  .max(128)
  .regex(/^"[^"\r\n]+"$/);
export const editHeadersSchema = z.strictObject({ 'If-Match': ifMatchSchema });
export const emptyInputSchema = z.strictObject({});
export const reasonInputSchema = z.strictObject({ reason: reasonSchema });
export const versionInputSchema = z.strictObject({ version: versionSchema });
export const entityShape = {
  id: uuidSchema,
  workspaceId: uuidSchema,
  createdAt: timestampSchema,
  updatedAt: timestampSchema,
};
export const responseSchema = <T extends z.ZodType>(data: T) => z.strictObject({ data });
export const uniqueIdsSchema = z
  .array(uuidSchema)
  .max(1000)
  .refine((v) => new Set(v).size === v.length, 'Duplicate IDs');
export const reorderSchema = z.strictObject({ ids: uniqueIdsSchema.min(1) });
type WithoutDefault<T> = T extends z.ZodDefault<infer I> ? I : T;
export const partialObject = <T extends z.ZodRawShape>(shape: T) => {
  const fields = Object.fromEntries(
    Object.entries(shape).map(([k, v]) => [k, v instanceof z.ZodDefault ? v.removeDefault() : v]),
  ) as { [K in keyof T]: WithoutDefault<T[K]> };
  return z.strictObject(fields).partial();
};
export const nonemptyPatch = <T extends z.ZodRawShape>(shape: T) =>
  partialObject(shape).refine(
    (v) => Object.values(v).some((x) => x !== undefined),
    'Provide at least one change',
  );
export const dateRangeShape = { from: timestampSchema.optional(), to: timestampSchema.optional() };
export const validDateRange = (v: { from?: string | undefined; to?: string | undefined }) =>
  !v.from || !v.to || Date.parse(v.from) < Date.parse(v.to);
export const optionalBooleanQuerySchema = z
  .enum(['true', 'false'])
  .transform((v) => v === 'true')
  .optional();

// Bounded structured content. Plain text leaves are escaped by renderers; never render as HTML.
export const richTextSchema = z
  .strictObject({
    type: z.literal('doc'),
    content: z
      .array(
        z.strictObject({
          type: z.enum(['paragraph', 'heading', 'blockquote', 'codeBlock']),
          content: z
            .array(
              z.strictObject({
                type: z.literal('text'),
                text: z.string().max(20000),
                marks: z
                  .array(z.enum(['bold', 'italic', 'code', 'underline']))
                  .max(4)
                  .optional(),
              }),
            )
            .max(200),
        }),
      )
      .max(200),
  })
  .refine((v) => JSON.stringify(v).length <= 100000, 'Document too large');
export type RichText = z.infer<typeof richTextSchema>;
export type IdempotencyHeaders = z.infer<typeof idempotencyHeadersSchema>;
export type EditHeaders = z.infer<typeof editHeadersSchema>;
export type ReorderInput = z.infer<typeof reorderSchema>;
