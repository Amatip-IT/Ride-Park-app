import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type TaxiRideRequestDocument = HydratedDocument<TaxiRideRequest>;

@Schema({ timestamps: true })
export class TaxiRideRequest {
  // The passenger requesting the ride
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  passenger: string;

  // ── Pickup ──
  @Prop({ type: String })
  pickupAddress?: string;

  @Prop({ type: String })
  pickupPostcode?: string;

  @Prop({ type: Number })
  pickupLat?: number;

  @Prop({ type: Number })
  pickupLng?: number;

  // Whether pickup was from GPS
  @Prop({ type: Boolean, default: false })
  pickupFromGps: boolean;

  // ── Destination ──
  @Prop({ type: String, required: true })
  destinationAddress: string;

  @Prop({ type: String })
  destinationPostcode?: string;

  @Prop({ type: Number })
  destinationLat?: number;

  @Prop({ type: Number })
  destinationLng?: number;

  // ── Timing ──
  @Prop({
    required: true,
    enum: ['now', 'leave_at', 'arrive_by'],
    default: 'now',
  })
  timingType: string;

  // Scheduled time (only used when timingType is 'leave_at' or 'arrive_by')
  @Prop({ type: Date })
  scheduledTime?: Date;

  // ── Estimated distance & cost ──
  @Prop({ type: Number })
  estimatedDistanceMiles?: number;

  @Prop({ type: Number })
  estimatedDurationMinutes?: number;

  @Prop({ type: Number })
  estimatedCost?: number;

  // ── Request lifecycle ──
  @Prop({
    default: 'searching',
    enum: [
      'searching', // Actively looking for a driver
      'accepted', // A driver accepted
      'arrived', // Driver has arrived at pickup
      'in_progress', // Ride is underway
      'awaiting_payment', // Trip ended — passenger must confirm location and pay
      'completed', // Ride finished and paid
      'cancelled', // Passenger cancelled
      'expired', // No driver accepted in time
    ],
  })
  status: string;

  // Optional note from the passenger
  @Prop({ type: String })
  passengerNote?: string;

  // ── Targeted driver (when passenger picks a specific driver) ──
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  targetDriver?: string;

  // ── The driver who accepted ──
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  acceptedDriver?: string;

  // Driver's vehicle details (sent when accepting)
  @Prop({ type: Object })
  driverVehicle?: {
    make?: string;
    model?: string;
    color?: string;
    plateNumber?: string;
  };

  // Driver's ETA (in minutes, sent when accepting)
  @Prop({ type: Number })
  driverEtaMinutes?: number;

  @Prop({ type: String })
  driverNumber?: string;

  // When the driver accepted
  @Prop({ type: Date })
  acceptedAt?: Date;

  // Linked Ride record (created when trip actually starts)
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'Ride' })
  ride?: string;

  // Passenger confirmed they are at the destination before paying
  @Prop({ type: Date })
  passengerConfirmedAt?: Date;

  // ── Pricing (all money in pence, all distances in metres) ──
  @Prop({ enum: ['small', 'medium', 'large'], default: 'small' })
  vehicleCategory: string;

  /** Pricing rules locked when the passenger was quoted; later admin changes don't alter this ride. */
  @Prop({ type: Object })
  pricingSnapshot?: Record<string, any>;

  /** Road route pickup → destination at booking time. */
  @Prop({ type: Number })
  estimatedTripMeters?: number;

  @Prop({ type: Number })
  estimatedTripSeconds?: number;

  /** Driver → pickup road distance: nearest-driver estimate at booking, replaced at acceptance. */
  @Prop({ type: Number })
  approachMeters?: number;

  @Prop({ type: Number })
  approachSeconds?: number;

  @Prop({ enum: ['nearest_driver', 'target_driver', 'accepted_driver', 'none'] })
  approachSource?: string;

  /** Driver position captured when they accepted (start of the billable approach). */
  @Prop({ type: Object })
  driverStartLocation?: { lat: number; lng: number; capturedAt: Date };

  @Prop({ type: Object })
  quoteBreakdown?: Record<string, any>;

  @Prop({ type: Number })
  estimatedCostPence?: number;

  // ── Cancellation ──
  @Prop({ type: Date })
  cancelledAt?: Date;

  @Prop({ enum: ['passenger', 'driver', 'admin', 'system'] })
  cancelledBy?: string;

  @Prop({ type: String })
  cancellationReason?: string;

  /** Set when the driver has seen the cancellation popup; until then it is replayed on reconnect. */
  @Prop({ type: Date, default: null })
  driverCancelAcknowledgedAt?: Date | null;

  createdAt?: Date;
  updatedAt?: Date;
}

export const TaxiRideRequestSchema: MongooseSchema<TaxiRideRequest> =
  SchemaFactory.createForClass(TaxiRideRequest);

// Indexes
TaxiRideRequestSchema.index({ passenger: 1, status: 1 });
TaxiRideRequestSchema.index({ status: 1, createdAt: -1 });
TaxiRideRequestSchema.index({ acceptedDriver: 1 });
TaxiRideRequestSchema.index({ targetDriver: 1, status: 1 });
