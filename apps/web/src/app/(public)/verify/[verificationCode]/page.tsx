import type { Metadata } from 'next';
import { siteConfig } from '@/features/marketing/site-config';
import { PublicCertificateVerifier } from '@/features/certificates';

interface VerifyCodePageProps {
  params: Promise<{ verificationCode: string }>;
}

export async function generateMetadata({ params }: VerifyCodePageProps): Promise<Metadata> {
  const { verificationCode } = await params;
  return {
    title: `Verify Certificate ${verificationCode.slice(0, 8)}… | ${siteConfig.name}`,
    description: `Official verification record for certificate ${verificationCode}.`,
  };
}

export default async function VerifyCodePage({ params }: VerifyCodePageProps) {
  const { verificationCode } = await params;

  return (
    <main className="min-h-[calc(100vh-14rem)] bg-muted/10 py-10">
      <PublicCertificateVerifier initialCode={verificationCode} />
    </main>
  );
}
