import { setAudioModeAsync, setIsAudioActiveAsync, useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as SecureStore from 'expo-secure-store';
import { Pause, Play, RotateCw } from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, PanResponder, Pressable, StyleSheet, Text, View } from 'react-native';
import { latestAccessToken, setLatestAccessToken, subscribeAccessToken } from '../api/client';
import { parseAudioDurationSeconds } from '../lib/audio-duration';
import { useTheme } from '../theme/ThemeContext';

const PLAYBACK_RATES = [1, 1.5, 2];
const LOAD_TIMEOUT_MS = 8000;
const DURATION_RESOLVE_DELAY_MS = 350;
let currentPlayer: any = null;

const durationByUrl = new Map<string, number>();
const inflightDuration = new Map<string, Promise<number | null>>();

function rememberDuration(url: string, seconds: number | null | undefined) {
  if (typeof seconds !== 'number' || !Number.isFinite(seconds) || seconds <= 0) return;
  const normalized = seconds > 3600 && seconds <= 3_600_000 ? seconds / 1000 : seconds;
  if (normalized <= 0 || normalized > 3600) return;
  durationByUrl.set(url, normalized);
}

function cachedDuration(url: string, durationMs?: number | null): number | null {
  const remembered = durationByUrl.get(url);
  if (remembered) return remembered;
  return normalizeDurationMs(durationMs);
}

async function readAccessToken(): Promise<string | null> {
  const stored = await SecureStore.getItemAsync('access-token');
  const token = stored ?? latestAccessToken;
  setLatestAccessToken(token);
  return token;
}

async function preparePlaybackSession() {
  await setIsAudioActiveAsync(true);
  await setAudioModeAsync({ playsInSilentMode: true, allowsRecording: false });
}

function useAuthToken(): string | null {
  const [token, setToken] = useState<string | null>(latestAccessToken);
  useEffect(() => {
    let active = true;
    const apply = (value: string | null) => {
      if (active) setToken(value);
    };
    readAccessToken().then(apply).catch(() => apply(null));
    const unsubscribe = subscribeAccessToken(apply);
    const appStateSub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      readAccessToken().then(apply).catch(() => {});
      preparePlaybackSession().catch(() => {});
    });
    return () => {
      active = false;
      unsubscribe();
      appStateSub.remove();
    };
  }, []);
  return token;
}

const BAR_PATTERN = [0.32, 0.55, 0.85, 0.4, 1, 0.6, 0.75, 0.45, 0.9, 0.5, 0.7, 0.35, 0.62, 0.82, 0.48, 0.95, 0.55, 0.72, 0.4, 0.88, 0.58, 0.78, 0.5, 0.66, 0.92, 0.44, 0.6, 0.34];

function positiveSeconds(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) return null;
  return value;
}

function formatElapsed(seconds: number | null): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function formatDuration(seconds: number | null): string {
  const value = positiveSeconds(seconds);
  if (value == null) return '0:00';
  const total = Math.max(1, Math.round(value));
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  return `${minutes}:${String(secs).padStart(2, '0')}`;
}

function normalizeDurationMs(durationMs: number | null | undefined): number | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  if (durationMs < 1000) return durationMs;
  return durationMs / 1000;
}

async function resolveRemoteDuration(url: string, token: string | null): Promise<number | null> {
  const existing = durationByUrl.get(url);
  if (existing) return existing;
  const pending = inflightDuration.get(url);
  if (pending) return pending;

  const work = (async () => {
    const response = await fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!response.ok) return null;
    const seconds = parseAudioDurationSeconds(new Uint8Array(await response.arrayBuffer()));
    rememberDuration(url, seconds);
    return seconds;
  })();

  inflightDuration.set(url, work);
  try {
    return await work;
  } finally {
    inflightDuration.delete(url);
  }
}

