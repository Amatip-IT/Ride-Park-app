import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type LatLng = { lat: number; lng: number };

export interface DrivingRoute {
  coordinates: LatLng[];
  distanceMeters: number | null;
  durationSeconds: number | null;
  provider: 'amazon' | 'osrm' | 'straight';
}

export interface RouteLeg {
  distanceMeters: number;
  durationSeconds: number;
  /** false = straight-line estimate because no road route was available. */
  roadRoute: boolean;
}

const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;
/** Straight-line → road distance factor and urban speed used only when routing fails. */
const ROAD_FACTOR = 1.3;
const FALLBACK_SPEED_MPS = 25 * 0.44704;
const MAX_MATRIX_ORIGINS = 50;

export function straightLineMeters(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function estimatedLeg(a: LatLng, b: LatLng): RouteLeg {
  const distanceMeters = Math.round(straightLineMeters(a, b) * ROAD_FACTOR);
  return {
    distanceMeters,
    durationSeconds: Math.round(distanceMeters / FALLBACK_SPEED_MPS),
    roadRoute: false,
  };
}

export function isValidLatLng(p?: Partial<LatLng> | null): p is LatLng {
  return (
    !!p &&
    typeof p.lat === 'number' &&
    typeof p.lng === 'number' &&
    Number.isFinite(p.lat) &&
    Number.isFinite(p.lng) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    !(p.lat === 0 && p.lng === 0)
  );
}

@Injectable()
export class RoutesService {
  private readonly logger = new Logger(RoutesService.name);
  private readonly apiKey: string;
  private readonly region: string;
  private readonly cache = new Map<
    string,
    { expiresAt: number; route: DrivingRoute }
  >();

  constructor(configService: ConfigService) {
    this.apiKey = configService.get<string>('AWS_LOCATION_KEY') || '';
    this.region =
      configService.get<string>('AWS_LOCATION_REGION') ||
      configService.get<string>('AWS_REGION') ||
      'us-east-1';

    if (!this.apiKey) {
      this.logger.warn(
        'AWS_LOCATION_KEY is not set — routes fall back to the public OSRM router',
      );
    }
  }

  async getDrivingRoute(from: LatLng, to: LatLng): Promise<DrivingRoute> {
    // ~11 m grid so a moving car re-uses the same cached route between GPS ticks
    const key = [from.lat, from.lng, to.lat, to.lng]
      .map((n) => n.toFixed(4))
      .join(',');
    const cached = this.cache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.route;

    const route =
      (this.apiKey ? await this.fromAmazon(from, to) : null) ||
      (await this.fromOsrm(from, to)) || {
        coordinates: [from, to],
        distanceMeters: null,
        durationSeconds: null,
        provider: 'straight' as const,
      };

    if (this.cache.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.cache.keys().next().value;
      if (oldest) this.cache.delete(oldest);
    }
    this.cache.set(key, { expiresAt: Date.now() + CACHE_TTL_MS, route });
    return route;
  }

  /** Road distance + time for one leg, falling back to a straight-line estimate. */
  async getLeg(from: LatLng, to: LatLng): Promise<RouteLeg> {
    const route = await this.getDrivingRoute(from, to);
    if (route.provider !== 'straight' && route.distanceMeters != null) {
      return {
        distanceMeters: Math.round(route.distanceMeters),
        durationSeconds: Math.round(
          route.durationSeconds ?? route.distanceMeters / FALLBACK_SPEED_MPS,
        ),
        roadRoute: true,
      };
    }
    return estimatedLeg(from, to);
  }

  /**
   * Road distance/time from many origins (e.g. drivers) to one destination (pickup)
   * in a single CalculateRouteMatrix call. Entries the service can't route fall back
   * to a straight-line estimate, flagged with roadRoute=false.
   */
  async getMatrixToDestination(
    origins: LatLng[],
    destination: LatLng,
  ): Promise<RouteLeg[]> {
    const fallback = origins.map((o) => estimatedLeg(o, destination));
    if (!this.apiKey || origins.length === 0) return fallback;

    const results = [...fallback];
    for (let start = 0; start < origins.length; start += MAX_MATRIX_ORIGINS) {
      const batch = origins.slice(start, start + MAX_MATRIX_ORIGINS);
      try {
        const res = await fetch(
          `https://routes.geo.${this.region}.amazonaws.com/v2/route-matrix?key=${encodeURIComponent(this.apiKey)}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              Origins: batch.map((o) => ({ Position: [o.lng, o.lat] })),
              Destinations: [{ Position: [destination.lng, destination.lat] }],
              TravelMode: 'Car',
              RoutingBoundary: { Unbounded: true },
            }),
          },
        );
        if (!res.ok) {
          this.logger.warn(
            `Amazon Location CalculateRouteMatrix returned ${res.status}: ${(await res.text()).slice(0, 300)}`,
          );
          continue;
        }
        const data: any = await res.json();
        batch.forEach((_, i) => {
          const cell = data?.RouteMatrix?.[i]?.[0];
          if (cell && !cell.Error && typeof cell.Distance === 'number') {
            results[start + i] = {
              distanceMeters: Math.round(cell.Distance),
              durationSeconds: Math.round(cell.Duration ?? cell.Distance / FALLBACK_SPEED_MPS),
              roadRoute: true,
            };
          }
        });
      } catch (error) {
        this.logger.warn(
          `Amazon Location CalculateRouteMatrix failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }
    return results;
  }

  /** Amazon Location Routes v2 CalculateRoutes (Car, Core pricing bucket). */
  private async fromAmazon(
    from: LatLng,
    to: LatLng,
  ): Promise<DrivingRoute | null> {
    try {
      const res = await fetch(
        `https://routes.geo.${this.region}.amazonaws.com/v2/routes?key=${encodeURIComponent(this.apiKey)}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            Origin: [from.lng, from.lat],
            Destination: [to.lng, to.lat],
            TravelMode: 'Car',
            LegGeometryFormat: 'Simple',
          }),
        },
      );

      if (!res.ok) {
        this.logger.warn(
          `Amazon Location CalculateRoutes returned ${res.status}: ${(await res.text()).slice(0, 300)}`,
        );
        return null;
      }

      const data: any = await res.json();
      const route = data?.Routes?.[0];
      const coordinates: LatLng[] = (route?.Legs || []).flatMap((leg: any) =>
        (leg?.Geometry?.LineString || []).map(([lng, lat]: [number, number]) => ({
          lat,
          lng,
        })),
      );
      if (coordinates.length < 2) return null;

      return {
        coordinates,
        distanceMeters:
          typeof route.Summary?.Distance === 'number'
            ? route.Summary.Distance
            : null,
        durationSeconds:
          typeof route.Summary?.Duration === 'number'
            ? route.Summary.Duration
            : null,
        provider: 'amazon',
      };
    } catch (error) {
      this.logger.warn(
        `Amazon Location CalculateRoutes failed: ${error instanceof Error ? error.message : error}`,
      );
      return null;
    }
  }

  private async fromOsrm(
    from: LatLng,
    to: LatLng,
  ): Promise<DrivingRoute | null> {
    try {
      const url =
        `https://router.project-osrm.org/route/v1/driving/` +
        `${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
      const res = await fetch(url);
      const data: any = await res.json();
      const route = data?.routes?.[0];
      if (data?.code !== 'Ok' || !route?.geometry?.coordinates?.length) {
        return null;
      }
      return {
        coordinates: route.geometry.coordinates.map(
          ([lng, lat]: [number, number]) => ({ lat, lng }),
        ),
        distanceMeters: route.distance ?? null,
        durationSeconds: route.duration ?? null,
        provider: 'osrm',
      };
    } catch {
      return null;
    }
  }
}
