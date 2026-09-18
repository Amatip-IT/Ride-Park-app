import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';

export function SplashScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  return (
    <View style={styles.container}>
      {/* Splash screen background */}
    </View>
  );
}

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
