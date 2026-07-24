/** Keep in sync with backend src/common/pricing.constants.ts */
export const RATE_PER_MILE = 1.10;
export const CHAUFFEUR_AVG_MPH = 20;
export const CHAUFFEUR_MIN_HOURS = 1;

export function calculateChauffeurQuotedPrice(
  start: Date,
  end: Date,
): { quotedPrice: number; billableHours: number } {
  const durationMs = Math.max(0, end.getTime() - start.getTime());
  const hours = durationMs / (1000 * 60 * 60);
  const billableHours = Math.max(CHAUFFEUR_MIN_HOURS, Math.ceil(hours));
  const estimatedMiles = billableHours * CHAUFFEUR_AVG_MPH;
  const quotedPrice = Math.round(estimatedMiles * RATE_PER_MILE * 100) / 100;

  return { quotedPrice, billableHours };
}
