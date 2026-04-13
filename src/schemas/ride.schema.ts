import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type RideDocument = HydratedDocument<Ride>;

@Schema({ timestamps: true })
export class Ride {
  // The passenger/requester
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  passenger: string;

  // The driver/taxi driver
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  driver: string;

  // Linked booking request
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BookingRequest' })
  booking?: string;

  // Service type
  @Prop({ required: true, enum: ['driver', 'taxi'] })
  serviceType: string;

  // Pickup location
  @Prop({
    type: {
      address: { type: String },
      lat: { type: Number },
      lng: { type: Number },
    },
  })
  pickup?: { address?: string; lat?: number; lng?: number };

  // Dropoff location
  @Prop({
    type: {
      address: { type: String },
      lat: { type: Number },
      lng: { type: Number },
    },
  })
  dropoff?: { address?: string; lat?: number; lng?: number };

  // Distance in miles
  @Prop({ type: Number, default: 0 })
  distanceMiles: number;

  // Duration in minutes
  @Prop({ type: Number, default: 0 })
  durationMinutes: number;

  // Pricing breakdown
  @Prop({ type: Number, default: 0 })
  distanceCost: number; // £1.10 per mile

  @Prop({ type: Number, default: 0 })
  timeCost: number; // £0.20 per minute (taxi only)

  @Prop({ type: Number, default: 0 })
  totalCost: number; // distanceCost + timeCost

  // Rate per mile (£1.10)
  @Prop({ type: Number, default: 1.10 })
  ratePerMile: number;

  // Rate per minute (£0.20 for taxi, 0 for driver)
  @Prop({ type: Number, default: 0.20 })
  ratePerMinute: number;

  // Ride status
  @Prop({
    default: 'pending',
    enum: ['pending', 'in_progress', 'completed', 'cancelled'],
  })
  status: string;

  // Timestamps for the ride lifecycle
  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const RideSchema: MongooseSchema<Ride> =
  SchemaFactory.createForClass(Ride);

// Indexes
RideSchema.index({ passenger: 1, status: 1 });
RideSchema.index({ driver: 1, status: 1 });
RideSchema.index({ booking: 1 });
RideSchema.index({ serviceType: 1 });
