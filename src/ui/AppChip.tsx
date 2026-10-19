import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { borderWidth, chipSize, fontSize, fontWeight, opacity, radius, spacing } from '../theme/tokens';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  tone?: 'default' | 'danger';
  labelColor?: string;
  size?: keyof typeof chipSize;
  disabled?: boolean;
  accessibilityLabel?: string;
};

export function AppChip({ label, selected = false, onPress, tone = 'default', labelColor, size = 'default', disabled = false, accessibilityLabel }: Props) {
  const { colors } = useTheme();
  const selectedBg = tone === 'danger' ? colors.error : colors.primary;
  const idleColor = tone === 'danger' ? colors.error : colors.textSecondary;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
      disabled={disabled}
      hitSlop={spacing.md}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        chipSize[size],
        {
          backgroundColor: selected ? selectedBg : colors.background,
          borderColor: selected ? selectedBg : labelColor ?? colors.cardBorder,
        },
        tone === 'danger' && !selected && styles.plain,
        disabled ? styles.disabled : pressed && styles.pressed,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.label, { color: selected ? colors.primaryText : labelColor ?? idleColor }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: radius.pill,
    borderWidth: borderWidth.thin,
  },
  plain: { borderWidth: borderWidth.none, paddingHorizontal: spacing.sm },
  label: { fontSize: fontSize.small, fontWeight: fontWeight.semibold },
  pressed: { opacity: opacity.pressed },
  disabled: { opacity: opacity.disabled },
});
