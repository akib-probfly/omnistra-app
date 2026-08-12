import { Image, StyleSheet, Text, View } from 'react-native';
import { SkeletonBone, SkeletonPulse } from '../components/Skeleton';
import { useTheme } from '../theme/ThemeContext';

export function SplashScreen() {
  const { colors } = useTheme();
  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <View style={[styles.glow, { backgroundColor: colors.primary }]} />
      <Image source={require('../../assets/logo-main.png')} resizeMode="contain" style={styles.logo} />
      <Text style={[styles.tagline, { color: colors.textSecondary }]}>Your omnichannel inbox, everywhere.</Text>
      <View style={styles.loading}>
        <SkeletonPulse style={styles.skeletonStack}>
          <SkeletonBone width={160} height={10} radius={6} />
          <SkeletonBone width={110} height={10} radius={6} style={styles.skeletonGap} />
          <SkeletonBone width={80} height={10} radius={6} style={styles.skeletonGap} />
        </SkeletonPulse>
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>Loading your workspace...</Text>
      </View>
      <Text style={[styles.footer, { color: colors.textMuted }]}>OMNISTRA</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { alignItems: 'center', backgroundColor: '#eef4fb', flex: 1, justifyContent: 'center', overflow: 'hidden' },
  glow: { backgroundColor: '#d9e7ff', borderRadius: 220, height: 440, opacity: 0.7, position: 'absolute', right: -130, top: -110, width: 440 },
  logo: { height: 76, width: 250 },
  tagline: { color: '#526987', fontSize: 15, marginTop: 14 },
  loading: { alignItems: 'center', gap: 12, marginTop: 42 },
  skeletonStack: { alignItems: 'center', width: 160 },
  skeletonGap: { marginTop: 8 },
  loadingText: { color: '#64748b', fontSize: 13 },
  footer: { bottom: 30, color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 2, position: 'absolute' },
});
