import { type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { controlSize, fontSize, fontWeight, iconSize, opacity, radius, spacing } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';

type Props = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: Variant;
  disabled?: boolean;
  loading?: boolean;
  loadingLabel?: string;
  accessibilityLabel?: string;
  /** Full-width call to action (taller, squarer) rather than the default inline pill. */
  block?: boolean;
  /** Call-site spacing only; shape belongs to the component. */
  style?: StyleProp<ViewStyle>;
};

export function AppButton({
  label,
  onPress,
  icon: Icon,
  variant = 'primary',
  disabled = false,
  loading = false,
  loadingLabel,
  accessibilityLabel,
  block = false,
  style,
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
        block && styles.blockButton,
        { backgroundColor, borderColor, borderWidth: variant === 'secondary' ? 1 : 0 },
        busy && styles.disabled,
        style,
      ]}
    >
      {loading ? (
        <>
          <ActivityIndicator color={foreground} size={block ? undefined : 'small'} />
          {loadingLabel ? (
            <Text style={[styles.label, block && styles.blockLabel, { color: foreground }]}>
              {loadingLabel}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          {Icon ? <Icon color={foreground} size={iconSize.sm} /> : null}
          <Text style={[styles.label, block && styles.blockLabel, { color: foreground }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: spacing.xs,
    height: controlSize.compact,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  blockButton: { borderRadius: radius.lg, gap: spacing.sm, height: undefined, paddingVertical: 14 },
  label: { fontSize: fontSize.caption, fontWeight: fontWeight.bold },
  blockLabel: { fontSize: fontSize.body },
  disabled: { opacity: opacity.disabled },
});
