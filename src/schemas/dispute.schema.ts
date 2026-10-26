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

/** investigating = "Under Review" in the apps. */
export const DISPUTE_STATUSES = [
  'open',
  'investigating',
  'resolved',
  'rejected',
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

  // ── Ride link (set when the dispute is about a taxi/chauffeur ride) ──
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Ride', index: true })
  rideId?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'TaxiRideRequest', index: true })
  rideRequestId?: string;

  /** Short ride reference shown in the apps, e.g. GZ-4F2A9C. */
  @Prop({ type: String, index: true })
  rideReference?: string;

  @Prop({ enum: ['customer', 'driver', 'other'], default: 'other' })
  filedByRole: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', index: true })
  customerId?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', index: true })
  driverId?: string;

  @Prop({
    type: [
      {
        status: String,
        changedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  statusHistory: Array<{ status: string; changedBy?: string; note?: string; at: Date }>;

  @Prop({
    type: [
      {
        adminId: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
        note: String,
        at: { type: Date, default: Date.now },
      },
    ],
    default: [],
  })
  internalNotes: Array<{ adminId: string; note: string; at: Date }>;
}

export const DisputeSchema = SchemaFactory.createForClass(Dispute);

DisputeSchema.index({ createdAt: -1 });
DisputeSchema.index({ status: 1, category: 1, createdAt: -1 });
