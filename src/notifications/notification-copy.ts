/** Shared copy helpers so every push names the people, places, times, and amounts involved. */

export function notificationLines(
  ...parts: Array<string | false | null | undefined>
): string {
  return parts
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean)
    .join('\n');
}

export function gbp(amount?: number | null): string {
  const value = Number(amount);
  if (!Number.isFinite(value)) return '£0.00';
  return `£${value.toFixed(2)}`;
}

export function formatWhen(date?: Date | string | null): string | undefined {
  if (!date) return undefined;
  const value = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(value.getTime())) return undefined;
  return value.toLocaleString('en-GB', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function placeLine(
  address?: string | null,
  postcode?: string | null,
): string | undefined {
  const text = [address, postcode]
    .map((part) => (part ? String(part).trim() : ''))
    .filter(Boolean)
    .join(', ');
  return text || undefined;
}

export function clip(text?: string | null, max = 140): string | undefined {
  const value = text?.trim();
  if (!value) return undefined;
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export const DOCUMENT_LABELS: Record<string, string> = {
  natInsuranceUrl: 'National Insurance',
  vatCertUrl: 'VAT Certificate',
  dvlaLicenceUrl: 'DVLA Plastic Driving Licence',
  bankStatementUrl: 'Bank Statement',
  dvlaCheckCodeUrl: 'DVLA Electronic Counterpart Check Code',
  phvDriverLicenceUrl: 'Private Hire Driver Licence (Paper & Badge)',
  profilePhotoUrl: 'Profile Photo',
  phvlUrl: 'Private Hire Vehicle Licence (PHVL)',
  v5cUrl: 'V5C Vehicle Logbook',
  insuranceUrl: 'Insurance Certificate',
  vehicleInspectionUrl: 'UK Vehicle Inspection',
};

export function documentLabel(field?: string | null): string {
  if (!field) return 'document';
  if (DOCUMENT_LABELS[field]) return DOCUMENT_LABELS[field];
  const words = field
    .replace(/Url$/, '')
    .replace(/([A-Z])/g, ' $1')
    .trim();
  return words || 'document';
}

const DISPUTE_CATEGORY_LABELS: Record<string, string> = {
  unfair_rejection: 'Unfair rejection',
  payment_issue: 'Payment issue',
  misconduct: 'Misconduct',
  service_quality: 'Service quality',
  verification: 'Verification',
  other: 'Other',
};

const RESOLUTION_LABELS: Record<string, string> = {
  override_driver_approval: 'Driver approval was updated',
  override_provider_approval: 'Provider approval was updated',
  issue_refund: 'A refund was issued',
  suspend_user: 'An account action was taken',
  close_no_action: 'Closed with no further action',
  other: 'Reviewed',
};

export function disputeCategoryLabel(category?: string | null): string {
  return (category && DISPUTE_CATEGORY_LABELS[category]) || 'General';
}

export function resolutionLabel(resolution?: string | null): string {
  return (resolution && RESOLUTION_LABELS[resolution]) || 'Resolved';
}

export function serviceTypeLabel(serviceType?: string | null): string {
  if (serviceType === 'parking') return 'parking space';
  if (serviceType === 'driver') return 'chauffeur';
  if (serviceType === 'taxi') return 'taxi';
  return 'service';
}

export function pricingUnitLabel(unit?: string | null): string {
  if (unit === 'per_hour') return 'per hour';
  if (unit === 'per_day') return 'per day';
  if (unit === 'flat') return 'flat rate';
  if (unit === 'per_session') return 'per session';
  return '';
}

export function timingLabel(
  timingType?: string | null,
  scheduledTime?: Date | string | null,
): string {
  const when = formatWhen(scheduledTime);
  if (timingType === 'leave_at') {
    return when ? `Leave at ${when}` : 'Leave at a scheduled time';
  }
  if (timingType === 'arrive_by') {
    return when ? `Arrive by ${when}` : 'Arrive by a scheduled time';
  }
  return 'As soon as possible';
}

export function scheduleLine(
  start?: Date | string | null,
  end?: Date | string | null,
): string | undefined {
  const startLabel = formatWhen(start);
  const endLabel = formatWhen(end);
  if (startLabel && endLabel) return `When: ${startLabel} – ${endLabel}`;
  if (startLabel) return `Starts: ${startLabel}`;
  if (endLabel) return `Ends: ${endLabel}`;
  return undefined;
}

export function priceLine(
  amount?: number | null,
  unit?: string | null,
): string | undefined {
  if (amount == null || !Number.isFinite(Number(amount))) return undefined;
  const unitLabel = pricingUnitLabel(unit);
  return unitLabel
    ? `Price: ${gbp(amount)} ${unitLabel}`
    : `Price: ${gbp(amount)}`;
}

type TripFacts = {
  pickupAddress?: string | null;
  pickupPostcode?: string | null;
  destinationAddress?: string | null;
  destinationPostcode?: string | null;
  dropoffAddress?: string | null;
  timingType?: string | null;
  scheduledTime?: Date | string | null;
  estimatedCost?: number | null;
  estimatedDistanceMiles?: number | null;
  estimatedDurationMinutes?: number | null;
  passengerNote?: string | null;
};

export function tripFactLines(
  trip: TripFacts,
  options: { includeTiming?: boolean; includeEstimate?: boolean } = {},
): string[] {
  const dropoff = placeLine(
    trip.destinationAddress || trip.dropoffAddress,
    trip.destinationPostcode,
  );
  const estimateBits = [
    trip.estimatedCost != null ? gbp(trip.estimatedCost) : undefined,
    trip.estimatedDistanceMiles != null
      ? `${Number(trip.estimatedDistanceMiles).toFixed(1)} mi`
      : undefined,
    trip.estimatedDurationMinutes != null
      ? `${Math.round(Number(trip.estimatedDurationMinutes))} min`
      : undefined,
  ].filter(Boolean);

  return [
    `Pickup: ${placeLine(trip.pickupAddress, trip.pickupPostcode) || 'Shared in the app'}`,
    `Drop-off: ${dropoff || 'Shared in the app'}`,
    options.includeTiming === false
      ? undefined
      : `When: ${timingLabel(trip.timingType, trip.scheduledTime)}`,
    options.includeEstimate === false || estimateBits.length === 0
      ? undefined
      : `Estimate: ${estimateBits.join(' · ')}`,
    trip.passengerNote ? `Note: ${clip(trip.passengerNote)}` : undefined,
  ].filter((line): line is string => Boolean(line));
}

export function vehicleLine(vehicle?: {
  color?: string;
  make?: string;
  model?: string;
  plateNumber?: string;
} | null): string | undefined {
  if (!vehicle) return undefined;
  const name = [vehicle.color, vehicle.make, vehicle.model]
    .filter(Boolean)
    .join(' ');
  const plate = vehicle.plateNumber ? ` · ${vehicle.plateNumber}` : '';
  const text = `${name}${plate}`.trim();
  return text ? `Vehicle: ${text}` : undefined;
}
