import type { ReactNode } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeContext';
import { fontSize, fontWeight } from '../theme/tokens';

type Variant = 'display' | 'title' | 'heading' | 'subheading' | 'section' | 'body' | 'bodyStrong' | 'caption' | 'small' | 'tiny';
type Tone = 'default' | 'secondary' | 'muted' | 'primary' | 'error' | 'inverse';

type Props = {
  children: ReactNode;
  variant?: Variant;
  tone?: Tone;
  numberOfLines?: number;
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
};

const variantStyles: Record<Variant, TextStyle> = {
  display: { fontSize: fontSize.display, fontWeight: fontWeight.semibold, letterSpacing: -0.6 },
  title: { fontSize: fontSize.title, fontWeight: fontWeight.extrabold },
  heading: { fontSize: fontSize.heading, fontWeight: fontWeight.extrabold },
  subheading: { fontSize: fontSize.subheading, fontWeight: fontWeight.bold },
  section: { fontSize: 14, fontWeight: fontWeight.extrabold },
  body: { fontSize: fontSize.body, fontWeight: fontWeight.regular },
  bodyStrong: { fontSize: fontSize.body, fontWeight: fontWeight.bold },
  caption: { fontSize: fontSize.caption, fontWeight: fontWeight.regular },
  small: { fontSize: fontSize.small, fontWeight: fontWeight.regular },
  tiny: { fontSize: fontSize.tiny, fontWeight: fontWeight.extrabold },
};

/** Theme-aware text. Replaces one-off `fontSize`/`fontWeight`/color literals. */
export function AppText({
  children,
  variant = 'body',
  tone = 'default',
  numberOfLines,
  selectable,
  style,
}: Props) {
  const { colors } = useTheme();
  const color =
    tone === 'secondary' ? colors.textSecondary
      : tone === 'muted' ? colors.textMuted
        : tone === 'primary' ? colors.primary
          : tone === 'error' ? colors.error
            : tone === 'inverse' ? colors.primaryText
              : colors.text;

  return (
    <Text numberOfLines={numberOfLines} selectable={selectable} style={[variantStyles[variant], { color }, style]}>
      {children}
    </Text>
  );
}
