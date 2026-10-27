import type { Metadata } from 'next';
import { siteConfig } from '@/features/marketing/site-config';
import { PublicCertificateVerifier } from '@/features/certificates';

export const metadata: Metadata = {
  title: `Verify Certificate | ${siteConfig.name}`,
  description:
    'Verify the authenticity, completion status, and issuing authority of an official course completion certificate.',
};

export default function VerifyPage() {
  return (
    <main className="min-h-[calc(100vh-14rem)] bg-muted/10 py-10">
      <PublicCertificateVerifier />
    </main>
  );
}
