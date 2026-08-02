// @ts-nocheck
import { useEffect, useRef, useState } from 'react';
import * as SecureStore from 'expo-secure-store';
import * as FileSystem from 'expo-file-system/legacy';
import { ActivityIndicator, Animated, Image, Modal, PanResponder, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export type MediaGalleryItem = { attachId: string; src: string; thumb: string | null; mediaType: string };

type MediaViewerProps = {
  images: MediaGalleryItem[];
  index: number;
  onClose: () => void;
  onIndex: (index: number) => void;
};

function useLocalAsset(url: string | null, prefix: string): string | null {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    setUri(null);
    if (!url) return;
    let active = true;
    (async () => {
      try {
        const token = await SecureStore.getItemAsync('access-token');
        const target = `${FileSystem.cacheDirectory}${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}.bin`;
        const result = await FileSystem.downloadAsync(url, target, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
        if (active && result.status === 200) setUri(result.uri);
        else console.error('[media] fetch failed', url, result.status);
      } catch (error) {
        console.error('[media] fetch failed', url, error);
      }
    })();
    return () => { active = false; };
  }, [url, prefix]);
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
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
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
  const item = images[index] ?? null;
  const renderKey = item?.attachId ?? 'empty';
  const visible = images.length > 0 && index >= 0 && index < images.length;
  const stageHeight = winH - insets.top - insets.bottom - 132;

  if (!visible) return null;

  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose} presentationStyle="overFullScreen">
      <View style={styles.backdrop}>
        <View style={[styles.topBar, { paddingTop: insets.top + 8 }]}>
          <Pressable onPress={onClose} hitSlop={12} style={styles.closeBtn}><Text style={styles.closeText}>✕</Text></Pressable>
          <Text style={styles.counter}>{index + 1} of {images.length}</Text>
          <View style={styles.topSpacer} />
        </View>
        <View style={styles.centerFill}>
          <MainAsset key={renderKey} src={item?.src ?? ''} stageWidth={winW} stageHeight={stageHeight} />
        </View>
        {images.length > 1 ? <BottomBar insets={insets} images={images} index={index} onIndex={onIndex} /> : null}
      </View>
    </Modal>
  );
}

function MainAsset({ src, stageWidth, stageHeight }: { src: string; stageWidth: number; stageHeight: number }) {
  const modified = useLocalAsset(src, 'media');
  if (!modified) return <ActivityIndicator color="#fff" size="large" />;
  return <ZoomableImage src={modified} stageWidth={stageWidth} stageHeight={stageHeight} />;
}

function BottomBar({ insets, images, index, onIndex }: { insets: any; images: MediaGalleryItem[]; index: number; onIndex: (index: number) => void }) {
  return <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 8 }]}><ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.thumbsContent}>{images.map((media, mediaIndex) => <Thumb key={media.attachId} url={media.thumb ?? media.src} active={mediaIndex === index} onPress={() => onIndex(mediaIndex)} />)}</ScrollView></View>;
}

function Thumb({ url, active, onPress }: { url: string; active: boolean; onPress: () => void }) {
  const uri = useLocalAsset(url, 'thumb');
  return <Pressable onPress={onPress} style={[styles.thumbWrap, active && styles.thumbActive]}>{uri ? <Image source={{ uri }} resizeMode="cover" style={styles.thumbBox} /> : <View style={[styles.thumbBox, styles.thumbLoading]}><ActivityIndicator size="small" color="#fff" /></View>}</Pressable>;
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: '#050505' },
  centerFill: { flex: 1, alignItems: 'center', backgroundColor: '#050505', justifyContent: 'center' },
  zoomStage: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  zoomFill: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  topBar: { alignItems: 'center', flexDirection: 'row', justifyContent: 'space-between', left: 0, paddingBottom: 12, paddingHorizontal: 16, position: 'absolute', right: 0, top: 0, zIndex: 2 },
  closeBtn: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.14)', borderRadius: 20, height: 36, justifyContent: 'center', width: 36 },
  closeText: { color: '#fff', fontSize: 18, lineHeight: 20 },
  counter: { color: '#fff', fontSize: 14, fontWeight: '600' },
  topSpacer: { width: 36 },
  bottomBar: { left: 0, position: 'absolute', right: 0, bottom: 0, zIndex: 2 },
  thumbsContent: { gap: 10, paddingHorizontal: 16, paddingVertical: 8 },
  thumbWrap: { borderRadius: 10, overflow: 'hidden' },
  thumbActive: { borderColor: '#fff', borderWidth: 2 },
  thumbBox: { borderRadius: 8, height: 60, width: 60 },
  thumbLoading: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.1)', justifyContent: 'center' },
});