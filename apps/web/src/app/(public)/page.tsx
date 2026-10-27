import type { Metadata } from 'next';
import { LandingPage, siteConfig } from '@/features/marketing';

export const metadata: Metadata = {
  title: `${siteConfig.name} — ${siteConfig.tagline}`,
  description: siteConfig.description,
};

export default function PublicLandingPage() {
  return <LandingPage />;
}
