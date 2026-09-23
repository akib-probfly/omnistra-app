import { useCallback, useEffect, useState } from 'react';
import { getVideoThumbnail } from '../lib/video-thumbnail';
import { Film, Play } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import type { VideoThumbnail } from 'expo-video';
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
  const [failedPoster, setFailedPoster] = useState<string | null>(null);
  const [generated, setGenerated] = useState<{ url: string; thumb: VideoThumbnail } | null>(null);
  const poster = posterUrl && posterUrl !== failedPoster ? posterUrl : null;
  // Server posters render with auth headers; generated frames are native
  // image refs rendered directly. Poster wins when available.
  const generatedThumb = !poster && generated?.url === url ? generated.thumb : null;
  const onPosterError = useCallback(() => {
    if (poster) setFailedPoster(poster);
  }, [poster]);

  useEffect(() => {
    if (poster || !url) return;
    let active = true;
    getVideoThumbnail(url).then((thumb) => {
      if (active && thumb) setGenerated({ url, thumb });
    }).catch((error) => {
      if (active) console.warn('[video-thumbnail] Frame extraction failed', error instanceof Error ? error.message : 'Unknown error');
    });
    return () => { active = false; };
  }, [poster, url]);

  const sizeLabel = formatBytes(sizeBytes);
  const durationLabel = formatDuration(durationMs);

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={name ? `Play video: ${name}` : 'Play video'} style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {poster ? (
        <AuthenticatedImage key={poster} url={poster} onError={onPosterError} style={styles.media} resizeMode="cover" adaptive />
      ) : generatedThumb ? (
        <ExpoImage key={url} source={generatedThumb} style={styles.media} contentFit="cover" cachePolicy="memory-disk" />
      ) : (
        <View style={styles.media}>
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
        <View style={styles.playCircle}>
          <Play color="#fff" fill="#fff" size={28} strokeWidth={1.5} style={styles.playIcon} />
        </View>
      </View>

      {sizeLabel ? (
        <View pointerEvents="none" style={styles.sizeChip}>
          <Text style={styles.durationText}>{sizeLabel}</Text>
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { borderRadius: 20, height: 300, maxWidth: '100%', overflow: 'hidden', position: 'relative', width: 250 },
  pressed: { opacity: 0.85 },
  media: { ...StyleSheet.absoluteFill, alignItems: 'center', backgroundColor: '#0b1220', justifyContent: 'center' },
  filmGlyph: { alignItems: 'center', justifyContent: 'center' },
  shade: { ...StyleSheet.absoluteFill, backgroundColor: 'rgba(0,0,0,0.08)' },
  durationChip: { backgroundColor: 'rgba(2,6,23,0.65)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', left: 10, bottom: 10 },
  durationText: { color: '#f1f5f9', fontSize: 11, fontWeight: '600' },
  center: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center' },
  playCircle: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.45)', borderRadius: 32, height: 64, justifyContent: 'center', width: 64 },
  playIcon: { marginLeft: 3 },
  sizeChip: { backgroundColor: 'rgba(2,6,23,0.65)', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3, position: 'absolute', right: 10, bottom: 10 },
});