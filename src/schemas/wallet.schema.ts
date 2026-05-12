import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type WalletDocument = Wallet & Document;

@Schema({ timestamps: true })
export class Wallet {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true, unique: true })
  providerId: Types.ObjectId;

  @Prop({ default: 0 })
  balance: number; // Available balance in GBP (e.g., 90.00)

  @Prop({ default: 0 })
  totalEarnings: number; // Gross total earnings in GBP (e.g., 100.00)

  @Prop({ type: Object, default: null })
  bankDetails: {
    accountName: string;
    accountNumber: string; // 8 digits
    sortCode: string; // 6 digits
  };

  @Prop({ default: null })
  stripeConnectId: string; // Stripe Custom Account ID

  @Prop({ default: 'pending' })
  stripeConnectStatus: string; // pending, active, restricted
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
