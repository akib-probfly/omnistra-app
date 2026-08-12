import { AlertCircle, RefreshCw } from 'lucide-react-native';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

export function ErrorState({ message = 'Something went wrong. Please try again.', onRetry }: { message?: string; onRetry?: () => void }) {
  const { colors } = useTheme();
  return <View style={[styles.wrap, { backgroundColor: colors.surface, borderColor: colors.cardBorder }]}><View style={styles.icon}><AlertCircle color={colors.error} size={24} /></View><Text style={[styles.title, { color: colors.error }]}>Unable to load</Text><Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>{onRetry ? <Pressable onPress={onRetry} style={[styles.retry, { backgroundColor: colors.error }]}><RefreshCw color="#fff" size={16} /><Text style={styles.retryText}>Try again</Text></Pressable> : null}</View>;
}

const styles = StyleSheet.create({ wrap: { alignItems: 'center', backgroundColor: '#fff7f7', borderColor: '#fecaca', borderRadius: 18, borderWidth: 1, margin: 16, padding: 24 }, icon: { alignItems: 'center', backgroundColor: '#fee2e2', borderRadius: 24, height: 48, justifyContent: 'center', width: 48 }, title: { color: '#991b1b', fontSize: 17, fontWeight: '700', marginTop: 12 }, message: { color: '#b45353', fontSize: 13, lineHeight: 19, marginTop: 6, textAlign: 'center' }, retry: { alignItems: 'center', backgroundColor: '#dc2626', borderRadius: 18, flexDirection: 'row', gap: 7, marginTop: 16, paddingHorizontal: 16, paddingVertical: 9 }, retryText: { color: '#fff', fontWeight: '700' } });
