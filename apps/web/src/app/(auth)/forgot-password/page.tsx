import { siteConfig } from '@/features/marketing/site-config';
import type { Metadata } from 'next';
import { ForgotPasswordForm } from '@/features/auth';

export const metadata: Metadata = {
  title: 'Forgot Password',
  description: `Request a password recovery link for your ${siteConfig.name} account.`,
};

export default function ForgotPasswordPage() {
  return <ForgotPasswordForm />;
}
