/**
 * Display helpers for fares computed by the backend. The app never prices a ride
 * itself; it renders the pence breakdown the server returns.
 */

export type VehicleCategory = 'small' | 'medium' | 'large';

export const VEHICLE_OPTIONS: Array<{
  category: VehicleCategory;
  taxiType: 'Normal car' | 'Mini Bus' | 'Bus';
  label: string;
  seats: string;
}> = [
  { category: 'small', taxiType: 'Normal car', label: 'Normal car', seats: '1–4 seats' },
  { category: 'medium', taxiType: 'Mini Bus', label: 'Mini Bus', seats: '5–8 seats' },
  { category: 'large', taxiType: 'Bus', label: 'Bus', seats: '9+ seats' },
];

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
  subtotalPence: number;
  customerStopSeconds: number;
  driverStopSeconds: number;
  stopChargePence: number;
  totalPence: number;
}

export const formatPence = (pence?: number | null): string =>
  `£${((pence || 0) / 100).toFixed(2)}`;

export const metersToMilesLabel = (meters?: number | null): string => {
  const miles = (meters || 0) / 1609.344;
  return `${miles < 10 ? miles.toFixed(1) : Math.round(miles)} mi`;
};

export const secondsToMinutesLabel = (seconds?: number | null): string => {
  const minutes = Math.max(1, Math.round((seconds || 0) / 60));
  return `${minutes} min`;
};

/** mm:ss for a running stop timer. */
export const formatElapsed = (seconds: number): string => {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
};

/** Lines for a transparent breakdown, in the order the fare is calculated. */
export function fareLines(fare: FareBreakdown): Array<{ label: string; value: string; muted?: boolean }> {
  const lines: Array<{ label: string; value: string; muted?: boolean }> = [
    {
      label: `Distance ${metersToMilesLabel(fare.billableMeters)} (driver to you ${metersToMilesLabel(
        fare.approachMeters,
      )} + trip ${metersToMilesLabel(fare.tripMeters)})`,
      value: formatPence(fare.distanceChargePence),
    },
  ];
  if (fare.timeChargePence > 0) {
    lines.push({ label: `Time (${Math.round(fare.billableMinutes)} min)`, value: formatPence(fare.timeChargePence) });
  }
  if (fare.vehicleSurchargePence > 0) {
    lines.push({ label: 'Vehicle size', value: `+${formatPence(fare.vehicleSurchargePence)}` });
  }
  if (fare.minimumFareAdjustmentPence > 0) {
    lines.push({ label: 'Minimum fare top-up', value: `+${formatPence(fare.minimumFareAdjustmentPence)}` });
  }
  if (fare.stopChargePence > 0) {
    lines.push({
      label: `Waiting (${Math.round(fare.customerStopSeconds / 60)} min stops)`,
      value: `+${formatPence(fare.stopChargePence)}`,
    });
  }
  if (fare.driverStopSeconds > 0) {
    lines.push({ label: `Driver stops (${Math.round(fare.driverStopSeconds / 60)} min, not charged)`, value: '£0.00', muted: true });
  }
  return lines;
}
