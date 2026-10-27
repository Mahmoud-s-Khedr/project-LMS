import 'reflect-metadata';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { CertificateRenderer } from './certificate-renderer';

async function main() {
  const renderer = new CertificateRenderer();
  const pdf = await renderer.render({
    layout: {
      orientation: 'LANDSCAPE',
      title: 'Certificate of Completion',
      body: 'For demonstrated commitment to secure software design,\npractical application, and continuous learning.',
      accentColor: '#176875',
    },
    recipientName: 'Ada Lovelace · أحمد علي',
    courseTitle: 'Secure Systems & Software Engineering',
    issuerName: 'Northstar Learning Academy',
    verificationCode: 'p3EngageRepresentativeFixtureCode0123456789012',
    issuedAt: new Date('2026-10-26T12:00:00Z'),
  });
  const output = join(__dirname, 'fixtures', 'representative.pdf');
  await writeFile(output, pdf, { mode: 0o600 });
  process.stdout.write(`Rendered ${pdf.length} bytes to ${output}\n`);
}
void main().catch((error) => {
  process.stderr.write(`${String(error)}\n`);
  process.exitCode = 1;
});
