import type { LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';

type Tone = 'info' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

type Props = {
  label: string;
  tone?: Tone;
  /** `xs` (10/800) suits counts and tags; `sm` (11/600) suits status pills. */
  size?: 'xs' | 'sm';
  /** Leading glyph, e.g. a status icon in a pill. */
  icon?: LucideIcon;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pill badge for counts and status tags (`NEW`, unread counts, plan states).
 * Replaces the `borderRadius: 999` badge/count/chip literals scattered
 * across inbox, contacts, and settings screens.
 */
export function AppBadge({ label, tone = 'info', size = 'xs', icon: Icon, numberOfLines = 1, style }: Props) {
  const { colors } = useTheme();
  const palette =
    tone === 'primary' ? { bg: colors.primary, fg: colors.primaryText }
      : tone === 'success' ? { bg: colors.successSoft, fg: colors.success }
        : tone === 'warning' ? { bg: colors.warningSoft, fg: colors.warning }
          : tone === 'danger' ? { bg: colors.dangerSoft, fg: colors.error }
            : tone === 'neutral' ? { bg: colors.surfaceSecondary, fg: colors.textSecondary }
              : { bg: colors.primarySoft, fg: colors.primary };

  return (
    <View style={[styles.badge, size === 'sm' && styles.badgeSm, { backgroundColor: palette.bg }, style]}>
      {Icon ? <Icon color={palette.fg} size={12} /> : null}
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
});
