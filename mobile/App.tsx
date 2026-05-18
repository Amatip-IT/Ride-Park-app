import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { RootNavigator } from '@/navigation/RootNavigator';
import { useAuthStore } from '@/store/authStore';

// Keep the splash screen visible while we fetch resources
SplashScreen.preventAutoHideAsync();

export default function App() {
  // const [fontsLoaded] = useFonts({
  //   SpaceMono: require('./assets/fonts/SpaceMono-Regular.ttf'),
  // });
  const fontsLoaded = true; // Temporarily skip font loading

  const { restoreToken } = useAuthStore();

  useEffect(() => {
    async function prepare() {
      try {
        // Restore token from secure storage
        await restoreToken();
      } catch (e) {
        console.warn(e);
      } finally {
        // Tell the splash screen to hide after we've prepared the app
        SplashScreen.hideAsync();
      }
    }

    prepare();
  }, []);

  // Wait until fonts are loaded before rendering
  if (!fontsLoaded) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <StatusBar style="light" />
      <RootNavigator />
    </GestureHandlerRootView>
  );
}
