import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type BookingRequestDocument = HydratedDocument<BookingRequest>;

@Schema({ timestamps: true })
export class BookingRequest {
  // Who is making the request (general user)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  requester: string;

  // Who receives the request (provider) - Optional for broadcast
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  provider?: string;

  // Type of service being requested
  @Prop({
    required: true,
    enum: ['parking', 'driver', 'taxi'],
  })
  serviceType: string;

  // Reference to the specific service (ParkingSpace, Chauffeur, or Taxi) - Optional for broadcast
  @Prop({ type: MongooseSchema.Types.ObjectId })
  serviceId?: string;

  // Human-readable service name (for display)
  @Prop({ type: String })
  serviceName?: string;

  // Request status
  @Prop({
    default: 'pending',
    enum: ['pending', 'accepted', 'rejected', 'cancelled', 'completed'],
  })
  status: string;

  // Optional message from requester
  @Prop({ type: String })
  message?: string;

  // Provider's response message (e.g. rejection reason)
  @Prop({ type: String })
  responseMessage?: string;

  // Scheduling
  @Prop({ type: Date })
  startDate?: Date;

  @Prop({ type: Date })
  endDate?: Date;

  // Pricing snapshot at time of request
  @Prop({ type: Number })
  quotedPrice?: number;

  @Prop({ type: String })
  pricingUnit?: string; // 'per_hour', 'per_day', 'flat'

  // Timestamps for status changes
  @Prop({ type: Date })
  respondedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  createdAt?: Date;
  updatedAt?: Date;
}

export const BookingRequestSchema: MongooseSchema<BookingRequest> =
  SchemaFactory.createForClass(BookingRequest);

// Indexes
BookingRequestSchema.index({ requester: 1, status: 1 });
BookingRequestSchema.index({ provider: 1, status: 1 });
BookingRequestSchema.index({ serviceType: 1 });
BookingRequestSchema.index({ createdAt: -1 });