function PlayerShell({
  url,
  source,
  outgoing,
  durationMs,
  parsedDurationSeconds,
  autoRetries,
  onRetry,
}: {
  url: string;
  source: { uri: string; headers?: Record<string, string> } | null;
  outgoing: boolean;
  durationMs: number | null;
  parsedDurationSeconds: number | null;
  autoRetries: number;
  onRetry: () => void;
}) {
  const { colors } = useTheme();
  const player = useAudioPlayer(source, { updateInterval: 250 });
  const status = useAudioPlayerStatus(player);
  const [rateIndex, setRateIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [observedDuration, setObservedDuration] = useState(() => cachedDuration(url, durationMs) ?? 0);
  const fallbackDuration = parsedDurationSeconds ?? cachedDuration(url, durationMs);
  const rawPlayerDuration = positiveSeconds(status.duration) ?? positiveSeconds((player as { duration?: number } | null)?.duration);
  const playerDuration = rawPlayerDuration && rawPlayerDuration > 3600 && rawPlayerDuration <= 3_600_000
    ? rawPlayerDuration / 1000
    : rawPlayerDuration;
  const duration = playerDuration ?? fallbackDuration ?? positiveSeconds(observedDuration);
  const progress = duration && duration > 0 ? Math.min(1, Math.max(0, status.currentTime / duration)) : 0;
  const filledCount = Math.round(BAR_PATTERN.length * progress);
  const barWrap = useRef<View>(null);

  const playerRef = useRef(player);
  playerRef.current = player;
  const durationRef = useRef(duration ?? 0);
  durationRef.current = duration ?? 0;
  const onRetryRef = useRef(onRetry);
  onRetryRef.current = onRetry;
  const sourceRef = useRef(source);
  sourceRef.current = source;
  const statusRef = useRef(status);
  statusRef.current = status;

  useEffect(() => {
    preparePlaybackSession().catch(() => {});
  }, []);

  useEffect(() => {
    rememberDuration(url, playerDuration ?? fallbackDuration ?? observedDuration);
  }, [url, playerDuration, fallbackDuration, observedDuration]);

  useEffect(() => {
    const current = positiveSeconds(status.currentTime);
    if (!current) return;
    setObservedDuration((value) => (current > value ? current : value));
  }, [status.currentTime]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    const finishedAt = positiveSeconds(status.currentTime);
    if (finishedAt) setObservedDuration((value) => Math.max(value, finishedAt));
  }, [status.didJustFinish, status.currentTime]);

  useEffect(() => {
    if (status.isLoaded || status.playing) setFailed(false);
  }, [status.isLoaded, status.playing]);

  useEffect(() => {
    if (!source || status.isLoaded || fallbackDuration) return;
    const timer = setTimeout(() => {
      if (autoRetries === 0) {
        onRetryRef.current();
      } else {
        setFailed(true);
      }
    }, LOAD_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [source, status.isLoaded, fallbackDuration, autoRetries]);

  useEffect(() => {
    const target = playerRef.current;
    if (!target) return;
    try { target.loop = false; } catch {}
  }, [player]);

  useEffect(() => {
    if (!status.didJustFinish) return;
    const target = playerRef.current;
    if (currentPlayer === target) currentPlayer = null;
    try { target?.pause(); } catch {}
  }, [status.didJustFinish]);

  useEffect(() => {
    return () => {
      if (currentPlayer === playerRef.current) currentPlayer = null;
    };
  }, []);

  const applySeek = useCallback((locationX: number) => {
    barWrap.current?.measure((_x, _y, width) => {
      const dur = durationRef.current;
      const target = playerRef.current;
      if (!width || dur <= 0 || !target) return;
      const ratio = Math.min(1, Math.max(0, locationX / width));
      target.seekTo(ratio * dur).catch(() => {});
    });
  }, []);

  const seekResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (event) => applySeek(event.nativeEvent.locationX),
      onPanResponderMove: (event) => applySeek(event.nativeEvent.locationX),
    }),
  ).current;

  function togglePlay() {
    const target = playerRef.current;
    const nextSource = sourceRef.current;
    if (!target || !nextSource) return;
    if (status.playing) {
      target.pause();
      return;
    }
    if (currentPlayer && currentPlayer !== target) {
      try { currentPlayer.pause(); } catch {}
    }
    const dur = durationRef.current;
    const atEnd = status.didJustFinish || (dur > 0 && status.currentTime >= Math.max(0, dur - 0.15));
    const needsReload = !status.isLoaded;
    currentPlayer = target;

    void (async () => {
      try {
        await preparePlaybackSession();
        if (needsReload) {
          const freshToken = await readAccessToken();
          target.replace({
            uri: nextSource.uri,
            headers: freshToken ? { Authorization: `Bearer ${freshToken}` } : nextSource.headers,
          });
        }
      } catch {
        onRetryRef.current();
        return;
      }
      try { target.loop = false; } catch {}
      const start = () => {
        try { target.play(); } catch {
          onRetryRef.current();
        }
      };
      if (atEnd) {
        target.seekTo(0).then(start).catch(start);
      } else {
        start();
      }
      setTimeout(() => {
        const latest = statusRef.current;
        if (currentPlayer !== target) return;
        if (latest.playing || latest.isBuffering) return;
        if (!latest.isLoaded) onRetryRef.current();
      }, 2000);
    })();
  }

  function cycleRate() {
    const next = (rateIndex + 1) % PLAYBACK_RATES.length;
    setRateIndex(next);
    playerRef.current?.setPlaybackRate(PLAYBACK_RATES[next]);
  }

  const accent = outgoing ? '#cfe0ff' : '#3264f6';
  const tint = outgoing ? '#ffffff' : colors.textSecondary;
  const barBg = outgoing ? 'rgba(255,255,255,0.28)' : 'rgba(50,100,246,0.18)';
  const fillBg = outgoing ? 'rgba(255,255,255,0.85)' : '#3264f6';

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
          <Text style={[styles.time, { color: tint, fontVariant: ['tabular-nums'] }]}>{formatElapsed(status.currentTime)} / {formatDuration(duration)}</Text>
          <Pressable onPress={cycleRate} hitSlop={8}>
            <Text style={[styles.time, { color: tint, fontWeight: '700' }]}>{PLAYBACK_RATES[rateIndex]}x</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

