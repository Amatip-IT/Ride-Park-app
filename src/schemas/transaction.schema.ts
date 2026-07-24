import { Prop, Schema, SchemaFactory } from '@nestjs/mongoose';
import { Document, Types } from 'mongoose';

export type TransactionDocument = Transaction & Document;

export const TRANSACTION_STATUSES = [
  'pending',
  'approved',
  'transferring',
  'transfer_failed',
  'transferred',
  'payout_pending',
  'payout_failed',
  'paid',
  'completed',
  'rejected',
  'failed',
  'disputed',
  'refunded',
] as const;

export type TransactionStatus = (typeof TRANSACTION_STATUSES)[number];

@Schema({ timestamps: true })
export class Transaction {
  @Prop({ type: Types.ObjectId, ref: 'User', required: true })
  providerId: Types.ObjectId;

  @Prop({ required: true, enum: ['earning', 'withdrawal', 'deposit'] })
  type: string;

  @Prop({ required: true })
  amount: number; // For earning, this is the GROSS amount

  @Prop({ default: 0 })
  platformFee: number; // For earning, the fee deducted. Net = amount - platformFee

  @Prop({ type: String, required: true, enum: TRANSACTION_STATUSES })
  status: TransactionStatus;

  @Prop()
  description: string;

  @Prop()
  referenceId: string; // Job ID for earnings, or Stripe Transfer ID for withdrawals

  @Prop()
  stripeTransferId?: string;

  @Prop()
  stripePayoutId?: string;

  @Prop()
  stripeConnectedAccountId?: string;

  @Prop()
  stripePaymentIntentId?: string;

  @Prop({ default: 0 })
  payoutAttempt: number;

  @Prop({ default: 0 })
  recoveryAttempts: number;

  @Prop({ type: Date })
  lastReconciledAt?: Date;

  @Prop({ type: Date })
  nextRecoveryAt?: Date;

  @Prop({ type: Date })
  recoveryLeaseUntil?: Date;

  @Prop()
  failureCode?: string;

  @Prop({ type: Date })
  approvedAt?: Date;

  @Prop({ type: Date })
  paidAt?: Date;

  @Prop({ type: Date })
  walletRefundedAt?: Date;

  @Prop()
  adminNotes?: string; // Reason for rejection, etc.
}

export const TransactionSchema = SchemaFactory.createForClass(Transaction);

TransactionSchema.index(
  { stripeTransferId: 1 },
  { unique: true, sparse: true },
);
TransactionSchema.index({ stripePayoutId: 1 }, { unique: true, sparse: true });

TransactionSchema.index(
  { providerId: 1, type: 1, referenceId: 1 },
  {
    unique: true,
    partialFilterExpression: { referenceId: { $type: 'string' } },
  },
);
TransactionSchema.index({
  type: 1,
  status: 1,
  nextRecoveryAt: 1,
  recoveryLeaseUntil: 1,
  updatedAt: 1,
});
