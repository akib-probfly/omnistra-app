import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../theme/colors';
import { fontSize, fontWeight, radius, spacing } from '../theme/tokens';

/**
 * Shared auth-chrome layout plus the SignUp phone/country-picker styles.
 * Field, button, and error visuals now live in the `src/ui` primitives
 * (`AppTextField`, `AppButton`); what remains here is genuinely auth-specific.
 */
export function createAuthStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: spacing.xxxl,
      paddingVertical: 56,
    },
    header: {
      marginBottom: spacing.xxxl + spacing.sm,
    },
    subtitle: {
      marginTop: spacing.sm,
    },
    form: {
      gap: spacing.md,
    },
    phoneInputRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.inputBorder,
      borderRadius: radius.md,
      borderWidth: 1,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    countrySelector: {
      alignItems: 'center',
      alignSelf: 'stretch',
      borderRightColor: colors.inputBorder,
      borderRightWidth: 1,
      flexDirection: 'row',
      gap: spacing.xs,
      paddingHorizontal: spacing.sm,
    },
    flagText: {
      fontSize: fontSize.subheading,
    },
    countrySelectorText: {
      color: colors.text,
      fontSize: fontSize.caption,
      fontWeight: fontWeight.bold,
    },
    countrySelectorMeta: {
      color: colors.textSecondary,
      fontSize: fontSize.caption,
      fontWeight: fontWeight.semibold,
    },
    phoneNumberInput: {
      color: colors.text,
      flex: 1,
      fontSize: fontSize.subheading,
      height: 50,
      paddingHorizontal: spacing.sm + 2,
    },
    countrySheet: {
      paddingHorizontal: spacing.lg,
    },
    countryRow: {
      alignItems: 'center',
      borderRadius: radius.md,
      flexDirection: 'row',
      gap: spacing.sm + 2,
      paddingHorizontal: spacing.sm + 2,
      paddingVertical: spacing.md,
    },
    countryRowText: {
      color: colors.text,
      flex: 1,
      fontSize: fontSize.caption,
      fontWeight: fontWeight.bold,
    },
    countryRowMeta: {
      color: colors.textSecondary,
      fontSize: fontSize.caption,
      fontWeight: fontWeight.semibold,
    },
    linkWrapper: {
      alignItems: 'center',
      marginTop: 28,
    },
    footerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: 28,
      rowGap: spacing.md,
    },
  });
}
