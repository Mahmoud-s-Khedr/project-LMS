import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { certificateLayoutSchema } from '@lms/shared';

export interface RenderInput {
  layout: unknown;
  recipientName: string;
  courseTitle: string;
  issuerName: string;
  verificationCode: string;
  issuedAt: Date;
  background?: { bytes: Buffer; mimeType: 'image/png' | 'image/jpeg' };
}
export const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

/** Chromium supplies embedded Unicode fonts, wrapping, print layout and a sandboxed PDF renderer.
 * HTML contains escaped plain text only. CSP blocks all network and scripts, including background URLs. */
export function certificateHtml(input: RenderInput): string {
  const layout = certificateLayoutSchema.parse(input.layout);
  const e = escapeHtml;
  const background = input.background
    ? `url(data:${input.background.mimeType};base64,${input.background.bytes.toString('base64')})`
    : 'none';
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src 'none'"><style>
  @page {size:A4 ${layout.orientation.toLowerCase()};margin:0} *{box-sizing:border-box} body{margin:0;color:#142b3b;font-family:serif; background:#fcfbf7} main{height:${layout.orientation === 'LANDSCAPE' ? '210' : '297'}mm;padding:14mm;background-image:${background};background-size:cover} article{height:100%;border:2px solid ${layout.accentColor};padding:10mm 12mm;display:flex;flex-direction:column;align-items:center;justify-content:space-evenly;text-align:center;background:rgba(255,255,255,.90)} h1{font-size:30pt;color:${layout.accentColor};margin:0;overflow-wrap:anywhere} h2{font-size:25pt;margin:0;overflow-wrap:anywhere} h3{font-size:19pt;margin:0;overflow-wrap:anywhere} p{font-size:12pt;line-height:1.4;margin:0;white-space:pre-wrap;overflow-wrap:anywhere} .body{font-size:${layout.body.length > 1200 ? '7' : layout.body.length > 600 ? '9' : '12'}pt;line-height:1.25} small{font:8pt monospace;overflow-wrap:anywhere} .label{text-transform:uppercase;letter-spacing:3px;font-size:10pt}</style></head><body><main><article><p class="label">Certificate of achievement</p><h1>${e(layout.title)}</h1><p>Presented to</p><h2 dir="auto">${e(input.recipientName)}</h2><p>For successfully completing</p><h3 dir="auto">${e(input.courseTitle)}</h3><p class="body" dir="auto">${e(layout.body)}</p><p dir="auto">${e(input.issuerName)} · ${input.issuedAt.toISOString().slice(0, 10)}</p><small>Verification: ${e(input.verificationCode)}</small></article></main></body></html>`;
}
@Injectable()
export class CertificateRenderer {
  async render(input: RenderInput): Promise<Buffer> {
    const dir = await mkdtemp(join(tmpdir(), 'lms-certificate-'));
    try {
      const html = join(dir, 'certificate.html');
      const pdf = join(dir, 'certificate.pdf');
      await writeFile(html, certificateHtml(input), { mode: 0o600 });
      await promisify(execFile)(
        process.env.CERTIFICATE_CHROMIUM_PATH ?? '/usr/bin/google-chrome',
        [
          '--headless',
          '--disable-gpu',
          '--disable-background-networking',
          '--no-pdf-header-footer',
          `--user-data-dir=${join(dir, 'profile')}`,
          `--print-to-pdf=${pdf}`,
          `file://${html}`,
        ],
        { timeout: 45000, maxBuffer: 1024 * 1024 },
      );
      const bytes = await readFile(pdf);
      if (!bytes.subarray(0, 5).equals(Buffer.from('%PDF-')))
        throw new Error('Invalid rendered PDF');
      return bytes;
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
