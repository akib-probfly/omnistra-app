import { type LucideIcon } from 'lucide-react-native';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  title: string;
  message: string;
  icon?: LucideIcon;
};

export function EmptyState({ title, message, icon: Icon }: Props) {
  const { colors } = useTheme();

  return (
    <View style={styles.wrap}>
      {Icon ? <Icon color={colors.textMuted} size={30} /> : null}
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', paddingHorizontal: 32, paddingTop: 48 },
  title: { fontSize: 16, fontWeight: '700', marginTop: 12 },
  message: { fontSize: 13, marginTop: 5, textAlign: 'center' },
});
