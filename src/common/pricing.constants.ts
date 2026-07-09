/** Shared pricing — keep in sync with mobile/src/constants/pricing.ts */
export const RATE_PER_MILE = 1.10;
export const RATE_PER_MINUTE_TAXI = 0.20;

/** Assumed average speed when quoting chauffeur jobs from booked duration only (mph) */
export const CHAUFFEUR_AVG_MPH = 20;
export const CHAUFFEUR_MIN_HOURS = 1;

export function calculateChauffeurQuotedPrice(
  start: Date,
  end: Date,
): { quotedPrice: number; billableHours: number; estimatedMiles: number } {
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const hours = durationMs / (1000 * 60 * 60);
  const billableHours = Math.max(CHAUFFEUR_MIN_HOURS, Math.ceil(hours));
  const estimatedMiles = billableHours * CHAUFFEUR_AVG_MPH;
  const quotedPrice = Math.round(estimatedMiles * RATE_PER_MILE * 100) / 100;

  return { quotedPrice, billableHours, estimatedMiles };
}

export function calculateRideCost(
  serviceType: 'driver' | 'taxi',
  distanceMiles: number,
  durationMinutes: number,
): { distanceCost: number; timeCost: number; totalCost: number } {
  const distanceCost = Math.round(distanceMiles * RATE_PER_MILE * 100) / 100;
  const timeCost =
    serviceType === 'taxi'
      ? Math.round(durationMinutes * RATE_PER_MINUTE_TAXI * 100) / 100
      : 0;
  const totalCost = Math.round((distanceCost + timeCost) * 100) / 100;

  return { distanceCost, timeCost, totalCost };
}
