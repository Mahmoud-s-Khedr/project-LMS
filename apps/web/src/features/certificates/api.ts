import { api } from '@/lib/api';
import type { CursorMeta } from '@lms/shared';
import type {
  Certificate,
  CertificateVerification,
  CertificatesQueryParams,
} from './types';

export interface PaginatedCertificatesResponse {
  data: Certificate[];
  meta?: CursorMeta;
}

export interface CertificateDownloadResponse {
  data: {
    url: string;
    expiresAt: string;
  };
}

export async function fetchMyCertificates(
  query?: CertificatesQueryParams,
): Promise<PaginatedCertificatesResponse> {
  const searchParams = new URLSearchParams();
  if (query?.status) searchParams.set('status', query.status);
  if (query?.courseId) searchParams.set('courseId', query.courseId);
  if (query?.workspaceId) searchParams.set('workspaceId', query.workspaceId);
  if (query?.cursor) searchParams.set('cursor', query.cursor);
  if (query?.limit !== undefined) searchParams.set('limit', String(query.limit));

  const qs = searchParams.toString();
  const path = qs ? `/me/certificates?${qs}` : '/me/certificates';
  return api.get<PaginatedCertificatesResponse>(path);
}

export async function fetchCertificate(certificateId: string): Promise<Certificate> {
  const response = await api.get<{ data: Certificate }>(`/me/certificates/${certificateId}`);
  return response.data;
}

export async function downloadCertificate(certificateId: string): Promise<{ url: string; expiresAt: string }> {
  const response = await api.post<CertificateDownloadResponse>(
    `/me/certificates/${certificateId}/download`,
  );
  return response.data;
}

export async function verifyCertificate(
  verificationCode: string,
): Promise<CertificateVerification> {
  const response = await api.get<{ data: CertificateVerification }>(
    `/certificates/verify/${encodeURIComponent(verificationCode.trim())}`,
  );
  return response.data;
}
