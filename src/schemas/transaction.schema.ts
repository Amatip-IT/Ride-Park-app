import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  providerId: Types.ObjectId;

  @Prop({ required: true, enum: ['earning', 'withdrawal'] })
  type: string;

  @Prop({ required: true })
  amount: number; // For earning, this is the GROSS amount

  @Prop({ default: 0 })
  platformFee: number; // For earning, the fee deducted. Net = amount - platformFee

  @Prop({ required: true, enum: ['pending', 'completed', 'rejected', 'failed'] })
  status: string;

  @Prop()
  description: string;

  @Prop()
  referenceId: string; // Job ID for earnings, or Stripe Transfer ID for withdrawals
  
  @Prop()
  adminNotes: string; // Reason for rejection, etc.
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);
