import * as SecureStore from 'expo-secure-store';
import { latestAccessToken } from '../api/client';

const thumbnails = new Map<string, string>();
const pending = new Map<string, Promise<string | null>>();

/** Extract a still frame without creating an audio-playing video player. */
export async function getVideoThumbnail(url: string): Promise<string | null> {
  const cached = thumbnails.get(url);
  if (cached) return cached;
  const existing = pending.get(url);
  if (existing) return existing;

  const work = (async () => {
    // Lazy loading lets older native builds continue displaying server posters.
    const { getThumbnailAsync } = await import('expo-video-thumbnails');
    const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.zurvis.io/api/v1';
    const isApiUrl = new URL(url).origin === new URL(apiBase).origin;
    const token = isApiUrl ? (latestAccessToken ?? await SecureStore.getItemAsync('access-token')) : null;
    const { uri } = await getThumbnailAsync(url, {
      time: 0,
      quality: 0.6,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    if (thumbnails.size >= 100) {
      const oldest = thumbnails.keys().next().value;
      if (oldest) thumbnails.delete(oldest);
    }
    thumbnails.set(url, uri);
    return uri;
  })();
  pending.set(url, work);
  try {
    return await work;
  } finally {
    pending.delete(url);
  }
}
