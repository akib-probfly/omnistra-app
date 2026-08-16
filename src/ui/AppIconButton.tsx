import { type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  icon: LucideIcon;
  onPress: () => void;
  accessibilityLabel: string;
  disabled?: boolean;
  loading?: boolean;
};

export function AppIconButton({
  icon: Icon,
  onPress,
  accessibilityLabel,
  disabled = false,
  loading = false,
}: Props) {
  const { colors } = useTheme();
  const busy = disabled || loading;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      disabled={busy}
      onPress={onPress}
      style={[
        styles.button,
        { backgroundColor: colors.background, borderColor: colors.cardBorder },
        busy && styles.disabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={colors.primary} size="small" />
      ) : (
        <Icon color={colors.primary} size={16} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 38,
    justifyContent: 'center',
    width: 38,
  },
  disabled: { opacity: 0.6 },
});
