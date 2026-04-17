import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';
import { usePushNotifications } from '@/hooks/usePushNotifications';
import { AnimatedSplashScreen } from '@/screens/AnimatedSplashScreen';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function App() {
  // const [fontsLoaded] = useFonts({
  //   SpaceMono: require('./assets/fonts/SpaceMono-Regular.ttf'),
  // });
  const fontsLoaded = true; // Temporarily skip font loading

  const [isAppReady, setIsAppReady] = React.useState(false);
  const [isSplashAnimationComplete, setAnimationComplete] = React.useState(false);

  const { restoreToken, isAuthenticated } = useAuthStore();

  // Initialize push notifications securely when user logs in
  usePushNotifications(isAuthenticated);

  useEffect(() => {
    async function prepare() {
      try {
        // Restore token from secure storage
        await restoreToken();
      } catch (e) {
        console.warn(e);
      } finally {
        // App is ready but don't hide splash async here if AnimatedSplashScreen handles it
        setIsAppReady(true);
      }
    }

    prepare();
  }, []);

  // Wait until fonts are loaded before rendering
  if (!fontsLoaded || !isAppReady) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      {!isSplashAnimationComplete ? (
        <AnimatedSplashScreen onAnimationComplete={() => setAnimationComplete(true)} />
      ) : (
        <RootNavigator />
      )}
    </GestureHandlerRootView>
  );
}
