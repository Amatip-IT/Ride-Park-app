import {
  forwardRef,
  Inject,
  Injectable,
  Logger,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, PipelineStage, Types } from 'mongoose';
import { Wallet, WalletDocument } from 'src/schemas/wallet.schema';
import {
  Transaction,
  TransactionDocument,
} from 'src/schemas/transaction.schema';
import { PaymentsService } from 'src/payments/payments.service';

/** Stripe's smallest GBP card charge. Card top-ups for shortfalls are rounded up to this. */
const MIN_CARD_CHARGE_PENCE = 30;

export type WalletResult =
  | { ok: true; topUpPence: number; alreadyDone?: boolean }
  | { ok: false; message: string };

const pounds = (pence: number) => Math.round(pence) / 100;
const toPence = (amount: number | undefined) => Math.round((amount || 0) * 100);

/**
 * Customer wallet operations for rides. Every balance change is a single conditional
 * update on the wallet document (no read-modify-write), and every operation is keyed
 * by the ride id so retries can't double-hold, double-charge or double-release.
 * Balances stay in GBP (existing schema) but are always rounded to whole pence.
 */
@Injectable()
export class RideWalletService {
  private readonly logger = new Logger(RideWalletService.name);

  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
  ) {}

  private oid(id: string) {
    return new Types.ObjectId(id);
  }

  private async ensureWallet(userId: string): Promise<void> {
    await this.walletModel.updateOne(
      { providerId: this.oid(userId) },
      { $setOnInsert: { providerId: this.oid(userId), balance: 0, heldBalance: 0 } },
      { upsert: true },
    );
  }

  /** Rounded field arithmetic inside an update pipeline (avoids float drift like 37.650000001). */
  private addRounded(field: string, deltaPounds: number) {
    return {
      $round: [{ $add: [{ $ifNull: [`$${field}`, 0] }, deltaPounds] }, 2],
    };
  }

  private pushId(field: string, id: string) {
    return { $concatArrays: [{ $ifNull: [`$${field}`, []] }, [id]] };
  }

  private async ledger(entry: {
    userId: string;
    type: 'ride_hold' | 'ride_hold_release' | 'ride_payment' | 'refund' | 'deposit';
    referenceId: string;
    amountPence: number;
    description: string;
    stripePaymentIntentId?: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    const result = await this.transactionModel.updateOne(
      { providerId: this.oid(entry.userId), type: entry.type, referenceId: entry.referenceId },
      {
        $setOnInsert: {
          amount: pounds(entry.amountPence),
          amountPence: entry.amountPence,
          platformFee: 0,
          status: 'completed',
          description: entry.description,
          stripePaymentIntentId: entry.stripePaymentIntentId,
          metadata: entry.metadata,
        },
      },
      { upsert: true },
    );
    return result.upsertedCount > 0;
  }

  async getBalances(userId: string): Promise<{ availablePence: number; heldPence: number }> {
    const wallet = await this.walletModel
      .findOne({ providerId: this.oid(userId) })
      .select('balance heldBalance')
      .lean()
      .exec();
    return { availablePence: toPence(wallet?.balance), heldPence: toPence(wallet?.heldBalance) };
  }

  /**
   * Charges the saved card for a wallet shortfall and credits the wallet exactly once
   * per idempotency key, even if called concurrently or retried.
   */
  private async topUpFromCard(
    userId: string,
    shortfallPence: number,
    idempotencyKey: string,
    description: string,
  ): Promise<{ ok: true; pence: number; paymentIntentId: string } | { ok: false; message: string }> {
    const pence = Math.max(MIN_CARD_CHARGE_PENCE, Math.ceil(shortfallPence));
    let paymentIntentId: string;
    try {
      const intent = await this.paymentsService.chargeCustomer(
        userId,
        pounds(pence),
        description,
        { type: 'wallet_top_up', reason: 'ride_shortfall', idempotencyKey },
        idempotencyKey,
      );
      paymentIntentId = intent.id;
    } catch (error: any) {
      this.logger.warn(`Ride wallet top-up failed for ${userId}: ${error?.message || error}`);
      return {
        ok: false,
        message:
          'Your wallet balance is too low and your saved card could not be charged. Please add funds or update your card.',
      };
    }

    // The deposit row is the idempotency gate: only the request that inserts it credits the wallet
    const inserted = await this.ledger({
      userId,
      type: 'deposit',
      referenceId: paymentIntentId,
      amountPence: pence,
      description,
      stripePaymentIntentId: paymentIntentId,
      metadata: { idempotencyKey },
    });
    if (inserted) {
      await this.walletModel.updateOne({ providerId: this.oid(userId) }, [
        { $set: { balance: this.addRounded('balance', pounds(pence)) } },
      ] as PipelineStage[] as any);
    }
    return { ok: true, pence, paymentIntentId };
  }

  /**
   * Moves `amountPence` from available to held for this ride. Tops up the shortfall
   * from the saved card when the wallet doesn't cover it.
   */
  async holdRideFunds(input: {
    rideId: string;
    passengerId: string;
    amountPence: number;
  }): Promise<WalletResult & { topUpPaymentIntentId?: string }> {
    const { rideId, passengerId } = input;
    const amountPence = Math.max(0, Math.round(input.amountPence));
    await this.ensureWallet(passengerId);

    const tryHold = async () =>
      this.walletModel.updateOne(
        {
          providerId: this.oid(passengerId),
          appliedHolds: { $ne: rideId },
          balance: { $gte: pounds(amountPence) },
        },
        [
          {
            $set: {
              balance: this.addRounded('balance', -pounds(amountPence)),
              heldBalance: this.addRounded('heldBalance', pounds(amountPence)),
              appliedHolds: this.pushId('appliedHolds', rideId),
            },
          },
        ] as any,
      );

    const alreadyHeld = async () =>
      !!(await this.walletModel.exists({ providerId: this.oid(passengerId), appliedHolds: rideId }));

    // Ledger upsert is idempotent, so it also repairs a missing row after a crash
    const recordHold = () =>
      this.ledger({
        userId: passengerId,
        type: 'ride_hold',
        referenceId: rideId,
        amountPence,
        description: 'Ride fare held',
        metadata: { rideId },
      });

    let topUpPence = 0;
    let topUpPaymentIntentId: string | undefined;
    let result = await tryHold();

    if (result.modifiedCount === 0) {
      if (await alreadyHeld()) {
        await recordHold();
        return { ok: true, topUpPence: 0, alreadyDone: true };
      }

      const { availablePence } = await this.getBalances(passengerId);
      const topUp = await this.topUpFromCard(
        passengerId,
        amountPence - availablePence,
        `ride:${rideId}:hold-topup`,
        `Wallet top-up for ride ${rideId}`,
      );
      if (!topUp.ok) return topUp;
      topUpPence = topUp.pence;
      topUpPaymentIntentId = topUp.paymentIntentId;

      result = await tryHold();
      if (result.modifiedCount === 0 && !(await alreadyHeld())) {
        return { ok: false, message: 'Your wallet balance changed. Please try again.' };
      }
    }

    await recordHold();
    return { ok: true, topUpPence, topUpPaymentIntentId };
  }

  /**
   * Settles the hold at the final fare: the held amount is consumed, any unused part
   * returns to available balance, and any extra is taken from available balance
   * (topping up from the card if needed).
   */
  async captureRideHold(input: {
    rideId: string;
    passengerId: string;
    heldPence: number;
    finalPence: number;
  }): Promise<WalletResult & { extraChargedPence?: number }> {
    const { rideId, passengerId } = input;
    const heldPence = Math.max(0, Math.round(input.heldPence));
    const finalPence = Math.max(0, Math.round(input.finalPence));
    const differencePence = heldPence - finalPence; // >0 refund to available, <0 extra due

    const trySettle = async () =>
      this.walletModel.updateOne(
        {
          providerId: this.oid(passengerId),
          appliedHolds: rideId,
          settledHolds: { $ne: rideId },
          ...(differencePence < 0 ? { balance: { $gte: pounds(-differencePence) } } : {}),
        },
        [
          {
            $set: {
              heldBalance: this.addRounded('heldBalance', -pounds(heldPence)),
              balance: this.addRounded('balance', pounds(differencePence)),
              settledHolds: this.pushId('settledHolds', rideId),
            },
          },
        ] as any,
      );

    const alreadySettled = async () =>
      !!(await this.walletModel.exists({ providerId: this.oid(passengerId), settledHolds: rideId }));

    const recordPayment = () =>
      this.ledger({
        userId: passengerId,
        type: 'ride_payment',
        referenceId: rideId,
        amountPence: finalPence,
        description: 'Ride fare paid from wallet',
        metadata: { rideId, heldPence, finalPence },
      });

    let topUpPence = 0;
    let result = await trySettle();
    if (result.modifiedCount === 0) {
      if (await alreadySettled()) {
        await recordPayment();
        return { ok: true, topUpPence: 0, alreadyDone: true, extraChargedPence: Math.max(0, -differencePence) };
      }
      if (!(await this.walletModel.exists({ providerId: this.oid(passengerId), appliedHolds: rideId }))) {
        return { ok: false, message: 'No held funds were found for this ride.' };
      }

      const { availablePence } = await this.getBalances(passengerId);
      const topUp = await this.topUpFromCard(
        passengerId,
        -differencePence - availablePence,
        `ride:${rideId}:final-topup`,
        `Wallet top-up for final fare of ride ${rideId}`,
      );
      if (!topUp.ok) return topUp;
      topUpPence = topUp.pence;

      result = await trySettle();
      if (result.modifiedCount === 0 && !(await alreadySettled())) {
        return { ok: false, message: 'Your wallet balance changed. Please try again.' };
      }
    }

    await recordPayment();
    return {
      ok: true,
      topUpPence,
      extraChargedPence: Math.max(0, -differencePence),
    };
  }

  /** Returns held funds to available balance (ride cancelled, failed, or admin action). */
  async releaseRideHold(input: {
    rideId: string;
    passengerId: string;
    heldPence: number;
    reason: string;
  }): Promise<WalletResult> {
    const { rideId, passengerId } = input;
    const heldPence = Math.max(0, Math.round(input.heldPence));

    const result = await this.walletModel.updateOne(
      {
        providerId: this.oid(passengerId),
        appliedHolds: rideId,
        settledHolds: { $ne: rideId },
      },
      [
        {
          $set: {
            heldBalance: this.addRounded('heldBalance', -pounds(heldPence)),
            balance: this.addRounded('balance', pounds(heldPence)),
            settledHolds: this.pushId('settledHolds', rideId),
          },
        },
      ] as any,
    );

    if (result.modifiedCount === 0) {
      const settled = await this.walletModel.exists({
        providerId: this.oid(passengerId),
        settledHolds: rideId,
      });
      if (settled) return { ok: true, topUpPence: 0, alreadyDone: true };
      // Nothing was ever held — nothing to release
      return { ok: true, topUpPence: 0, alreadyDone: true };
    }

    await this.ledger({
      userId: passengerId,
      type: 'ride_hold_release',
      referenceId: rideId,
      amountPence: heldPence,
      description: `Held ride fare returned (${input.reason})`,
      metadata: { rideId, reason: input.reason },
    });
    return { ok: true, topUpPence: 0 };
  }

  /** Authorised refund (e.g. dispute resolution) credited to the customer's wallet once per reference. */
  async refundToWallet(input: {
    userId: string;
    amountPence: number;
    referenceId: string;
    description: string;
    metadata?: Record<string, unknown>;
  }): Promise<{ ok: boolean; alreadyDone: boolean }> {
    const amountPence = Math.round(input.amountPence);
    if (amountPence <= 0) return { ok: false, alreadyDone: false };
    await this.ensureWallet(input.userId);

    const inserted = await this.ledger({
      userId: input.userId,
      type: 'refund',
      referenceId: input.referenceId,
      amountPence,
      description: input.description,
      metadata: input.metadata,
    });
    if (!inserted) return { ok: true, alreadyDone: true };

    await this.walletModel.updateOne({ providerId: this.oid(input.userId) }, [
      { $set: { balance: this.addRounded('balance', pounds(amountPence)) } },
    ] as any);
    return { ok: true, alreadyDone: false };
  }

  async getRideTransactions(rideId: string) {
    return this.transactionModel
      .find({
        $or: [{ referenceId: rideId }, { 'metadata.rideId': rideId }, { 'metadata.idempotencyKey': { $regex: `^ride:${rideId}:` } }],
      })
      .sort({ createdAt: 1 })
      .lean()
      .exec();
  }
}
