'use client';

import * as React from 'react';
import Link from 'next/link';
import { ExternalLink, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { CertificateList, useMyCertificatesQuery } from '@/features/certificates';

export default function StudentCertificatesPage() {
  const { data, isLoading, isError, refetch } = useMyCertificatesQuery();

  return (
    <div className="space-y-6 pb-10">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-border/60 pb-5">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            Earned Certificates
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Download your official course completion credentials and share public verification
            codes.
          </p>
        </div>

        <Button variant="outline" size="sm" asChild className="text-xs">
          <Link href="/verify">
            <ShieldCheck className="mr-1.5 size-3.5 text-primary" />
            Public Verification Tool
            <ExternalLink className="ml-1 size-3" />
          </Link>
        </Button>
      </div>

      <CertificateList
        certificates={data?.data}
        isLoading={isLoading}
        isError={isError}
        onRetry={refetch}
      />
    </div>
  );
}
