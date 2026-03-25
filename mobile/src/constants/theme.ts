// Color Palette - Per Design Spec
export const COLORS = {
  // Primary
  deepNavy: '#0D1B2A',
  electricTeal: '#00C2A8',
  cloudWhite: '#F5F8FF',
  steelBlue: '#1A3C6E',

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
};

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
