import { Injectable, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Cron, CronExpression } from '@nestjs/schedule';
import { Model } from 'mongoose';
import {
  Transaction,
  TransactionDocument,
} from 'src/schemas/transaction.schema';
import { WalletService } from './wallet.service';

@Injectable()
export class WithdrawalRecoveryTask {
  private readonly logger = new Logger(WithdrawalRecoveryTask.name);

  constructor(
    @InjectModel(Transaction.name)
    private readonly transactionModel: Model<TransactionDocument>,
    private readonly walletService: WalletService,
  ) {}

  @Cron(CronExpression.EVERY_10_MINUTES)
  async reconcileStuckWithdrawals(): Promise<void> {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 5 * 60_000);
    const candidates = await this.transactionModel
      .find({
        type: 'withdrawal',
        status: {
          $in: [
            'transferring',
            'transfer_failed',
            'transferred',
            'payout_pending',
          ],
        },
        recoveryAttempts: { $lt: 5 },
        updatedAt: { $lt: staleBefore },
        $and: [
          {
            $or: [
              { nextRecoveryAt: { $exists: false } },
              { nextRecoveryAt: { $lte: now } },
            ],
          },
          {
            $or: [
              { recoveryLeaseUntil: { $exists: false } },
              { recoveryLeaseUntil: { $lte: now } },
            ],
          },
        ],
      })
      .select('_id')
      .limit(50)
      .lean()
      .exec();

    for (const candidate of candidates) {
      const claimed = await this.transactionModel.findOneAndUpdate(
        {
          _id: candidate._id,
          recoveryAttempts: { $lt: 5 },
          $or: [
            { recoveryLeaseUntil: { $exists: false } },
            { recoveryLeaseUntil: { $lte: new Date() } },
          ],
        },
        {
          $inc: { recoveryAttempts: 1 },
          $set: {
            recoveryLeaseUntil: new Date(Date.now() + 4 * 60_000),
            lastReconciledAt: new Date(),
          },
        },
        { new: true },
      );
      if (!claimed) continue;

      try {
        const rawResult: unknown = await this.walletService.reconcileWithdrawal(
          claimed._id.toString(),
        );
        const success =
          typeof rawResult === 'object' &&
          rawResult !== null &&
          'success' in rawResult &&
          rawResult.success === true;
        if (!success) {
          const message =
            typeof rawResult === 'object' &&
            rawResult !== null &&
            'message' in rawResult &&
            typeof rawResult.message === 'string'
              ? rawResult.message
              : 'Reconciliation did not complete';
          this.logger.warn(
            JSON.stringify({
              event: 'withdrawal_reconciliation_incomplete',
              transactionId: claimed._id.toString(),
              attempt: claimed.recoveryAttempts,
              message,
            }),
          );
        }
      } catch (error: unknown) {
        this.logger.error(
          JSON.stringify({
            event: 'withdrawal_reconciliation_failed',
            transactionId: claimed._id.toString(),
            attempt: claimed.recoveryAttempts,
            error: error instanceof Error ? error.message : 'Unknown error',
          }),
        );
      } finally {
        const delayMinutes = Math.min(
          60,
          5 * 2 ** Math.max(0, claimed.recoveryAttempts - 1),
        );
        await this.transactionModel.updateOne(
          { _id: claimed._id },
          {
            $unset: { recoveryLeaseUntil: 1 },
            $set: {
              nextRecoveryAt: new Date(Date.now() + delayMinutes * 60_000),
            },
          },
        );
      }
    }
  }
}
