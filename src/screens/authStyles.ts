import { StyleSheet } from 'react-native';
import type { ThemeColors } from '../theme/colors';

export function createAuthStyles(colors: ThemeColors) {
  return StyleSheet.create({
    screen: {
      backgroundColor: colors.background,
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
      paddingVertical: 56,
    },
    header: {
      marginBottom: 40,
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '600',
      letterSpacing: -0.6,
    },
    subtitle: {
      color: colors.textSecondary,
      fontSize: 15,
      lineHeight: 22,
      marginTop: 8,
    },
    form: {
      gap: 12,
    },
    fieldRow: {
      flexDirection: 'row',
      gap: 10,
    },
    fieldColumn: {
      flex: 1,
    },
    fieldLabel: {
      color: colors.textSecondary,
      fontSize: 12,
      fontWeight: '600',
      marginBottom: 6,
    },
    phoneInputRow: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.inputBorder,
      borderRadius: 12,
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
      gap: 4,
      paddingHorizontal: 8,
    },
    countrySelectorText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '700',
    },
    countrySelectorMeta: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    phoneNumberInput: {
      color: colors.text,
      flex: 1,
      fontSize: 16,
      height: 50,
      paddingHorizontal: 10,
    },
    sheetTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
      marginBottom: 14,
    },
    countrySheet: {
      paddingHorizontal: 16,
    },
    sheetSearch: {
      backgroundColor: colors.surfaceSecondary,
      borderColor: colors.inputBorder,
      borderRadius: 12,
      borderWidth: 1,
      color: colors.text,
      fontSize: 15,
      height: 46,
      marginBottom: 12,
      paddingHorizontal: 14,
    },
    countryRow: {
      alignItems: 'center',
      borderRadius: 12,
      flexDirection: 'row',
      gap: 10,
      paddingHorizontal: 10,
      paddingVertical: 12,
    },
    countryRowText: {
      color: colors.text,
      flex: 1,
      fontSize: 14,
      fontWeight: '700',
    },
    countryRowMeta: {
      color: colors.textSecondary,
      fontSize: 13,
      fontWeight: '600',
    },
    inputWrapper: {
      alignItems: 'center',
      backgroundColor: colors.surface,
      borderColor: colors.inputBorder,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      paddingHorizontal: 14,
    },
    inputIcon: {
      marginRight: 10,
    },
    input: {
      color: colors.text,
      flex: 1,
      fontSize: 16,
      height: 50,
    },
    inputWithToggle: {
      paddingRight: 4,
    },
    eyeToggle: {
      padding: 6,
    },
    error: {
      color: colors.error,
      fontSize: 13,
      marginTop: 4,
    },
    helpText: {
      color: colors.textSecondary,
      fontSize: 12,
      lineHeight: 18,
      marginTop: 2,
    },
    successBox: {
      alignItems: 'center',
      flexDirection: 'row',
      gap: 8,
      marginTop: 4,
    },
    successText: {
      color: colors.textSecondary,
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
    },
    primary: {
      alignItems: 'center',
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 50,
      justifyContent: 'center',
      marginTop: 12,
    },
    primaryPressed: {
      opacity: 0.88,
    },
    primaryDisabled: {
      opacity: 0.45,
    },
    primaryText: {
      color: colors.primaryText,
      fontSize: 15,
      fontWeight: '600',
      letterSpacing: 0.2,
    },
    linkWrapper: {
      alignItems: 'center',
      marginTop: 28,
    },
    link: {
      color: colors.textSecondary,
      fontSize: 14,
    },
    linkBold: {
      color: colors.primary,
      fontWeight: '600',
    },
    forgotLink: {
      alignSelf: 'flex-end',
      marginTop: 4,
    },
    footerRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      marginTop: 28,
      rowGap: 12,
    },
    secondary: {
      alignItems: 'center',
      borderColor: colors.cardBorder,
      borderRadius: 12,
      borderWidth: 1,
      height: 50,
      justifyContent: 'center',
      marginTop: 12,
    },
    secondaryText: {
      color: colors.primary,
      fontSize: 15,
      fontWeight: '600',
    },
  });
}
