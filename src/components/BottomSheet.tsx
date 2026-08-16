import { createContext, useContext, useEffect, useMemo, forwardRef } from 'react';
import { Keyboard, Modal, Platform, Pressable, StyleSheet, useWindowDimensions, View, type StyleProp, type ViewStyle, type ScrollViewProps, type FlatListProps } from 'react-native';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { runOnJS, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, withSpring, withTiming, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeContext';

type BottomSheetContextValue = {
  pan: ReturnType<typeof Gesture.Pan>;
  nativeScrollGesture: ReturnType<typeof Gesture.Native>;
  contentOffsetY: SharedValue<number>;
};

const BottomSheetContext = createContext<BottomSheetContextValue | null>(null);

/**
 * Drop-in replacements for ScrollView / FlatList that live inside a
 * <BottomSheet>. They run their native scroll simultaneously with the sheet's
 * drag pan and report the scroll offset back so the sheet only drags (and
 * dismisses) when the content is scrolled to the top.
 */
export const SheetScrollView = forwardRef<Animated.ScrollView, ScrollViewProps>(function SheetScrollView(props, ref) {
  const ctx = useContext(BottomSheetContext);
  const { onScroll, ...rest } = props;
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event: any) => {
      if (ctx) ctx.contentOffsetY.value = event.contentOffset.y;
      onScroll?.((event as any) as Parameters<NonNullable<ScrollViewProps['onScroll']>>[0]);
    },
  });
  const content = (
    <Animated.ScrollView
      ref={ref}
      bounces={false}
      alwaysBounceVertical={false}
      overScrollMode="never"
      {...rest}
      onScroll={scrollHandler as any}
      scrollEventThrottle={16}
    />
  );
  return ctx ? <GestureDetector gesture={ctx.nativeScrollGesture}>{content}</GestureDetector> : content;
});

export function SheetFlatList(props: FlatListProps<any>) {
  const ctx = useContext(BottomSheetContext);
  const { onScroll, ...rest } = props;
  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event: any) => {
      if (ctx) ctx.contentOffsetY.value = event.contentOffset.y;
      onScroll?.((event as any) as Parameters<NonNullable<FlatListProps<any>['onScroll']>>[0]);
    },
  });
  const content = (
    <Animated.FlatList
      bounces={false}
      overScrollMode="never"
      {...(rest as any)}
      onScroll={scrollHandler as any}
      scrollEventThrottle={16}
    />
  );
  return ctx ? <GestureDetector gesture={ctx.nativeScrollGesture}>{content}</GestureDetector> : content;
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
  const contentOffsetY = useSharedValue(0);
  const keyboardInset = useSharedValue(0);
  const nativeScrollGesture = useMemo(() => Gesture.Native(), []);

  const requestClose = () => {
    if (!visible) return;
    translateY.value = withTiming(sheetHeight.value + 60, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
  };

  useEffect(() => {
    if (visible) {
      contentOffsetY.value = 0;
      translateY.value = withTiming(0, { duration: 260 });
    } else {
      keyboardInset.value = 0;
    }
  }, [visible, translateY, contentOffsetY, keyboardInset]);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
    const show = Keyboard.addListener(showEvent, (event) => {
      if (!visible) return;
      const next = Math.max(0, event.endCoordinates.height - insets.bottom);
      keyboardInset.value = withTiming(next, { duration: Platform.OS === 'ios' ? 250 : 160 });
    });
    const hide = Keyboard.addListener(hideEvent, () => {
      keyboardInset.value = withTiming(0, { duration: Platform.OS === 'ios' ? 250 : 160 });
    });
    return () => {
      show.remove();
      hide.remove();
    };
  }, [visible, insets.bottom, keyboardInset]);

  const settleOrDismiss = (translationY: number, velocityY: number) => {
    'worklet';
    const shouldDismiss = translationY > 72 || translationY > sheetHeight.value * 0.12 || velocityY > 500;
    if (shouldDismiss) {
      translateY.value = withTiming(sheetHeight.value + 60, { duration: 220 }, (finished) => {
        if (finished) runOnJS(onClose)();
      });
      return;
    }
    translateY.value = withSpring(0, { damping: 18, stiffness: 200 });
  };

  const pan = Gesture.Pan()
    .simultaneousWithExternalGesture(nativeScrollGesture)
    .activeOffsetY(10)
    .failOffsetX([-28, 28])
    .onUpdate((event) => {
      const draggingSheet = translateY.value > 0;
      const atTop = contentOffsetY.value <= 2;
      if (event.translationY <= 0 && !draggingSheet) return;
      if (!atTop && !draggingSheet) return;
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (translateY.value <= 0 && contentOffsetY.value > 2) return;
      settleOrDismiss(event.translationY, event.velocityY);
    });

  const handlePan = Gesture.Pan()
    .activeOffsetY(6)
    .failOffsetX([-40, 40])
    .onUpdate((event) => {
      translateY.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      settleOrDismiss(event.translationY, event.velocityY);
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value - keyboardInset.value }],
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
              {showHandle ? (
                <GestureDetector gesture={handlePan}>
                  <View style={styles.handleHit} hitSlop={12}>
                    <View style={[styles.handle, { backgroundColor: colors.cardBorder }]} />
                  </View>
                </GestureDetector>
              ) : null}
              <BottomSheetContext.Provider value={{ pan, nativeScrollGesture, contentOffsetY }}>
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
  handleHit: {
    alignItems: 'center',
    paddingBottom: 8,
    paddingTop: 8,
    width: '100%',
  },
  handle: {
    borderRadius: 3,
    height: 4,
    width: 40,
  },
});
