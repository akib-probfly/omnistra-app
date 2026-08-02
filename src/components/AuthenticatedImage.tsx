// @ts-nocheck
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Image, Pressable, StyleSheet, View } from 'react-native';

export function AuthenticatedImage({ url, style, onPress, resizeMode = 'cover', adaptive, onLoaded }: { url: string; style: any; onPress?: () => void; resizeMode?: 'cover' | 'contain'; adaptive?: boolean; onLoaded?: () => void }) {
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('access-token');
        const target = `${FileSystem.cacheDirectory}media-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
        const result = await FileSystem.downloadAsync(url, target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (active && result.status === 200) setLocalUri(result.uri);
        else console.error('[media] download failed', url, result.status);
      } catch (error) {
        console.error('[media] download failed', url, error);
      }
    })();
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
