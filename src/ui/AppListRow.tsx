import { ChevronRight } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import type { LucideIcon } from 'lucide-react-native';

type Props = {
  icon: LucideIcon;
  /** Tile background. Defaults to the primary soft tint. */
  iconBg?: string;
  /** Icon glyph color. Defaults to the primary color. */
  iconColor?: string;
  title: string;
  description?: string;
  /** Small pill rendered next to the title (e.g. `NEW`). */
  badge?: ReactNode;
  /** Custom trailing content. Defaults to a chevron. Set to `null` for none. */
  trailing?: ReactNode;
  /** Hide the bottom separator (use for the last row in a card). */
  last?: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
};

/**
 * Standard settings/list row: 40pt icon tile, title + description copy,
 * trailing chevron or custom value. Handles the bottom separator so call
 * sites don't repeat border logic.
 */
export function AppListRow({
  icon: Icon,
  iconBg,
  iconColor,
  title,
  description,
  badge,
  trailing,
  last = false,
  onPress,
  accessibilityLabel,
}: Props) {
  const { colors } = useTheme();
  const tileBg = iconBg ?? colors.primarySoft;
  const glyphColor = iconColor ?? colors.primary;

  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? title}
      onPress={onPress}
      style={[
        styles.row,
        !last && { borderBottomColor: colors.separator, borderBottomWidth: 1 },
      ]}
    >
      <View style={[styles.tile, { backgroundColor: tileBg }]}>
        <Icon color={glyphColor} size={18} />
      </View>
      <View style={styles.copy}>
        <View style={styles.titleLine}>
          <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
          {badge}
        </View>
        {description ? (
          <Text style={[styles.description, { color: colors.textSecondary }]} numberOfLines={1}>
            {description}
          </Text>
        ) : null}
      </View>
      {trailing === undefined ? (
        <ChevronRight color={colors.textMuted} size={18} />
      ) : (
        trailing
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: spacing.md + 2,
    paddingVertical: spacing.md,
  },
  tile: {
    alignItems: 'center',
    borderRadius: radius.xxl,
    height: 40,
    justifyContent: 'center',
    width: 40,
  },
  copy: { flex: 1, marginLeft: spacing.md, minWidth: 0 },
  titleLine: { alignItems: 'center', flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  title: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  description: { fontSize: fontSize.small, marginTop: 2 },
});
