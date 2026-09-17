import { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { usersApi } from '@/api';
import { isExpoGo } from '@/utils/expoGo';
import { handleNotificationNavigation } from '@/utils/notificationRouting';

type NotificationResponse = {
  notification: { request: { content: { data?: Record<string, unknown> } } };
};

function routeFromNotificationResponse(response: NotificationResponse | null) {
  if (!response) return;
  const data = (response.notification.request.content.data || {}) as Record<string, unknown>;
  const type = typeof data.type === 'string' ? data.type : undefined;
  handleNotificationNavigation(type, data);
}

/**
 * Remote push is not available in Expo Go on Android (SDK 53+).
 * Do not import expo-notifications in Expo Go — the native module throws on load.
 */
export function usePushNotifications(isAuthenticated: boolean) {
  const notificationListener = useRef<{ remove: () => void } | null>(null);
  const responseListener = useRef<{ remove: () => void } | null>(null);

  useEffect(() => {
    if (!isAuthenticated || isExpoGo()) {
      return;
    }

    const Notifications = require('expo-notifications') as typeof import('expo-notifications');
    const Device = require('expo-device') as typeof import('expo-device');

    Notifications.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });

    registerForPushNotificationsAsync(Notifications, Device).then((token) => {
      if (token) {
        try {
          usersApi.updatePushToken(token);
        } catch (e) {
          console.log('Failed to save push token securely:', e);
        }
      }
    });

    notificationListener.current = Notifications.addNotificationReceivedListener((notification) => {
      console.log('Notification Received:', notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener((response) => {
      routeFromNotificationResponse(response);
    });

    Notifications.getLastNotificationResponseAsync().then((response) => {
      if (response) {
        routeFromNotificationResponse(response);
      }
    });

    return () => {
      notificationListener.current?.remove();
      responseListener.current?.remove();
    };
  }, [isAuthenticated]);
}

async function registerForPushNotificationsAsync(
  Notifications: typeof import('expo-notifications'),
  Device: typeof import('expo-device'),
) {
  let token: string | undefined;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  if (Device.isDevice) {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;
    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }
    if (finalStatus !== 'granted') {
      return null;
    }

    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ||
      Constants.easConfig?.projectId ||
      'you-need-to-set-eas-project-id';

    try {
      token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
    } catch (e) {
      console.log('Error getting push token:', e);
    }
  }

  return token;
}
