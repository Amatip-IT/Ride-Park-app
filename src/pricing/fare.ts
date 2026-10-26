/**
 * Ride fare engine. Pure functions, integer pence throughout; convert to pounds
 * only at the edges (legacy pound fields and display).
 */

export const METERS_PER_MILE = 1609.344;

export const VEHICLE_CATEGORIES = ['small', 'medium', 'large'] as const;
export type VehicleCategory = (typeof VEHICLE_CATEGORIES)[number];

/** Passenger-facing taxi types, smallest to largest. */
const TAXI_TYPE_TO_CATEGORY: Record<string, VehicleCategory> = {
  'normal car': 'small',
  'mini bus': 'medium',
  bus: 'large',
};

export const VEHICLE_CATEGORY_LABELS: Record<VehicleCategory, string> = {
  small: 'Normal car',
  medium: 'Mini Bus',
  large: 'Bus',
};

export function vehicleCategoryFrom(value?: string | null): VehicleCategory {
  if (!value) return 'small';
  const normalized = value.trim().toLowerCase();
  if ((VEHICLE_CATEGORIES as readonly string[]).includes(normalized)) {
    return normalized as VehicleCategory;
  }
  return TAXI_TYPE_TO_CATEGORY[normalized] || 'small';
}

export interface PricingRules {
  ratePerMilePence: number;
  /** Taxi-only time component on the passenger's journey. */
  ratePerMinuteTaxiPence: number;
  minimumFarePence: number;
  vehicleSurchargePence: Record<VehicleCategory, number>;
  customerStopRatePencePerMinute: number;
  driverStopRatePencePerMinute: number;
  /** Increments whenever an admin changes pricing; stored on each ride snapshot. */
  version: number;
}

export const DEFAULT_PRICING_RULES: PricingRules = {
  ratePerMilePence: 110,
  ratePerMinuteTaxiPence: 20,
  minimumFarePence: 400,
  vehicleSurchargePence: { small: 0, medium: 200, large: 400 },
  customerStopRatePencePerMinute: 50,
  driverStopRatePencePerMinute: 0,
  version: 1,
};

export type StopInitiator = 'customer' | 'driver';

export interface StopForPricing {
  initiatedBy: StopInitiator;
  durationSeconds: number;
}

export interface FareInput {
  serviceType: 'taxi' | 'driver';
  vehicleCategory: VehicleCategory;
  /** Road distance from the driver's position at acceptance to the pickup. */
  approachMeters: number;
  /** Road (or recorded) distance from pickup to destination. */
  tripMeters: number;
  /** Passenger journey minutes, excluding stop time (stops are billed separately). */
  tripMinutes: number;
  stops?: StopForPricing[];
}

export interface FareBreakdown {
  vehicleCategory: VehicleCategory;
  approachMeters: number;
  tripMeters: number;
  billableMeters: number;
  billableMinutes: number;
  distanceChargePence: number;
  timeChargePence: number;
  baseFarePence: number;
  vehicleSurchargePence: number;
  minimumFareAdjustmentPence: number;
  /** Fare after vehicle surcharge and minimum fare, before stop charges. */
  subtotalPence: number;
  customerStopSeconds: number;
  driverStopSeconds: number;
  stopChargePence: number;
  totalPence: number;
  rulesVersion: number;
}

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

/** Per-minute rate applied to elapsed seconds, rounded once to the nearest penny. */
export function chargeForSeconds(seconds: number, pencePerMinute: number): number {
  return Math.round((nonNegative(seconds) * nonNegative(pencePerMinute)) / 60);
}

/**
 * Order: base fare (distance + taxi time) → vehicle surcharge → minimum fare →
 * stop charges. Each step is applied exactly once.
 */
export function calculateFare(input: FareInput, rules: PricingRules): FareBreakdown {
  const approachMeters = Math.round(nonNegative(input.approachMeters));
  const tripMeters = Math.round(nonNegative(input.tripMeters));
  const billableMeters = approachMeters + tripMeters;
  const billableMinutes =
    input.serviceType === 'taxi' ? Math.round(nonNegative(input.tripMinutes) * 100) / 100 : 0;

  const distanceChargePence = Math.round(
    (billableMeters / METERS_PER_MILE) * rules.ratePerMilePence,
  );
  const timeChargePence = Math.round(billableMinutes * rules.ratePerMinuteTaxiPence);
  const baseFarePence = distanceChargePence + timeChargePence;

  const vehicleSurchargePence = rules.vehicleSurchargePence[input.vehicleCategory] ?? 0;
  const withVehicle = baseFarePence + vehicleSurchargePence;
  const subtotalPence = Math.max(withVehicle, rules.minimumFarePence);
  const minimumFareAdjustmentPence = subtotalPence - withVehicle;

  let customerStopSeconds = 0;
  let driverStopSeconds = 0;
  for (const stop of input.stops || []) {
    if (stop.initiatedBy === 'customer') customerStopSeconds += nonNegative(stop.durationSeconds);
    else driverStopSeconds += nonNegative(stop.durationSeconds);
  }
  const stopChargePence =
    chargeForSeconds(customerStopSeconds, rules.customerStopRatePencePerMinute) +
    chargeForSeconds(driverStopSeconds, rules.driverStopRatePencePerMinute);

  return {
    vehicleCategory: input.vehicleCategory,
    approachMeters,
    tripMeters,
    billableMeters,
    billableMinutes,
    distanceChargePence,
    timeChargePence,
    baseFarePence,
    vehicleSurchargePence,
    minimumFareAdjustmentPence,
    subtotalPence,
    customerStopSeconds: Math.round(customerStopSeconds),
    driverStopSeconds: Math.round(driverStopSeconds),
    stopChargePence,
    totalPence: subtotalPence + stopChargePence,
    rulesVersion: rules.version,
  };
}

export const penceToPounds = (pence: number): number => Math.round(pence) / 100;
export const poundsToPence = (pounds: number): number => Math.round((Number(pounds) || 0) * 100);
export const metersToMiles = (meters: number): number =>
  Math.round((nonNegative(meters) / METERS_PER_MILE) * 100) / 100;
export const milesToMeters = (miles: number): number => Math.round(nonNegative(miles) * METERS_PER_MILE);
