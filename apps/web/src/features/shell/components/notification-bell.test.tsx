import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationBell } from './notification-bell';
import { api } from '@/lib/api';

afterEach(cleanup);
it('counts unread notifications across pages and marks them read', async () => {
  const get = vi
    .spyOn(api, 'get')
    .mockResolvedValueOnce({
      data: [{ id: '1', title: 'First', body: 'Hello' }],
      meta: { nextCursor: 'next', hasMore: true, limit: 100 },
    })
    .mockResolvedValueOnce({
      data: [{ id: '2', title: 'Second', body: 'World' }],
      meta: { nextCursor: null, hasMore: false, limit: 100 },
    });
  const post = vi.spyOn(api, 'post').mockResolvedValue({});
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>,
  );
  await screen.findByRole('button', { name: 'Notifications (2 unread)' });
  expect(get).toHaveBeenCalledTimes(2);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Notifications (2 unread)' }), {
    key: 'Enter',
  });
  fireEvent.click(await screen.findByRole('button', { name: 'Mark all as read' }));
  await waitFor(() =>
    expect(post).toHaveBeenCalledWith(
      '/me/notifications/read-all',
      expect.objectContaining({ through: expect.any(String) }),
    ),
  );
});

it('shows loading and empty states without an unread badge', async () => {
  let resolve!: (value: unknown) => void;
  vi.spyOn(api, 'get').mockReturnValueOnce(
    new Promise((done) => {
      resolve = done;
    }),
  );
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>,
  );
  const bell = screen.getByRole('button', { name: 'Notifications (0 unread)' });
  fireEvent.keyDown(bell, { key: 'Enter' });
  expect(await screen.findByText('Loading notifications...')).toBeInTheDocument();
  resolve({ data: [], meta: { nextCursor: null, hasMore: false, limit: 100 } });
  expect(await screen.findByText('No unread notifications.')).toBeInTheDocument();
  expect(bell.querySelector('span')).toBeNull();
});

it('shows an error when notifications cannot be loaded', async () => {
  vi.spyOn(api, 'get').mockRejectedValueOnce(new Error('offline'));
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={client}>
      <NotificationBell />
    </QueryClientProvider>,
  );
  fireEvent.keyDown(screen.getByRole('button', { name: 'Notifications (0 unread)' }), {
    key: 'Enter',
  });
  expect(await screen.findByText(/could not load notifications/i)).toBeInTheDocument();
});
