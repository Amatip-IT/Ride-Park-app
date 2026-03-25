import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type ChauffeurDocument = HydratedDocument<Chauffeur>;

@Schema({ timestamps: true })
export class Chauffeur {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  user: string;

  @Prop({
    default: 'not_applied',
    enum: [
      'not_applied',
      'pending_auto_check',
      'pending_admin_review',
      'approved',
      'rejected',
    ],
  })
  status: string;

  @Prop({ default: false })
  isVerified: boolean;

  @Prop({ default: false })
  isActive: boolean;

  @Prop({ type: Object })
  documents?: any;

  @Prop({ type: Object })
  location?: {
    coordinates?: { lat: number; lng: number };
    what3words?: string;
  };

  @Prop({
    default: 'unavailable',
    enum: ['unavailable', 'available', 'on_trip', 'offline'],
  })
  availability: string;

  @Prop()
  rejectionReason?: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User' })
  approvedBy?: string;

  createdAt?: Date;
  updatedAt?: Date;
}

export const ChauffeurSchema: MongooseSchema<Chauffeur> =
  SchemaFactory.createForClass(Chauffeur);

// Indexes
ChauffeurSchema.index({ user: 1 });
ChauffeurSchema.index({ isActive: 1 });
ChauffeurSchema.index({ availability: 1 });
