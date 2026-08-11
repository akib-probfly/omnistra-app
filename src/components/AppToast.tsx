import { Check } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { BaseToast, ErrorToast, type ToastConfig } from 'react-native-toast-message';
import { useTheme } from '../theme/ThemeContext';

function SuccessToast(props: any) {
  const { colors } = useTheme();
  return (
    <BaseToast
      {...props}
      style={[styles.toast, { borderLeftColor: '#22c55e', backgroundColor: colors.surface }]}
      contentContainerStyle={styles.content}
      text1Style={[styles.text1, { color: colors.text }]}
      text2Style={[styles.text2, { color: colors.textSecondary }]}
      text2NumberOfLines={2}
    />
  );
}

function ErrorToastWrapper(props: any) {
  const { colors } = useTheme();
  return (
    <ErrorToast
      {...props}
      style={[styles.toast, { borderLeftColor: colors.error, backgroundColor: colors.surface }]}
      contentContainerStyle={styles.content}
      text1Style={[styles.text1, { color: colors.text }]}
      text2Style={[styles.text2, { color: colors.textSecondary }]}
      text2NumberOfLines={2}
    />
  );
}

function InfoToast(props: any) {
  const { colors } = useTheme();
  return (
    <BaseToast
      {...props}
      style={[styles.toast, { borderLeftColor: colors.primary, backgroundColor: colors.surface }]}
      contentContainerStyle={styles.content}
      text1Style={[styles.text1, { color: colors.text }]}
      text2Style={[styles.text2, { color: colors.textSecondary }]}
      text2NumberOfLines={2}
    />
  );
}

function CopyToast({ text1 }: { text1?: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.copyPill, { backgroundColor: colors.text, shadowColor: colors.text }]}>
      <View style={styles.copyIcon}>
        <Check color={colors.surface} size={14} strokeWidth={3} />
      </View>
      <Text style={[styles.copyText, { color: colors.background }]}>{text1 ?? 'Copied'}</Text>
    </View>
  );
}

export const toastConfig: ToastConfig = {
  success: (props) => <SuccessToast {...props} />,
  error: (props) => <ErrorToastWrapper {...props} />,
  info: (props) => <InfoToast {...props} />,
  copy: ({ text1 }) => <CopyToast text1={text1} />,
};

const styles = StyleSheet.create({
  toast: {
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
    fontSize: 14,
    fontWeight: '700',
  },
  text2: {
    fontSize: 12,
    fontWeight: '500',
    marginTop: 2,
  },
  copyPill: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 999,
    elevation: 6,
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
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
    fontSize: 14,
    fontWeight: '600',
  },
});
