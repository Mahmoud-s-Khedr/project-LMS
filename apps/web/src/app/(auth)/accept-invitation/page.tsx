import { siteConfig } from '@/features/marketing/site-config';
import type { Metadata } from 'next';
import { AcceptInvitationView } from '@/features/auth';

export const metadata: Metadata = {
  title: 'Accept Invitation',
  description: `Accept an invitation to join a ${siteConfig.name} workspace.`,
};

interface AcceptInvitationPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AcceptInvitationPage({ searchParams }: AcceptInvitationPageProps) {
  const params = await searchParams;
  const rawToken = params.token;
  const defaultToken =
    typeof rawToken === 'string' ? rawToken : Array.isArray(rawToken) ? (rawToken[0] ?? '') : '';

  return <AcceptInvitationView defaultToken={defaultToken} />;
}
