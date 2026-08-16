import * as SecureStore from 'expo-secure-store';
import { useVideoPlayer, VideoView } from 'expo-video';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function VideoPlayerModal({ url, visible, onClose }: { url: string | null; visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [source, setSource] = useState<{ uri: string; headers: Record<string, string> } | null>(null);

  useEffect(() => {
    if (!visible || !url) return;
    let active = true;
    SecureStore.getItemAsync('access-token')
      .then((value) => {
        if (!active) return;
        setSource({ uri: url, headers: value ? { Authorization: `Bearer ${value}` } : {} });
      })
      .catch(() => {});
    return () => { active = false; };
  }, [visible, url]);

  const player = useVideoPlayer(source, (p) => {
    p.loop = false;
    if (source) p.play();
  });

  useEffect(() => {
    if (!visible) player.pause();
  }, [visible, player]);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={styles.backdrop}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}><X color="#fff" size={22} /></Pressable>
          <View style={styles.topSpacer} />
        </View>
        {source ? (
          <VideoView player={player} style={styles.video} contentFit="contain" nativeControls allowsFullscreen />
        ) : (
          <ActivityIndicator color="#fff" size="large" />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050505' },
  video: { flex: 1, width: '100%' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', left: 0, paddingBottom: 12, paddingHorizontal: 16, position: 'absolute', right: 0, top: 0, zIndex: 2 },
  closeBtn: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 20, height: 36, justifyContent: 'center', width: 36 },
  topSpacer: { width: 36 },
});
