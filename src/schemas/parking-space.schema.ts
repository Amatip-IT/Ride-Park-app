import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ParkingSpaceDocument = HydratedDocument<ParkingSpace>;

@Schema({ timestamps: true })
export class ParkingSpace {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  owner: string;

  @Prop({ required: true, trim: true })
  name: string;

  @Prop({ type: String, trim: true })
  description?: string;

  // Address / location
  @Prop({ required: true, trim: true })
  postCode: string;

  @Prop({ type: String, trim: true })
  town?: string;

  @Prop({ type: String, trim: true })
  county?: string;

  @Prop({ type: String, trim: true })
  country?: string;

  // what3words address (e.g. "filled.count.soap")
  @Prop({ type: String, trim: true })
  what3words?: string;

  // Nearest place name from what3words API
  @Prop({ type: String, trim: true })
  nearestPlace?: string;

  @Prop({
    type: {
      lat: { type: Number },
      lng: { type: Number },
    },
  })
  coordinates?: { lat: number; lng: number };

  // Pricing
  @Prop({ required: true, type: Number })
  hourlyRate: number;

  @Prop({ type: Number })
  dailyRate?: number;

  // Media
  @Prop({ type: [String], default: [] })
  photos: string[];

  @Prop({ type: [String], default: [] })
  cctvPhotos: string[];

  // Detailed Characteristics
  @Prop({ type: String, trim: true })
  parkingType?: string; // e.g. "Short Stay"

  @Prop({ type: [String], default: [] })
  bookingMethods: string[]; // e.g. ["Phone", "Online / App"]

  @Prop({ type: String, trim: true })
  locationId?: string; // ID assigned to layout display. e.g "59181"

  @Prop({ type: String, trim: true })
  chargesDescription?: string;

  @Prop({ type: String, trim: true })
  maxStayDetails?: string; // "Maximum stay 2 hours..."

  @Prop({ type: [String], default: [] })
  acceptedVehicles: string[]; // ["Car", "Motorbikes"]

  @Prop({ type: MongooseSchema.Types.Mixed, default: {} })
  openingTimes: Record<string, string>; // { "Monday": "24 hours", ... }

  // Availability
  @Prop({ default: true })
  isAvailable: boolean;

  @Prop({ default: 1, type: Number })
  totalSpots: number;

  @Prop({ default: 0, type: Number })
  occupiedSpots: number;

  // Verification status (from provider verification)
  @Prop({ default: false })
  isVerified: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ParkingSpaceSchema: MongooseSchema<ParkingSpace> =
  SchemaFactory.createForClass(ParkingSpace);

// Text index for location-based search
ParkingSpaceSchema.index({ postCode: 1 });
ParkingSpaceSchema.index({ town: 'text', name: 'text', postCode: 'text', nearestPlace: 'text' });
ParkingSpaceSchema.index({ owner: 1 });
ParkingSpaceSchema.index({ isAvailable: 1, isVerified: 1 });
ParkingSpaceSchema.index({ what3words: 1 });
ParkingSpaceSchema.index({ nearestPlace: 1 });

