import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StripeProvider } from '@stripe/stripe-react-native';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';
import { useUIStore } from '@/store/index';
import { usePushNotifications } from '@/hooks/usePushNotifications';

SplashScreen.preventAutoHideAsync();

const STRIPE_PUBLISHABLE_KEY =
  process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY || '';

function AppContent() {
  const { isAuthenticated } = useAuthStore();
  const isDarkMode = useUIStore((s) => s.isDarkMode);
  usePushNotifications(isAuthenticated);

  return (
    <>
      <StatusBar style={isDarkMode ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
}

export default function App() {
  const { restoreToken, isLoading } = useAuthStore();
  const hydrateDarkMode = useUIStore((s) => s.hydrateDarkMode);

  useEffect(() => {
    restoreToken();
    hydrateDarkMode();
  }, [restoreToken, hydrateDarkMode]);

  useEffect(() => {
    if (!isLoading) {
      SplashScreen.hideAsync();
    }
  }, [isLoading]);

  if (isLoading) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StripeProvider publishableKey={STRIPE_PUBLISHABLE_KEY}>
        <AppContent />
      </StripeProvider>
    </GestureHandlerRootView>
  );
}
