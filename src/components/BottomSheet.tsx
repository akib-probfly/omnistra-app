import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle, type ScrollViewProps, type FlatListProps } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

type BottomSheetContextValue = {
  pan: ReturnType<typeof Gesture.Pan>;
  contentOffsetY: SharedValue<number>;
};

const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

/**
 * Drop-in replacements for ScrollView / FlatList that live inside a
 * <BottomSheet>. They run their native scroll simultaneously with the sheet's
 * drag pan and report the scroll offset back so the sheet only drags (and
 * dismisses) when the content is scrolled to the top.
 */
export function SheetScrollView(props: ScrollViewProps) {
  const ctx = useContext(BottomSheetContext);
  const { onScroll, ...rest } = props;
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event: any) => {
      if (ctx) ctx.contentOffsetY.value = event.contentOffset.y;
      onScroll?.((event as any) as Parameters<NonNullable<ScrollViewProps['onScroll']>>[0]);
    },
  });
  const content = <Animated.ScrollView {...rest} onScroll={scrollHandler as any} scrollEventThrottle={16} />;
  const nativeGesture = ctx ? Gesture.Native().simultaneousWithExternalGesture(ctx.pan) : null;
  return nativeGesture ? <GestureDetector gesture={nativeGesture}>{content}</GestureDetector> : content;
}

export function SheetFlatList(props: FlatListProps<any>) {
  const ctx = useContext(BottomSheetContext);
  const { onScroll, ...rest } = props;
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event: any) => {
      if (ctx) ctx.contentOffsetY.value = event.contentOffset.y;
      onScroll?.((event as any) as Parameters<NonNullable<FlatListProps<any>['onScroll']>>[0]);
    },
  });
  const content = <Animated.FlatList {...(rest as any)} onScroll={scrollHandler as any} scrollEventThrottle={16} />;
  const nativeGesture = ctx ? Gesture.Native().simultaneousWithExternalGesture(ctx.pan) : null;
  return nativeGesture ? <GestureDetector gesture={nativeGesture}>{content}</GestureDetector> : content;
}

type BottomSheetProps = {
  visible: boolean;
  onClose: () => void;
  children: React.ReactNode;
  /** Extra styling for the sheet surface (e.g. height). */
  sheetStyle?: StyleProp<ViewStyle>;
  /** Show the drag handle affordance. Default true. */
  showHandle?: boolean;
};

/**
 * Bottom-anchored modal sheet with swipe-down-to-dismiss.
 * Replaces raw RN <Modal> sheets so all sheets share one dismiss gesture.
 */
export function BottomSheet({ visible, onClose, children, sheetStyle, showHandle = true }: BottomSheetProps) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: windowHeight } = useWindowDimensions();
  const translateY = useSharedValue(windowHeight);
  const sheetHeight = useSharedValue(windowHeight);

  const requestClose = () => {
    if (!visible) return;
    translateY.value = withTiming(sheetHeight.value + 60, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  useEffect(() => {
    if (visible) {
      translateY.value = withTiming(0, { duration: 260 });
    }
  }, [visible, translateY]);

  const contentOffsetY = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetY(8)
    .onUpdate((event) => {
      // Only drag the sheet when the inner scrollable is at the top.
      // Otherwise a downward swipe scrolls the list instead of closing the sheet.
      if (contentOffsetY.value > 0) return;
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (contentOffsetY.value > 0) return;
      const shouldDismiss = event.translationY > sheetHeight.value * 0.2 || event.velocityY > 700;
      if (shouldDismiss) {
        translateY.value = withTiming(sheetHeight.value + 60, { duration: 220 }, (finished) => {
          if (finished) runOnJS(onClose)();
        });
      } else {
        translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
      }
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={requestClose}>
      <GestureHandlerRootView style={styles.root}>
        <View style={styles.container}>
          <Pressable style={StyleSheet.absoluteFillObject} onPress={requestClose} />
          <GestureDetector gesture={pan}>
            <Animated.View
              onLayout={(event) => {
                const { height } = event.nativeEvent.layout;
                if (height > 0) sheetHeight.value = height;
              }}
              style={[
                styles.sheet,
                { backgroundColor: colors.surface, paddingBottom: Math.max(insets.bottom, 12) },
                sheetAnimatedStyle,
                sheetStyle,
              ]}
            >
              {showHandle ? <View style={[styles.handle, { backgroundColor: colors.cardBorder }]} /> : null}
              <BottomSheetContext.Provider value={{ pan, contentOffsetY }}>
                {children}
              </BottomSheetContext.Provider>
            </Animated.View>
          </GestureDetector>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  handle: {
    alignSelf: 'center',
    borderRadius: 3,
    height: 4,
    marginTop: 8,
    width: 40,
  },
});
