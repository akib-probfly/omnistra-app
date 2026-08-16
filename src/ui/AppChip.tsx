import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  label: string;
  selected?: boolean;
  onPress: () => void;
  tone?: 'default' | 'danger';
};

export function AppChip({ label, selected = false, onPress, tone = 'default' }: Props) {
  const { colors } = useTheme();
  const selectedBg = tone === 'danger' ? colors.error : colors.primary;
  const idleColor = tone === 'danger' ? colors.error : colors.textSecondary;

  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? selectedBg : colors.background,
          borderColor: selected ? selectedBg : colors.cardBorder,
        },
        tone === 'danger' && !selected && styles.plain,
      ]}
    >
      <Text
        numberOfLines={1}
        style={[styles.label, { color: selected ? colors.primaryText : idleColor }]}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 11,
    paddingVertical: 6,
  },
  plain: { borderWidth: 0, paddingHorizontal: 8 },
  label: { fontSize: 12, fontWeight: '600' },
});
