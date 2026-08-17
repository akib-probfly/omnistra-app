import { Image, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeContext';

export function AuthChrome() {
  const { colors, isDark } = useTheme();
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={isDark ? [colors.background, '#0b1f4a', colors.background] : [colors.background, '#dbeafe', colors.background]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <View style={[styles.orb, styles.orbTop, { backgroundColor: colors.primary }]} />
      <View style={[styles.orb, styles.orbBottom, { backgroundColor: colors.primary }]} />
    </View>
  );
}

export function AuthWordmark() {
  return (
    <Image source={require('../../assets/logo-wordmark.png')} resizeMode="contain" style={styles.wordmark} />
  );
}

const styles = StyleSheet.create({
  orb: {
    borderRadius: 200,
    opacity: 0.14,
    position: 'absolute',
  },
  orbTop: {
    height: 280,
    right: -90,
    top: -110,
    width: 280,
  },
  orbBottom: {
    bottom: -140,
    height: 320,
    left: -120,
    opacity: 0.1,
    width: 320,
  },
  wordmark: {
    height: 56,
    marginBottom: 28,
    width: 228,
  },
});
