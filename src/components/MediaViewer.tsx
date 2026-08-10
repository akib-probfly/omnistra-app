// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Animated, FlatList, Image, Modal, PanResponder, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import { Download } from 'lucide-react-native';
import { downloadMedia, getCachedMediaUri, prepareLocalImageForLibrary } from './AuthenticatedImage';

export type MediaGalleryItem = { attachId: string; src: string; mediaType: string };

type MediaViewerProps = {
  images: MediaGalleryItem[];
  index: number;
  onClose: () => void;
  onIndex: (index: number) => void;
};

function useLocalAsset(url: string | null): string | null {
  const [uri, setUri] = useState<string | null>(url ? getCachedMediaUri(url) : null);
  useEffect(() => {
    if (!url) return;
    let active = true;
    setUri(getCachedMediaUri(url));
    downloadMedia(url).then((result) => { if (active) setUri(result); }).catch((error) => console.error('[media] fetch failed', url, error));
    return () => { active = false; };
  }, [url]);
  return uri;
}

function ZoomableImage({ src, stageWidth, stageHeight }: { src: string; stageWidth: number; stageHeight: number }) {
  const scale = useRef(new Animated.Value(1)).current;
  const translateX = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(0)).current;
  const lastScale = useRef(1);
  const lastTx = useRef(0);
  const lastTy = useRef(0);
  const pinchStart = useRef<{ distance: number; scale: number } | null>(null);

  const clampScale = (value: number) => Math.min(4, Math.max(1, value));
  const clampPan = (x: number, y: number, s: number) => {
    const maxX = Math.max(0, (stageWidth * (s - 1)) / 2);
    const maxY = Math.max(0, (stageHeight * (s - 1)) / 2);
    return { x: Math.max(-maxX, Math.min(maxX, x)), y: Math.max(-maxY, Math.min(maxY, y)) };
  };
  const distance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const dx = touches[0].pageX - touches[1].pageX;
    const dy = touches[0].pageY - touches[1].pageY;
    return Math.hypot(dx, dy);
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => lastScale.current > 1,
      onMoveShouldSetPanResponder: (_, gesture) => (gesture.touches ?? []).length >= 2 || lastScale.current > 1,
      onPanResponderGrant: () => {},
      onPanResponderMove: (_, gesture) => {
        const touches = gesture.touches ?? [];
        if (touches.length >= 2) {
          const d = distance(touches);
          if (!pinchStart.current) {
            pinchStart.current = { distance: d, scale: lastScale.current };
            return;
          }
          const base = pinchStart.current.distance || 1;
          const next = clampScale(pinchStart.current.scale * (d / base));
          scale.setValue(next);
          lastScale.current = next;
          return;
        }
        if (pinchStart.current) {
          pinchStart.current = null;
        }
        if (lastScale.current <= 1) {
          translateX.setValue(0);
          translateY.setValue(0);
          return;
        }
        const next = clampPan(lastTx.current + gesture.dx, lastTy.current + gesture.dy, lastScale.current);
        translateX.setValue(next.x);
        translateY.setValue(next.y);
      },
      onPanResponderRelease: (_, gesture) => {
        if (gesture.touches?.length >= 2) {
          pinchStart.current = null;
          return;
        }
        pinchStart.current = null;
        if (lastScale.current < 1) {
          lastScale.current = 1;
          Animated.spring(scale, { toValue: 1, useNativeDriver: true }).start();
        }
        const clamped = clampPan(lastTx.current + gesture.dx, lastTy.current + gesture.dy, lastScale.current);
        lastTx.current = clamped.x;
        lastTy.current = clamped.y;
        translateX.setValue(clamped.x);
        translateY.setValue(clamped.y);
      },
      onPanResponderTerminate: () => {
        pinchStart.current = null;
      },
    }),
  ).current;

  return (
    <View style={[styles.zoomStage, { width: stageWidth, height: stageHeight }]} {...panResponder.panHandlers}>
      <Animated.View style={[styles.zoomFill, { transform: [{ scale }, { translateX }, { translateY }] }]}>
        <Image source={{ uri: src }} resizeMode="contain" style={{ width: stageWidth, height: stageHeight }} />
      </Animated.View>
    </View>
  );
}

export function MediaViewer({ images, index, onClose, onIndex }: MediaViewerProps) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const listRef = useRef<FlatList<MediaGalleryItem>>(null);
  const [saving, setSaving] = useState(false);
  const visible = images.length > 0 && index >= 0 && index < images.length;
  const stageHeight = winH - insets.top - insets.bottom;
  const current = visible ? images[index] : null;

  useEffect(() => {
    if (!visible || !listRef.current) return;
    try {
      listRef.current.scrollToIndex({ index, animated: false });
    } catch {
      // index outside rendered window; the pager handles it on next layout
    }
  }, [index, visible]);

  const saveCurrentImage = async () => {
    if (!current?.src || saving) return;
    setSaving(true);
    try {
      const localUri = await prepareLocalImageForLibrary(current.src);
      const permission = await MediaLibrary.requestPermissionsAsync(true);
      if (permission.status !== 'granted') {
        Alert.alert('Permission required', 'Allow photo library access to save images.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(localUri);
      Alert.alert('Saved', 'Image saved to your photos.');
    } catch (error) {
      console.error('[media] save failed', current.src, error);
      Alert.alert('Download failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  const onMomentumScrollEnd = (event: any) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / winW);
    if (nextIndex >= 0 && nextIndex < images.length && nextIndex !== index) onIndex(nextIndex);
  };

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={styles.backdrop}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}><Text style={styles.closeText}>✕</Text></Pressable>
          <Text style={styles.counter}>{index + 1} of {images.length}</Text>
          <Pressable
            onPress={saveCurrentImage}
            hitSlop={12}
            disabled={saving}
            style={[styles.closeBtn, saving && styles.actionDisabled]}
            accessibilityRole="button"
            accessibilityLabel="Download image"
          >
            {saving ? <ActivityIndicator color="#fff" size="small" /> : <Download color="#fff" size={18} />}
          </Pressable>
        </View>
        <View style={styles.centerFill}>
          <FlatList
            ref={listRef}
            data={images}
            keyExtractor={(media) => media.attachId}
            horizontal
            pagingEnabled
            style={styles.pager}
            showsHorizontalScrollIndicator={false}
            getItemLayout={(_, i) => ({ length: winW, offset: winW * i, index: i })}
            initialScrollIndex={index}
            onMomentumScrollEnd={onMomentumScrollEnd}
            renderItem={({ item: media }) => (
              <View style={{ width: winW, height: stageHeight }}>
                <MainAsset src={media.src} stageWidth={winW} stageHeight={stageHeight} />
              </View>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

function MainAsset({ src, stageWidth, stageHeight }: { src: string; stageWidth: number; stageHeight: number }) {
  const modified = useLocalAsset(src);
  if (!modified) return <ActivityIndicator color="#fff" size="large" />;
  return <ZoomableImage src={modified} stageWidth={stageWidth} stageHeight={stageHeight} />;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050505' },
  pager: { flex: 1, width: '100%' },
  centerFill: { flex: 1, alignItems: 'center', backgroundColor: '#050505', justifyContent: 'center' },
  zoomStage: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  zoomFill: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', left: 0, paddingBottom: 12, paddingHorizontal: 16, position: 'absolute', right: 0, top: 0, zIndex: 2 },
  closeBtn: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 20, height: 36, justifyContent: 'center', width: 36 },
  closeText: { color: '#fff', fontSize: 18, lineHeight: 20 },
  counter: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actionDisabled: { opacity: 0.6 },
});
