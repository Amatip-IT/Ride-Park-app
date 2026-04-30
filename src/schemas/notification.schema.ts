import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Schema as MongooseSchema } from 'mongoose';

export type NotificationDocument = Notification & Document;

@Schema({ timestamps: true })
export class Notification {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  userId: string;

  @Prop({ required: true })
  title: string;

  @Prop({ required: true })
  body: string;

  @Prop({ required: true, enum: ['ride', 'booking', 'payment', 'system', 'promo'] })
  type: string;

  @Prop({ default: false })
  read: boolean;

  @Prop({ type: Object })
  data?: Record<string, any>;
}

export const NotificationSchema = SchemaFactory.createForClass(Notification);
