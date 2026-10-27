import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { Environment } from '../../config/env';

/** Domain modules must authorize ownership before issuing object URLs. */
@Injectable()
export class StorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  readonly privateBucket: string;
  readonly publicBucket: string;

  constructor(config: ConfigService<Environment, true>) {
    this.privateBucket = config.get('S3_PRIVATE_BUCKET', { infer: true });
    this.publicBucket = config.get('S3_PUBLIC_BUCKET', { infer: true });
    this.client = new S3Client({
      endpoint: config.get('S3_ENDPOINT', { infer: true }),
      region: config.get('S3_REGION', { infer: true }),
      forcePathStyle: config.get('S3_FORCE_PATH_STYLE', { infer: true }),
      credentials: {
        accessKeyId: config.get('S3_ACCESS_KEY_ID', { infer: true }),
        secretAccessKey: config.get('S3_SECRET_ACCESS_KEY', { infer: true }),
      },
    });
  }

  createUploadUrl(key: string, contentType: string, expiresIn = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({ Bucket: this.privateBucket, Key: key, ContentType: contentType }),
      { expiresIn },
    );
  }

  createDownloadUrl(key: string, expiresIn = 300): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.privateBucket, Key: key }),
      { expiresIn },
    );
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.privateBucket, Key: key }));
  }

  onModuleDestroy(): void {
    this.client.destroy();
  }
}
