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
  @Prop({ type: Number, default: 1.1 })
  ratePerMile: number;

  // Rate per minute (£0.20 for taxi, 0 for driver)
  @Prop({ type: Number, default: 0.2 })
  ratePerMinute: number;

  // Ride status
  @Prop({
    default: 'pending',
    enum: [
      'pending',
      'in_progress',
      'awaiting_payment',
      'completed',
      'cancelled',
    ],
  })
  status: string;

  // Passenger confirmed they are at the destination before paying
  @Prop({ type: Date })
  passengerConfirmedAt?: Date;

  // Payment status (tracks whether the Stripe charge succeeded)
  @Prop({
    default: 'pending',
    enum: ['pending', 'processing', 'charged', 'payment_failed'],
  })
  paymentStatus: string;

  // Stripe PaymentIntent ID (stored after successful charge on completion)
  @Prop({ type: String })
  paymentIntentId?: string;

  @Prop({ type: Number, default: 0 })
  paymentAttempt: number;

  @Prop({ type: Date })
  paymentProcessingAt?: Date;

  // Timestamps for the ride lifecycle
  @Prop({ type: Date })
  startedAt?: Date;

  @Prop({ type: Date })
  completedAt?: Date;

  // ── Pricing (pence / metres / seconds). Legacy pound fields above are derived from these. ──
  @Prop({ enum: ['small', 'medium', 'large'], default: 'small' })
  vehicleCategory: string;

  @Prop({ type: Object })
  pricingSnapshot?: Record<string, any>;

  /** Driver → pickup road distance fixed at acceptance; billed once. */
  @Prop({ type: Number, default: 0 })
  approachMeters: number;

  /** Road route pickup → destination (estimate). */
  @Prop({ type: Number })
  estimatedTripMeters?: number;

  /** Distance recorded from the driver's GPS during the trip. */
  @Prop({ type: Number })
  recordedTripMeters?: number;

  /** Trip distance actually billed after reconciling estimate vs recording. */
  @Prop({ type: Number })
  billedTripMeters?: number;

  @Prop({ type: Number })
  tripSeconds?: number;

  @Prop({ type: Object })
  fareBreakdown?: Record<string, any>;

  @Prop({ type: Number })
  estimatedFarePence?: number;

  @Prop({ type: Number })
  totalCostPence?: number;

  @Prop({
    type: [
      {
        initiatedBy: { type: String, enum: ['customer', 'driver'], required: true },
        initiatorId: { type: MongooseSchema.Types.ObjectId, ref: 'User', required: true },
        startedAt: { type: Date, required: true },
        endedAt: { type: Date, default: null },
        durationSeconds: { type: Number, default: 0 },
        ratePencePerMinute: { type: Number, default: 0 },
        chargePence: { type: Number, default: 0 },
        endedBy: { type: MongooseSchema.Types.ObjectId, ref: 'User' },
      },
    ],
    default: [],
  })
  stops: Array<{
    _id?: any;
    initiatedBy: 'customer' | 'driver';
    initiatorId: string;
    startedAt: Date;
    endedAt?: Date | null;
    durationSeconds: number;
    ratePencePerMinute: number;
    chargePence: number;
    endedBy?: string;
  }>;

  /** How the passenger pays: funds held in their wallet, or a card charge (legacy rides). */
  @Prop({ enum: ['wallet', 'card'], default: 'card' })
  paymentMethod: string;

  @Prop({
    type: {
      status: {
        type: String,
        enum: ['none', 'holding', 'held', 'capturing', 'captured', 'releasing', 'released', 'failed'],
        default: 'none',
      },
      amountPence: { type: Number, default: 0 },
      topUpPaymentIntentId: { type: String },
      heldAt: { type: Date },
      capturedAt: { type: Date },
      capturedAmountPence: { type: Number },
      extraChargedPence: { type: Number },
      releasedAt: { type: Date },
      failureReason: { type: String },
    },
    default: () => ({ status: 'none', amountPence: 0 }),
  })
  hold: {
    status: string;
    amountPence: number;
    topUpPaymentIntentId?: string;
    heldAt?: Date;
    capturedAt?: Date;
    capturedAmountPence?: number;
    extraChargedPence?: number;
    releasedAt?: Date;
    failureReason?: string;
  };

  createdAt?: Date;
  updatedAt?: Date;
}

export const RideSchema: MongooseSchema<Ride> =
  SchemaFactory.createForClass(Ride);

RideSchema.index({ booking: 1 }, { unique: true, sparse: true });
RideSchema.index({ paymentIntentId: 1 }, { unique: true, sparse: true });

// Indexes
RideSchema.index({ passenger: 1, status: 1 });
RideSchema.index({ driver: 1, status: 1 });
RideSchema.index({ serviceType: 1 });
