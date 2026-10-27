import type {
  Certificate,
  CertificateVerification,
  CertificatesQuery,
  CertificateStatus,
} from '@lms/shared';
import type { z } from 'zod';
import type { certificatesQuerySchema } from '@lms/shared';

export type {
  Certificate,
  CertificateVerification,
  CertificatesQuery,
  CertificateStatus,
};

export type CertificatesQueryParams = z.input<typeof certificatesQuerySchema>;

export function formatCertificateDate(isoString: string | null | undefined): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return isoString;
    return new Intl.DateTimeFormat('en-US', {
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    }).format(d);
  } catch {
    return isoString;
  }
}
