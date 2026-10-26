import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type PlatformSettingsDocument = PlatformSettings & Document;

/** Single document holding platform-wide settings. Ride pricing values are in pence. */
@Schema({ timestamps: true })
export class PlatformSettings {
  @Prop({ default: 10 })
  platformFeePercentage: number;

  @Prop({ default: 110 })
  ratePerMilePence: number;

  @Prop({ default: 20 })
  ratePerMinuteTaxiPence: number;

  @Prop({ default: 400 })
  minimumFarePence: number;

  @Prop({ type: Object, default: () => ({ small: 0, medium: 200, large: 400 }) })
  vehicleSurchargesPence: { small: number; medium: number; large: number };

  @Prop({ default: 50 })
  customerStopRatePencePerMinute: number;

  @Prop({ default: 0 })
  driverStopRatePencePerMinute: number;

  @Prop({ default: 1 })
  pricingVersion: number;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  pricingUpdatedBy?: string;

  @Prop({ type: Date })
  pricingUpdatedAt?: Date;
}

export const PlatformSettingsSchema =
  SchemaFactory.createForClass(PlatformSettings);