export function VoiceNotePlayer({ url, outgoing = false, durationMs = null }: { url: string; outgoing?: boolean; durationMs?: number | null; audio?: boolean }) {
  const token = useAuthToken();
  const [retryTick, setRetryTick] = useState(0);
  const [parsedDuration, setParsedDuration] = useState(() => cachedDuration(url, durationMs));
  const knownDuration = parsedDuration ?? cachedDuration(url, durationMs);

  const source = useMemo(() => {
    if (!url || !token) return null;
    return { uri: url, headers: { Authorization: `Bearer ${token}` } };
  }, [url, token]);

  useEffect(() => {
    rememberDuration(url, knownDuration);
  }, [url, knownDuration]);

  useEffect(() => {
    if (!url || !token || knownDuration) return undefined;
    let active = true;
    const timer = setTimeout(() => {
      resolveRemoteDuration(url, token)
        .then((seconds) => {
          if (!active || !seconds) return;
          setParsedDuration(seconds);
        })
        .catch(() => {});
    }, DURATION_RESOLVE_DELAY_MS);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [url, token, knownDuration, retryTick]);

  if (!url) return null;

  return (
    <PlayerShell
      key={`${url}-${retryTick}-${token ?? ''}`}
      url={url}
      source={source}
      outgoing={outgoing}
      durationMs={durationMs}
      parsedDurationSeconds={knownDuration}
      autoRetries={retryTick}
      onRetry={() => setRetryTick((value) => value + 1)}
    />
  );
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
