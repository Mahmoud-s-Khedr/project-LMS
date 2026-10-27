'use client';

import * as React from 'react';
import Link from 'next/link';
import {
  Calendar,
  Check,
  Copy,
  Download,
  ExternalLink,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  User,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';
import { useDownloadCertificateMutation } from '../hooks';
import { formatCertificateDate } from '../types';
import type { Certificate } from '../types';

export interface CertificateCardProps {
  certificate: Certificate;
}

export function CertificateCard({ certificate }: CertificateCardProps) {
  const downloadMutation = useDownloadCertificateMutation();
  const [copied, setCopied] = React.useState(false);

  const isValid = certificate.status === 'VALID';
  const isRenderReady = certificate.renderStatus === 'READY';
  const isPending = certificate.renderStatus === 'PENDING';

  const handleCopyCode = async () => {
    try {
      await navigator.clipboard.writeText(certificate.verificationCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback
    }
  };

  const handleDownload = async () => {
    try {
      const result = await downloadMutation.mutateAsync(certificate.id);
      if (result.url) {
        window.open(result.url, '_blank', 'noopener,noreferrer');
      }
    } catch {
      // Mutation error state captured by button or toast
    }
  };

  return (
    <Card className="flex flex-col justify-between overflow-hidden border-border/80 bg-gradient-to-b from-card via-card to-muted/20 shadow-sm transition-all hover:shadow-md">
      {/* Decorative Top Border */}
      <div
        className={`h-1.5 w-full ${
          isValid ? 'bg-gradient-to-r from-amber-500 via-primary to-amber-600' : 'bg-destructive/80'
        }`}
      />

      <CardHeader className="space-y-3 pb-3">
        <div className="flex items-center justify-between gap-2">
          {isValid ? (
            <Badge
              variant="outline"
              className="border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-xs"
            >
              <ShieldCheck className="mr-1 size-3.5" />
              Valid Credential
            </Badge>
          ) : (
            <Badge variant="destructive" className="text-xs">
              <ShieldAlert className="mr-1 size-3.5" />
              Revoked
            </Badge>
          )}

          {isPending && (
            <Badge variant="secondary" className="text-[11px]">
              <Loader2 className="mr-1 size-3 animate-spin" />
              Rendering PDF…
            </Badge>
          )}

          {certificate.renderStatus === 'FAILED' && (
            <Badge variant="destructive" className="text-[11px]">
              Render Failed
            </Badge>
          )}
        </div>

        <div>
          <h3 className="line-clamp-2 text-lg font-bold tracking-tight text-foreground">
            {certificate.courseTitle}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">Issued by {certificate.issuerName}</p>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 py-2">
        {/* Recipient and Date */}
        <div className="space-y-2 rounded-xl border border-border/60 bg-muted/30 p-3 text-xs">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <User className="size-3.5" />
              Awarded To
            </span>
            <span className="font-semibold text-foreground">{certificate.recipientName}</span>
          </div>
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              Issue Date
            </span>
            <span className="font-medium text-foreground">
              {formatCertificateDate(certificate.issuedAt)}
            </span>
          </div>
          {certificate.revokedAt && (
            <div className="flex items-center justify-between text-destructive">
              <span className="flex items-center gap-1.5">
                <ShieldAlert className="size-3.5" />
                Revoked Date
              </span>
              <span className="font-medium">{formatCertificateDate(certificate.revokedAt)}</span>
            </div>
          )}
        </div>

        {/* Verification Code Box */}
        <div className="space-y-1">
          <div className="flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>Verification Code</span>
            <button
              type="button"
              onClick={handleCopyCode}
              className="flex items-center gap-1 text-primary hover:underline"
            >
              {copied ? (
                <>
                  <Check className="size-3 text-emerald-500" />
                  <span className="text-emerald-500">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="size-3" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          <p className="truncate font-mono text-xs text-foreground/80 bg-muted/40 p-2 rounded-lg border border-border/40 select-all">
            {certificate.verificationCode}
          </p>
        </div>
      </CardContent>

      <CardFooter className="flex flex-wrap items-center justify-between gap-2 border-t border-border/40 pt-3">
        <Button variant="outline" size="sm" asChild className="text-xs">
          <Link href={`/verify/${certificate.verificationCode}`}>
            <ExternalLink className="mr-1.5 size-3.5" />
            Verify
          </Link>
        </Button>

        <Button
          size="sm"
          onClick={handleDownload}
          disabled={!isValid || !isRenderReady || downloadMutation.isPending}
          className="text-xs"
        >
          {downloadMutation.isPending ? (
            <>
              <Loader2 className="mr-1.5 size-3.5 animate-spin" />
              Generating Link…
            </>
          ) : (
            <>
              <Download className="mr-1.5 size-3.5" />
              Download PDF
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  );
}
