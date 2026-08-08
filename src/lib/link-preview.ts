export type LinkPreviewPayload = {
  url: string;
  hostname: string;
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  siteName: string | null;
  faviconUrl: string | null;
  themeColor: string | null;
  cardType: string | null;
};

const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_CACHE_ENTRIES = 200;
const DEFAULT_FRONTEND_BASE_URL = 'https://app.omnistra.ai';
const SITE_PREVIEW_REVISION = '2026-05-06-youtube-preview-v1';

type CacheEntry = { expiresAt: number; preview: LinkPreviewPayload | null };
const previewCache = new Map<string, CacheEntry>();
const inflightRequests = new Map<string, Promise<LinkPreviewPayload | null>>();

function pruneCache(now: number) {
  previewCache.forEach((entry, key) => {
    if (entry.expiresAt <= now) previewCache.delete(key);
  });
  while (previewCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = previewCache.keys().next().value;
    if (!oldestKey) break;
    previewCache.delete(oldestKey);
  }
}

export function getPreviewableUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function findFirstUrlInText(value: string): string | null {
  const match = value.match(/https?:\/\/[^\s]+/i);
  return match ? match[0] : null;
}

export async function fetchLinkPreview(url: string): Promise<LinkPreviewPayload | null> {
  const cacheKey = `${url}::${SITE_PREVIEW_REVISION}`;
  const now = Date.now();
  const cached = previewCache.get(cacheKey);
  if (cached && cached.expiresAt > now) return cached.preview;

  const existing = inflightRequests.get(cacheKey);
  if (existing) return existing;

  const request = (async () => {
    try {
      const frontendBaseUrl = (process.env.EXPO_PUBLIC_FRONTEND_BASE_URL ?? DEFAULT_FRONTEND_BASE_URL).replace(/\/$/, '');
      const response = await fetch(`${frontendBaseUrl}/api/link-preview?url=${encodeURIComponent(url)}&v=${encodeURIComponent(SITE_PREVIEW_REVISION)}`, {
        method: 'GET',
        headers: { Accept: 'application/json' },
      });
      if (!response.ok) throw new Error('preview_fetch_failed');
      const payload = await response.json() as { preview?: LinkPreviewPayload };
      return payload.preview ?? null;
    } catch {
      return null;
    }
  })()
    .then((preview) => {
      const freshNow = Date.now();
      if (preview) {
        previewCache.set(cacheKey, { preview, expiresAt: freshNow + CACHE_TTL_MS });
      } else {
        previewCache.delete(cacheKey);
      }
      pruneCache(freshNow);
      return preview;
    })
    .finally(() => {
      inflightRequests.delete(cacheKey);
    });

  inflightRequests.set(cacheKey, request);
  return request;
}
