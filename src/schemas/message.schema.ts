import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { HydratedDocument, Schema as MongooseSchema } from 'mongoose';

export type MessageDocument = HydratedDocument<Message>;

@Schema({ timestamps: true })
export class Message {
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  sender: string;

  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'User', required: true })
  recipient: string;

  // We optionally tie a chat to a specific booking/service so users know what they are talking about
  @Prop({ type: MongooseSchema.Types.ObjectId, ref: 'BookingRequest' })
  bookingId?: string;

  @Prop({ required: true, type: String })
  content: string;

  @Prop({ default: false })
  isRead: boolean;

  createdAt?: Date;
  updatedAt?: Date;
}

export const MessageSchema: MongooseSchema<Message> =
  SchemaFactory.createForClass(Message);

// Indexes
MessageSchema.index({ sender: 1, recipient: 1 });
MessageSchema.index({ recipient: 1, sender: 1 });
MessageSchema.index({ bookingId: 1 });
MessageSchema.index({ createdAt: -1 });
