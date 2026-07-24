import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AdminMessageDocument = HydratedDocument<AdminMessage>;

@Schema({ timestamps: true })
export class AdminMessage {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  admin: string;

  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  userId: string;

  @Prop({ required: true })
  message: string;

  @Prop({ default: 'Message from Gleezip Admin' })
  subject?: string;

  @Prop({
    required: true,
    enum: ['system', 'email', 'push', 'all'],
    default: 'system',
  })
  channel: string;

  @Prop({
    default: 'sent',
    enum: ['sent', 'delivered', 'read', 'failed'],
  })
  deliveryStatus: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'AdminMessageTemplate' })
  templateId?: string;

  @Prop()
  templateName?: string;

  @Prop({ default: false })
  pushSent: boolean;

  @Prop({ default: false })
  emailSent: boolean;

  @Prop()
  failureReason?: string;
}

export const AdminMessageSchema = SchemaFactory.createForClass(AdminMessage);

AdminMessageSchema.index({ userId: 1, createdAt: -1 });
AdminMessageSchema.index({ admin: 1, createdAt: -1 });
