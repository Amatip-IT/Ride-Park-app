import * as bcrypt from 'bcrypt';
import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import type { HydratedDocument, Schema as MongooseSchema } from 'mongoose';
import { VerifiedStatus, VerifiedStatusSchema } from './verified-status.schema';
import { OtpStorage, OtpStorageSchema } from './otp.schema';

export type UserDocument = HydratedDocument<User>;

@Schema({ timestamps: true }) // Enable automatic createdAt and updatedAt fields
export class User {
  @Prop({ required: true })
  firstName: string;

  @Prop({ required: true })
  lastName: string;

  @Prop({ required: true, unique: true })
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

  @Prop({ required: true, select: false })
  password: string;

  @Prop({
    default: 'user',
    required: true,
    enum: ['user', 'admin', 'parking_provider', 'driver', 'taxi_driver'],
  })
  role: string;

  // Embedded small docs
  @Prop({ type: VerifiedStatusSchema, default: {} })
  isVerified: VerifiedStatus;

  @Prop({ type: OtpStorageSchema, select: false, default: null })
  otpStorage?: OtpStorage;

  @Prop({ type: Date })
  lastLoggedInAt: Date;

  @Prop({ type: String, select: false, default: null })
  refreshToken?: string;
}

export const UserSchema: MongooseSchema<User> =
  SchemaFactory.createForClass(User);

// Pre-save hook to hash password
UserSchema.pre('save', async function (next) {
  // Only hash if password is modified
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

// Virtuals for related verifications
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

// Enable virtuals in JSON / Object outputs
UserSchema.set('toObject', { virtuals: true });
UserSchema.set('toJSON', { virtuals: true });
