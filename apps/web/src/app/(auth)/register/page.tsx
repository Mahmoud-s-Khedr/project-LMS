import { siteConfig } from '@/features/marketing/site-config';
import type { Metadata } from 'next';
import { RegisterForm } from '@/features/auth';

export const metadata: Metadata = {
  title: 'Create Account',
  description: `Create your free ${siteConfig.name} account to enroll in courses or launch a studio.`,
};

interface RegisterPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function RegisterPage({ searchParams }: RegisterPageProps) {
  const params = await searchParams;
  const rawRole = params.role;
  const roleStr = typeof rawRole === 'string' ? rawRole : Array.isArray(rawRole) ? rawRole[0] : '';
  const defaultRole = roleStr?.toLowerCase() === 'instructor' ? 'INSTRUCTOR' : 'STUDENT';
  const rawRedirect = params.redirect;
  const redirectTo =
    typeof rawRedirect === 'string'
      ? rawRedirect
      : Array.isArray(rawRedirect)
        ? rawRedirect[0]
        : undefined;

  return <RegisterForm defaultRole={defaultRole} redirectTo={redirectTo} />;
}
