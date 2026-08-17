import { Search, X } from 'lucide-react-native';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

type Props = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  /** `md` (44pt) suits full screens, `sm` (38pt) suits dense toolbars. */
  size?: 'sm' | 'md';
  /** Which surface the field sits on, so it stays readable in both themes. */
  tone?: 'surface' | 'background';
  showClear?: boolean;
  /** Extra work to run when clearing, e.g. resetting a debounced value. */
  onClear?: () => void;
  /** Fill remaining space in a toolbar row. Turn off inside column layouts like sheets. */
  fill?: boolean;
};

export function AppSearchField({
  value,
  onChangeText,
  placeholder = 'Search…',
  size = 'md',
  tone = 'surface',
  showClear = true,
  onClear,
  fill = true,
}: Props) {
  const { colors } = useTheme();
  const height = size === 'sm' ? 38 : 44;
  const iconSize = size === 'sm' ? 15 : 18;
  const background = tone === 'surface' ? colors.surface : colors.background;

  const clear = () => {
    onChangeText('');
    onClear?.();
  };

  return (
    <View style={[styles.wrap, !fill && styles.wrapFlush, { backgroundColor: background, borderColor: colors.cardBorder, height }]}>
      <Search color={colors.textMuted} size={iconSize} />
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        style={[styles.input, { color: colors.text, height }]}
      />
      {showClear && value ? (
        <Pressable onPress={clear} hitSlop={8} accessibilityLabel="Clear search">
          <X color={colors.textMuted} size={iconSize - 2} />
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
    paddingHorizontal: 12,
  },
  wrapFlush: { flex: 0, alignSelf: 'stretch' },
  input: { flex: 1, fontSize: 14, marginLeft: 8, paddingVertical: 0 },
});
