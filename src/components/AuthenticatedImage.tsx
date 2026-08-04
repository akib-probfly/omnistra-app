// @ts-nocheck
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

const cache = new Map<string, string>();

export async function downloadMedia(url: string): Promise<string> {
  const existing = cache.get(url);
  if (existing) return existing;
  const token = await SecureStore.getItemAsync('access-token');
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
  if (!url) return;
  void downloadMedia(url).catch(() => {});
}

export function AuthenticatedImage({ url, style, onPress, resizeMode = 'cover', adaptive, onLoaded }: { url: string; style: any; onPress?: () => void; resizeMode?: 'cover' | 'contain'; adaptive?: boolean; onLoaded?: () => void }) {
  const [localUri, setLocalUri] = useState<string | null>(cache.get(url) ?? null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    downloadMedia(url).then((uri) => { if (active) setLocalUri(uri); }).catch((error) => { if (active) console.error('[media] download failed', url, error); });
    return () => { active = false; };
  }, [url]);
  return (
    <Pressable disabled={!onPress} onPress={onPress} style={adaptive ? style : undefined}>
      {localUri ? (
        <Image source={{ uri: localUri }} resizeMode={resizeMode} style={adaptive ? [{ width: '100%', height: '100%' }, style] : style} onLoad={() => { setLoaded(true); onLoaded?.(); }} />
      ) : (
        <View style={[adaptive ? styles.mediaPlaceholder : style, styles.mediaPlaceholder]}>{loaded ? null : <View style={styles.loadingWrap}><ActivityIndicator color="#2563eb" size="small" /></View>}</View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  mediaPlaceholder: { alignItems: 'center', backgroundColor: '#e8eef7', justifyContent: 'center' },
  loadingWrap: { alignItems: 'center', justifyContent: 'center' },
});
