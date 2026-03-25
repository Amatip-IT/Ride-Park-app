import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type TaxiDocument = HydratedDocument<Taxi>;

// MOT Check interface with both raw data AND calculated fields
export interface MotCheckData {
  // Basic check result
  passed: boolean;
  checkedAt: Date;
  data: any;

  // Calculated/analyzed fields for easy access
  analysis?: {
    vehicleStatus: 'NEW_VEHICLE' | 'MOT_EXEMPT' | 'REQUIRES_MOT' | 'UNKNOWN';
    vehicleAge?: number;
    expiryDate?: string;
    latestMileage?: number;
    riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
    requiresAdminReview?: boolean;

    // Human-readable messages/warnings
    messages: string[]; // Array of warnings/info messages

    // Individual check flags
    checks: {
      hasMotHistory: boolean;
      latestTestPassed: boolean;
      motNotExpired: boolean;
      mileageIncreasing: boolean;
      noDangerousDefects: boolean;
      noOutstandingRecalls?: boolean;
      requiresMot: boolean;
      isExempt: boolean;
    };

    // Latest test summary (for quick access)
    latestTest?: {
      completedDate: string;
      testResult: string;
      expiryDate: string;
      odometerValue: string;
      motTestNumber: string;
      hasDefects: boolean;
      defectCount?: number;
    };

    // Mileage trend
    mileageHistory?: Array<{ date: string; mileage: number }>;
  };
}

@Schema({ timestamps: true })
export class Taxi {
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

  @Prop({ type: Object })
  vehicleInfo?: any;

  @Prop({ type: Object })
  dvlaCheck?: any;

  @Prop({ type: Object })
  motCheck?: MotCheckData;

  @Prop({ type: Object })
  documents?: any;

  @Prop({ type: Object })
  location?: {
    coordinates?: { lat: number; lng: number };
    what3words?: string;
  };

  @Prop()
  rejectionReason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TaxiSchema: MongooseSchema<Taxi> =
  SchemaFactory.createForClass(Taxi);

// Indexes
TaxiSchema.index({ user: 1 });
TaxiSchema.index({ isActive: 1 });
TaxiSchema.index({ status: 1 });
TaxiSchema.index({ 'motCheck.analysis.vehicleStatus': 1 });
TaxiSchema.index({ 'motCheck.analysis.riskLevel': 1 });
TaxiSchema.index({ 'motCheck.checkedAt': 1 });
