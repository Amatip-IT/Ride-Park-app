import * as bcrypt from 'bcrypt';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { VerifiedStatus, VerifiedStatusSchema } from './verified-status.schema';
import { OtpStorage, OtpStorageSchema } from './otp.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true })
export class User {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[a-z0-9_]{3,30}$/,
  })
  username: string;

  @Prop({
    required: true,
    unique: true,
    lowercase: true,
    trim: true,
    match: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
  email: string;

  @Prop({
    required: true,
    trim: true,
    match: /^\+?[1-9]\d{1,14}$/,
  })
  phoneNumber: string;

  @Prop({ type: String, trim: true })
  postCode?: string;

  @Prop({
    type: {
      street: { type: String },
      county: { type: String },
      town: { type: String },
      country: { type: String },
    },
    default: {},
  })
  address?: {
    street?: string;
    county?: string;
    town?: string;
    country?: string;
  };

  @Prop({ required: true, default: false })
  termsAccepted: boolean;

  @Prop({ type: Date })
  termsAcceptedAt?: Date;

  @Prop({
    type: String,
    enum: ['driver_license', 'national_identity_card', 'passport'],
  })
  idType?: string;

  @Prop({ type: String })
  identityDocumentUrl?: string;

  @Prop({ type: String })
  proofOfAddressUrl?: string;

  @Prop({
    type: String,
    enum: ['none', 'pending', 'verified', 'rejected'],
    default: 'none',
  })
  identityStatus?: string;

  @Prop({ required: true, select: false })
  password: string;

  @Prop({
    default: 'user',
    required: true,
    enum: ['user', 'admin', 'parking_provider', 'driver', 'taxi_driver'],
  })
  role: string;

  @Prop({ type: String, enum: ['Normal car', 'Mini Bus', 'Bus'] })
  taxiType?: string;

  @Prop({ type: VerifiedStatusSchema, default: {} })
  isVerified: VerifiedStatus;

  @Prop({ type: OtpStorageSchema, select: false, default: null })
  otpStorage?: OtpStorage;

  @Prop({ type: Date })
  lastLoggedInAt: Date;

  @Prop({ type: String, select: false, default: null })
  refreshToken?: string;

  @Prop({ type: Number, default: 0 })
  tokenVersion: number;

  @Prop({ type: Number, default: 0 })
  failedLoginAttempts: number;

  @Prop({ type: Date, default: null })
  lockUntil?: Date | null;

  @Prop({ type: String, default: null })
  pushToken?: string;

  @Prop({ type: String, select: false, default: null })
  stripeCustomerId?: string;

  @Prop({ type: String, default: null })
  profileImageUrl?: string;

  @Prop({ default: 'active', enum: ['active', 'suspended', 'banned'] })
  accountStatus: string;

  @Prop({ type: String })
  suspensionReason?: string;

  @Prop({ type: Date })
  suspensionEndDate?: Date;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  suspendedBy?: string;

  @Prop({ type: Date })
  suspendedAt?: Date;

  // ============================================================
  // NEW: Properly typed documents array for uploaded documents
  // ============================================================
  @Prop({
    type: [{
      documentType: {
        type: String,
        required: true,
        enum: [
          'vat_certificate',
          'driver_license',
          'insurance',
          'vehicle_registration',
          'id_document',
          'proof_of_address',
          'profile_photo',
          'other'
        ]
      },
      url: { type: String, required: true },
      fileName: { type: String, required: true },
      fileSize: { type: Number, required: true },
      mimeType: { type: String, required: true },
      uploadedAt: { type: Date, default: Date.now },
      status: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending'
      },
      rejectionReason: { type: String },
      reviewedAt: { type: Date },
      reviewedBy: { type: String }
    }],
    default: []
  })
  documents: Array<{
    documentType: string;
    url: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
    uploadedAt: Date;
    status: string;
    rejectionReason?: string;
    reviewedAt?: Date;
    reviewedBy?: string;
  }>;
}

export const UserSchema: MongooseSchema<User> =
  SchemaFactory.createForClass(User);

UserSchema.pre('save', function (next) {
  if (typeof this.username === 'string') {
    this.username = this.username.toLowerCase().trim();
  }
  next();
});

UserSchema.pre('save', async function (next) {
  if (!this.isModified('password')) {
    return next();
  }

  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

UserSchema.virtual('driverVerifications', {
  ref: 'DriverVerification',
  localField: '_id',
  foreignField: 'user',
});

UserSchema.virtual('parkingVerifications', {
  ref: 'ParkingVerification',
  localField: '_id',
  foreignField: 'user',
});

UserSchema.virtual('identityVerifications', {
  ref: 'IdentityVerification',
  localField: '_id',
  foreignField: 'user',
});

UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON', { virtuals: true });
