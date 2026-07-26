import {
  Injectable,
  HttpException,
  HttpStatus,
  InternalServerErrorException,
  Logger,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from 'src/schemas/wallet.schema';
import {
  Transaction,
  TransactionDocument,
} from 'src/schemas/transaction.schema';
import {
  PlatformSettings,
  PlatformSettingsDocument,
} from 'src/schemas/platform-settings.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { PaymentsService } from 'src/payments/payments.service';
import { mapStripeConnectStatus } from './connect.util';
import Stripe from 'stripe';
import { WebhookEventsService } from '../webhooks/webhook-events.service';
import {
  getStripeServerKey,
  getStripeWebhookSecret,
} from '../payments/stripe-config';

@Injectable()
export class WalletService {
  private stripe: Stripe;
  private readonly connectWebhookSecret: string;
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name)
    private transactionModel: Model<TransactionDocument>,
    @InjectModel(PlatformSettings.name)
    private platformSettingsModel: Model<PlatformSettingsDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    private readonly webhookEventsService: WebhookEventsService,
  ) {
    const key = getStripeServerKey('connect')!;
    this.stripe = new Stripe(key);
    this.connectWebhookSecret = getStripeWebhookSecret('connect')!;
  }

  async getPlatformFee(): Promise<number> {
    let settings = await this.platformSettingsModel.findOne();
    if (!settings) {
      settings = await this.platformSettingsModel.create({
        platformFeePercentage: 10,
      });
    }
    return settings.platformFeePercentage;
  }

  async getWallet(providerId: string) {
    let wallet = await this.walletModel.findOne({
      providerId: new Types.ObjectId(providerId),
    });
    if (!wallet) {
      wallet = await this.walletModel.create({
        providerId: new Types.ObjectId(providerId),
      });
    }
    return wallet;
  }

  async syncConnectAccountStatus(
    wallet: WalletDocument,
  ): Promise<WalletDocument> {
    if (!wallet.stripeConnectId) {
      return wallet;
    }

    const account = await this.stripe.accounts.retrieve(wallet.stripeConnectId);
    wallet.stripeConnectStatus = mapStripeConnectStatus(account);
    wallet.stripeConnectRequirementsDue =
      account.requirements?.currently_due || [];
    await wallet.save();
    return wallet;
  }

  async getConnectStatus(providerId: string) {
    const wallet = await this.getWallet(providerId);
    const synced = wallet.stripeConnectId
      ? await this.syncConnectAccountStatus(wallet)
      : wallet;

    return {
      success: true,
      data: {
        stripeConnectStatus: synced.stripeConnectStatus,
        requirementsDue: synced.stripeConnectRequirementsDue || [],
        payoutsEnabled: synced.stripeConnectStatus === 'active',
        hasBankDetails: Boolean(synced.bankDetails),
        stripeConnectId: synced.stripeConnectId || null,
      },
    };
  }

  verifyConnectWebhookSignature(
    payload: string | Buffer,
    signature: string,
  ): Stripe.Event {
    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        this.connectWebhookSecret,
      );
    } catch (error) {
      this.logger.error('Connect webhook signature verification failed', error);
      throw new InternalServerErrorException('Invalid webhook signature');
    }
  }

  async handleConnectWebhookEvent(event: Stripe.Event): Promise<boolean> {
    return this.webhookEventsService.processOnce(
      'connect',
      event.id,
      event.type,
      async () => {
        switch (event.type) {
          case 'account.updated':
            await this.handleAccountUpdated(event.data.object);
            break;
          case 'transfer.reversed':
            await this.handleTransferReversed(event.data.object);
            break;
          case 'payout.created':
          case 'payout.updated':
          case 'payout.paid':
          case 'payout.failed':
          case 'payout.canceled':
            await this.handlePayoutEvent(event.data.object);
            break;
          default:
            this.logger.debug(`Unhandled Connect webhook event: ${event.type}`);
        }
      },
    );
  }

  private async handleAccountUpdated(account: Stripe.Account) {
    const wallet = await this.walletModel.findOne({
      stripeConnectId: account.id,
    });
    if (!wallet) {
      return;
    }

    wallet.stripeConnectStatus = mapStripeConnectStatus(account);
    wallet.stripeConnectRequirementsDue =
      account.requirements?.currently_due || [];
    await wallet.save();
  }

  private async handleTransferReversed(transfer: Stripe.Transfer) {
    const transactionId = transfer.metadata?.transactionId;
    if (!transactionId) {
      this.logger.warn(
        `Transfer ${transfer.id} reversed without transactionId metadata`,
      );
      return;
    }

    const transaction = await this.transactionModel.findById(transactionId);
    if (!transaction || transaction.type !== 'withdrawal') {
      return;
    }

    if (
      transaction.status === 'failed' ||
      transaction.status === 'rejected' ||
      transaction.walletRefundedAt
    ) {
      return;
    }

    transaction.status = 'failed';
    transaction.failureCode = 'transfer_reversed';
    transaction.walletRefundedAt = new Date();
    transaction.adminNotes =
      'Stripe transfer was reversed — funds returned to wallet';
    await transaction.save();

    await this.walletModel.findOneAndUpdate(
      { providerId: transaction.providerId },
      { $inc: { balance: transaction.amount } },
    );

    this.logger.warn(
      `Withdrawal ${transactionId} reversed; refunded £${transaction.amount} to provider wallet`,
    );
  }

  private async handlePayoutEvent(payout: Stripe.Payout) {
    const transactionId = payout.metadata?.transactionId;
    const transaction = transactionId
      ? await this.transactionModel.findById(transactionId)
      : await this.transactionModel.findOne({ stripePayoutId: payout.id });

    if (!transaction || transaction.type !== 'withdrawal') {
      return;
    }

    const eventAttempt = Number(payout.metadata?.payoutAttempt || 0);
    if (eventAttempt && eventAttempt < (transaction.payoutAttempt || 0)) {
      this.logger.debug(
        `Ignored stale payout event for withdrawal ${transaction._id.toString()} attempt ${eventAttempt}`,
      );
      return;
    }

    transaction.stripePayoutId = payout.id;

    if (payout.status === 'paid') {
      transaction.status = 'paid';
      transaction.paidAt = new Date();
      transaction.failureCode = undefined;
      transaction.adminNotes = undefined;
    } else if (payout.status === 'failed' || payout.status === 'canceled') {
      transaction.status = 'payout_failed';
      transaction.failureCode = payout.failure_code || payout.status;
      transaction.adminNotes =
        payout.failure_message ||
        `Stripe payout ${payout.status}; correct the payout account and retry`;
    } else {
      transaction.status = 'payout_pending';
    }

    await transaction.save();
  }

  private async ensureManualPayouts(wallet: WalletDocument): Promise<void> {
    if (!wallet.stripeConnectId || wallet.manualPayoutsConfigured) {
      return;
    }

    await this.stripe.balanceSettings.update(
      {
        payments: {
          payouts: {
            schedule: { interval: 'manual' },
          },
        },
      },
      { stripeAccount: wallet.stripeConnectId },
    );

    wallet.manualPayoutsConfigured = true;
    await wallet.save();
  }

  async topUpWallet(userId: string, amount: number) {
    const paymentIntent = await this.paymentsService.chargeCustomer(
      userId,
      amount,
      'Wallet Top Up',
      { type: 'wallet_top_up' },
    );

    const wallet = await this.getWallet(userId);
    wallet.balance += amount;
    await wallet.save();

    await this.transactionModel.create({
      providerId: new Types.ObjectId(userId),
      type: 'deposit',
      amount: amount,
      status: 'completed',
      description: 'Wallet Top Up via Card',
      referenceId: paymentIntent.id,
    });

    return { success: true, message: 'Top up successful', data: wallet };
  }

  async updateBankDetails(
    providerId: string,
    details: { accountName: string; accountNumber: string; sortCode: string },
    options: { clientIp: string; acceptedStripeTerms: boolean },
  ) {
    if (!options.acceptedStripeTerms) {
      throw new HttpException(
        'You must accept the Stripe Connected Account Agreement to receive payouts',
        HttpStatus.BAD_REQUEST,
      );
    }

    const user = await this.userModel.findById(providerId);
    if (!user) {
      throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);
    }

    const wallet = await this.getWallet(providerId);

    try {
      let stripeAccountId = wallet.stripeConnectId;

      if (!stripeAccountId) {
        const account = await this.stripe.accounts.create({
          type: 'custom',
          country: 'GB',
          email: user.email,
          capabilities: {
            transfers: { requested: true },
          },
          business_type: 'individual',
          individual: {
            first_name: user.firstName,
            last_name: user.lastName,
            email: user.email,
          },
          tos_acceptance: {
            date: Math.floor(Date.now() / 1000),
            ip: options.clientIp,
          },
        });
        stripeAccountId = account.id;
        wallet.stripeConnectId = stripeAccountId;
        wallet.stripeTosAcceptedAt = new Date();
      } else if (!wallet.stripeTosAcceptedAt) {
        await this.stripe.accounts.update(stripeAccountId, {
          tos_acceptance: {
            date: Math.floor(Date.now() / 1000),
            ip: options.clientIp,
          },
        });
        wallet.stripeTosAcceptedAt = new Date();
      }

      await this.ensureManualPayouts(wallet);

      const bankToken = await this.stripe.tokens.create({
        bank_account: {
          country: 'GB',
          currency: 'gbp',
          account_holder_name: details.accountName,
          account_number: details.accountNumber,
          routing_number: details.sortCode,
        },
      });

      const externalAccount = await this.stripe.accounts.createExternalAccount(
        stripeAccountId,
        {
          external_account: bankToken.id,
          default_for_currency: true,
        },
      );

      wallet.bankDetails = {
        accountName: details.accountName,
        last4: 'last4' in externalAccount ? externalAccount.last4 : undefined,
        bankName:
          'bank_name' in externalAccount
            ? externalAccount.bank_name || undefined
            : undefined,
      };
      wallet.stripeExternalAccountId = externalAccount.id;
      await wallet.save();
      await this.syncConnectAccountStatus(wallet);

      return {
        success: true,
        message:
          wallet.stripeConnectStatus === 'active'
            ? 'Bank details saved. Your account is ready for payouts.'
            : 'Bank details saved. Stripe may require additional verification before payouts are enabled.',
        data: wallet,
      };
    } catch (error: any) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async requestWithdrawal(providerId: string, amount: number) {
    if (amount <= 0) {
      throw new HttpException(
        'Amount must be greater than zero',
        HttpStatus.BAD_REQUEST,
      );
    }

    const wallet = await this.getWallet(providerId);
    if (!wallet.bankDetails || !wallet.stripeConnectId) {
      throw new HttpException(
        'Please add bank details first',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (wallet.stripeConnectId) {
      await this.syncConnectAccountStatus(wallet);
    }

    if (wallet.stripeConnectStatus !== 'active') {
      throw new HttpException(
        'Your payout account is not fully verified yet. Complete bank setup or wait for Stripe verification.',
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.ensureManualPayouts(wallet);

    const result = await this.walletModel.findOneAndUpdate(
      { providerId: new Types.ObjectId(providerId), balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    );

    if (!result) {
      throw new HttpException('Insufficient balance', HttpStatus.BAD_REQUEST);
    }

    const transaction = await this.transactionModel.create({
      providerId: new Types.ObjectId(providerId),
      type: 'withdrawal',
      amount: amount,
      status: 'pending',
      description: 'Withdrawal to Bank Account',
    });

    return {
      success: true,
      message: 'Withdrawal requested successfully',
      data: transaction,
    };
  }

  async approveWithdrawal(transactionId: string) {
    const transaction = await this.transactionModel.findById(transactionId);
    if (!transaction || transaction.type !== 'withdrawal') {
      return { success: false, message: 'Withdrawal request not found' };
    }

    if (
      transaction.status === 'paid' ||
      transaction.status === 'payout_pending'
    ) {
      return {
        success: true,
        message:
          transaction.status === 'paid'
            ? 'Withdrawal is already paid'
            : 'Payout is already being processed by Stripe',
        data: transaction,
      };
    }

    const retryableStatuses = [
      'pending',
      'approved',
      'transferring',
      'transfer_failed',
      'transferred',
      'payout_failed',
    ];
    if (!retryableStatuses.includes(transaction.status)) {
      return {
        success: false,
        message: `Withdrawal cannot be processed from status ${transaction.status}`,
      };
    }

    const wallet = await this.walletModel.findOne({
      providerId: transaction.providerId,
    });
    if (!wallet?.stripeConnectId) {
      return {
        success: false,
        message: 'Provider Stripe Connect account not found',
      };
    }

    try {
      const account = await this.stripe.accounts.retrieve(
        wallet.stripeConnectId,
      );
      if (!account.payouts_enabled) {
        return {
          success: false,
          message:
            'Provider Stripe Connect account cannot receive payouts yet. They must complete verification.',
        };
      }

      await this.ensureManualPayouts(wallet);
      transaction.approvedAt = transaction.approvedAt || new Date();
      transaction.stripeConnectedAccountId = wallet.stripeConnectId;

      if (!transaction.stripeTransferId) {
        transaction.status = 'transferring';
        transaction.failureCode = undefined;
        transaction.adminNotes = undefined;
        await transaction.save();

        try {
          const transfer = await this.stripe.transfers.create(
            {
              amount: Math.round(transaction.amount * 100),
              currency: 'gbp',
              source_type: 'card',
              destination: wallet.stripeConnectId,
              description: `Gleezip withdrawal ${transactionId}`,
              metadata: {
                transactionId,
                providerId: transaction.providerId.toString(),
              },
            },
            { idempotencyKey: `withdrawal:${transactionId}:transfer` },
          );

          transaction.stripeTransferId = transfer.id;
          transaction.referenceId = transfer.id;
          transaction.status = 'transferred';
          await transaction.save();
        } catch (error: any) {
          transaction.status = 'transfer_failed';
          transaction.failureCode = error?.code || 'stripe_transfer_failed';
          transaction.adminNotes = error?.message || 'Stripe transfer failed';
          await transaction.save();
          return {
            success: false,
            message: `Stripe transfer failed: ${transaction.adminNotes}`,
            data: transaction,
          };
        }
      }

      return await this.createPayoutForWithdrawal(transaction, wallet);
    } catch (error: any) {
      this.logger.error(
        `Withdrawal ${transactionId} processing failed: ${error?.message}`,
      );
      return {
        success: false,
        message: error?.message || 'Stripe withdrawal processing failed',
        data: transaction,
      };
    }
  }

  private async createPayoutForWithdrawal(
    transaction: TransactionDocument,
    wallet: WalletDocument,
  ) {
    const transactionId = transaction._id.toString();
    const payoutAttempt = (transaction.payoutAttempt || 0) + 1;
    transaction.payoutAttempt = payoutAttempt;
    transaction.status = 'payout_pending';
    transaction.failureCode = undefined;
    transaction.adminNotes = undefined;
    await transaction.save();

    try {
      const payout = await this.stripe.payouts.create(
        {
          amount: Math.round(transaction.amount * 100),
          currency: 'gbp',
          source_type: 'card',
          method: 'standard',
          description: `Gleezip withdrawal ${transactionId}`,
          metadata: {
            transactionId,
            providerId: transaction.providerId.toString(),
            payoutAttempt: payoutAttempt.toString(),
          },
        },
        {
          stripeAccount: wallet.stripeConnectId,
          idempotencyKey: `withdrawal:${transactionId}:payout:${payoutAttempt}`,
        },
      );

      transaction.stripePayoutId = payout.id;
      if (payout.status === 'paid') {
        transaction.status = 'paid';
        transaction.paidAt = new Date();
      } else if (payout.status === 'failed' || payout.status === 'canceled') {
        transaction.status = 'payout_failed';
        transaction.failureCode = payout.failure_code || payout.status;
        transaction.adminNotes =
          payout.failure_message || `Stripe payout ${payout.status}`;
      } else {
        transaction.status = 'payout_pending';
      }
      await transaction.save();

      return {
        success: true,
        message:
          transaction.status === 'paid'
            ? 'Withdrawal paid successfully'
            : 'Withdrawal approved; Stripe is processing the bank payout',
        data: transaction,
      };
    } catch (error: any) {
      const code = error?.code || error?.raw?.code || 'stripe_payout_failed';
      transaction.status =
        code === 'balance_insufficient' ? 'transferred' : 'payout_failed';
      transaction.failureCode = code;
      transaction.adminNotes = error?.message || 'Stripe payout failed';
      await transaction.save();

      return {
        success: code === 'balance_insufficient',
        message:
          code === 'balance_insufficient'
            ? 'Funds were transferred to the provider Stripe balance and are waiting to become available. Retry the payout later.'
            : `Stripe payout failed: ${transaction.adminNotes}`,
        data: transaction,
      };
    }
  }

  async reconcileWithdrawal(transactionId: string) {
    const transaction = await this.transactionModel.findById(transactionId);
    if (!transaction || transaction.type !== 'withdrawal') {
      return { success: false, message: 'Withdrawal request not found' };
    }

    if (transaction.status === 'paid') {
      return {
        success: true,
        message: 'Withdrawal is already paid',
        data: transaction,
      };
    }

    if (
      transaction.status === 'payout_pending' &&
      transaction.stripePayoutId &&
      transaction.stripeConnectedAccountId
    ) {
      const payout = await this.stripe.payouts.retrieve(
        transaction.stripePayoutId,
        { stripeAccount: transaction.stripeConnectedAccountId },
      );
      await this.handlePayoutEvent(payout);
      const refreshed = await this.transactionModel.findById(transactionId);
      return {
        success:
          refreshed?.status === 'paid' ||
          refreshed?.status === 'payout_pending',
        message: `Stripe payout status reconciled as ${refreshed?.status || payout.status}`,
        data: refreshed,
      };
    }

    return this.approveWithdrawal(transactionId);
  }

  async addEarning(
    providerId: string,
    grossAmount: number,
    referenceId: string,
    stripePaymentIntentId?: string,
  ) {
    if (
      grossAmount > 0 &&
      !stripePaymentIntentId &&
      process.env.NODE_ENV !== 'test'
    ) {
      throw new Error(
        'A successful Stripe PaymentIntent is required before crediting earnings',
      );
    }
    const feePercentage = await this.getPlatformFee();
    const platformFee = (grossAmount * feePercentage) / 100;
    const netAmount = grossAmount - platformFee;
    const providerObjectId = new Types.ObjectId(providerId);

    await this.getWallet(providerId);
    const walletUpdate = await this.walletModel.updateOne(
      {
        providerId: providerObjectId,
        creditedReferences: { $ne: referenceId },
      },
      {
        $inc: { balance: netAmount, totalEarnings: grossAmount },
        $addToSet: { creditedReferences: referenceId },
      },
    );

    const transaction = await this.transactionModel.findOneAndUpdate(
      { providerId: providerObjectId, type: 'earning', referenceId },
      {
        $setOnInsert: {
          amount: grossAmount,
          platformFee,
          status: 'completed',
          description: 'Job Earning',
          stripePaymentIntentId,
        },
      },
      { upsert: true, new: true },
    );

    if (walletUpdate.modifiedCount === 0) {
      this.logger.debug(`Skipped duplicate earning credit for ${referenceId}`);
    }

    return transaction;
  }

  async getTransactions(providerId: string, period?: 'day' | 'week' | 'month') {
    const query: any = { providerId: new Types.ObjectId(providerId) };

    if (period) {
      const now = new Date();
      const startDate = new Date();
      if (period === 'day') startDate.setDate(now.getDate() - 1);
      else if (period === 'week') startDate.setDate(now.getDate() - 7);
      else if (period === 'month') startDate.setMonth(now.getMonth() - 1);

      query.createdAt = { $gte: startDate };
    }

    const transactions = await this.transactionModel
      .find(query)
      .sort({ createdAt: -1 });
    return { success: true, data: transactions };
  }
}
