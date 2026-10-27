'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import {
  Calendar,
  CheckCircle2,
  Loader2,
  Lock,
  Search,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { siteConfig } from '@/features/marketing/site-config';
import { useVerifyCertificateQuery } from '../hooks';
import { formatCertificateDate } from '../types';

export interface PublicCertificateVerifierProps {
  initialCode?: string;
}

export function PublicCertificateVerifier({ initialCode = '' }: PublicCertificateVerifierProps) {
  const router = useRouter();
  const [codeInput, setCodeInput] = React.useState(initialCode);
  const [activeCode, setActiveCode] = React.useState(initialCode.trim());

  const {
    data: verification,
    isLoading,
    isError,
  } = useVerifyCertificateQuery(activeCode, {
    enabled: Boolean(activeCode),
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = codeInput.trim();
    if (trimmed) {
      setActiveCode(trimmed);
      router.push(`/verify/${encodeURIComponent(trimmed)}`);
    }
  };

  const isValid = verification?.status === 'VALID';

  return (
    <div className="mx-auto max-w-2xl space-y-8 px-4 py-8 sm:py-12">
      {/* Search Header */}
      <div className="text-center space-y-3">
        <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
          <ShieldCheck className="size-3.5" />
          Official Credential Verification
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          Verify Certificate Authenticity
        </h1>
        <p className="mx-auto max-w-lg text-sm text-muted-foreground">
          Enter a certificate verification code issued by {siteConfig.name} to confirm its
          integrity, completion status, and issuer credentials.
        </p>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="mx-auto mt-6 flex max-w-md gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Paste verification code…"
              value={codeInput}
              onChange={(e) => setCodeInput(e.target.value)}
              className="pl-9 font-mono text-xs sm:text-sm"
              required
            />
          </div>
          <Button type="submit" disabled={isLoading || !codeInput.trim()}>
            {isLoading ? <Loader2 className="size-4 animate-spin" /> : 'Verify'}
          </Button>
        </form>
      </div>

      {/* Verification Result Display */}
      {isLoading && (
        <Card className="border-border/60">
          <CardContent className="flex flex-col items-center justify-center p-12 text-center space-y-3">
            <Loader2 className="size-8 animate-spin text-primary" />
            <p className="text-sm font-medium text-muted-foreground">
              Verifying certificate against cryptographic records…
            </p>
          </CardContent>
        </Card>
      )}

      {isError && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="flex flex-col items-center justify-center p-8 text-center sm:p-10 space-y-2">
            <div className="rounded-2xl bg-destructive/10 p-3 text-destructive">
              <ShieldAlert className="size-8" />
            </div>
            <h3 className="text-base font-semibold text-destructive">Certificate Not Verified</h3>
            <p className="max-w-md text-xs sm:text-sm text-muted-foreground">
              We could not locate a valid certificate with verification code{' '}
              <code className="font-mono font-medium text-foreground">{activeCode}</code>. Please
              double-check the code or contact the issuer.
            </p>
          </CardContent>
        </Card>
      )}

      {verification && (
        <Card className="overflow-hidden border-border/80 shadow-lg">
          {/* Top banner */}
          <div
            className={`h-2 w-full ${
              isValid
                ? 'bg-gradient-to-r from-emerald-500 via-primary to-emerald-600'
                : 'bg-destructive'
            }`}
          />

          <CardHeader className="p-6 text-center space-y-3">
            <div className="mx-auto flex justify-center">
              {isValid ? (
                <div className="rounded-2xl bg-emerald-500/10 p-4 text-emerald-600 dark:text-emerald-400">
                  <CheckCircle2 className="size-10" />
                </div>
              ) : (
                <div className="rounded-2xl bg-destructive/10 p-4 text-destructive">
                  <ShieldAlert className="size-10" />
                </div>
              )}
            </div>

            <div>
              <div className="flex justify-center">
                <Badge
                  variant="outline"
                  className={
                    isValid
                      ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs px-3 py-1 font-semibold'
                      : 'border-destructive/40 bg-destructive/10 text-destructive text-xs px-3 py-1 font-semibold'
                  }
                >
                  {isValid ? 'Verified Valid Credential' : 'Credential Revoked'}
                </Badge>
              </div>

              <h2 className="mt-3 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
                {verification.courseTitle}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Issued by{' '}
                <span className="font-medium text-foreground">{verification.issuerName}</span>
              </p>
            </div>
          </CardHeader>

          <CardContent className="p-6 pt-0 space-y-4">
            <div className="divide-y divide-border/60 rounded-xl border border-border/60 bg-muted/20 text-xs sm:text-sm">
              <div className="flex items-center justify-between p-3.5 sm:p-4">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <User className="size-4" />
                  Recipient (Privacy Masked)
                </span>
                <span className="font-semibold text-foreground">
                  {verification.maskedRecipientName}
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 sm:p-4">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Calendar className="size-4" />
                  Date of Issuance
                </span>
                <span className="font-medium text-foreground">
                  {formatCertificateDate(verification.issuedAt)}
                </span>
              </div>

              <div className="flex items-center justify-between p-3.5 sm:p-4">
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Lock className="size-4" />
                  Verification Code
                </span>
                <span className="font-mono text-xs text-foreground/80">{activeCode}</span>
              </div>
            </div>

            <div className="rounded-xl border border-border/40 bg-muted/10 p-4 text-xs text-muted-foreground">
              <p className="flex items-center gap-1.5 font-medium text-foreground">
                <ShieldCheck className="size-3.5 text-primary" />
                Privacy & Cryptographic Integrity Notice
              </p>
              <p className="mt-1 leading-relaxed">
                To protect student data rights, recipient personal names are privacy-masked in
                public verification. This verification record is cryptographically guaranteed by{' '}
                {siteConfig.name}.
              </p>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
