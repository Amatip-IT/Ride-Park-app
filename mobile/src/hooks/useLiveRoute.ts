import { useEffect, useMemo, useRef, useState } from 'react';
import {
  fetchRouteDetails,
  LatLng,
  projectOntoRoute,
  remainingRoute,
  routeLengthMeters,
  RouteDetails,
} from '@/utils/routing';

/** Re-route when the moving origin drifts this far from the drawn line. */
const OFF_ROUTE_METERS = 60;
/** Never re-fetch more often than this, even when off route. */
const MIN_REFETCH_MS = 10_000;
/** Refresh the route (and its ETA) at least this often while moving. */
const MAX_ROUTE_AGE_MS = 90_000;

/**
 * Driving route from a (possibly moving) origin to a target. The route is fetched
 * once per leg and trimmed locally as the origin moves, so the line shrinks behind
 * the car without a network call on every GPS tick.
 *
 * @param legKey change this to force a fresh route (e.g. trip status changed)
 * @param movingOrigin trim the line to the origin's position and re-route when it goes off route
 */
export function useLiveRoute(
  from: LatLng | null,
  to: LatLng | null,
  legKey: string,
  movingOrigin: boolean,
) {
  const [route, setRoute] = useState<RouteDetails | null>(null);
  const lastFetchRef = useRef<{ at: number; key: string } | null>(null);
  const inFlightRef = useRef(false);

  const key = from && to ? `${legKey}:${to.lat},${to.lng}` : '';

  useEffect(() => {
    if (!from || !to) {
      setRoute(null);
      lastFetchRef.current = null;
      return;
    }

    const now = Date.now();
    const last = lastFetchRef.current;
    const legChanged = !last || last.key !== key;

    let needsFetch = legChanged;
    if (!needsFetch && movingOrigin && route?.coordinates.length) {
      const age = now - last!.at;
      const offRoute =
        (projectOntoRoute(route.coordinates, from)?.distanceMeters ?? 0) > OFF_ROUTE_METERS;
      needsFetch = age >= MAX_ROUTE_AGE_MS || (offRoute && age >= MIN_REFETCH_MS);
    }
    if (!needsFetch || (inFlightRef.current && !legChanged)) return;

    inFlightRef.current = true;
    lastFetchRef.current = { at: now, key };
    if (legChanged) setRoute(null);

    fetchRouteDetails(from, to)
      .then((details) => {
        // A newer leg may have started while this request was in flight
        if (lastFetchRef.current?.key === key) setRoute(details);
      })
      .finally(() => {
        inFlightRef.current = false;
      });
  }, [key, from?.lat, from?.lng]);

  const coordinates = useMemo<LatLng[]>(() => {
    const coords = route?.coordinates || [];
    if (movingOrigin && from && coords.length >= 2) {
      return remainingRoute(coords, from);
    }
    return coords;
  }, [route, movingOrigin, from?.lat, from?.lng]);

  const remainingMeters = useMemo(
    () => (coordinates.length >= 2 ? routeLengthMeters(coordinates) : null),
    [coordinates],
  );

  /** Route duration scaled to the distance still ahead. */
  const etaMinutes = useMemo(() => {
    if (!route?.durationSeconds || remainingMeters == null) return null;
    const total = routeLengthMeters(route.coordinates);
    const fraction = total > 0 ? Math.min(1, remainingMeters / total) : 1;
    return Math.max(1, Math.round((route.durationSeconds * fraction) / 60));
  }, [route, remainingMeters]);

  return { coordinates, remainingMeters, etaMinutes };
}
