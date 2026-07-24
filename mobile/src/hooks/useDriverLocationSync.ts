import { useEffect } from 'react';
import { providerApi } from '@/api';
import { getCurrentCoords } from '@/utils/helpers';

/**
 * Keeps a driver's live GPS on the server while they are online.
 */
export function useDriverLocationSync(enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;

    const sync = async () => {
      const coords = await getCurrentCoords();
      if (!coords) return;
      try {
        await providerApi.updateLocation(coords.lat, coords.lng);
      } catch {
        // Location sync is best-effort.
      }
    };

    sync();
    const interval = setInterval(sync, 30000);
    return () => clearInterval(interval);
  }, [enabled]);
}
