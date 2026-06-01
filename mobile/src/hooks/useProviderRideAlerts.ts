import { useState, useRef, useCallback } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
import { taxiBookingsApi } from '@/api';

/**
 * Polls available taxi ride requests while the driver is online.
 * Triggers haptic feedback when new requests appear.
 */
export function useProviderRideAlerts(enabled: boolean, pollIntervalMs = 15000) {
  const [availableCount, setAvailableCount] = useState(0);
  const previousCountRef = useRef(0);

  const refresh = useCallback(async () => {
    if (!enabled) {
      setAvailableCount(0);
      previousCountRef.current = 0;
      return;
    }
    try {
      const res = await taxiBookingsApi.getAvailable();
      const next = res.data?.success ? (res.data.data?.length ?? 0) : 0;

      if (next > previousCountRef.current && previousCountRef.current > 0) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      }
      previousCountRef.current = next;
      setAvailableCount(next);
    } catch {
      // silent — screens handle fetch errors separately
    }
  }, [enabled]);

  useFocusEffect(
    useCallback(() => {
      if (!enabled) return undefined;

      refresh();
      const id = setInterval(refresh, pollIntervalMs);
      return () => clearInterval(id);
    }, [enabled, pollIntervalMs, refresh]),
  );

  return { availableCount, refresh };
}
