import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { radius, spacing } from '../theme/tokens';

type Props = {
  children: ReactNode;
  /** Inner padding. Defaults to `lg` (16). */
  padding?: keyof typeof spacing;
  /** Corner radius. Defaults to `xl` (18). */
  radiusKey?: keyof typeof radius;
  /** Call-site spacing only; shape belongs to the component. */
  style?: StyleProp<ViewStyle>;
};

/**
 * Standard surface card: themed background + border, shared radius/padding.
 * Replaces the `surface`/`cardBorder`/`borderRadius: 18` blocks repeated
 * across every settings and list screen.
 */
export function AppCard({ children, padding = 'lg', radiusKey = 'xl', style }: Props) {
  const { colors } = useTheme();

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.surface,
          borderColor: colors.cardBorder,
          borderRadius: radius[radiusKey],
          padding: spacing[padding],
        },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1 },
});
