import { type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type Props = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
};

export function AppButton({
  label,
  onPress,
  icon: Icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const busy = disabled || loading;
  const backgroundColor =
    variant === 'primary' ? colors.primary
      : variant === 'destructive' ? colors.error
        : variant === 'secondary' ? colors.background
          : 'transparent';
  const borderColor = variant === 'secondary' ? colors.cardBorder : 'transparent';
  const foreground =
    variant === 'primary' || variant === 'destructive' ? colors.primaryText
      : variant === 'ghost' ? colors.primary
        : colors.text;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={busy}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor, borderColor, borderWidth: variant === 'secondary' ? 1 : 0 },
        busy && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={foreground} size="small" />
      ) : (
        <>
          {Icon ? <Icon color={foreground} size={16} /> : null}
          <Text style={[styles.label, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 999,
    flexDirection: 'row',
    gap: 4,
    height: 38,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  label: { fontSize: 13, fontWeight: '700' },
  disabled: { opacity: 0.6 },
});
