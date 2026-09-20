import { StyleSheet, Text, type StyleProp, type ViewStyle } from 'react-native';
import { View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';

type Tone = 'info' | 'primary' | 'success' | 'warning' | 'danger' | 'neutral';

type Props = {
  label: string;
  tone?: Tone;
  numberOfLines?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Pill badge for counts and status tags (`NEW`, unread counts, plan states).
 * Replaces the `borderRadius: 999` badge/count/chip literals scattered
 * across inbox, contacts, and settings screens.
 */
export function AppBadge({ label, tone = 'info', numberOfLines = 1, style }: Props) {
  const { colors } = useTheme();
  const palette =
    tone === 'primary' ? { bg: colors.primary, fg: colors.primaryText }
      : tone === 'success' ? { bg: colors.successSoft, fg: colors.success }
        : tone === 'warning' ? { bg: colors.warningSoft, fg: colors.warning }
          : tone === 'danger' ? { bg: colors.dangerSoft, fg: colors.error }
            : tone === 'neutral' ? { bg: colors.surfaceSecondary, fg: colors.textSecondary }
              : { bg: colors.primarySoft, fg: colors.primary };

  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }, style]}>
      <Text numberOfLines={numberOfLines} style={[styles.label, { color: palette.fg }]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm - 2,
    paddingVertical: spacing.xs - 2,
  },
  label: { fontSize: fontSize.tiny, fontWeight: fontWeight.extrabold },
});
