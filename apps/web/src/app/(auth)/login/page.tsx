import { siteConfig } from '@/features/marketing/site-config';
import type { Metadata } from 'next';
import { LoginForm } from '@/features/auth';

export const metadata: Metadata = {
  title: 'Sign In',
  description: `Sign in to your ${siteConfig.name} student, instructor, or academy account.`,
};

interface LoginPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const rawRedirect = params.redirect;
  const redirectTo =
    typeof rawRedirect === 'string'
      ? rawRedirect
      : Array.isArray(rawRedirect)
        ? rawRedirect[0]
        : undefined;

  return <LoginForm redirectTo={redirectTo} />;
}
