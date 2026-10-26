import {
  calculateFare,
  chargeForSeconds,
  DEFAULT_PRICING_RULES,
  FareInput,
  METERS_PER_MILE,
  vehicleCategoryFrom,
} from './fare';

const rules = DEFAULT_PRICING_RULES;
const miles = (n: number) => n * METERS_PER_MILE;

const baseTrip: FareInput = {
  serviceType: 'taxi',
  vehicleCategory: 'small',
  approachMeters: miles(2),
  tripMeters: miles(8),
  tripMinutes: 20,
};

describe('calculateFare', () => {
  it('reuses the existing formula: £1.10/mile on approach + trip, £0.20/min taxi time', () => {
    const fare = calculateFare(baseTrip, rules);
    expect(fare.billableMeters).toBe(Math.round(miles(2)) + Math.round(miles(8)));
    expect(fare.distanceChargePence).toBe(1100); // 10 mi × 110p
    expect(fare.timeChargePence).toBe(400); // 20 min × 20p
    expect(fare.baseFarePence).toBe(1500);
    expect(fare.totalPence).toBe(1500);
  });

  it('counts driver-to-pickup and pickup-to-destination distance exactly once each', () => {
    const fare = calculateFare(baseTrip, rules);
    const tripOnly = calculateFare({ ...baseTrip, approachMeters: 0 }, rules);
    expect(fare.distanceChargePence - tripOnly.distanceChargePence).toBe(220);
  });

  it('adds +£2 for medium and +£4 for large on the same trip, once', () => {
    const small = calculateFare(baseTrip, rules);
    const medium = calculateFare({ ...baseTrip, vehicleCategory: 'medium' }, rules);
    const large = calculateFare({ ...baseTrip, vehicleCategory: 'large' }, rules);
    expect(medium.totalPence - small.totalPence).toBe(200);
    expect(large.totalPence - small.totalPence).toBe(400);
    // Recalculating from the same input never stacks the surcharge
    expect(calculateFare({ ...baseTrip, vehicleCategory: 'large' }, rules).totalPence).toBe(
      large.totalPence,
    );
  });

  it('enforces the minimum fare after the vehicle surcharge', () => {
    const short = { ...baseTrip, approachMeters: 200, tripMeters: 300, tripMinutes: 1 };
    const fare = calculateFare(short, rules);
    expect(fare.subtotalPence).toBe(400);
    expect(fare.minimumFareAdjustmentPence).toBe(400 - (fare.baseFarePence + 0));

    const large = calculateFare({ ...short, vehicleCategory: 'large' }, rules);
    // Base + £4 already exceeds £4, so no minimum adjustment
    expect(large.minimumFareAdjustmentPence).toBe(0);
    expect(large.subtotalPence).toBe(large.baseFarePence + 400);
  });

  it('follows a changed minimum fare', () => {
    const short = { ...baseTrip, approachMeters: 0, tripMeters: 100, tripMinutes: 1 };
    const fare = calculateFare(short, { ...rules, minimumFarePence: 650 });
    expect(fare.subtotalPence).toBe(650);
  });

  it('charges customer stops at 50p/min and driver stops at £0', () => {
    const fare = calculateFare(
      {
        ...baseTrip,
        stops: [
          { initiatedBy: 'customer', durationSeconds: 150 },
          { initiatedBy: 'driver', durationSeconds: 600 },
        ],
      },
      rules,
    );
    expect(fare.customerStopSeconds).toBe(150);
    expect(fare.driverStopSeconds).toBe(600);
    expect(fare.stopChargePence).toBe(125); // 2.5 min × 50p
    expect(fare.totalPence).toBe(fare.subtotalPence + 125);
  });

  it('adds stop charges after the minimum fare', () => {
    const short = {
      ...baseTrip,
      approachMeters: 0,
      tripMeters: 100,
      tripMinutes: 1,
      stops: [{ initiatedBy: 'customer' as const, durationSeconds: 120 }],
    };
    const fare = calculateFare(short, rules);
    expect(fare.subtotalPence).toBe(400);
    expect(fare.totalPence).toBe(500);
  });

  it('applies no time charge to chauffeur rides', () => {
    const fare = calculateFare({ ...baseTrip, serviceType: 'driver' }, rules);
    expect(fare.timeChargePence).toBe(0);
  });
});

describe('chargeForSeconds', () => {
  it('rounds once on the total, not per tick', () => {
    expect(chargeForSeconds(1, 50)).toBe(1);
    expect(chargeForSeconds(61, 50)).toBe(51);
    expect(chargeForSeconds(0, 50)).toBe(0);
  });
});

describe('vehicleCategoryFrom', () => {
  it('maps taxi types smallest → largest', () => {
    expect(vehicleCategoryFrom('Normal car')).toBe('small');
    expect(vehicleCategoryFrom('Mini Bus')).toBe('medium');
    expect(vehicleCategoryFrom('Bus')).toBe('large');
    expect(vehicleCategoryFrom('large')).toBe('large');
    expect(vehicleCategoryFrom(undefined)).toBe('small');
  });
});
