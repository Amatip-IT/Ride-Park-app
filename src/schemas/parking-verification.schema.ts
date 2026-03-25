import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ParkingVerificationDocument = HydratedDocument<ParkingVerification>;

@Schema({ timestamps: true })
export class ParkingVerification {
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

  @Prop({ default: false }) isVerified: boolean;
  @Prop({ default: false }) isActive: boolean;

  @Prop({ type: String }) address?: string;
  @Prop({ type: String }) postcode?: string;
  @Prop({ type: Object }) location?: {
    coordinates?: { lat: number; lng: number };
    what3words?: string;
  };
  @Prop({ type: Object }) postcodeCheck?: any;
  @Prop({ type: Object }) what3wordsCheck?: any;
  @Prop({ type: Object }) documents?: any;

  @Prop() rejectionReason?: string;
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: string;
}

export const ParkingVerificationSchema =
  SchemaFactory.createForClass(ParkingVerification);

// Indexes
ParkingVerificationSchema.index({ user: 1 });
ParkingVerificationSchema.index({ isActive: 1 });
ParkingVerificationSchema.index({ status: 1 });
