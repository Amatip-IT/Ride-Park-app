import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type DisputeDocument = HydratedDocument<Dispute>;

export const DISPUTE_CATEGORIES = [
  'unfair_rejection',
  'payment_issue',
  'misconduct',
  'service_quality',
  'verification',
  'other',
] as const;

export const DISPUTE_STATUSES = [
  'open',
  'investigating',
  'resolved',
  'closed',
] as const;

export const DISPUTE_RESOLUTIONS = [
  'override_driver_approval',
  'override_provider_approval',
  'issue_refund',
  'suspend_user',
  'close_no_action',
  'other',
] as const;

@Schema({ timestamps: true })
export class Dispute {
  @Prop({
    type: MongooseSchema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  })
  filedBy: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', index: true })
  complaintAbout?: string;

  @Prop({ required: true, enum: DISPUTE_CATEGORIES, index: true })
  category: string;

  @Prop({ required: true })
  description: string;

  @Prop({ type: [String], default: [] })
  evidenceUrls: string[];

  @Prop({
    required: true,
    enum: DISPUTE_STATUSES,
    default: 'open',
    index: true,
  })
  status: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  assignedTo?: string;

  @Prop()
  adminNotes?: string;

  @Prop({ enum: DISPUTE_RESOLUTIONS })
  resolution?: string;

  @Prop()
  resolutionNotes?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  resolvedBy?: string;

  @Prop()
  resolvedAt?: Date;

  @Prop()
  stripeRefundId?: string;

  @Prop()
  refundAmount?: number;

  @Prop()
  relatedServiceType?: string;

  @Prop()
  relatedServiceId?: string;

  @Prop({ type: Object })
  metadata?: Record<string, unknown>;
}

export const DisputeSchema = SchemaFactory.createForClass(Dispute);

DisputeSchema.index({ createdAt: -1 });
DisputeSchema.index({ status: 1, category: 1, createdAt: -1 });
