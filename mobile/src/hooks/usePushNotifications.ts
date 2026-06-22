import React, { useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { usersApi } from '@/api';
import { handleNotificationNavigation } from '@/utils/notificationRouting';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

function routeFromNotificationResponse(response: Notifications.NotificationResponse | null) {
  if (!response) return;
  const content = response.notification.request.content;
  const data = (content.data || {}) as Record<string, any>;
  const type = (data.type as string) || undefined;
  handleNotificationNavigation(type, data);
}

export function usePushNotifications(isAuthenticated: boolean) {
  const notificationListener = useRef<Notifications.Subscription | null>(null);
  const responseListener = useRef<Notifications.Subscription | null>(null);

  useEffect(() => {
    if (!isAuthenticated) return;

    registerForPushNotificationsAsync().then((token) => {
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

async function registerForPushNotificationsAsync() {
  let token;

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
