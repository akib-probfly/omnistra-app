import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Modal, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { Image } from 'expo-image';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { showNotice } from './AppToast';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as MediaLibrary from 'expo-media-library';
import { Download } from 'lucide-react-native';
import { getImageRequestHeaders, prepareLocalImageForLibrary } from './AuthenticatedImage';

export type MediaGalleryItem = { attachId: string; src: string; mediaType: string };

type MediaViewerProps = {
  images: MediaGalleryItem[];
  index: number;
  onClose: () => void;
  onIndex: (index: number) => void;
};

const MIN_SCALE = 1;
const MAX_SCALE = 4;

function clampPan(x: number, y: number, s: number, stageWidth: number, stageHeight: number) {
  'worklet';
  const maxX = Math.max(0, (stageWidth * (s - 1)) / 2);
  const maxY = Math.max(0, (stageHeight * (s - 1)) / 2);
  return {
    x: Math.max(-maxX, Math.min(maxX, x)),
    y: Math.max(-maxY, Math.min(maxY, y)),
  };
}

function ZoomableImage({
  src,
  stageWidth,
  stageHeight,
  onZoomChange,
}: {
  src: string;
  stageWidth: number;
  stageHeight: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  const [headers, setHeaders] = useState<Record<string, string> | undefined>();
  const [checkingHeaders, setCheckingHeaders] = useState(true);
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const reportZoom = (value: number) => {
    onZoomChange(value > 1.02);
  };

  const pinch = Gesture.Pinch()
    .onStart(() => {
      savedScale.value = scale.value;
      runOnJS(reportZoom)(Math.max(scale.value, 1.1));
    })
    .onUpdate((event) => {
      const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, savedScale.value * event.scale));
      scale.value = next;
      const clamped = clampPan(translateX.value, translateY.value, next, stageWidth, stageHeight);
      translateX.value = clamped.x;
      translateY.value = clamped.y;
    })
    .onEnd(() => {
      if (scale.value <= 1.02) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        savedScale.value = 1;
        savedTx.value = 0;
        savedTy.value = 0;
        runOnJS(reportZoom)(1);
        return;
      }
      savedScale.value = scale.value;
      runOnJS(reportZoom)(scale.value);
    });

  const pan = Gesture.Pan()
    .manualActivation(true)
    .averageTouches(true)
    .onTouchesMove((_event, state) => {
      if (scale.value > 1.02) state.activate();
    })
    .onStart(() => {
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    })
    .onUpdate((event) => {
      if (scale.value <= 1) return;
      const next = clampPan(savedTx.value + event.translationX, savedTy.value + event.translationY, scale.value, stageWidth, stageHeight);
      translateX.value = next.x;
      translateY.value = next.y;
    })
    .onEnd(() => {
      savedTx.value = translateX.value;
      savedTy.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(pinch, pan);

  useEffect(() => {
    let active = true;
    setCheckingHeaders(true);
    getImageRequestHeaders(src)
      .then((nextHeaders) => {
        if (active) {
          setHeaders(nextHeaders);
          setCheckingHeaders(false);
        }
      })
      .catch((error) => {
        if (active) setCheckingHeaders(false);
        console.error('[media] image auth failed', src, error);
      });
    return () => {
      active = false;
    };
  }, [src]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <View style={[styles.zoomStage, { width: stageWidth, height: stageHeight }]} collapsable={false}>
        <Animated.View style={[styles.zoomFill, { width: stageWidth, height: stageHeight }, animatedStyle]}>
          {checkingHeaders ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Image source={{ uri: src, cacheKey: src, headers }} contentFit="contain" cachePolicy="memory-disk" allowDownscaling style={{ width: stageWidth, height: stageHeight }} />
          )}
        </Animated.View>
      </View>
    </GestureDetector>
  );
}

