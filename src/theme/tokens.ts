/**
 * Design tokens for the home-grown UI library (`src/ui`).
 *
 * Single source of truth for spacing, corner radii, type scale, and the
 * decorative icon-tile palette. Structural surfaces and text colors live in
 * `src/theme/colors.ts` so they can adapt to light/dark mode; everything here
 * is theme-independent.
 *
 * Rule of thumb: import from here instead of sprinkling magic numbers or
 * pasted hex values across screens. Prefer `gap` over margins and `padding`
 * over margins when laying out rows and cards.
 */

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export type SpacingKey = keyof typeof spacing;

export const radius = {
  sm: 8,
  md: 12,
  lg: 14,
  xl: 18,
  xxl: 20,
  pill: 999,
} as const;

export type RadiusKey = keyof typeof radius;

export const fontSize = {
  tiny: 10,
  small: 12,
  caption: 13,
  body: 15,
  subheading: 16,
  heading: 18,
  title: 24,
  display: 28,
} as const;

export type FontSizeKey = keyof typeof fontSize;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
  extrabold: '800',
} as const;

/** Standard input height shared by text fields, search fields, and selects. */
export const inputHeight = 50;

/** Dense toolbar height (search fields, filter rows). */
export const inputHeightDense = 44;

/**
 * Decorative icon-tile palette used by settings rows, cards, and list items.
 * These are intentionally static across themes: pastel tiles stay legible on
 * both light and dark surfaces. Structural colors (backgrounds, text,
 * borders) must still come from `useTheme()` colors.
 */
export const iconTiles = {
  blue: { bg: '#eff6ff', fg: '#2563eb' },
  green: { bg: '#ecfdf5', fg: '#059669' },
  orange: { bg: '#fff7ed', fg: '#ea580c' },
  yellow: { bg: '#fefce8', fg: '#ca8a04' },
  pink: { bg: '#fdf2f8', fg: '#db2777' },
  indigo: { bg: '#eef2ff', fg: '#4f46e5' },
  slate: { bg: '#f1f5f9', fg: '#475569' },
  dark: { bg: '#1e293b', fg: '#f1f5f9' },
} as const;

export type IconTileKey = keyof typeof iconTiles;

/**
 * Card shadow that works on the current Expo SDK (legacy shadow props +
 * Android elevation). When the app moves to SDK 57+ with the New Architecture,
 * prefer the CSS `boxShadow` style prop instead.
 */
export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 8,
  shadowOffset: { width: 0, height: 2 },
  elevation: 2,
} as const;
