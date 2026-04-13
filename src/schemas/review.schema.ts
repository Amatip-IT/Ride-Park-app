import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ReviewDocument = HydratedDocument<Review>;

@Schema({ timestamps: true })
export class Review {
  // Who wrote the review
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  reviewer: string;

  // What type of service is being reviewed
  @Prop({ required: true, enum: ['parking', 'driver', 'taxi'] })
  serviceType: string;

  // Reference to the specific service (ParkingSpace, Chauffeur, or Taxi)
  @Prop({ type: MongooseSchema.Types.ObjectId, required: true })
  serviceId: string;

  // Reference to the booking this review is for
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BookingRequest' })
  booking?: string;

  // Star rating (1-5)
  @Prop({ required: true, min: 1, max: 5, type: Number })
  rating: number;

  // Optional text comment
  @Prop({ type: String, trim: true, maxlength: 500 })
  comment?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ReviewSchema: MongooseSchema<Review> =
  SchemaFactory.createForClass(Review);

// Indexes
ReviewSchema.index({ serviceId: 1, serviceType: 1 });
ReviewSchema.index({ reviewer: 1 });
ReviewSchema.index({ booking: 1 });
ReviewSchema.index({ rating: 1 });
