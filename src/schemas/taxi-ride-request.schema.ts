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
      'searching',     // Actively looking for a driver
      'accepted',      // A driver accepted
      'in_progress',   // Ride is underway
      'completed',     // Ride finished
      'cancelled',     // Passenger cancelled
      'expired',       // No driver accepted in time
    ],
  })
  status: string;

  // Optional note from the passenger
  @Prop({ type: String })
  passengerNote?: string;

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

  createdAt?: Date;
  updatedAt?: Date;
}

export const TaxiRideRequestSchema: MongooseSchema<TaxiRideRequest> =
  SchemaFactory.createForClass(TaxiRideRequest);

// Indexes
TaxiRideRequestSchema.index({ passenger: 1, status: 1 });
TaxiRideRequestSchema.index({ status: 1, createdAt: -1 });
TaxiRideRequestSchema.index({ acceptedDriver: 1 });
TaxiRideRequestSchema.index({ pickupPostcode: 1 });
