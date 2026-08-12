// @ts-nocheck
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const cache = new Map<string, string>();

function isPublicRemoteUrl(url: string) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes('fbcdn.net')
      || host.includes('facebook.com')
      || host.includes('fbsbx.com')
      || host.includes('cdninstagram.com')
      || host.includes('googleusercontent.com')
      || host.includes('twimg.com')
    );
  } catch {
    return false;
  }
}

function shouldSendAuthHeader(url: string) {
  if (isPublicRemoteUrl(url)) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    const apiBase = process.env.EXPO_PUBLIC_API_BASE_URL;
    if (apiBase) {
      const apiHost = new URL(apiBase).hostname.toLowerCase();
      return host === apiHost || host.endsWith(`.${apiHost}`);
    }
    return host.includes('omnistra') || host.includes('localhost') || host === '127.0.0.1';
  } catch {
    return true;
  }
}

export async function downloadMedia(url: string): Promise<string> {
  const existing = cache.get(url);
  if (existing) return existing;
  // Public CDNs (Facebook lookaside, etc.) often 404 when fetched via FileSystem.
  // Callers should render these with a remote Image uri instead.
  if (isPublicRemoteUrl(url)) {
    cache.set(url, url);
    return url;
  }
  const token = shouldSendAuthHeader(url) ? await SecureStore.getItemAsync('access-token') : null;
  const extension = guessMediaExtension(url);
  const target = `${FileSystem.cacheDirectory}media-${Date.now()}-${Math.random().toString(36).slice(2)}.${extension}`;
  const result = await FileSystem.downloadAsync(url, target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (result.status !== 200) throw new Error(`Download failed with status ${result.status}`);
  cache.set(url, result.uri);
  return result.uri;
}

function guessMediaExtension(url: string) {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    const match = pathname.match(/\.([a-z0-9]+)$/);
    if (match) {
      const ext = match[1];
      if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'bmp', 'mp4', 'mov', 'webm'].includes(ext)) {
        return ext === 'jpeg' ? 'jpg' : ext;
      }
    }
    if (pathname.includes('/preview')) return 'jpg';
    if (pathname.includes('/download')) return 'jpg';
  } catch {
    // fall through
  }
  return 'jpg';
}

/** Prefer the full file download endpoint over a preview variant when saving. */
export function toDownloadableMediaUrl(url: string) {
  if (!url) return url;
  return url.replace(/\/preview\/?(?:\?.*)?$/i, '/download');
}

/**
 * Ensures a local file:// URI with a real image extension for MediaLibrary.
 * Cached display files may use unsupported extensions like `.img`.
 */
export async function prepareLocalImageForLibrary(url: string): Promise<string> {
  const downloadUrl = toDownloadableMediaUrl(url);
  const localUri = await downloadMedia(downloadUrl);
  if (/^https?:\/\//i.test(localUri)) {
    throw new Error('Could not download a local copy of this image.');
  }
  if (/\.(jpe?g|png|gif|webp|heic|bmp)$/i.test(localUri)) {
    return localUri;
  }
  const saveUri = `${FileSystem.cacheDirectory}save-${Date.now()}-${Math.random().toString(36).slice(2)}.jpg`;
  await FileSystem.copyAsync({ from: localUri, to: saveUri });
  return saveUri;
}

export function getCachedMediaUri(url: string): string | null {
  return cache.get(url) ?? null;
}

export function prefetchMedia(url: string): void {
  if (!url || isPublicRemoteUrl(url)) return;
  void downloadMedia(url).catch(() => {});
}

function fitWithinBounds(width: number, height: number, maxWidth: number, maxHeight: number) {
  if (width <= 0 || height <= 0) {
    return { width: maxWidth, height: Math.round(maxWidth * 0.75) };
  }
  const scale = Math.min(maxWidth / width, maxHeight / height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function AuthenticatedImage({
  url,
  style,
  onPress,
  resizeMode = 'cover',
  adaptive,
  fitContent,
  maxWidth = 250,
  maxHeight = 340,
  onLoaded,
  onError,
}: {
  url: string;
  style: any;
  onPress?: () => void;
  resizeMode?: 'cover' | 'contain';
  adaptive?: boolean;
  /** Size the image to its natural aspect ratio within maxWidth/maxHeight (no crop). */
  fitContent?: boolean;
  maxWidth?: number;
  maxHeight?: number;
  onLoaded?: () => void;
  onError?: () => void;
}) {
  const { colors } = useTheme();
  const publicRemote = isPublicRemoteUrl(url);
  const [localUri, setLocalUri] = useState<string | null>(publicRemote ? url : (cache.get(url) ?? null));
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [naturalSize, setNaturalSize] = useState<{ width: number; height: number } | null>(null);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setLoaded(false);
    setNaturalSize(null);

    if (!url) {
      setLocalUri(null);
      return;
    }

    if (isPublicRemoteUrl(url)) {
      setLocalUri(url);
      return;
    }

    setLocalUri(cache.get(url) ?? null);
    downloadMedia(url)
      .then((uri) => {
        if (active) setLocalUri(uri);
      })
      .catch((error) => {
        if (active) {
          setFailed(true);
          onError?.();
          console.error('[media] download failed', url, error);
        }
      });

    return () => {
      active = false;
    };
  }, [url]);

  useEffect(() => {
    if (!fitContent || !localUri) return;
    let active = true;
    Image.getSize(
      localUri,
      (width, height) => {
        if (active) setNaturalSize({ width, height });
      },
      () => {
        // Keep placeholder size if measurement fails; onLoad may still fill it in.
      },
    );
    return () => {
      active = false;
    };
  }, [fitContent, localUri]);

  const flatStyle = useMemo(() => StyleSheet.flatten(style) ?? {}, [style]);
  const fittedSize = useMemo(() => {
    if (!fitContent) return null;
    if (naturalSize) return fitWithinBounds(naturalSize.width, naturalSize.height, maxWidth, maxHeight);
    return {
      width: typeof flatStyle.width === 'number' ? flatStyle.width : maxWidth,
      height: typeof flatStyle.height === 'number' ? flatStyle.height : Math.round(maxWidth * 0.75),
    };
  }, [fitContent, naturalSize, maxWidth, maxHeight, flatStyle.width, flatStyle.height]);

  const containerStyle = fitContent
    ? [flatStyle, fittedSize, styles.fitContent]
    : adaptive
      ? style
      : undefined;
  const imageStyle = fitContent
    ? [fittedSize, { borderRadius: flatStyle.borderRadius }]
    : adaptive
      ? [{ width: '100%', height: '100%' }, style]
      : style;

  return (
    <Pressable disabled={!onPress} onPress={onPress} style={containerStyle}>
      {localUri && !failed ? (
        <Image
          source={{ uri: localUri }}
          resizeMode={fitContent ? 'cover' : resizeMode}
          style={imageStyle}
          onLoad={(event) => {
            const source = event?.nativeEvent?.source;
            if (fitContent && source?.width && source?.height) {
              setNaturalSize({ width: source.width, height: source.height });
            }
            setLoaded(true);
            onLoaded?.();
          }}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
        />
      ) : (
        <View style={[fitContent ? fittedSize : adaptive ? styles.mediaPlaceholder : style, styles.mediaPlaceholder, { backgroundColor: colors.surfaceSecondary }]}>
          {loaded || failed ? null : (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color={colors.primary} size="small" />
            </View>
          )}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mediaPlaceholder: { alignItems: 'center', backgroundColor: '#e8eef7', justifyContent: 'center' },
  loadingWrap: { alignItems: 'center', justifyContent: 'center' },
  fitContent: { overflow: 'hidden' },
});
