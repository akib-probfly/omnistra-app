// @ts-nocheck
import { setAudioModeAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import { Pause, Play, RotateCw } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

const PLAYBACK_RATES = [1, 1.5, 2];
const LOAD_TIMEOUT_MS = 8000;
let currentPlayer: any = null;

function useAuthToken(): string | null {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    SecureStore.getItemAsync('access-token')
      .then((value) => { if (active) setToken(value); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  return token;
}

const BAR_PATTERN = [0.32, 0.55, 0.85, 0.4, 1, 0.6, 0.75, 0.45, 0.9, 0.5, 0.7, 0.35, 0.62, 0.82, 0.48, 0.95, 0.55, 0.72, 0.4, 0.88, 0.58, 0.78, 0.5, 0.66, 0.92, 0.44, 0.6, 0.34];

function formatClock(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds)) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function PlayerShell({ url, token, outgoing, durationMs, autoRetries, onRetry }: { url: string; token: string | null; outgoing: boolean; durationMs: number | null; autoRetries: number; onRetry: () => void }) {
  const { colors } = useTheme();
  const source = url && token ? { uri: url, headers: { Authorization: `Bearer ${token}` } } : null;
  const player = useAudioPlayer(source);
  const status = useAudioPlayerStatus(player);
  const [rateIndex, setRateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const duration = status.duration > 0 ? status.duration : durationMs != null ? durationMs / 1000 : null;
  const progress = status.duration > 0 ? Math.min(1, Math.max(0, status.currentTime / status.duration)) : 0;
  const filledCount = Math.round(BAR_PATTERN.length * progress);
  const barWrap = useRef<View>(null);
  const loaded = status.isLoaded || status.duration > 0;

  const playerRef = useRef(player);
  playerRef.current = player;
  const durationRef = useRef(duration ?? 0);
  durationRef.current = duration ?? 0;

  useEffect(() => {
    setAudioModeAsync({ playsInSilentMode: true }).catch(() => {});
  }, []);

  useEffect(() => {
    if (loaded) {
      setFailed(false);
      console.log('[voice] loaded', { url, duration: status.duration, isLoaded: status.isLoaded, state: status.playbackState });
    }
  }, [loaded, status.duration, status.isLoaded, status.playbackState]);

  useEffect(() => {
    if (!source || loaded) return;
    const timer = setTimeout(async () => {
      console.warn('[voice] load timeout', { url, state: status.playbackState, isLoaded: status.isLoaded, duration: status.duration });
      try {
        const res = await fetch(url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        const buf = await res.arrayBuffer();
        const magic = Array.from(new Uint8Array(buf.slice(0, 16))).map((b) => b.toString(16).padStart(2, '0')).join(' ');
        console.warn('[voice] probe', { status: res.status, type: res.headers.get('content-type'), length: res.headers.get('content-length'), bytes: buf.byteLength, magic });
      } catch (error) {
        console.warn('[voice] probe failed', url, error);
      }
      if (autoRetries === 0) {
        onRetry();
      } else {
        setFailed(true);
      }
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [source, loaded, status.playbackState, status.isLoaded, status.duration, autoRetries]);

  useEffect(() => {
    const target = playerRef.current;
    if (!target) return;
    // Ensure voice notes never loop; seek-to-0 on finish can restart playback on some devices.
    try { target.loop = false; } catch {}
  }, [player]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    const target = playerRef.current;
    if (currentPlayer === target) currentPlayer = null;
    // Stay paused at the end. Replay only when the user taps play again.
    try { target?.pause(); } catch {}
  }, [status.didJustFinish]);

  useEffect(() => {
    return () => {
      if (currentPlayer === playerRef.current) currentPlayer = null;
    };
  }, []);

  const applySeek = useCallback((gesture: { locationX: number }) => {
    barWrap.current?.measure((_x, _y, width) => {
      const dur = durationRef.current;
      const target = playerRef.current;
      if (!width || dur <= 0 || !target) return;
      const ratio = Math.min(1, Math.max(0, gesture.locationX / width));
      target.seekTo(ratio * dur).catch(() => {});
    });
  }, []);

  const seekResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (_, gesture) => applySeek(gesture),
      onPanResponderMove: (_, gesture) => applySeek(gesture),
    }),
  ).current;

  function togglePlay() {
    const target = playerRef.current;
    if (!target) return;
    if (status.playing) {
      target.pause();
      return;
    }
    if (currentPlayer && currentPlayer !== target) {
      try { currentPlayer.pause(); } catch {}
    }
    const dur = durationRef.current;
    const atEnd = status.didJustFinish || (dur > 0 && status.currentTime >= Math.max(0, dur - 0.15));
    currentPlayer = target;
    if (atEnd) {
      target.seekTo(0).then(() => {
        try { target.loop = false; } catch {}
        target.play();
      }).catch(() => {
        target.play();
      });
      return;
    }
    try { target.loop = false; } catch {}
    target.play();
  }

  function cycleRate() {
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(next);
    playerRef.current?.setPlaybackRate(PLAYBACK_RATES[next], 0);
  }

  const accent = outgoing ? '#cfe0ff' : '#3264f6';
  const tint = outgoing ? '#ffffff' : colors.textSecondary;
  const barBg = outgoing ? 'rgba(255,255,255,0.28)' : 'rgba(50,100,246,0.18)';
  const fillBg = outgoing ? 'rgba(255,255,255,0.85)' : '#3264f6';

  if (!source) {
    return <View style={[styles.row, { justifyContent: 'center', paddingVertical: 14 }, !outgoing && { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><ActivityIndicator color={accent} size="small" /></View>;
  }

  if (failed) {
    return (
      <View style={[styles.row, outgoing && styles.outgoingRow, !outgoing && { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
        <Pressable onPress={onRetry} style={[styles.playButton, { backgroundColor: accent }]}>
          <RotateCw color="#fff" size={16} />
        </Pressable>
        <View style={styles.middle}>
          <Text style={[styles.time, { color: tint, fontWeight: '700' }]}>Couldn't load audio</Text>
          <Text style={[styles.time, { color: tint }]}>Tap to retry</Text>
        </View>
      </View>
    );
  }

  if (!loaded) {
    return <View style={[styles.row, { justifyContent: 'center', paddingVertical: 14 }, !outgoing && { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><ActivityIndicator color={accent} size="small" /></View>;
  }

  return (
    <View style={[styles.row, outgoing && styles.outgoingRow, !outgoing && { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}>
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

function VoiceInner({ url, outgoing, durationMs, retryTick, onRetry }: { url: string; outgoing: boolean; durationMs: number | null; retryTick: number; onRetry: () => void }) {
  const token = useAuthToken();
  return <PlayerShell key={`${url}-${retryTick}`} url={url} token={token} outgoing={outgoing} durationMs={durationMs} autoRetries={retryTick} onRetry={onRetry} />;
}

export function VoiceNotePlayer({ url, outgoing = false, durationMs = null, audio = false }: { url: string; outgoing?: boolean; durationMs?: number | null; audio?: boolean }) {
  const [retryTick, setRetryTick] = useState(0);
  if (!url) return null;
  return <VoiceInner key={url} url={url} outgoing={outgoing} durationMs={durationMs} retryTick={retryTick} onRetry={() => setRetryTick((t) => t + 1)} />;
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', backgroundColor: '#fff', borderColor: '#cfe0fa', borderRadius: 18, borderWidth: 1, flexDirection: 'row', overflow: 'hidden', padding: 10, minWidth: 190 },
  outgoingRow: { backgroundColor: '#3264f6', borderColor: 'rgba(255,255,255,0.35)' },
  playButton: { alignItems: 'center', borderRadius: 18, height: 36, justifyContent: 'center', width: 36 },
  middle: { flex: 1, marginLeft: 10 },
  barRow: { alignItems: 'center', flexDirection: 'row', gap: 3, height: 20 },
  bar: { borderRadius: 2, flex: 1, maxWidth: 3 },
  metaRow: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 },
  time: { fontSize: 11 },
});
