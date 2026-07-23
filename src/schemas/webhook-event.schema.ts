import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument } from 'mongoose';

export type WebhookEventDocument = HydratedDocument<WebhookEvent>;

@Schema({ timestamps: true })
export class WebhookEvent {
  @Prop({ required: true, enum: ['payments', 'connect'] })
  provider: string;

  @Prop({ required: true })
  eventId: string;

  @Prop({ required: true })
  eventType: string;

  @Prop({ required: true, enum: ['processing', 'completed', 'failed'] })
  status: string;

  @Prop({ default: 1 })
  attempts: number;

  @Prop({ type: Date })
  processingStartedAt?: Date;

  @Prop({ type: Date })
  processedAt?: Date;

  @Prop()
  lastError?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const WebhookEventSchema = SchemaFactory.createForClass(WebhookEvent);

WebhookEventSchema.index({ provider: 1, eventId: 1 }, { unique: true });
WebhookEventSchema.index({ status: 1, updatedAt: 1 });
WebhookEventSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 90 * 24 * 60 * 60 },
);
