import { Check, Info, AlertTriangle } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import Toast, { type ToastConfig, type ToastConfigParams } from 'react-native-toast-message';
import { useTheme } from '../theme/ThemeContext';

type Tone = 'success' | 'error' | 'info';

const TONE = {
  success: { iconBg: '#dcfce7', icon: '#15803d', card: '#f0fdf4', border: '#bbf7d0' },
  error: { iconBg: '#ffe4e6', icon: '#e11d48', card: '#fff1f2', border: '#fecdd3' },
  info: { iconBg: '#dbeafe', icon: '#1d4ed8', card: '#eff6ff', border: '#bfdbfe' },
} as const;

function ToastCard({
  type,
  text1,
  text2,
}: {
  type: Tone;
  text1?: string;
  text2?: string;
}) {
  const { colors, isDark } = useTheme();
  const tone = TONE[type];
  const Icon = type === 'success' ? Check : type === 'error' ? AlertTriangle : Info;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: isDark ? colors.surface : tone.card,
          borderColor: isDark ? colors.cardBorder : tone.border,
          shadowColor: colors.text,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: isDark ? colors.surfaceSecondary : tone.iconBg }]}>
        <Icon color={tone.icon} size={16} strokeWidth={2.6} />
      </View>
      <View style={styles.copy}>
        {text1 ? <Text style={[styles.title, { color: colors.text }]}>{text1}</Text> : null}
        {text2 ? <Text style={[styles.body, { color: colors.textSecondary }]}>{text2}</Text> : null}
      </View>
    </View>
  );
}

function CopyToast({ text1 }: { text1?: string }) {
  const { colors, isDark } = useTheme();
  return (
    <View
      style={[
        styles.card,
        styles.copyCard,
        {
          backgroundColor: isDark ? colors.surface : TONE.success.card,
          borderColor: isDark ? colors.cardBorder : TONE.success.border,
          shadowColor: colors.text,
        },
      ]}
    >
      <View style={[styles.iconWrap, { backgroundColor: isDark ? colors.surfaceSecondary : TONE.success.iconBg }]}>
        <Check color={TONE.success.icon} size={16} strokeWidth={2.6} />
      </View>
      <Text style={[styles.title, { color: colors.text }]}>{text1 ?? 'Copied'}</Text>
    </View>
  );
}

function renderToast(type: Tone) {
  return function Toast(props: ToastConfigParams<any>) {
    return <ToastCard type={type} text1={props.text1} text2={props.text2} />;
  };
}

export function showNotice(text1: string, text2?: string) {
  const lower = text1.toLowerCase();
  const type =
    lower.includes('fail')
    || lower.includes('could not')
    || lower.includes('permission')
    || lower.includes('too large')
    || lower.includes('unavailable')
    || lower.includes('locked')
    || lower.startsWith('fix')
      ? 'error'
      : lower.includes('saved')
        || lower.includes('updated')
        || lower.includes('synced')
        || lower.includes('created')
        || lower.includes('downloaded')
        ? 'success'
        : 'info';
  Toast.show({ type, text1, text2: text2 || undefined });
}

export const toastConfig: ToastConfig = {
  success: renderToast('success'),
  error: renderToast('error'),
  info: renderToast('info'),
  copy: ({ text1 }) => <CopyToast text1={text1} />,
};

const styles = StyleSheet.create({
  card: {
    alignItems: 'center',
    alignSelf: 'center',
    borderRadius: 16,
    borderWidth: 1,
    elevation: 8,
    flexDirection: 'row',
    gap: 12,
    maxWidth: 420,
    paddingHorizontal: 14,
    paddingVertical: 12,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    width: '92%',
  },
  copyCard: {
    alignSelf: 'center',
    width: 'auto',
  },
  iconWrap: {
    alignItems: 'center',
    borderRadius: 999,
    height: 28,
    justifyContent: 'center',
    width: 28,
  },
  copy: {
    flex: 1,
    minWidth: 0,
  },
  title: {
    fontSize: 14,
    fontWeight: '700',
  },
  body: {
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 17,
    marginTop: 2,
  },
});
