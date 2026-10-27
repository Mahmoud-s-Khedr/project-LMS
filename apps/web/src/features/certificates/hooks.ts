import { useMutation, useQuery } from '@tanstack/react-query';
import type { CertificatesQueryParams } from './types';
import {
  fetchMyCertificates,
  fetchCertificate,
  downloadCertificate,
  verifyCertificate,
} from './api';

export const CERTIFICATES_QUERY_KEYS = {
  all: ['certificates'] as const,
  myCertificates: (query?: CertificatesQueryParams) => ['certificates', 'mine', query] as const,
  detail: (id: string) => ['certificates', 'detail', id] as const,
  verify: (code: string) => ['certificates', 'verify', code] as const,
};

export function useMyCertificatesQuery(query?: CertificatesQueryParams) {
  return useQuery({
    queryKey: CERTIFICATES_QUERY_KEYS.myCertificates(query),
    queryFn: () => fetchMyCertificates(query),
  });
}

export function useCertificateQuery(certificateId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: CERTIFICATES_QUERY_KEYS.detail(certificateId),
    queryFn: () => fetchCertificate(certificateId),
    enabled: (options?.enabled ?? true) && Boolean(certificateId),
  });
}

export function useDownloadCertificateMutation() {
  return useMutation({
    mutationFn: (certificateId: string) => downloadCertificate(certificateId),
  });
}

export function useVerifyCertificateQuery(
  verificationCode: string,
  options?: { enabled?: boolean },
) {
  const code = verificationCode.trim();
  return useQuery({
    queryKey: CERTIFICATES_QUERY_KEYS.verify(code),
    queryFn: () => verifyCertificate(code),
    enabled: (options?.enabled ?? true) && Boolean(code),
    retry: false,
  });
}
