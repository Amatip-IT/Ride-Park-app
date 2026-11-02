import { useMemo } from 'react';
import { ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

export function useThemedStyles<T extends Record<string, unknown>>(
  factory: (colors: ThemeColors) => T,
): { colors: ThemeColors; styles: T } {
  const colors = useThemeColors();
  const styles = useMemo(() => factory(colors), [colors, factory]);
  return { colors, styles };
}
