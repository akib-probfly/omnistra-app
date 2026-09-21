import type { LucideIcon } from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type StyleProp, type TextInputProps, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight, inputHeight, radius, spacing } from '../theme/tokens';

type Props = Pick<
  TextInputProps,
  | 'value'
  | 'onChangeText'
  | 'autoFocus'
  | 'placeholder'
  | 'keyboardType'
  | 'autoCapitalize'
  | 'autoComplete'
  | 'secureTextEntry'
  | 'editable'
  | 'multiline'
  | 'numberOfLines'
  | 'onSubmitEditing'
  | 'returnKeyType'
> & {
  label?: string;
  icon?: LucideIcon;
  /** Trailing affordance rendered inside the box, e.g. a password eye-toggle. */
  trailing?: ReactNode;
  error?: string;
  helpText?: string;
  /** Call-site spacing only; shape belongs to the component. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Labeled text field: label, themed input box, optional leading icon and
 * trailing affordance, error and help text. Consolidates the
 * `inputWrapper`/`fieldInput`/`fieldLabel` blocks repeated across auth,
 * contacts, workspace, and settings forms.
 */
export function AppTextField({
  label,
  icon: Icon,
  trailing,
  error,
  helpText,
  style,
  ...inputProps
}: Props) {
  const { colors } = useTheme();

  return (
    <View style={style}>
      {label ? <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text> : null}
      <View
        style={[
          styles.box,
          {
            backgroundColor: colors.surface,
            borderColor: error ? colors.error : colors.inputBorder,
            minHeight: inputProps.multiline ? inputHeight : undefined,
          },
        ]}
      >
        {Icon ? (
          <Icon color={colors.textMuted} size={16} style={styles.icon} />
        ) : null}
        <TextInput
          placeholderTextColor={colors.textMuted}
          underlineColorAndroid="transparent"
          style={[
            styles.input,
            { color: colors.text },
            inputProps.multiline && styles.multiline,
          ]}
          {...inputProps}
        />
        {trailing ? <View style={styles.trailing}>{trailing}</View> : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.error }]}>{error}</Text> : null}
      {!error && helpText ? (
        <Text style={[styles.help, { color: colors.textSecondary }]}>{helpText}</Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: {
    fontSize: fontSize.small,
    fontWeight: fontWeight.semibold,
    marginBottom: spacing.xs + 2,
  },
  box: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: spacing.md + 2,
  },
  icon: { marginRight: spacing.sm + 2 },
  trailing: { marginLeft: spacing.sm, padding: spacing.xs },
  input: { flex: 1, fontSize: fontSize.subheading, height: inputHeight },
  multiline: { height: undefined, paddingVertical: spacing.md, textAlignVertical: 'top' },
  error: { fontSize: fontSize.caption, marginTop: spacing.xs },
  help: { fontSize: fontSize.small, lineHeight: 18, marginTop: 2 },
});
