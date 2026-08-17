import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  View,
  type ImageSourcePropType,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as NativeSplashScreen from 'expo-splash-screen';

const SPLASH_MS = 2800;
const LIGHT_BG = '#f4f7fb';

export type SplashScreenProps = {
  onFinish: () => void;
  iconSource: ImageSourcePropType;
  wordmarkSource?: ImageSourcePropType;
  brandName?: string;
  tagline?: string;
  backgroundColor?: string;
};

function PulsingDots() {
  const first = useRef(new Animated.Value(0.22)).current;
  const second = useRef(new Animated.Value(0.22)).current;
  const third = useRef(new Animated.Value(0.22)).current;

  useEffect(() => {
    const values = [first, second, third];
    const loops = values.map((dot, index) =>
      Animated.loop(
        Animated.sequence([
          Animated.delay(index * 180),
          Animated.timing(dot, {
            toValue: 1,
            duration: 340,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
          Animated.timing(dot, {
            toValue: 0.22,
            duration: 340,
            easing: Easing.inOut(Easing.quad),
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((loop) => loop.start());
    return () => loops.forEach((loop) => loop.stop());
  }, [first, second, third]);

  return (
    <View style={styles.dots} accessibilityLabel="Loading">
      {[first, second, third].map((dot, index) => (
        <Animated.View key={index} style={[styles.dot, { opacity: dot }]} />
      ))}
    </View>
  );
}

export function SplashScreen({
  onFinish,
  iconSource,
  wordmarkSource,
  brandName,
  tagline = 'OMNICHANNEL INBOX',
  backgroundColor = LIGHT_BG,
}: SplashScreenProps) {
  const insets = useSafeAreaInsets();
  const markScale = useRef(new Animated.Value(0.5)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkOpacity = useRef(new Animated.Value(0)).current;
  const wordmarkTranslate = useRef(new Animated.Value(18)).current;
  const taglineOpacity = useRef(new Animated.Value(0)).current;
  const loaderOpacity = useRef(new Animated.Value(0)).current;
  const finishedRef = useRef(false);
  const revealedRef = useRef(false);
  const [revealed, setRevealed] = useState(false);
  const showWordmarkOnly = Boolean(wordmarkSource);

  const reveal = useCallback(() => {
    if (revealedRef.current) return;
    revealedRef.current = true;
    const fallback = setTimeout(() => setRevealed(true), 250);
    void NativeSplashScreen.hideAsync()
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(fallback);
        setRevealed(true);
      });
  }, []);

  useEffect(() => {
    if (!revealed) return;

    const intro = Animated.sequence([
      Animated.parallel([
        Animated.spring(markScale, {
          toValue: 1,
          friction: 5.4,
          tension: 72,
          useNativeDriver: true,
        }),
        Animated.timing(markOpacity, {
          toValue: 1,
          duration: 460,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
      Animated.delay(80),
      ...(showWordmarkOnly
        ? []
        : [
            Animated.parallel([
              Animated.timing(wordmarkOpacity, {
                toValue: 1,
                duration: 420,
                easing: Easing.out(Easing.quad),
                useNativeDriver: true,
              }),
              Animated.timing(wordmarkTranslate, {
                toValue: 0,
                duration: 420,
                easing: Easing.out(Easing.cubic),
                useNativeDriver: true,
              }),
            ]),
          ]),
      Animated.timing(taglineOpacity, {
        toValue: 1,
        duration: 320,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(loaderOpacity, {
        toValue: 1,
        duration: 280,
        useNativeDriver: true,
      }),
    ]);

    intro.start();

    const timer = setTimeout(() => {
      if (finishedRef.current) return;
      finishedRef.current = true;
      onFinish();
    }, SPLASH_MS);

    return () => {
      intro.stop();
      clearTimeout(timer);
    };
  }, [
    markOpacity,
    markScale,
    loaderOpacity,
    onFinish,
    revealed,
    showWordmarkOnly,
    taglineOpacity,
    wordmarkOpacity,
    wordmarkTranslate,
  ]);

  return (
    <View style={[styles.screen, { backgroundColor }]} onLayout={reveal}>
      <StatusBar style="dark" backgroundColor={backgroundColor} translucent={Platform.OS === 'android'} />
      <View style={[styles.body, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
        <View style={styles.center}>
          {showWordmarkOnly ? (
            <Animated.Image
              source={wordmarkSource}
              resizeMode="contain"
              style={[styles.heroWordmark, { opacity: markOpacity, transform: [{ scale: markScale }] }]}
            />
          ) : (
            <>
              <Animated.Image
                source={iconSource}
                resizeMode="contain"
                style={[styles.icon, { opacity: markOpacity, transform: [{ scale: markScale }] }]}
              />
              {brandName ? (
                <Animated.Text
                  style={[styles.brandName, { opacity: wordmarkOpacity, transform: [{ translateY: wordmarkTranslate }] }]}
                >
                  {brandName}
                </Animated.Text>
              ) : null}
            </>
          )}
          {tagline ? (
            <Animated.Text style={[styles.tagline, { opacity: taglineOpacity }]}>{tagline}</Animated.Text>
          ) : null}
        </View>
        <Animated.View style={[styles.loader, { opacity: loaderOpacity, paddingBottom: Math.max(insets.bottom, 28) }]}>
          <PulsingDots />
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: LIGHT_BG,
  },
  body: {
    flex: 1,
  },
  center: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  icon: {
    height: 112,
    width: 112,
  },
  heroWordmark: {
    height: 64,
    width: 280,
  },
  wordmark: {
    height: 56,
    marginTop: 14,
    width: 248,
  },
  brandName: {
    color: '#0f172a',
    fontSize: 34,
    fontWeight: '800',
    letterSpacing: -0.6,
    marginTop: 12,
  },
  tagline: {
    color: '#64748b',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 3.4,
    marginTop: 18,
  },
  loader: {
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  dots: {
    flexDirection: 'row',
    gap: 8,
  },
  dot: {
    backgroundColor: '#2563eb',
    borderRadius: 4,
    height: 8,
    width: 8,
  },
});
