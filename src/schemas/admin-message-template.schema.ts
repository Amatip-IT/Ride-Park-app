import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type AdminMessageTemplateDocument =
  HydratedDocument<AdminMessageTemplate>;

@Schema({ timestamps: true })
export class AdminMessageTemplate {
  @Prop({ required: true })
  name: string;

  @Prop({
    required: true,
    enum: [
      'verification',
      'approval',
      'rejection',
      'expiry',
      'suspension',
      'earnings',
      'booking',
      'general',
      'custom',
    ],
    default: 'general',
  })
  category: string;

  @Prop({ required: true })
  subject: string;

  @Prop({ required: true })
  body: string;

  @Prop({ default: true })
  isActive: boolean;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  createdBy?: string;
}

export const AdminMessageTemplateSchema =
  SchemaFactory.createForClass(AdminMessageTemplate);

AdminMessageTemplateSchema.index({ category: 1, isActive: 1 });
