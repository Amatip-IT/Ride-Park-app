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

  /** Customer funds reserved for rides in progress (GBP). Not spendable, not paid out. */
  @Prop({ default: 0 })
  heldBalance: number;

  /** Ride ids whose hold has been applied to this wallet (idempotency). */
  @Prop({ type: [String], default: [], select: false })
  appliedHolds: string[];

  /** Ride ids whose hold has been captured or released (idempotency). */
  @Prop({ type: [String], default: [], select: false })
  settledHolds: string[];

  @Prop({ type: Object, default: null })
  bankDetails: {
    accountName: string;
    last4?: string;
    bankName?: string;
  };

  @Prop()
  stripeExternalAccountId?: string;

  @Prop({ default: null })
  stripeConnectId: string; // Stripe Custom Account ID

  @Prop({ default: 'pending' })
  stripeConnectStatus: string; // pending, active, restricted

  @Prop({ type: [String], default: [] })
  stripeConnectRequirementsDue: string[];

  @Prop({ type: Date })
  stripeTosAcceptedAt?: Date;

  @Prop({ default: false })
  manualPayoutsConfigured: boolean;

  @Prop({ type: [String], default: [], select: false })
  creditedReferences: string[];
}

export const WalletSchema = SchemaFactory.createForClass(Wallet);
WalletSchema.index({ stripeConnectId: 1 }, { unique: true, sparse: true });
