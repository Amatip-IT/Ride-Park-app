import { useEffect, useState } from 'react';
import * as Location from 'expo-location';

export type BiasPosition = { lat: number; lng: number };

/**
 * Resolves the user's current coordinates for biasing place search and nearby matching.
 */
export function useLocationBias() {
  const [biasPosition, setBiasPosition] = useState<BiasPosition | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted' || cancelled) return;

        const lastKnown = await Location.getLastKnownPositionAsync();
        if (!cancelled && lastKnown) {
          setBiasPosition({
            lat: lastKnown.coords.latitude,
            lng: lastKnown.coords.longitude,
          });
        }

        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.High,
        });

        if (!cancelled) {
          setBiasPosition({
            lat: location.coords.latitude,
            lng: location.coords.longitude,
          });
        }
      } catch {
        // Bias is optional — search still works without it.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return biasPosition;
}
