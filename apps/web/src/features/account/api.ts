import { api } from '@/lib/api';
import type { Me, ProfileUpdate, SafeUser } from './types';

export async function fetchProfile(): Promise<Me> {
  const response = await api.get<{ data: Me }>('/me');
  return response.data;
}

export async function updateProfile(data: ProfileUpdate): Promise<SafeUser> {
  const response = await api.patch<{ data: SafeUser }>('/me', data);
  return response.data;
}

export async function logoutAllSessions(): Promise<void> {
  await api.post('/auth/logout-all');
}
