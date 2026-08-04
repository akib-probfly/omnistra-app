// @ts-nocheck
import { useEvent } from 'expo';
import * as SecureStore from 'expo-secure-store';
import { useVideoPlayer, VideoView } from 'expo-video';
import { Play } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { AuthenticatedImage } from './AuthenticatedImage';

export function VideoThumb({ url, posterUrl, onPress }: { url: string; posterUrl?: string; onPress: () => void }) {
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);
  const [hasFrame, setHasFrame] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync('access-token')
      .then((value) => {
        if (!active) return;
        setSource({ uri: url, headers: value ? { Authorization: `Bearer ${value}` } : {} });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [url]);

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    p.muted = true;
  });

  const { status } = useEvent(player, 'statusChange', { status: player.status });

  useEffect(() => {
    if (status === 'error') setFailed(true);
  }, [status]);

  useEffect(() => {
    if (failed || !source) return;
    setHasFrame(false);
    if (status === 'readyToPlay' && !player.playing) {
      player.currentTime = 0;
      player.play();
    }
  }, [source, status, failed, player]);

  const showVideoFrame = !posterUrl && hasFrame;

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      {posterUrl ? (
        <AuthenticatedImage url={posterUrl} style={styles.media} resizeMode="contain" />
      ) : showVideoFrame ? (
        <VideoView
          player={player}
          style={styles.media}
          contentFit="contain"
          nativeControls={false}
          onFirstFrameRender={() => { player.pause(); setHasFrame(true); }}
        />
      ) : failed ? (
        <View style={[styles.media, styles.placeholder]}>
          <View style={styles.placeholderGlyph}>
            <Play color="#fff" fill="#fff" size={26} />
          </View>
        </View>
      ) : (
        <View style={[styles.media, styles.placeholder]}>
          <ActivityIndicator color="#fff" size="small" />
        </View>
      )}
      <View pointerEvents="none" style={styles.center}>
        <View style={styles.playCircle}>
          <Play color="#fff" fill="#fff" size={26} />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: { height: 160, overflow: 'hidden', position: 'relative', width: 250 },
  media: { bottom: 0, left: 0, position: 'absolute', right: 0, top: 0 },
  placeholder: { alignItems: 'center', backgroundColor: '#1e2a44', justifyContent: 'center' },
  placeholderGlyph: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.12)', borderColor: 'rgba(255,255,255,0.25)', borderRadius: 999, borderWidth: 1, height: 56, justifyContent: 'center', width: 56 },
  center: { alignItems: 'center', bottom: 0, justifyContent: 'center', left: 0, position: 'absolute', right: 0, top: 0 },
  playCircle: { alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.55)', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 },
});