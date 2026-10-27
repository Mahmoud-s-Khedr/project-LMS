import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  S3Client,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  AbortMultipartUploadCommand,
  GetObjectCommand,
  PutObjectCommand,
  HeadObjectCommand,
  type CompletedPart,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createReadStream, createWriteStream } from 'node:fs';
import { pipeline } from 'node:stream/promises';
import { Transform } from 'node:stream';
import { createHash } from 'node:crypto';
import { StorageService } from '../../infrastructure/storage/storage.service';

/** Only the missing multipart/worker streaming operations; ordinary capabilities reuse StorageService. */
@Injectable()
export class MediaStorageService implements OnModuleDestroy {
  private readonly client: S3Client;
  constructor(
    config: ConfigService,
    readonly storage: StorageService,
  ) {
    this.client = new S3Client({
      endpoint: config.getOrThrow<string>('S3_ENDPOINT'),
      region: config.getOrThrow<string>('S3_REGION'),
      forcePathStyle: true,
      credentials: {
        accessKeyId: config.getOrThrow<string>('S3_ACCESS_KEY_ID'),
        secretAccessKey: config.getOrThrow<string>('S3_SECRET_ACCESS_KEY'),
      },
    });
  }
  async initiate(key: string, mime: string) {
    const r = await this.client.send(
      new CreateMultipartUploadCommand({
        Bucket: this.storage.privateBucket,
        Key: key,
        ContentType: mime,
      }),
    );
    if (!r.UploadId) throw new Error('Object store omitted upload ID');
    return r.UploadId;
  }
  download(key: string, filename: string, mime: string) {
    const disposition = `${mime.startsWith('video/') || mime.startsWith('audio/') ? 'inline' : 'attachment'}; filename="download"; filename*=UTF-8''${encodeURIComponent(filename).replace(/['()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)}`;
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.storage.privateBucket,
        Key: key,
        ResponseContentDisposition: disposition,
        ResponseContentType: mime,
      }),
      { expiresIn: 60 },
    );
  }
  part(key: string, uploadId: string, partNumber: number) {
    return getSignedUrl(
      this.client,
      new UploadPartCommand({
        Bucket: this.storage.privateBucket,
        Key: key,
        UploadId: uploadId,
        PartNumber: partNumber,
      }),
      { expiresIn: 300 },
    );
  }
  async complete(key: string, uploadId: string, parts: CompletedPart[]) {
    await this.client.send(
      new CompleteMultipartUploadCommand({
        Bucket: this.storage.privateBucket,
        Key: key,
        UploadId: uploadId,
        MultipartUpload: { Parts: parts },
      }),
    );
  }
  async publishPublicVariant(privateKey: string, publicKey: string, mime: string) {
    await this.client.send(
      new CopyObjectCommand({
        Bucket: this.storage.publicBucket,
        Key: publicKey,
        CopySource: `${this.storage.privateBucket}/${privateKey.split('/').map(encodeURIComponent).join('/')}`,
        ContentType: mime,
        MetadataDirective: 'REPLACE',
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
  }
  async deletePublicVariant(key: string) {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.storage.publicBucket, Key: key }),
    );
  }
  async abort(key: string, uploadId: string) {
    await this.client.send(
      new AbortMultipartUploadCommand({
        Bucket: this.storage.privateBucket,
        Key: key,
        UploadId: uploadId,
      }),
    );
  }
  async fetchVerified(key: string, path: string, expectedSize: bigint) {
    const head = await this.client.send(
      new HeadObjectCommand({ Bucket: this.storage.privateBucket, Key: key }),
    );
    if (BigInt(head.ContentLength ?? -1) !== expectedSize) throw new MediaRejected('SIZE_MISMATCH');
    const result = await this.client.send(
      new GetObjectCommand({ Bucket: this.storage.privateBucket, Key: key }),
    );
    if (!result.Body) throw new Error('Empty object response');
    let count = 0n;
    const digest = createHash('sha256');
    let prefix = Buffer.alloc(0);
    const verify = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        count += BigInt(chunk.length);
        if (count > expectedSize) {
          callback(new MediaRejected('SIZE_MISMATCH'));
          return;
        }
        digest.update(chunk);
        if (prefix.length < 512)
          prefix = Buffer.concat([prefix, chunk.subarray(0, 512 - prefix.length)]);
        callback(null, chunk);
      },
    });
    const body = result.Body as NodeJS.ReadableStream;
    await pipeline(body, verify, createWriteStream(path), {
      signal: AbortSignal.timeout(30 * 60 * 1000),
    });
    if (count !== expectedSize) throw new MediaRejected('SIZE_MISMATCH');
    return { sha256: digest.digest('hex'), prefix, contentType: result.ContentType };
  }
  async putFile(key: string, path: string, mime: string, length: number) {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.storage.privateBucket,
        Key: key,
        Body: createReadStream(path),
        ContentType: mime,
        ContentLength: length,
      }),
    );
  }
  onModuleDestroy() {
    this.client.destroy();
  }
}
export class MediaRejected extends Error {
  constructor(
    readonly code:
      'SIZE_MISMATCH' | 'MIME_MISMATCH' | 'CHECKSUM_MISMATCH' | 'MALWARE' | 'SCAN_FAILED',
  ) {
    super(code);
  }
}
export function sniffMime(prefix: Buffer, mime: string): boolean {
  if (mime === 'application/pdf') return prefix.subarray(0, 5).toString() === '%PDF-';
  if (mime === 'image/png')
    return prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  if (mime === 'image/jpeg') return prefix[0] === 255 && prefix[1] === 216 && prefix[2] === 255;
  if (mime === 'image/webp')
    return (
      prefix.subarray(0, 4).toString() === 'RIFF' && prefix.subarray(8, 12).toString() === 'WEBP'
    );
  if (mime === 'video/mp4') return prefix.subarray(4, 8).toString() === 'ftyp';
  if (mime === 'audio/mpeg')
    return (
      prefix.subarray(0, 3).toString() === 'ID3' ||
      (prefix[0] === 255 && ((prefix[1] ?? 0) & 224) === 224)
    );
  if (mime === 'text/vtt')
    return prefix
      .toString('utf8')
      .replace(/^\uFEFF/, '')
      .startsWith('WEBVTT');
  if (mime === 'text/plain')
    return !prefix.includes(0) && !/^\s*(?:<!doctype|<html|<script|<svg)/i.test(prefix.toString());
  return false;
}
