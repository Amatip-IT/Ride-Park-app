import { useMemo } from 'react';
import { useUIStore } from '@/store/index';
import { getThemeColors, ThemeColors } from '@/constants/theme';

export function useThemeColors(): ThemeColors {
  const isDarkMode = useUIStore((s) => s.isDarkMode);
  return useMemo(() => getThemeColors(isDarkMode), [isDarkMode]);
}
