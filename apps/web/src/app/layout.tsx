import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import { headers } from 'next/headers';
import { Providers } from '@/components/providers';
import { siteConfig } from '@/features/marketing/site-config';
import './globals.css';

export const metadata: Metadata = {
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers();
  const nonce = headersList.get('x-nonce') ?? undefined;

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script
          nonce={nonce}
          dangerouslySetInnerHTML={{
            __html: 'window.__zod_globalConfig = { jitless: true };',
          }}
        />
      </head>
      <body className="min-h-screen bg-background font-sans text-foreground antialiased">
        <Providers nonce={nonce}>{children}</Providers>
      </body>
    </html>
  );
}
