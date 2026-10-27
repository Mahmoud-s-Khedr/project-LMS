import * as React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/lib/api';
import { siteConfig } from '@/features/marketing/site-config';
import { formatCertificateDate } from './types';
import { CertificateCard } from './components/certificate-card';
import { CertificateList } from './components/certificate-list';
import { PublicCertificateVerifier } from './components/public-certificate-verifier';
import type { Certificate, CertificateVerification } from './types';

// Mock Next.js navigation useRouter
const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

function renderWithClient(ui: React.ReactElement) {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return render(<QueryClientProvider client={queryClient}>{ui}</QueryClientProvider>);
}

const mockValidCertificate: Certificate = {
  id: '70000000-0000-4000-8000-000000000001',
  workspaceId: '10000000-0000-4000-8000-000000000001',
  enrollmentId: '30000000-0000-4000-8000-000000000001',
  status: 'VALID',
  verificationCode: 'CERT-2026-ARCH-VERIFY-00000000000000000001',
  issuedAt: '2026-10-15T10:00:00.000Z',
  revokedAt: null,
  courseTitle: 'Full-Stack Software Architecture',
  issuerName: 'Academy of Engineering',
  recipientName: 'Alex Mercer',
  renderStatus: 'READY',
  createdAt: '2026-10-15T10:00:00.000Z',
  updatedAt: '2026-10-15T10:00:00.000Z',
};

const mockRevokedCertificate: Certificate = {
  id: '70000000-0000-4000-8000-000000000002',
  workspaceId: '10000000-0000-4000-8000-000000000001',
  enrollmentId: '30000000-0000-4000-8000-000000000002',
  status: 'REVOKED',
  verificationCode: 'CERT-2026-REVOKED-CODE-0000000000000002',
  issuedAt: '2026-05-10T10:00:00.000Z',
  revokedAt: '2026-06-01T10:00:00.000Z',
  courseTitle: 'Deprecated Systems',
  issuerName: 'Legacy Academy',
  recipientName: 'Alex Mercer',
  renderStatus: 'READY',
  createdAt: '2026-05-10T10:00:00.000Z',
  updatedAt: '2026-06-01T10:00:00.000Z',
};

const mockPublicVerification: CertificateVerification = {
  status: 'VALID',
  courseTitle: 'Full-Stack Software Architecture',
  issuerName: 'Academy of Engineering',
  issuedAt: '2026-10-15T10:00:00.000Z',
  maskedRecipientName: 'A*** M***',
};

describe('Certificate Domain Helpers', () => {
  it('formats certificate date string', () => {
    expect(formatCertificateDate('2026-10-15T10:00:00.000Z')).toBe('October 15, 2026');
    expect(formatCertificateDate(null)).toBe('—');
  });
});

describe('CertificateCard Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('renders valid certificate card and triggers PDF download', async () => {
    const postSpy = vi.spyOn(api, 'post').mockResolvedValueOnce({
      data: {
        url: 'https://minio.test/signed-certificate.pdf',
        expiresAt: '2026-10-26T12:00:00.000Z',
      },
    });

    const windowOpenSpy = vi.spyOn(window, 'open').mockImplementation(() => null);

    renderWithClient(<CertificateCard certificate={mockValidCertificate} />);

    expect(screen.getByText('Full-Stack Software Architecture')).toBeTruthy();
    expect(screen.getByText('Valid Credential')).toBeTruthy();
    expect(screen.getByText('Alex Mercer')).toBeTruthy();
    expect(screen.getByText(/CERT-2026-ARCH-VERIFY/i)).toBeTruthy();

    const downloadBtn = screen.getByRole('button', { name: /download pdf/i });
    fireEvent.click(downloadBtn);

    await waitFor(() => {
      expect(postSpy).toHaveBeenCalledWith(`/me/certificates/${mockValidCertificate.id}/download`);
      expect(windowOpenSpy).toHaveBeenCalledWith(
        'https://minio.test/signed-certificate.pdf',
        '_blank',
        'noopener,noreferrer',
      );
    });
  });

  it('renders revoked certificate state with disabled download', () => {
    renderWithClient(<CertificateCard certificate={mockRevokedCertificate} />);

    expect(screen.getByText('Revoked')).toBeTruthy();
    expect(screen.getByText('Deprecated Systems')).toBeTruthy();
    const downloadBtn = screen.getByRole('button', { name: /download pdf/i });
    expect(downloadBtn.hasAttribute('disabled')).toBe(true);
  });
});

describe('CertificateList Component', () => {
  it('filters certificates by tab and search input', async () => {
    const user = userEvent.setup();
    renderWithClient(
      <CertificateList certificates={[mockValidCertificate, mockRevokedCertificate]} />,
    );

    expect(screen.getByText('Full-Stack Software Architecture')).toBeTruthy();
    expect(screen.getByText('Deprecated Systems')).toBeTruthy();

    // Filter valid
    const validTab = screen.getByRole('tab', { name: /valid/i });
    await user.click(validTab);
    expect(screen.getByText('Full-Stack Software Architecture')).toBeTruthy();
    expect(screen.queryByText('Deprecated Systems')).toBeNull();

    // Search query
    const input = screen.getByPlaceholderText(/search certificates/i);
    await user.type(input, 'nonexistent');
    expect(screen.getByText(/no matching certificates found/i)).toBeTruthy();
  });
});

describe('PublicCertificateVerifier Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });
  afterEach(() => {
    cleanup();
  });

  it('displays brand name and privacy-masked recipient name for valid certificate', async () => {
    vi.spyOn(api, 'get').mockResolvedValueOnce({
      data: mockPublicVerification,
    });

    renderWithClient(
      <PublicCertificateVerifier initialCode="CERT-2026-ARCH-VERIFY-00000000000000000001" />,
    );

    expect(await screen.findByText('Verified Valid Credential')).toBeTruthy();
    expect(screen.getByText('Full-Stack Software Architecture')).toBeTruthy();
    expect(screen.getByText('Academy of Engineering')).toBeTruthy();
    // Privacy masked name
    expect(screen.getByText('A*** M***')).toBeTruthy();
    // Brand name from siteConfig
    expect(screen.getAllByText(new RegExp(siteConfig.name, 'i')).length).toBeGreaterThan(0);
  });

  it('handles certificate verification failure / 404', async () => {
    vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('Certificate not found'));

    renderWithClient(<PublicCertificateVerifier initialCode="INVALID-CODE-00000000000000000000" />);

    expect(await screen.findByText(/Certificate Not Verified/i)).toBeTruthy();
  });

  it('navigates when submitting code in search bar', () => {
    renderWithClient(<PublicCertificateVerifier initialCode="" />);

    const input = screen.getByPlaceholderText(/paste verification code/i);
    fireEvent.change(input, { target: { value: 'TEST-CODE-12345' } });

    const verifyBtn = screen.getByRole('button', { name: /verify/i });
    fireEvent.click(verifyBtn);

    expect(mockPush).toHaveBeenCalledWith('/verify/TEST-CODE-12345');
  });
});
