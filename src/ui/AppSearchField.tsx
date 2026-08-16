import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
};

export function AppSearchField({ value, onChangeText, placeholder = 'Search…' }: Props) {
  const { colors } = useTheme();

  return (
    <View style={[styles.wrap, { backgroundColor: colors.background, borderColor: colors.cardBorder }]}>
      <Search color={colors.textMuted} size={15} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text }]}
      />
      {value ? (
        <Pressable onPress={() => onChangeText('')} hitSlop={8} accessibilityLabel="Clear search">
          <X color={colors.textMuted} size={14} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    flex: 1,
    flexDirection: 'row',
    height: 38,
    paddingHorizontal: 12,
  },
  input: { flex: 1, fontSize: 14, height: 38, marginLeft: 8, paddingVertical: 0 },
});
