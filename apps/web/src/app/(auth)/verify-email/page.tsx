import { siteConfig } from '@/features/marketing/site-config';
import type { Metadata } from 'next';
import { VerifyEmailView } from '@/features/auth';

export const metadata: Metadata = {
  title: 'Verify Email',
  description: `Verify your ${siteConfig.name} email address or request a new verification link.`,
};

interface VerifyEmailPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function VerifyEmailPage({ searchParams }: VerifyEmailPageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const rawEmail = params.email;

  const defaultToken =
    typeof rawToken === 'string' ? rawToken : Array.isArray(rawToken) ? (rawToken[0] ?? '') : '';
  const defaultEmail =
    typeof rawEmail === 'string' ? rawEmail : Array.isArray(rawEmail) ? (rawEmail[0] ?? '') : '';

  return <VerifyEmailView defaultToken={defaultToken} defaultEmail={defaultEmail} />;
}
