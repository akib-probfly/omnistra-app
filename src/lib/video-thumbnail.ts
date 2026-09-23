import * as SecureStore from 'expo-secure-store';
import { createVideoPlayer, type VideoThumbnail } from 'expo-video';
import { latestAccessToken } from '../api/client';

const thumbnails = new Map<string, VideoThumbnail>();
const pending = new Map<string, Promise<VideoThumbnail | null>>();

/** Extract a still frame without creating an audio-playing video player. */
export async function getVideoThumbnail(url: string): Promise<VideoThumbnail | null> {
  const cached = thumbnails.get(url);
  if (cached) return cached;
  const existing = pending.get(url);
  if (existing) return existing;

  const work = (async () => {
    const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL ?? 'https://api.zurvis.io/api/v1';
    const isApiUrl = new URL(url).origin === new URL(apiBase).origin;
    const token = isApiUrl ? (latestAccessToken ?? await SecureStore.getItemAsync('access-token')) : null;
    // expo-video-thumbnails is deprecated (removed after SDK 56); frame
    // extraction now goes through a headless player. Auth headers ride on
    // the player source, and the result is a native image ref for expo-image.
    const player = createVideoPlayer({
      uri: url,
      headers: token ? { Authorization: `Bearer ${token}` } : undefined,
    });
    try {
      const frames = await player.generateThumbnailsAsync(0);
      const first = frames[0] ?? null;
      if (first) {
        if (thumbnails.size >= 100) {
          const oldest = thumbnails.keys().next().value;
          if (oldest) thumbnails.delete(oldest);
        }
        thumbnails.set(url, first);
      }
      return first;
    } finally {
      try {
        player.release();
      } catch {
        // Player already released.
      }
    }
  })();
  pending.set(url, work);
  try {
    return await work;
  } finally {
    pending.delete(url);
  }
}
