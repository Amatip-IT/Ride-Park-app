// Color Palette - Light Theme
export const LIGHT_COLORS = {
  // Primary
  deepNavy: '#1A1A2E',
  electricTeal: '#00B4A0',
  cloudWhite: '#F5F8FF',
  steelBlue: '#1A3C6E',

  // Light Theme Backgrounds
  background: '#FFFFFF',
  surface: '#F7F8FA',
  surfaceAlt: '#ECEEF2',

  // Text Colors
  textPrimary: '#1A1A2E',
  textSecondary: '#64748B',
  textTertiary: '#94A3B8',

  // Secondary
  softSlate: '#8899BB',
  amber: '#F39C12',
  coralRed: '#E74C3C',

  // Utility
  success: '#10B981',
  warning: '#F39C12',
  error: '#E74C3C',
  info: '#3B82F6',
  placeholder: '#9CA3AF',
  border: '#E5E7EB',
  divider: '#F1F3F5',
};

// Color Palette - Dark Theme
export const DARK_COLORS = {
  deepNavy: '#F5F8FF',
  electricTeal: '#00C2A8',
  cloudWhite: '#1A1A2E',
  steelBlue: '#7EB8FF',

  background: '#0D1B2A',
  surface: '#1B2838',
  surfaceAlt: '#243447',

  textPrimary: '#F1F5F9',
  textSecondary: '#94A3B8',
  textTertiary: '#64748B',

  softSlate: '#8899BB',
  amber: '#F39C12',
  coralRed: '#E74C3C',

  success: '#10B981',
  warning: '#F39C12',
  error: '#E74C3C',
  info: '#60A5FA',
  placeholder: '#64748B',
  border: '#2D3F54',
  divider: '#1E2D3D',
};

export type ThemeColors = typeof LIGHT_COLORS;

/** @deprecated Use useThemeColors() for theme-aware colors */
export const COLORS = LIGHT_COLORS;

export function getThemeColors(isDarkMode: boolean): ThemeColors {
  return isDarkMode ? DARK_COLORS : LIGHT_COLORS;
}

// Spacing scale
export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  '2xl': 32,
  '3xl': 48,
};

// Border radius
export const BORDER_RADIUS = {
  none: 0,
  sm: 4,
  md: 8,
  lg: 12,
  xl: 16,
  full: 999,
};

// Typography sizes
export const FONT_SIZES = {
  hero: 32,
  section: 22,
  body: 16,
  label: 14,
  small: 12,
};

export const FONT_WEIGHTS = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

// Common spacing shortcuts
export const marginHelpers = {
  container: SPACING.lg,
  section: SPACING.xl,
  card: SPACING.md,
};
