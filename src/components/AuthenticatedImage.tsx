// @ts-nocheck
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

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
  const target = `${FileSystem.cacheDirectory}media-${Date.now()}-${Math.random().toString(36).slice(2)}.img`;
  const result = await FileSystem.downloadAsync(url, target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (result.status !== 200) throw new Error(`Download failed with status ${result.status}`);
  cache.set(url, result.uri);
  return result.uri;
}

export function getCachedMediaUri(url: string): string | null {
  return cache.get(url) ?? null;
}

export function prefetchMedia(url: string): void {
  if (!url || isPublicRemoteUrl(url)) return;
  void downloadMedia(url).catch(() => {});
}

export function AuthenticatedImage({
  url,
  style,
  onPress,
  resizeMode = 'cover',
  adaptive,
  onLoaded,
  onError,
}: {
  url: string;
  style: any;
  onPress?: () => void;
  resizeMode?: 'cover' | 'contain';
  adaptive?: boolean;
  onLoaded?: () => void;
  onError?: () => void;
}) {
  const publicRemote = isPublicRemoteUrl(url);
  const [localUri, setLocalUri] = useState<string | null>(publicRemote ? url : (cache.get(url) ?? null));
  const [failed, setFailed] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    setLoaded(false);

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

  const imageStyle = adaptive ? [{ width: '100%', height: '100%' }, style] : style;

  return (
    <Pressable disabled={!onPress} onPress={onPress} style={adaptive ? style : undefined}>
      {localUri && !failed ? (
        <Image
          source={{ uri: localUri }}
          resizeMode={resizeMode}
          style={imageStyle}
          onLoad={() => {
            setLoaded(true);
            onLoaded?.();
          }}
          onError={() => {
            setFailed(true);
            onError?.();
          }}
        />
      ) : (
        <View style={[adaptive ? styles.mediaPlaceholder : style, styles.mediaPlaceholder]}>
          {loaded || failed ? null : (
            <View style={styles.loadingWrap}>
              <ActivityIndicator color="#2563eb" size="small" />
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
});