export function MediaViewer({ images, index, onClose, onIndex }: MediaViewerProps) {
  const insets = useSafeAreaInsets();
  const { width: winW, height: winH } = useWindowDimensions();
  const listRef = useRef<FlatList<MediaGalleryItem>>(null);
  const [saving, setSaving] = useState(false);
  const [pagerLocked, setPagerLocked] = useState(false);
  const [stage, setStage] = useState({ width: winW, height: winH });
  const visible = images.length > 0 && index >= 0 && index < images.length;
  const current = visible ? images[index] : null;
  const stageW = stage.width || winW;
  const stageH = stage.height || winH;

  useEffect(() => {
    setStage({ width: winW, height: winH });
  }, [winW, winH]);

  useEffect(() => {
    setPagerLocked(false);
  }, [index]);

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
        showNotice('Permission required', 'Allow photo library access to save images.');
        return;
      }
      await MediaLibrary.saveToLibraryAsync(localUri);
      showNotice('Saved', 'Image saved to your photos.');
    } catch (error) {
      console.error('[media] save failed', current.src, error);
      showNotice('Download failed', error instanceof Error ? error.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  if (!visible) return null;

  const onMomentumScrollEnd = (event: any) => {
    const nextIndex = Math.round(event.nativeEvent.contentOffset.x / Math.max(stageW, 1));
    if (nextIndex >= 0 && nextIndex < images.length && nextIndex !== index) onIndex(nextIndex);
  };

  return (
    <Modal
      visible
      animationType="fade"
      onRequestClose={onClose}
      presentationStyle="fullScreen"
      statusBarTranslucent
    >
      <GestureHandlerRootView
        style={styles.backdrop}
        onLayout={(event) => {
          const { width, height } = event.nativeEvent.layout;
          if (width > 0 && height > 0 && (width !== stage.width || height !== stage.height)) {
            setStage({ width, height });
          }
        }}
      >
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(media) => media.attachId}
          horizontal
          pagingEnabled
          scrollEnabled={!pagerLocked}
          style={styles.pager}
          showsHorizontalScrollIndicator={false}
          getItemLayout={(_, i) => ({ length: stageW, offset: stageW * i, index: i })}
          initialScrollIndex={index}
          onMomentumScrollEnd={onMomentumScrollEnd}
          renderItem={({ item: media }) => (
            <View style={[styles.slide, { width: stageW, height: stageH }]}>
              <MainAsset src={media.src} stageWidth={stageW} stageHeight={stageH} onZoomChange={setPagerLocked} />
            </View>
          )}
        />
        <View style={[styles.topBar, { paddingTop: Math.max(insets.top, 12) + 8 }]} pointerEvents="box-none">
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
      </GestureHandlerRootView>
    </Modal>
  );
}

function MainAsset({
  src,
  stageWidth,
  stageHeight,
  onZoomChange,
}: {
  src: string;
  stageWidth: number;
  stageHeight: number;
  onZoomChange: (zoomed: boolean) => void;
}) {
  return <ZoomableImage src={src} stageWidth={stageWidth} stageHeight={stageHeight} onZoomChange={onZoomChange} />;
}

const styles = StyleSheet.create({
  backdrop: { backgroundColor: '#050505', flex: 1 },
  pager: { flex: 1 },
  slide: { alignItems: 'center', justifyContent: 'center' },
  loader: { alignItems: 'center', justifyContent: 'center' },
  zoomStage: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  zoomFill: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  topBar: { alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', flexDirection: 'row', justifyContent: 'space-between', left: 0, paddingBottom: 12, paddingHorizontal: 16, position: 'absolute', right: 0, top: 0, zIndex: 2 },
  closeBtn: { alignItems: 'center', backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 20, height: 36, justifyContent: 'center', width: 36 },
  closeText: { color: '#fff', fontSize: 18, lineHeight: 20 },
  counter: { color: '#fff', fontSize: 14, fontWeight: '600' },
  actionDisabled: { opacity: 0.6 },
});
