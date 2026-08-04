import { Film, Play } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { AuthenticatedImage } from './AuthenticatedImage';

function formatBytes(sizeBytes: number | null | undefined): string | null {
  if (typeof sizeBytes !== 'number' || !Number.isFinite(sizeBytes) || sizeBytes <= 0) return null;
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  if (sizeBytes < 1024 * 1024 * 1024) return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(sizeBytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(durationMs: number | null | undefined): string | null {
  if (typeof durationMs !== 'number' || !Number.isFinite(durationMs) || durationMs <= 0) return null;
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export function VideoThumb({
  url,
  posterUrl,
  name,
  sizeBytes,
  durationMs,
  onPress,
}: {
  url: string;
  posterUrl?: string;
  name?: string | null;
  sizeBytes?: number | null;
  durationMs?: number | null;
  onPress: () => void;
}) {
  const sizeLabel = formatBytes(sizeBytes);
  const durationLabel = formatDuration(durationMs);
  const showInfo = Boolean(name || sizeLabel);

  return (
    <Pressable onPress={onPress} style={styles.card}>
      {posterUrl ? (
        <AuthenticatedImage url={posterUrl} style={styles.media} resizeMode="cover" />
      ) : (
        <View style={styles.media}>
          <View style={styles.glow} />
          <View style={styles.filmGlyph}>
            <Film color="rgba(148,163,184,0.35)" size={56} />
          </View>
        </View>
      )}

      <View pointerEvents="none" style={styles.shade} />
      {durationLabel ? (
        <View style={styles.durationChip}>
          <Text style={styles.durationText}>{durationLabel}</Text>
        </View>
      ) : null}

      <View pointerEvents="none" style={styles.center}>
        <View style={styles.playHalo}>
          <View style={styles.playCircle}>
            <Play color="#fff" fill="#fff" size={30} style={styles.playIcon} />
          </View>
        </View>
      </View>

      {showInfo ? (
        <View pointerEvents="none" style={styles.infoBar}>
          {name ? (
            <Text numberOfLines={1} style={styles.infoName}>{name}</Text>
          ) : null}
          {sizeLabel ? <Text style={styles.infoSize}>{sizeLabel}</Text> : null}
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 18, height: 170, overflow: 'hidden', position: 'relative', width: 250 },
  media: { ...StyleSheet.absoluteFillObject, alignItems: 'center', backgroundColor: '#0b1220', justifyContent: 'center' },
  glow: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(37,99,235,0.16)', borderRadius: 999, height: 220, position: 'absolute', top: -60, width: 220, alignSelf: 'center' },
  filmGlyph: { alignItems: 'center', justifyContent: 'center' },
  shade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(2,6,23,0.25)' },
  durationChip: { backgroundColor: 'rgba(2,6,23,0.65)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 8, top: 8 },
  durationText: { color: '#f1f5f9', fontSize: 11, fontWeight: '600' },
  center: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  playHalo: { alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.35)', borderRadius: 42, height: 84, justifyContent: 'center', width: 84 },
  playCircle: { alignItems: 'center', backgroundColor: 'rgba(15,23,42,0.72)', borderRadius: 32, height: 64, justifyContent: 'center', width: 64 },
  playIcon: { marginLeft: 4 },
  infoBar: { alignItems: 'center', backgroundColor: 'rgba(2,6,23,0.72)', bottom: 0, flexDirection: 'row', gap: 8, left: 0, paddingHorizontal: 12, paddingVertical: 8, position: 'absolute', right: 0 },
  infoName: { color: '#f8fafc', flex: 1, fontSize: 12, fontWeight: '600' },
  infoSize: { color: '#cbd5e1', fontSize: 11 },
});