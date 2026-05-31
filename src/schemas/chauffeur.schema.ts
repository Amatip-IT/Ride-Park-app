import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ChauffeurDocument = HydratedDocument<Chauffeur>;

@Schema({ timestamps: true })
export class Chauffeur {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: string;

  @Prop({
    default: 'not_applied',
    enum: [
      'not_applied',
      'pending_auto_check',
      'pending_admin_review',
      'approved',
      'rejected',
    ],
  })
  status: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: false })
  isActive: boolean;

  // Sequential driver number (001, 002, etc.)
  @Prop({ type: String, unique: true, sparse: true })
  driverNumber?: string;

  // ── Individual Document URLs ──
  // Driver requirements
  @Prop() natInsuranceUrl?: string;
  @Prop() vatCertUrl?: string;
  @Prop() dvlaLicenceUrl?: string;
  @Prop() bankStatementUrl?: string;
  @Prop() dvlaCheckCodeUrl?: string;
  @Prop() phvDriverLicenceUrl?: string;
  @Prop() profilePhotoUrl?: string;

  // Vehicle requirements
  @Prop() phvlUrl?: string;
  @Prop() v5cUrl?: string;
  @Prop() insuranceUrl?: string;
  @Prop() vehicleInspectionUrl?: string;

  // Per-document status tracking with detailed info
  // Structure: { fieldName: { status, rejectionReason, uploadedAt, reviewedAt, reviewedBy } }
  @Prop({ type: Object, default: {} })
  documentStatuses?: Record<string, {
    status?: 'not_submitted' | 'uploaded' | 'verified' | 'rejected';
    rejectionReason?: string;
    uploadedAt?: Date;
    reviewedAt?: Date;
    reviewedBy?: string; // Admin user ID
  }>;

  // Legacy generic documents (kept for backward compatibility)
  @Prop({ type: Object })
  documents?: any;

  @Prop({ type: Object })
  location?: {
    coordinates?: { lat: number; lng: number };
    what3words?: string;
  };

  @Prop({
    default: 'offline',
    enum: ['online', 'offline', 'busy'],
  })
  availability: string;

  @Prop()
  rejectionReason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: string;

  // Document expiry tracking
  @Prop({ type: Object, default: {} })
  documentExpiries?: Record<string, {
    expiryDate: Date;
    renewalNotificationSent?: Date;
    renewalReminderLevel?: '30_day' | '7_day' | 'expired';
  }>;

  @Prop({ default: true })
  canAcceptRides: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChauffeurSchema: MongooseSchema<Chauffeur> =
  SchemaFactory.createForClass(Chauffeur);

// Indexes
ChauffeurSchema.index({ user: 1 });
ChauffeurSchema.index({ isActive: 1 });
ChauffeurSchema.index({ availability: 1 });
ChauffeurSchema.index({ driverNumber: 1 });
ChauffeurSchema.index({ status: 1 });
