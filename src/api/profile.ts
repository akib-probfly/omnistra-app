import * as SecureStore from 'expo-secure-store';
import { apiFetch } from './client';

const API_BASE_URL = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.zurvis.io/api/v1').replace(/\/$/, '');

export type UserProfile = {
  id: string;
  email: string;
  name: string | null;
  avatarUrl: string | null;
  createdAt: string;
  updatedAt: string;
};

export type UpdateUserProfileInput = {
  name?: string;
  currentPassword?: string;
  newPassword?: string;
  confirmNewPassword?: string;
  avatar?: { uri: string; name: string; mimeType: string };
};

export async function fetchMyProfile() {
  return apiFetch<UserProfile>('/users/me/profile', { method: 'GET' });
}

export async function updateMyProfile(input: UpdateUserProfileInput) {
  const token = await SecureStore.getItemAsync('access-token');
  const form = new FormData();
  if (input.name !== undefined) form.append('name', input.name);
  if (input.currentPassword !== undefined) form.append('currentPassword', input.currentPassword);
  if (input.newPassword !== undefined) form.append('newPassword', input.newPassword);
  if (input.confirmNewPassword !== undefined) form.append('confirmNewPassword', input.confirmNewPassword);
  if (input.avatar) form.append('avatar', { uri: input.avatar.uri, name: input.avatar.name, type: input.avatar.mimeType } as any);
  const response = await fetch(`${API_BASE_URL}/users/me/profile`, {
    method: 'PATCH',
    headers: { Accept: 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: form,
  });
  if (!response.ok) {
    const raw = await response.text();
    let message = `Request failed with status ${response.status}`;
    try {
      const parsed = JSON.parse(raw) as { message?: string; error?: string };
      message = parsed.message ?? parsed.error ?? message;
    } catch {
      if (raw && raw.length < 240) message = raw;
    }
    throw new Error(message);
  }
  const payload = await response.json() as UserProfile | { data?: UserProfile };
  if (typeof payload === 'object' && payload !== null && 'data' in payload && payload.data !== undefined) {
    return payload.data as UserProfile;
  }
  return payload as UserProfile;
}
