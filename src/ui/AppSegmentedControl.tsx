import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Option<T> = { value: T; label: string };

type Props<T> = {
  options: ReadonlyArray<Option<T>>;
  value: T;
  onChange: (value: T) => void;
};

/**
 * Inline single-select control for 2-3 short options, sized for use directly under a field label
 * (hence the built-in top margin).
 */
export function AppSegmentedControl<T extends string>({ options, value, onChange }: Props<T>) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.surfaceSecondary }]}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.option, active && { backgroundColor: colors.surface }]}
          >
            <Text style={[styles.label, { color: active ? colors.primary : colors.textSecondary }]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: 12, flexDirection: 'row', gap: 3, marginTop: 6, padding: 3 },
  option: { alignItems: 'center', borderRadius: 9, flex: 1, paddingVertical: 9 },
  label: { fontSize: 12, fontWeight: '600' },
});
