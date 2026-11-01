import { searchApi } from '@/api';
import { estimateDurationMinutes, haversineDistanceMiles } from '@/utils/helpers';

export type LatLng = { lat: number; lng: number };

export type RouteDetails = {
  coordinates: LatLng[];
  distanceMeters: number | null;
  durationSeconds: number | null;
};

const EARTH_RADIUS_M = 6371000;
const toRad = (deg: number) => (deg * Math.PI) / 180;
const toDeg = (rad: number) => (rad * 180) / Math.PI;

function isValidPoint(p?: LatLng | null): p is LatLng {
  return !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !!p.lat && !!p.lng;
}

async function fetchFromOsrm(from: LatLng, to: LatLng): Promise<RouteDetails | null> {
  try {
    const url =
      `https://router.project-osrm.org/route/v1/driving/` +
      `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (data?.code === 'Ok' && route?.geometry?.coordinates?.length) {
      return {
        coordinates: route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => ({ lat, lng }),
        ),
        distanceMeters: route.distance ?? null,
        durationSeconds: route.duration ?? null,
      };
    }
  } catch {
    // fall through
  }
  return null;
}

/**
 * Driving route with distance and duration. Uses the backend (Amazon Location Routes),
 * then the public OSRM router, then a straight line.
 */
export async function fetchRouteDetails(from: LatLng, to: LatLng): Promise<RouteDetails> {
  if (!isValidPoint(from) || !isValidPoint(to)) {
    return { coordinates: [], distanceMeters: null, durationSeconds: null };
  }

  try {
    const res = await searchApi.getRoute(from, to);
    const route = res.data?.success ? res.data.data : null;
    if (route?.coordinates?.length >= 2) {
      return {
        coordinates: route.coordinates,
        distanceMeters: route.distanceMeters ?? null,
        durationSeconds: route.durationSeconds ?? null,
      };
    }
  } catch {
    // backend unreachable or signed out — try OSRM directly
  }

  return (
    (await fetchFromOsrm(from, to)) || {
      coordinates: [from, to],
      distanceMeters: null,
      durationSeconds: null,
    }
  );
}

/** Driving route polyline only. */
export async function fetchDrivingRoute(from: LatLng, to: LatLng): Promise<LatLng[]> {
  return (await fetchRouteDetails(from, to)).coordinates;
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

export function distanceMeters(a: LatLng, b: LatLng): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

/** Compass bearing in degrees (0 = north) from a to b. */
export function bearingBetween(a: LatLng, b: LatLng): number {
  const y = Math.sin(toRad(b.lng - a.lng)) * Math.cos(toRad(b.lat));
  const x =
    Math.cos(toRad(a.lat)) * Math.sin(toRad(b.lat)) -
    Math.sin(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.cos(toRad(b.lng - a.lng));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

/** Closest point on the route to `point`, with the segment index it falls on. */
export function projectOntoRoute(
  route: LatLng[],
  point: LatLng,
): { point: LatLng; segmentIndex: number; distanceMeters: number } | null {
  if (route.length < 2) return null;

  // Equirectangular projection around the point is accurate to a few cm at city scale
  const cosLat = Math.cos(toRad(point.lat));
  const toXY = (p: LatLng) => ({
    x: toRad(p.lng - point.lng) * cosLat * EARTH_RADIUS_M,
    y: toRad(p.lat - point.lat) * EARTH_RADIUS_M,
  });

  let best: { point: LatLng; segmentIndex: number; distanceMeters: number } | null = null;

  for (let i = 0; i < route.length - 1; i++) {
    const a = toXY(route[i]);
    const b = toXY(route[i + 1]);
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, -(a.x * dx + a.y * dy) / lenSq));
    const px = a.x + t * dx;
    const py = a.y + t * dy;
    const dist = Math.sqrt(px * px + py * py);

    if (!best || dist < best.distanceMeters) {
      best = {
        point: {
          lat: route[i].lat + t * (route[i + 1].lat - route[i].lat),
          lng: route[i].lng + t * (route[i + 1].lng - route[i].lng),
        },
        segmentIndex: i,
        distanceMeters: dist,
      };
    }
  }

  return best;
}

/** The part of the route still ahead of `point` (starts at the point's projection). */
export function remainingRoute(route: LatLng[], point: LatLng): LatLng[] {
  const projection = projectOntoRoute(route, point);
  if (!projection) return route;
  return [projection.point, ...route.slice(projection.segmentIndex + 1)];
}

export function routeLengthMeters(route: LatLng[]): number {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += distanceMeters(route[i], route[i + 1]);
  }
  return total;
}

export function formatDistance(meters: number): string {
  const miles = meters / 1609.344;
  if (miles < 0.1) return `${Math.round(meters * 3.28084)} ft`;
  return `${miles.toFixed(miles < 10 ? 1 : 0)} mi`;
}
