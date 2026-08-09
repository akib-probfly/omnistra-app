import { Check } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { BaseToast, ErrorToast, type ToastConfig } from 'react-native-toast-message';

export const toastConfig: ToastConfig = {
  success: (props) => (
    <BaseToast
      {...props}
      style={styles.success}
      contentContainerStyle={styles.content}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
    />
  ),
  error: (props) => (
    <ErrorToast
      {...props}
      style={styles.error}
      contentContainerStyle={styles.content}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
    />
  ),
  info: (props) => (
    <BaseToast
      {...props}
      style={styles.info}
      contentContainerStyle={styles.content}
      text1Style={styles.text1}
      text2Style={styles.text2}
      text2NumberOfLines={2}
    />
  ),
  copy: ({ text1 }) => (
    <View style={styles.copyPill}>
      <View style={styles.copyIcon}>
        <Check color="#fff" size={14} strokeWidth={3} />
      </View>
      <Text style={styles.copyText}>{text1 ?? 'Copied'}</Text>
    </View>
  ),
};

const styles = StyleSheet.create({
  success: {
    borderLeftColor: '#22c55e',
    borderLeftWidth: 4,
    borderRadius: 12,
    height: 'auto',
    minHeight: 56,
    width: '92%',
  },
  error: {
    borderLeftColor: '#ef4444',
    borderLeftWidth: 4,
    borderRadius: 12,
    height: 'auto',
    minHeight: 56,
    width: '92%',
  },
  info: {
    borderLeftColor: '#2563eb',
    borderLeftWidth: 4,
    borderRadius: 12,
    height: 'auto',
    minHeight: 56,
    width: '92%',
  },
  content: {
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  text1: {
    color: '#0f172a',
    fontSize: 14,
    fontWeight: '700',
  },
  text2: {
    color: '#64748b',
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  copyPill: {
    alignItems: 'center',
    alignSelf: 'center',
    backgroundColor: '#1e293b',
    borderRadius: 999,
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    shadowColor: '#0f172a',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  copyIcon: {
    alignItems: 'center',
    backgroundColor: '#22c55e',
    borderRadius: 999,
    height: 22,
    justifyContent: 'center',
    width: 22,
  },
  copyText: {
    color: '#f8fafc',
    fontSize: 14,
    fontWeight: '600',
  },
});
