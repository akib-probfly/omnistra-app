import { type LucideIcon } from 'lucide-react-native';
import { ActivityIndicator, Pressable, StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { controlSize, fontSize, fontWeight, iconSize, opacity, radius, spacing } from '../theme/tokens';

type Variant = 'primary' | 'secondary' | 'ghost' | 'destructive';
type Size = 'sm' | 'md' | 'lg';

type Props = {
  label: string;
  onPress: () => void;
  icon?: LucideIcon;
  variant?: Variant;
  /** Omit to preserve the existing inline/block sizing. */
  size?: Size;
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
  size,
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
      accessibilityRole="button"
      accessibilityState={{ disabled: busy, busy: loading }}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={busy}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        block && styles.blockButton,
        size && sizeStyles[size],
        { backgroundColor, borderColor, borderWidth: variant === 'secondary' ? 1 : 0 },
        style,
        busy ? styles.disabled : pressed && styles.pressed,
      ]}
    >
      {loading ? (
        <>
          <ActivityIndicator color={foreground} size={block ? undefined : 'small'} />
          {loadingLabel ? (
            <Text style={[styles.label, block && styles.blockLabel, size && labelSizeStyles[size], { color: foreground }]}>
              {loadingLabel}
            </Text>
          ) : null}
        </>
      ) : (
        <>
          {Icon ? <Icon color={foreground} size={iconSize.sm} /> : null}
          <Text style={[styles.label, block && styles.blockLabel, size && labelSizeStyles[size], { color: foreground }]}>{label}</Text>
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
  pressed: { opacity: opacity.pressed },
});

const sizeStyles = StyleSheet.create({
  sm: { height: controlSize.compact, paddingHorizontal: spacing.md, paddingVertical: 0 },
  md: { height: controlSize.touchTarget, paddingHorizontal: spacing.lg, paddingVertical: 0 },
  lg: { height: controlSize.large, paddingHorizontal: spacing.xl, paddingVertical: 0 },
});

const labelSizeStyles = StyleSheet.create({
  sm: { fontSize: fontSize.caption },
  md: { fontSize: fontSize.body },
  lg: { fontSize: fontSize.subheading },
});
