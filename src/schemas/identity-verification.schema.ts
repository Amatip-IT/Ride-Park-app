import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type IdentityVerificationDocument =
  HydratedDocument<IdentityVerification>;

@Schema({ timestamps: true })
export class IdentityVerification {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: string;

  @Prop({ type: String, required: true })
  stripeVerificationId: string;

  @Prop({
    type: String,
    enum: ['pending', 'verified', 'failed'],
    default: 'pending',
  })
  status: string;

  @Prop({
    type: String,
    enum: ['driving_license', 'passport'],
  })
  idType?: string;

  @Prop({ type: String })
  verifiedName?: string;

  @Prop({ type: String })
  verifiedDOB?: string;

  @Prop({ type: String })
  licenseNumber?: string;

  @Prop({ type: Date })
  verifiedAt?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  verifiedBy?: string;

  // Auto-delete pending/failed records
  @Prop({ type: Date, default: null })
  expiresAt?: Date | null;
}

export const IdentityVerificationSchema =
  SchemaFactory.createForClass(IdentityVerification);

IdentityVerificationSchema.index({ user: 1, status: 1 });
IdentityVerificationSchema.index({ stripeVerificationId: 1 });
IdentityVerificationSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 86400 },
);

// Set expiresAt for pending/failed records on save
IdentityVerificationSchema.pre('save', function (next) {
  if (this.status === 'pending' || this.status === 'failed') {
    this.expiresAt = new Date();
  } else if (this.status === 'verified') {
    this.expiresAt = null;
  }
  next();
});

// Handle expiresAt on updates (for webhook)
IdentityVerificationSchema.pre('findOneAndUpdate', function (next) {
  const update = this.getUpdate() as any;

  if (update.$set) {
    if (update.$set.status === 'verified') {
      update.$set.expiresAt = null;
    } else if (
      update.$set.status === 'pending' ||
      update.$set.status === 'failed'
    ) {
      update.$set.expiresAt = new Date();
    }
  } else {
    if (update.status === 'verified') {
      update.expiresAt = null;
    } else if (update.status === 'pending' || update.status === 'failed') {
      update.expiresAt = new Date();
    }
  }

  next();
});
