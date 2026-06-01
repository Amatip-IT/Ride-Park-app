import { estimateDurationMinutes, haversineDistanceMiles } from '@/utils/helpers';

export type LatLng = { lat: number; lng: number };

/** Fetch driving route polyline via OSRM (public). Falls back to straight line. */
export async function fetchDrivingRoute(
  from: LatLng,
  to: LatLng,
): Promise<LatLng[]> {
  if (!from.lat || !from.lng || !to.lat || !to.lng) {
    return [];
  }

  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;

    const res = await fetch(url);
    const data = await res.json();

    if (data?.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates?.length) {
      return data.routes[0].geometry.coordinates.map(
        ([lng, lat]: [number, number]) => ({ lat, lng }),
      );
    }
  } catch {
    // fall through to straight line
  }

  return [from, to];
}

/** ETA in minutes from driver position to a target, using road-speed estimate */
export function computeLiveEtaMinutes(
  driver: LatLng,
  target: LatLng,
): number {
  const miles = haversineDistanceMiles(driver.lat, driver.lng, target.lat, target.lng);
  return Math.max(1, estimateDurationMinutes(miles));
}

/** Resolve map route endpoints for a trip leg */
export function getRouteEndpoints(
  pickup?: LatLng | null,
  destination?: LatLng | null,
  driver?: LatLng | null,
  status?: string,
): { from: LatLng; to: LatLng } | null {
  if (!pickup?.lat || !destination?.lat) return null;

  if (status === 'in_progress' && driver?.lat) {
    return { from: driver, to: destination };
  }
  if (
    (status === 'accepted' || status === 'arrived') &&
    driver?.lat &&
    pickup.lat
  ) {
    return { from: driver, to: pickup };
  }
  return { from: pickup, to: destination };
}
