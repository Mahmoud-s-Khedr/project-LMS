import { siteConfig } from '@/features/marketing/site-config';
import type { Metadata } from 'next';
import { ResetPasswordForm } from '@/features/auth';

export const metadata: Metadata = {
  title: 'Reset Password',
  description: `Set a new password for your ${siteConfig.name} account using your recovery token.`,
};

interface ResetPasswordPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function ResetPasswordPage({ searchParams }: ResetPasswordPageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const defaultToken =
    typeof rawToken === 'string' ? rawToken : Array.isArray(rawToken) ? (rawToken[0] ?? '') : '';

  return <ResetPasswordForm defaultToken={defaultToken} />;
}
