// @ts-nocheck
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { Pause, Play } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';

const PLAYBACK_RATES = [1, 1.5, 2];
let currentPlayer: any = null;

function useLocalAsset(url: string): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('access-token');
        const target = `${FileSystem.cacheDirectory}voice-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
        const result = await FileSystem.downloadAsync(url, target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (active && result.status === 200) setUri(result.uri);
        else console.error('[voice] download failed', url, result.status);
      } catch (error) {
        console.error('[voice] download failed', url, error);
      }
    })();
    return () => { active = false; };
  }, [url]);
  return uri;
}

const BAR_PATTERN = [0.32, 0.55, 0.85, 0.4, 1, 0.6, 0.75, 0.45, 0.9, 0.5, 0.7, 0.35, 0.62, 0.82, 0.48, 0.95, 0.55, 0.72, 0.4, 0.88, 0.58, 0.78, 0.5, 0.66, 0.92, 0.44, 0.6, 0.34];

function formatClock(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function VoiceInner({ url, outgoing, durationMs }: { url: string; outgoing: boolean; durationMs: number | null }) {
  const localUri = useLocalAsset(url);
  const player = useAudioPlayer(localUri ? { uri: localUri } : null);
  const status = useAudioPlayerStatus(player);
  const [rateIndex, setRateIndex] = useState(0);
  const duration = status.duration > 0 ? status.duration : durationMs != null ? durationMs / 1000 : null;
  const progress = status.duration > 0 ? Math.min(1, Math.max(0, status.currentTime / status.duration)) : 0;
  const barWrap = useRef<View>(null);
  const filledCount = Math.round(BAR_PATTERN.length * progress);

  const seekResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gesture) => applySeek(gesture),
      onPanResponderMove: (_, gesture) => applySeek(gesture),
    }),
  ).current;

  function applySeek(gesture: { locationX: number; x0?: number; moveX?: number }) {
    barWrap.current?.measure((_x, _y, width) => {
      if (!width || status.duration <= 0) return;
      const ratio = Math.min(1, Math.max(0, gesture.locationX / width));
      player.seekTo(ratio * status.duration);
    });
  }

  function togglePlay() {
    if (!player) return;
    if (status.playing) {
      player.pause();
    } else {
      if (currentPlayer && currentPlayer !== player) {
        try { currentPlayer.pause(); } catch {}
      }
      currentPlayer = player;
      player.play();
    }
  }

  function cycleRate() {
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(next);
    player.setPlaybackRate(PLAYBACK_RATES[next], 0);
  }

  const accent = outgoing ? '#cfe0ff' : '#3264f6';
  const tint = outgoing ? '#ffffff' : '#526987';
  const barBg = outgoing ? 'rgba(255,255,255,0.28)' : 'rgba(50,100,246,0.18)';
  const fillBg = outgoing ? 'rgba(255,255,255,0.85)' : '#3264f6';

  if (!localUri) {
    return <View style={[styles.row, { justifyContent: 'center', paddingVertical: 14 }]}><ActivityIndicator color={accent} size="small" /></View>;
  }

  return (
    <View style={[styles.row, outgoing && styles.outgoingRow]}>
      <Pressable onPress={togglePlay} style={[styles.playButton, { backgroundColor: accent }]}>
        {status.playing ? <Pause color="#fff" fill="#fff" size={16} /> : <Play color="#fff" fill="#fff" size={16} style={{ marginLeft: 1 }} />}
      </Pressable>
      <View style={styles.middle}>
        <View ref={barWrap} {...seekResponder.panHandlers} style={styles.barRow}>
          {BAR_PATTERN.map((height, index) => (
            <View key={index} style={[styles.bar, { height: height * 18, backgroundColor: index < filledCount ? fillBg : barBg }]} />
          ))}
        </View>
        <View style={styles.metaRow}>
          <Text style={[styles.time, { color: tint }]}>{formatClock(status.currentTime)} / {formatClock(duration)}</Text>
          <Pressable onPress={cycleRate} hitSlop={8}>
            <Text style={[styles.time, { color: tint, fontWeight: '700' }]}>{PLAYBACK_RATES[rateIndex]}x</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function VoiceNotePlayer({ url, outgoing = false, durationMs = null, audio = false }: { url: string; outgoing?: boolean; durationMs?: number | null; audio?: boolean }) {
  if (!url) return null;
  return <VoiceInner key={url} url={url} outgoing={outgoing} durationMs={durationMs} />;
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 18, borderWidth: 1, flexDirection: 'row', padding: 10, minWidth: 210 },
  outgoingRow: { backgroundColor: '#3264f6', borderColor: '#3264f6' },
  playButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  middle: { flex: 1, marginLeft: 10 },
  barRow: { alignItems: 'center', flexDirection: 'row', gap: 3, height: 20 },
  bar: { borderRadius: 2, width: 3 },
  metaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { fontSize: 11 },
});
