// @ts-nocheck
import * as SecureStore from 'expo-secure-store';
import { useVideoPlayer, VideoView } from 'expo-video';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

export function VideoThumb({ url, style, tint = '#2563eb' }: { url: string; style: any; tint?: string }) {
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync('access-token')
      .then((value) => { if (active) setToken(value); })
      .catch(() => {});
    return () => { active = false; };
  }, []);

  const source = url && token ? { uri: url, headers: { Authorization: `Bearer ${token}` }, useCaching: true } : null;
  const player = useVideoPlayer(source, (p) => {
    p.muted = true;
    p.loop = false;
    p.currentTime = 0;
  });

  return (
    <View style={style}>
      {source ? <VideoView player={player} style={StyleSheet.absoluteFill} contentFit="cover" nativeControls={false} onFirstFrameRender={() => setReady(true)} /> : null}
      {!ready ? (
        <View style={[StyleSheet.absoluteFill, styles.loadingWrap]}>
          <ActivityIndicator color={tint} size="small" />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingWrap: { alignItems: 'center', backgroundColor: '#0f172a', justifyContent: 'center' },
});
