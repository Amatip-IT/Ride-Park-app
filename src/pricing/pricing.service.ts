import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  PlatformSettings,
  PlatformSettingsDocument,
} from 'src/schemas/platform-settings.schema';
import {
  calculateFare,
  DEFAULT_PRICING_RULES,
  FareBreakdown,
  FareInput,
  PricingRules,
} from './fare';

const CACHE_MS = 15_000;

export type PricingRulesUpdate = Partial<
  Omit<PricingRules, 'version' | 'vehicleSurchargePence'>
> & {
  vehicleSurchargePence?: Partial<PricingRules['vehicleSurchargePence']>;
};

/** Hard limits so a typo in the admin dashboard cannot produce absurd fares. */
const LIMITS: Record<string, [number, number]> = {
  ratePerMilePence: [1, 2_000],
  ratePerMinuteTaxiPence: [0, 500],
  minimumFarePence: [0, 10_000],
  customerStopRatePencePerMinute: [0, 1_000],
  driverStopRatePencePerMinute: [0, 1_000],
  vehicleSurcharge: [0, 10_000],
};

export function validatePricingUpdate(update: PricingRulesUpdate): string | null {
  const check = (key: string, value: unknown, limitKey = key): string | null => {
    if (value === undefined) return null;
    const [min, max] = LIMITS[limitKey];
    if (typeof value !== 'number' || !Number.isInteger(value) || value < min || value > max) {
      return `${key} must be a whole number of pence between ${min} and ${max}`;
    }
    return null;
  };

  for (const key of [
    'ratePerMilePence',
    'ratePerMinuteTaxiPence',
    'minimumFarePence',
    'customerStopRatePencePerMinute',
    'driverStopRatePencePerMinute',
  ] as const) {
    const error = check(key, update[key]);
    if (error) return error;
  }

  const surcharges = update.vehicleSurchargePence;
  if (surcharges) {
    for (const category of ['small', 'medium', 'large'] as const) {
      const error = check(`vehicleSurchargePence.${category}`, surcharges[category], 'vehicleSurcharge');
      if (error) return error;
    }
  }
  return null;
}

@Injectable()
export class PricingService {
  private readonly logger = new Logger(PricingService.name);
  private cached: { rules: PricingRules; at: number } | null = null;

  constructor(
    @InjectModel(PlatformSettings.name)
    private settingsModel: Model<PlatformSettingsDocument>,
  ) {}

  toRules(settings?: Partial<PlatformSettings> | null): PricingRules {
    const d = DEFAULT_PRICING_RULES;
    const s = settings || {};
    const surcharges = s.vehicleSurchargesPence || d.vehicleSurchargePence;
    return {
      ratePerMilePence: s.ratePerMilePence ?? d.ratePerMilePence,
      ratePerMinuteTaxiPence: s.ratePerMinuteTaxiPence ?? d.ratePerMinuteTaxiPence,
      minimumFarePence: s.minimumFarePence ?? d.minimumFarePence,
      vehicleSurchargePence: {
        small: surcharges.small ?? d.vehicleSurchargePence.small,
        medium: surcharges.medium ?? d.vehicleSurchargePence.medium,
        large: surcharges.large ?? d.vehicleSurchargePence.large,
      },
      customerStopRatePencePerMinute:
        s.customerStopRatePencePerMinute ?? d.customerStopRatePencePerMinute,
      driverStopRatePencePerMinute:
        s.driverStopRatePencePerMinute ?? d.driverStopRatePencePerMinute,
      version: s.pricingVersion ?? d.version,
    };
  }

  /** Current global rules (briefly cached). Rides use their own snapshot once quoted. */
  async getRules(): Promise<PricingRules> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) {
      return this.cached.rules;
    }
    try {
      const settings = await this.settingsModel.findOne().lean().exec();
      const rules = this.toRules(settings as Partial<PlatformSettings> | null);
      this.cached = { rules, at: Date.now() };
      return rules;
    } catch (error) {
      this.logger.error(
        `Could not load pricing settings, using defaults: ${error instanceof Error ? error.message : error}`,
      );
      return this.cached?.rules || DEFAULT_PRICING_RULES;
    }
  }

  invalidate(): void {
    this.cached = null;
  }

  async quote(input: FareInput, rules?: PricingRules): Promise<FareBreakdown> {
    return calculateFare(input, rules || (await this.getRules()));
  }
}
