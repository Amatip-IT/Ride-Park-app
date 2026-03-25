import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { COLORS, SPACING, FONT_SIZES, BORDER_RADIUS } from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen() {
  const navigation = useNavigation<NavigationProp>();
  const [showProviderOptions, setShowProviderOptions] = useState(false);

  const navigateToAuth = (isLogin: boolean, role?: 'user' | 'parking_provider' | 'driver' | 'taxi_driver') => {
    navigation.navigate('Auth', { isLogin, role });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header Section */}
        <View style={styles.header}>
          <Text style={styles.logoText}>Ride & Park</Text>
          <Text style={styles.subtitle}>Your all-in-one app for parking, professional drivers, and taxi rides.</Text>
        </View>

        {/* Action Buttons */}
        {!showProviderOptions ? (
          <View style={styles.actionsContainer}>
            <TouchableOpacity 
              style={[styles.button, styles.primaryButton]} 
              onPress={() => navigateToAuth(false, 'user')}
            >
              <Text style={styles.primaryButtonText}>Sign Up as General User</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.secondaryButton]} 
              onPress={() => setShowProviderOptions(true)}
            >
              <Text style={styles.secondaryButtonText}>Become a Provider</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.loginContainer} 
              onPress={() => navigateToAuth(true)}
            >
              <Text style={styles.loginText}>Already have an account? <Text style={styles.loginLink}>Log In</Text></Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.actionsContainer}>
            <Text style={styles.sectionTitle}>Choose Provider Type</Text>
            
            <TouchableOpacity 
              style={[styles.button, styles.providerButton]} 
              onPress={() => navigateToAuth(false, 'parking_provider')}
            >
              <Text style={styles.providerButtonText}>Register Parking Space</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.providerButton]} 
              onPress={() => navigateToAuth(false, 'driver')}
            >
              <Text style={styles.providerButtonText}>Register as Driver (Hire)</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={[styles.button, styles.providerButton]} 
              onPress={() => navigateToAuth(false, 'taxi_driver')}
            >
              <Text style={styles.providerButtonText}>Register as Taxi Driver</Text>
            </TouchableOpacity>

            <TouchableOpacity 
              style={styles.backButton} 
              onPress={() => setShowProviderOptions(false)}
            >
              <Text style={styles.backButtonText}>← Back</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.deepNavy,
  },
  content: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'space-between',
  },
  header: {
    marginTop: SPACING['3xl'],
    alignItems: 'center',
  },
  logoText: {
    fontSize: FONT_SIZES.hero,
    fontWeight: '800',
    color: COLORS.electricTeal,
    marginBottom: SPACING.md,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: COLORS.softSlate,
    textAlign: 'center',
    lineHeight: 24,
    paddingHorizontal: SPACING.lg,
  },
  actionsContainer: {
    width: '100%',
    paddingBottom: SPACING['3xl'],
  },
  sectionTitle: {
    fontSize: FONT_SIZES.section,
    color: COLORS.cloudWhite,
    fontWeight: '600',
    marginBottom: SPACING.xl,
    textAlign: 'center',
  },
  button: {
    width: '100%',
    padding: SPACING.lg,
    borderRadius: BORDER_RADIUS.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  primaryButton: {
    backgroundColor: COLORS.electricTeal,
  },
  primaryButtonText: {
    color: COLORS.deepNavy,
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: COLORS.electricTeal,
  },
  secondaryButtonText: {
    color: COLORS.electricTeal,
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
  },
  providerButton: {
    backgroundColor: COLORS.steelBlue,
  },
  providerButtonText: {
    color: COLORS.cloudWhite,
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
  loginContainer: {
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  loginText: {
    color: COLORS.softSlate,
    fontSize: FONT_SIZES.body,
  },
  loginLink: {
    color: COLORS.electricTeal,
    fontWeight: '600',
  },
  backButton: {
    marginTop: SPACING.lg,
    alignItems: 'center',
    padding: SPACING.sm,
  },
  backButtonText: {
    color: COLORS.softSlate,
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
});
