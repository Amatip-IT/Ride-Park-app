import React, { useState, useCallback, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Image } from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '@/navigation/RootNavigator';
import { SPACING, FONT_SIZES, BORDER_RADIUS, ThemeColors } from '@/constants/theme';
import { useThemeColors } from '@/hooks/useThemeColors';
import { useAuthStore } from '@/store/authStore';
import { secureStorage } from '@/utils/secureStorage';

type NavigationProp = NativeStackNavigationProp<RootStackParamList, 'Onboarding'>;

export function OnboardingScreen() {
  const colors = useThemeColors();
  const styles = useMemo(() => makeStyles(colors), [colors]);
  const navigation = useNavigation<NavigationProp>();
  const { setIsOnboarded } = useAuthStore();
  const [showProviderOptions, setShowProviderOptions] = useState(false);

  useFocusEffect(
    useCallback(() => {
      setShowProviderOptions(false);
    }, []),
  );

  const navigateToAuth = async (
    isLogin: boolean,
    role: 'user' | 'parking_provider' | 'driver' | 'taxi_driver' = 'user',
  ) => {
    try {
      // Mark as onboarded
      await secureStorage.setItem('onboarded', 'true');
      setIsOnboarded(true);
      // Always pass an explicit role so React Navigation does not keep a stale provider role
      navigation.navigate('Auth', { isLogin, role }, { merge: false });
    } catch (error) {
      console.log('Error marking onboarding complete:', error);
      navigation.navigate('Auth', { isLogin, role }, { merge: false });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {/* Header Section */}
        <View style={styles.header}>
          <Image
            source={require('../../assets/images/logo.jpg')}
            style={styles.logoImage}
            resizeMode="contain"
          />
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
              onPress={() => navigateToAuth(true, 'user')}
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
              <Text style={styles.providerButtonText}>Register as Park Owner</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.providerButton]}
              onPress={() => navigateToAuth(false, 'driver')}
            >
              <Text style={styles.providerButtonText}>Register as Driver</Text>
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

const makeStyles = (colors: ThemeColors) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
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
  logoImage: {
    width: 260,
    height: 100,
    marginBottom: SPACING.lg,
  },
  subtitle: {
    fontSize: FONT_SIZES.body,
    color: colors.textSecondary,
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
    color: colors.textPrimary,
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
    backgroundColor: colors.electricTeal,
  },
  primaryButtonText: {
    color: '#FFF',
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: colors.electricTeal,
  },
  secondaryButtonText: {
    color: colors.electricTeal,
    fontSize: FONT_SIZES.body,
    fontWeight: '700',
  },
  providerButton: {
    backgroundColor: colors.surfaceAlt,
  },
  providerButtonText: {
    color: colors.textPrimary,
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
  loginContainer: {
    marginTop: SPACING.lg,
    alignItems: 'center',
  },
  loginText: {
    color: colors.textSecondary,
    fontSize: FONT_SIZES.body,
  },
  loginLink: {
    color: colors.electricTeal,
    fontWeight: '600',
  },
  backButton: {
    marginTop: SPACING.lg,
    alignItems: 'center',
    padding: SPACING.sm,
  },
  backButtonText: {
    color: colors.textSecondary,
    fontSize: FONT_SIZES.body,
    fontWeight: '600',
  },
});
