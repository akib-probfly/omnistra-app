import type { LucideIcon } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';
import { AppBadge } from './AppBadge';
import { AppText } from './AppText';

type Props = {
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
  label: string;
  badge?: string;
  accessory?: string;
  disabled?: boolean;
  onPress?: () => void;
};

export function SettingsGridItem({ icon: Icon, iconBg, iconColor, label, badge, accessory, disabled, onPress }: Props) {
  const { colors } = useTheme();

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[styles.item, disabled && styles.disabled]}
    >
      <View style={[styles.icon, { backgroundColor: iconBg }]}> 
        <Icon color={iconColor} size={22} />
      </View>
      <AppText variant="caption" numberOfLines={2} style={styles.label}>{label}</AppText>
      {accessory ? <AppText variant="tiny" tone="primary" style={styles.accessory}>{accessory}</AppText> : null}
      {badge ? <AppBadge label={badge} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  item: { alignItems: 'center', minHeight: 112, paddingHorizontal: spacing.xs, paddingVertical: spacing.md, width: '33.333%' },
  disabled: { opacity: 0.58 },
  icon: { alignItems: 'center', borderRadius: radius.xxl, elevation: 1, height: 52, justifyContent: 'center', marginBottom: spacing.md, shadowColor: '#0f172a', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.1, shadowRadius: 2, width: 52 },
  label: { fontSize: fontSize.small, fontWeight: fontWeight.semibold, textAlign: 'center' },
  accessory: { fontSize: fontSize.tiny, marginTop: spacing.xs / 2, textAlign: 'center' },
});
