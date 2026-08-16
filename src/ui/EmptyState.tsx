import { type LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  title: string;
  message: string;
  icon?: LucideIcon;
  iconSize?: number;
  /** Arbitrary visual above the title, for cases an icon can't cover. Wins over `icon`. */
  illustration?: ReactNode;
  /** Recovery affordance rendered below the message, e.g. "Clear filters". */
  action?: ReactNode;
};

export function EmptyState({ title, message, icon: Icon, iconSize = 30, illustration, action }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {illustration ?? (Icon ? <Icon color={colors.textMuted} size={iconSize} /> : null)}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  title: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  message: { fontSize: 13, marginTop: 5, textAlign: 'center' },
});
