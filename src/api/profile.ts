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
  const responseText = await new Promise<string>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('PATCH', `${API_BASE_URL}/users/me/profile`);
    request.setRequestHeader('Accept', 'application/json');
    if (token) request.setRequestHeader('Authorization', `Bearer ${token}`);
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        resolve(request.responseText);
        return;
      }
      let message = `Request failed with status ${request.status}`;
      try {
        const parsed = JSON.parse(request.responseText) as { message?: string | string[]; error?: string };
        const serverMessage = parsed.message ?? parsed.error;
        if (Array.isArray(serverMessage)) message = serverMessage.join(', ');
        else if (serverMessage) message = serverMessage;
      } catch {
        if (request.responseText && request.responseText.length < 240) message = request.responseText;
      }
      reject(new Error(message));
    };
    request.onerror = () => reject(new Error('Request failed due to a network error.'));
    request.onabort = () => reject(new Error('Request was cancelled.'));
    request.send(form);
  });
  const payload = JSON.parse(responseText) as UserProfile | { data?: UserProfile };
  if (typeof payload === 'object' && payload !== null && 'data' in payload && payload.data !== undefined) {
    return payload.data as UserProfile;
  }
  return payload as UserProfile;
}
