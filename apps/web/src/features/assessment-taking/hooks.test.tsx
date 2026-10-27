import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { expect, it, vi } from 'vitest';
import { useLearnerAttempt, useStartAttemptMutation } from './hooks';
import { api } from '@/lib/api';

it('fetches saved answers after starting or resuming, rather than caching the partial start response', async () => {
  const attempt = {
    attemptId: '10000000-0000-4000-8000-000000000008',
    version: 1,
    status: 'IN_PROGRESS',
    startedAt: '2026-10-26T10:00:00Z',
    deadlineAt: null,
    questions: [],
  };
  vi.spyOn(api, 'post').mockResolvedValue({ data: attempt });
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValue({ data: { ...attempt, submittedAt: null, answers: [] } });
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  const start = renderHook(() => useStartAttemptMutation('enrollment', 'assessment'), { wrapper });
  await act(async () => {
    await start.result.current.mutateAsync();
  });
  const detail = renderHook(() => useLearnerAttempt(attempt.attemptId), { wrapper });
  await waitFor(() => expect(detail.result.current.data?.answers).toEqual([]));
  expect(get).toHaveBeenCalledWith(`/me/attempts/${attempt.attemptId}`);
  client.clear();
});
