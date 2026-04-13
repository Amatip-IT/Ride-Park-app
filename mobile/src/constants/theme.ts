// Color Palette - Clean White Theme
export const COLORS = {
  // Primary
  deepNavy: '#1A1A2E',        // Dark text / accents
  electricTeal: '#00B4A0',    // Primary action color
  cloudWhite: '#F5F8FF',      // Text on dark backgrounds
  steelBlue: '#1A3C6E',       // Dark header accents

  // Light Theme Backgrounds
  background: '#FFFFFF',       // Main white background
  surface: '#F7F8FA',         // Card / section backgrounds
  surfaceAlt: '#ECEEF2',      // Alternate surfaces (search bar, etc.)

  // Text Colors
  textPrimary: '#1A1A2E',     // Main text (dark)
  textSecondary: '#64748B',   // Secondary / muted text
  textTertiary: '#94A3B8',    // Hint / placeholder text

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
