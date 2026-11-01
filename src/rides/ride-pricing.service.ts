import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { PricingService } from 'src/pricing/pricing.service';
import {
  calculateFare,
  FareBreakdown,
  PricingRules,
  StopForPricing,
  VEHICLE_CATEGORIES,
  VehicleCategory,
  vehicleCategoryFrom,
} from 'src/pricing/fare';
import {
  isValidLatLng,
  LatLng,
  RouteLeg,
  RoutesService,
  straightLineMeters,
} from 'src/search/routes.service';

/** Nearest drivers per category sent to the route matrix when estimating the approach. */
const DRIVERS_PER_CATEGORY = 5;
/** Ignore driver positions older than this when estimating approach distance. */
const MAX_DRIVER_LOCATION_AGE_MS = 15 * 60_000;

export const CATEGORY_RANK: Record<VehicleCategory, number> = { small: 0, medium: 1, large: 2 };

export interface ApproachEstimate extends RouteLeg {
  source: 'nearest_driver' | 'target_driver' | 'none';
  driverUserId?: string;
}

export interface RideQuote {
  trip: RouteLeg;
  approach: Record<VehicleCategory, ApproachEstimate>;
  fares: Record<VehicleCategory, FareBreakdown>;
  rules: PricingRules;
}

/** Recorded GPS distance is accepted within these bounds of the road estimate. */
export function reconcileTripMeters(
  estimatedMeters: number | undefined,
  recordedMeters: number | undefined,
): { billedMeters: number; basis: 'recorded' | 'estimated' | 'clamped' } {
  const est = estimatedMeters && estimatedMeters > 0 ? estimatedMeters : undefined;
  const rec = recordedMeters && recordedMeters >= 100 ? recordedMeters : undefined;
  if (rec == null && est == null) return { billedMeters: 0, basis: 'estimated' };
  if (rec == null) return { billedMeters: Math.round(est!), basis: 'estimated' };
  if (est == null) return { billedMeters: Math.round(rec), basis: 'recorded' };

  // Detours happen, but GPS drift or a stuck tracker must not inflate or zero the fare
  const lower = est * 0.5;
  const upper = est * 1.5 + 3000;
  if (rec < lower) return { billedMeters: Math.round(lower), basis: 'clamped' };
  if (rec > upper) return { billedMeters: Math.round(upper), basis: 'clamped' };
  return { billedMeters: Math.round(rec), basis: 'recorded' };
}

@Injectable()
export class RidePricingService {
  private readonly logger = new Logger(RidePricingService.name);

  constructor(
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    private readonly pricingService: PricingService,
    private readonly routesService: RoutesService,
  ) {}

  getRules(): Promise<PricingRules> {
    return this.pricingService.getRules();
  }

  /** Driver's last known position, if recent enough to trust. */
  driverPosition(record: any): LatLng | null {
    const coords = record?.location?.coordinates;
    if (!isValidLatLng(coords)) return null;
    const updatedAt = record?.updatedAt ? new Date(record.updatedAt).getTime() : Date.now();
    if (Date.now() - updatedAt > MAX_DRIVER_LOCATION_AGE_MS) return null;
    return { lat: coords.lat, lng: coords.lng };
  }

  driverCategory(record: any): VehicleCategory {
    return vehicleCategoryFrom(record?.user?.taxiType || record?.vehicleInfo?.taxiType);
  }

  /** Approach (driver → pickup) estimate per category from the nearest online drivers. */
  private async estimateApproach(
    pickup: LatLng,
    targetTaxiId?: string,
  ): Promise<Record<VehicleCategory, ApproachEstimate>> {
    const none: ApproachEstimate = { distanceMeters: 0, durationSeconds: 0, roadRoute: false, source: 'none' };
    const result: Record<VehicleCategory, ApproachEstimate> = {
      small: { ...none },
      medium: { ...none },
      large: { ...none },
    };

    try {
      if (targetTaxiId) {
        const taxi = await this.taxiModel.findById(targetTaxiId).populate('user', 'taxiType').lean().exec();
        const position = this.driverPosition(taxi);
        if (taxi && position) {
          const leg = await this.routesService.getLeg(position, pickup);
          const estimate: ApproachEstimate = {
            ...leg,
            source: 'target_driver',
            driverUserId: String((taxi.user as any)?._id || taxi.user),
          };
          for (const category of VEHICLE_CATEGORIES) result[category] = estimate;
        }
        return result;
      }

      const taxis = await this.taxiModel
        .find({ status: 'approved', availability: 'online', 'location.coordinates.lat': { $ne: null } })
        .populate('user', 'taxiType')
        .limit(300)
        .lean()
        .exec();

      const candidates: Array<{ category: VehicleCategory; position: LatLng; userId: string }> = [];
      for (const category of VEHICLE_CATEGORIES) {
        // A larger vehicle can serve a smaller request, so it counts towards that category's supply
        const eligible = taxis
          .map((t) => ({ t, position: this.driverPosition(t) }))
          .filter(
            (x): x is { t: any; position: LatLng } =>
              !!x.position && CATEGORY_RANK[this.driverCategory(x.t)] >= CATEGORY_RANK[category],
          )
          .sort((a, b) => straightLineMeters(a.position, pickup) - straightLineMeters(b.position, pickup))
          .slice(0, DRIVERS_PER_CATEGORY);
        for (const { t, position } of eligible) {
          candidates.push({ category, position, userId: String(t.user?._id || t.user) });
        }
      }
      if (candidates.length === 0) return result;

      const legs = await this.routesService.getMatrixToDestination(
        candidates.map((c) => c.position),
        pickup,
      );
      candidates.forEach((candidate, i) => {
        const leg = legs[i];
        const current = result[candidate.category];
        if (current.source === 'none' || leg.durationSeconds < current.durationSeconds) {
          result[candidate.category] = { ...leg, source: 'nearest_driver', driverUserId: candidate.userId };
        }
      });
    } catch (error) {
      this.logger.warn(
        `Approach estimate failed, quoting without it: ${error instanceof Error ? error.message : error}`,
      );
    }
    return result;
  }

  /** Server-side quote for all three vehicle categories. */
  async quote(input: {
    pickup: LatLng;
    destination: LatLng;
    targetTaxiId?: string;
    rules?: PricingRules;
  }): Promise<RideQuote> {
    const rules = input.rules || (await this.pricingService.getRules());
    const [trip, approach] = await Promise.all([
      this.routesService.getLeg(input.pickup, input.destination),
      this.estimateApproach(input.pickup, input.targetTaxiId),
    ]);

    const fares = {} as Record<VehicleCategory, FareBreakdown>;
    for (const category of VEHICLE_CATEGORIES) {
      fares[category] = calculateFare(
        {
          serviceType: 'taxi',
          vehicleCategory: category,
          approachMeters: approach[category].distanceMeters,
          tripMeters: trip.distanceMeters,
          tripMinutes: trip.durationSeconds / 60,
        },
        rules,
      );
    }
    return { trip, approach, fares, rules };
  }

  fare(input: {
    serviceType: 'taxi' | 'driver';
    vehicleCategory: VehicleCategory;
    approachMeters: number;
    tripMeters: number;
    tripMinutes: number;
    stops?: StopForPricing[];
    rules: PricingRules;
  }): FareBreakdown {
    return calculateFare(input, input.rules);
  }

  leg(from: LatLng, to: LatLng): Promise<RouteLeg> {
    return this.routesService.getLeg(from, to);
  }
}
