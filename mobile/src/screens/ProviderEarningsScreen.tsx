import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { COLORS } from '@/constants/theme';

export function ProviderEarningsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Provider Earnings (To be built)</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deepNavy,
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: COLORS.cloudWhite,
    fontSize: 18,
  },
});
