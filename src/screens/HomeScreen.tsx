import { StyleSheet, Text, View } from 'react-native';

export function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Omnistra Mobile</Text>
      <Text style={styles.subtitle}>The mobile foundation is ready.</Text>
      <Text style={styles.body}>Next: authentication, inbox conversations, channels, and realtime updates.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', padding: 24, backgroundColor: '#f8fafc' },
  title: { fontSize: 28, fontWeight: '700', color: '#0f172a' },
  subtitle: { marginTop: 8, fontSize: 18, color: '#334155' },
  body: { marginTop: 16, fontSize: 15, lineHeight: 22, color: '#64748b' },
});
