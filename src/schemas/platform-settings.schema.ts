import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document } from 'mongoose';

export type PlatformSettingsDocument = PlatformSettings & Document;

@Schema({ timestamps: true })
export class PlatformSettings {
  @Prop({ default: 10 })
  platformFeePercentage: number;
}

export const PlatformSettingsSchema = SchemaFactory.createForClass(PlatformSettings);
