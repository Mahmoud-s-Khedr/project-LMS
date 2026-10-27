import { config } from 'dotenv';
import {
  S3Client,
  CreateBucketCommand,
  PutBucketCorsCommand,
  PutBucketVersioningCommand,
  PutBucketLifecycleConfigurationCommand,
  PutBucketPolicyCommand,
  DeleteBucketPolicyCommand,
} from '@aws-sdk/client-s3';
config({ path: '../../.env', quiet: true });
const client = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION ?? 'us-east-1',
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.S3_ACCESS_KEY_ID!,
    secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
  },
});
async function main() {
  const privateBucket = process.env.S3_PRIVATE_BUCKET ?? 'lms-private';
  const publicBucket = process.env.S3_PUBLIC_BUCKET ?? 'lms-public';
  for (const Bucket of [privateBucket, publicBucket]) {
    try {
      await client.send(new CreateBucketCommand({ Bucket }));
    } catch (error) {
      if (
        !(error instanceof Error) ||
        !['BucketAlreadyOwnedByYou', 'BucketAlreadyExists'].includes(error.name)
      )
        throw error;
    }
    try {
      await client.send(
        new PutBucketCorsCommand({
          Bucket,
          CORSConfiguration: {
            CORSRules: [
              {
                AllowedOrigins: [process.env.WEB_ORIGIN ?? 'http://localhost:3100'],
                AllowedMethods: ['PUT', 'GET', 'HEAD', 'POST'],
                AllowedHeaders: ['Content-Type', 'x-amz-*'],
                ExposeHeaders: ['ETag'],
                MaxAgeSeconds: 3600,
              },
            ],
          },
        }),
      );
    } catch (error) {
      if (!(error instanceof Error) || error.name !== 'NotImplemented') throw error;
      console.log('MinIO uses server-level CORS; run scripts/bootstrap-storage.sh.');
    }
  }
  await client.send(
    new PutBucketVersioningCommand({
      Bucket: privateBucket,
      VersioningConfiguration: { Status: 'Enabled' },
    }),
  );
  await client.send(new DeleteBucketPolicyCommand({ Bucket: privateBucket }));
  await client.send(
    new PutBucketPolicyCommand({
      Bucket: publicBucket,
      Policy: JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: '*',
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${publicBucket}/*`],
          },
        ],
      }),
    }),
  );
  await client.send(
    new PutBucketLifecycleConfigurationCommand({
      Bucket: privateBucket,
      LifecycleConfiguration: {
        Rules: [
          {
            ID: 'quarantine-expiry',
            Status: 'Enabled',
            Filter: { Prefix: 'quarantine/' },
            Expiration: { Days: 2 },
            AbortIncompleteMultipartUpload: { DaysAfterInitiation: 1 },
          },
        ],
      },
    }),
  );
  console.log('Buckets, CORS, private policy and quarantine lifecycle configured.');
}
void main().finally(() => client.destroy());
