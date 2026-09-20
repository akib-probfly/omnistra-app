import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import type { ThemeColors } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';

export type BadgeTone = 'info' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

type Props = {
  label: string;
  tone?: BadgeTone;
  /** `xs` (10/800) suits counts and tags; `sm` (11/600) suits status pills. */
  size?: 'xs' | 'sm';
  /** Leading glyph, e.g. a status icon in a pill. */
  icon?: LucideIcon;
  /** Leading status dot in the foreground color (Members-style pills). */
  dot?: boolean;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
};

/** Theme-aware badge palette, for custom pills that `AppBadge` can't cover. */
export function badgePalette(colors: ThemeColors, tone: BadgeTone): { bg: string; fg: string } {
  switch (tone) {
    case 'primary':
      return { bg: colors.primary, fg: colors.primaryText };
    case 'success':
      return { bg: colors.successSoft, fg: colors.success };
    case 'warning':
      return { bg: colors.warningSoft, fg: colors.warning };
    case 'danger':
      return { bg: colors.dangerSoft, fg: colors.error };
    case 'neutral':
      return { bg: colors.surfaceSecondary, fg: colors.textSecondary };
    case 'info':
    default:
      return { bg: colors.primarySoft, fg: colors.primary };
  }
}

/**
 * Pill badge for counts and status tags (`NEW`, unread counts, plan states).
 * Replaces the `borderRadius: 999` badge/count/chip literals scattered
 * across inbox, contacts, and settings screens.
 */
export function AppBadge({ label, tone = 'info', size = 'xs', icon: Icon, dot = false, numberOfLines = 1, style }: Props) {
  const { colors } = useTheme();
  const palette = badgePalette(colors, tone);

  return (
    <View style={[styles.badge, size === 'sm' && styles.badgeSm, { backgroundColor: palette.bg }, style]}>
      {Icon ? <Icon color={palette.fg} size={12} /> : null}
      {dot && !Icon ? <View style={[styles.dot, { backgroundColor: palette.fg }]} /> : null}
      <Text numberOfLines={numberOfLines} style={[styles.label, size === 'sm' && styles.labelSm, { color: palette.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignItems: 'center',
    borderRadius: radius.pill,
    flexDirection: 'row',
    gap: 3,
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: spacing.xs - 2,
  },
  badgeSm: {
    borderRadius: radius.sm + 2,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
  },
  label: { fontSize: fontSize.tiny, fontWeight: fontWeight.extrabold },
  labelSm: { fontSize: 11, fontWeight: fontWeight.semibold },
  dot: { borderRadius: 3, height: 6, width: 6 },
});
