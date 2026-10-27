'use client';

import * as React from 'react';
import Link from 'next/link';
import { Award, Compass, RotateCcw, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { CertificateCard } from './certificate-card';
import type { Certificate } from '../types';

export interface CertificateListProps {
  certificates?: Certificate[];
  isLoading?: boolean;
  isError?: boolean;
  onRetry?: () => void;
}

export function CertificateList({
  certificates = [],
  isLoading,
  isError,
  onRetry,
}: CertificateListProps) {
  const [filter, setFilter] = React.useState<'all' | 'valid' | 'revoked'>('all');
  const [searchQuery, setSearchQuery] = React.useState('');

  const filteredCertificates = React.useMemo(() => {
    return certificates.filter((cert) => {
      if (filter === 'valid' && cert.status !== 'VALID') return false;
      if (filter === 'revoked' && cert.status !== 'REVOKED') return false;

      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesTitle = cert.courseTitle.toLowerCase().includes(query);
        const matchesCode = cert.verificationCode.toLowerCase().includes(query);
        const matchesIssuer = cert.issuerName.toLowerCase().includes(query);
        if (!matchesTitle && !matchesCode && !matchesIssuer) return false;
      }

      return true;
    });
  }, [certificates, filter, searchQuery]);

  if (isError) {
    return (
      <div className="flex flex-col items-center justify-center rounded-2xl border border-destructive/20 bg-destructive/5 p-8 text-center sm:p-12">
        <p className="font-semibold text-destructive">Failed to load certificates</p>
        <p className="mt-1 text-sm text-muted-foreground">
          There was an issue retrieving your certificates. Please try again.
        </p>
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry} className="mt-4">
            <RotateCcw className="mr-2 size-3.5" />
            Try Again
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Controls */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          value={filter}
          onValueChange={(val) => setFilter(val as typeof filter)}
          className="w-full sm:w-auto"
        >
          <TabsList className="grid w-full grid-cols-3 sm:w-auto">
            <TabsTrigger value="all">All ({certificates.length})</TabsTrigger>
            <TabsTrigger value="valid">Valid</TabsTrigger>
            <TabsTrigger value="revoked">Revoked</TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search certificates…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
      </div>

      {/* Loading */}
      {isLoading ? (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-xl border border-border/60 p-5 space-y-4">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-3/4" />
              <Skeleton className="h-16 w-full" />
              <div className="flex justify-between pt-2">
                <Skeleton className="h-8 w-24" />
                <Skeleton className="h-8 w-28" />
              </div>
            </div>
          ))}
        </div>
      ) : filteredCertificates.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {filteredCertificates.map((cert) => (
            <CertificateCard key={cert.id} certificate={cert} />
          ))}
        </div>
      ) : (
        /* Empty */
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border/80 bg-muted/20 p-8 text-center sm:p-12">
          <div className="rounded-2xl bg-amber-500/10 p-4 text-amber-600 dark:text-amber-400">
            <Award className="size-8" />
          </div>
          <h3 className="mt-4 text-base font-semibold text-foreground">
            {searchQuery ? 'No matching certificates found' : 'No certificates earned yet'}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            {searchQuery
              ? 'Try modifying your search or changing the selected status filter.'
              : 'Complete all lessons, assignments, and passing requirements in a course to earn official verifiable certificates.'}
          </p>
          <div className="mt-5 flex gap-3">
            {searchQuery ? (
              <Button variant="outline" size="sm" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            ) : (
              <Button asChild size="sm">
                <Link href="/student/enrollments">
                  <Compass className="mr-2 size-4" />
                  View Enrolled Courses
                </Link>
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
