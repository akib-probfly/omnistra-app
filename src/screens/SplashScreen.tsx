import { ActivityIndicator, Image, StyleSheet, Text, View } from 'react-native';

export function SplashScreen() {
  return <View style={styles.screen}><View style={styles.glow} /><Image source={require('../../assets/logo-main.png')} resizeMode="contain" style={styles.logo} /><Text style={styles.tagline}>Your omnichannel inbox, everywhere.</Text><View style={styles.loading}><ActivityIndicator color="#2563eb" size="small" /><Text style={styles.loadingText}>Loading your workspace...</Text></View><Text style={styles.footer}>OMNISTRA</Text></View>;
}

const styles = StyleSheet.create({ screen: { alignItems: 'center', backgroundColor: '#eef4fb', flex: 1, justifyContent: 'center', overflow: 'hidden' }, glow: { backgroundColor: '#d9e7ff', borderRadius: 220, height: 440, opacity: 0.7, position: 'absolute', right: -130, top: -110, width: 440 }, logo: { height: 76, width: 250 }, tagline: { color: '#526987', fontSize: 15, marginTop: 14 }, loading: { alignItems: 'center', flexDirection: 'row', gap: 9, marginTop: 42 }, loadingText: { color: '#64748b', fontSize: 13 }, footer: { bottom: 30, color: '#94a3b8', fontSize: 10, fontWeight: '700', letterSpacing: 2, position: 'absolute' } });
