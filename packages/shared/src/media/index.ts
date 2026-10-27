import { z } from 'zod';
import { assetStatusSchema, assetVisibilitySchema } from '../enums';
import {
  entityShape,
  uuidSchema,
  digitStringSchema,
  timestampSchema,
  responseSchema,
} from '../primitives';
export const submissionMimeSchema = z.enum([
  'application/pdf',
  'text/plain',
  'image/jpeg',
  'image/png',
]);
export const uploadMimeSchema = z.enum([
  'application/pdf',
  'text/plain',
  'text/vtt',
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/mpeg',
]);
export const assetPurposeSchema = z.enum([
  'PRIMARY_VIDEO',
  'PRIMARY_DOCUMENT',
  'CAPTIONS',
  'RESOURCE',
  'RECORDING',
  'COURSE_COVER',
  'SUBMISSION',
  'CERTIFICATE_BACKGROUND',
]);
export const assetUploadSchema = z
  .strictObject({
    purpose: assetPurposeSchema,
    parentId: uuidSchema,
    filename: z
      .string()
      .min(1)
      .max(255)
      .refine(
        (v) => !/[\\/]/.test(v) && !Array.from(v).some((char) => char.charCodeAt(0) < 32),
        'Unsafe filename',
      ),
    mimeType: uploadMimeSchema,
    sizeBytes: digitStringSchema.pipe(
      z
        .string()
        .refine((v) => BigInt(v) > 0n && BigInt(v) <= 5368709120n, 'Expected 1 byte..5 GiB'),
    ),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .refine(
    (v) =>
      v.purpose !== 'SUBMISSION' ||
      (submissionMimeSchema.safeParse(v.mimeType).success &&
        digitStringSchema.safeParse(v.sizeBytes).success &&
        BigInt(v.sizeBytes) <= 10485760n),
    'Submission must use safe MIME and be <=10 MiB',
  );
export const assetCompleteSchema = z.strictObject({});
export const assetSchema = z.strictObject({
  ...entityShape,
  filename: z.string().max(255),
  mimeType: uploadMimeSchema,
  sizeBytes: digitStringSchema,
  status: assetStatusSchema,
  visibility: assetVisibilitySchema,
  rejectionCode: z
    .enum(['SIZE_MISMATCH', 'MIME_MISMATCH', 'CHECKSUM_MISMATCH', 'MALWARE', 'SCAN_FAILED'])
    .nullable(),
});
// Local MinIO HTTP is supported; deployment signing services enforce their trusted endpoint.
export const capabilityUrlSchema = z
  .url()
  .max(8192)
  .pipe(
    z.string().refine((v) => {
      const url = new URL(v);
      return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
    }),
  );
export const downloadCapabilitySchema = z.strictObject({
  url: capabilityUrlSchema,
  expiresAt: timestampSchema,
});
export const assetUploadResponseSchema = responseSchema(
  z.strictObject({
    assetId: uuidSchema,
    url: capabilityUrlSchema,
    method: z.enum(['PUT', 'POST']),
    headers: z.record(z.string().max(100), z.string().max(1000)),
    expiresAt: timestampSchema,
  }),
);
export const assetResponseSchema = responseSchema(assetSchema);
export const downloadResponseSchema = responseSchema(downloadCapabilitySchema);
export const assetCompleteResponseSchema = responseSchema(
  z.strictObject({ operationId: uuidSchema, status: z.literal('SCANNING') }),
);
export const joinSessionResponseSchema = downloadResponseSchema;
export type Asset = z.infer<typeof assetSchema>;
export type AssetUpload = z.infer<typeof assetUploadSchema>;
export type DownloadCapability = z.infer<typeof downloadCapabilitySchema>;

export const multipartPartsSchema = z
  .strictObject({
    parts: z
      .array(
        z.strictObject({
          partNumber: z.number().int().min(1).max(10000),
          etag: z.string().regex(/^"?[a-fA-F0-9-]{16,128}"?$/),
        }),
      )
      .min(1)
      .max(10000),
  })
  .refine(
    (v) => v.parts.every((p, i) => p.partNumber === i + 1),
    'Parts must be contiguous and ordered',
  );
export const multipartSignSchema = z.strictObject({
  partNumber: z.number().int().min(1).max(10000),
});
export const multipartModeSchema = z.strictObject({
  multipart: z.enum(['true', 'false']).default('false'),
});

export const multipartUploadResponseSchema = responseSchema(
  z.strictObject({
    assetId: uuidSchema,
    uploadId: z.string().min(1).max(2048),
    partSizeBytes: z.literal(16777216),
    expiresAt: timestampSchema,
  }),
);
export const uploadStartResponseSchema = z.union([
  assetUploadResponseSchema,
  multipartUploadResponseSchema,
]);
