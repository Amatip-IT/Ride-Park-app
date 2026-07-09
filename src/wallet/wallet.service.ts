import { Injectable, HttpException, HttpStatus, InternalServerErrorException, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from 'src/schemas/wallet.schema';
import { Transaction, TransactionDocument } from 'src/schemas/transaction.schema';
import { PlatformSettings, PlatformSettingsDocument } from 'src/schemas/platform-settings.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { PaymentsService } from 'src/payments/payments.service';
import { mapStripeConnectStatus } from './connect.util';
import Stripe from 'stripe';

@Injectable()
export class WalletService {
  private stripe: Stripe;
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectModel(Wallet.name) private walletModel: Model<WalletDocument>,
    @InjectModel(Transaction.name) private transactionModel: Model<TransactionDocument>,
    @InjectModel(PlatformSettings.name) private platformSettingsModel: Model<PlatformSettingsDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    private readonly paymentsService: PaymentsService,
  ) {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key && process.env.NODE_ENV !== 'test') {
      throw new Error('STRIPE_SECRET_KEY is required');
    }
    this.stripe = new Stripe(key || 'sk_test_mock');
  }

  async getPlatformFee(): Promise<number> {
    let settings = await this.platformSettingsModel.findOne();
    if (!settings) {
      settings = await this.platformSettingsModel.create({ platformFeePercentage: 10 });
    }
    return settings.platformFeePercentage;
  }

  async getWallet(providerId: string) {
    let wallet = await this.walletModel.findOne({ providerId: new Types.ObjectId(providerId) });
    if (!wallet) {
      wallet = await this.walletModel.create({ providerId: new Types.ObjectId(providerId) });
    }
    return wallet;
  }

  async syncConnectAccountStatus(wallet: WalletDocument): Promise<WalletDocument> {
    if (!wallet.stripeConnectId) {
      return wallet;
    }

    const account = await this.stripe.accounts.retrieve(wallet.stripeConnectId);
    wallet.stripeConnectStatus = mapStripeConnectStatus(account);
    wallet.stripeConnectRequirementsDue = account.requirements?.currently_due || [];
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
    const webhookSecret =
      process.env.STRIPE_CONNECT_WEBHOOK_SECRET ||
      process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET ||
      process.env.STRIPE_WEBHOOK_SECRET;

    if (!webhookSecret) {
      throw new InternalServerErrorException(
        'Stripe Connect webhook secret not configured',
      );
    }

    try {
      return this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret,
      );
    } catch (error) {
      this.logger.error('Connect webhook signature verification failed', error);
      throw new InternalServerErrorException('Invalid webhook signature');
    }
  }

  async handleConnectWebhookEvent(event: Stripe.Event): Promise<void> {
    switch (event.type) {
      case 'account.updated':
        await this.handleAccountUpdated(event.data.object as Stripe.Account);
        break;
      case 'transfer.reversed':
        await this.handleTransferReversed(event.data.object as Stripe.Transfer);
        break;
      default:
        this.logger.debug(`Unhandled Connect webhook event: ${event.type}`);
    }
  }

  private async handleAccountUpdated(account: Stripe.Account) {
    const wallet = await this.walletModel.findOne({ stripeConnectId: account.id });
    if (!wallet) {
      return;
    }

    wallet.stripeConnectStatus = mapStripeConnectStatus(account);
    wallet.stripeConnectRequirementsDue = account.requirements?.currently_due || [];
    await wallet.save();
  }

  private async handleTransferReversed(transfer: Stripe.Transfer) {
    const transactionId = transfer.metadata?.transactionId;
    if (!transactionId) {
      this.logger.warn(`Transfer ${transfer.id} reversed without transactionId metadata`);
      return;
    }

    const transaction = await this.transactionModel.findById(transactionId);
    if (!transaction || transaction.type !== 'withdrawal') {
      return;
    }

    if (transaction.status === 'failed' || transaction.status === 'rejected') {
      return;
    }

    transaction.status = 'failed';
    transaction.adminNotes = 'Stripe transfer was reversed — funds returned to wallet';
    await transaction.save();

    await this.walletModel.findOneAndUpdate(
      { providerId: transaction.providerId },
      { $inc: { balance: transaction.amount } },
    );

    this.logger.warn(
      `Withdrawal ${transactionId} reversed; refunded £${transaction.amount} to provider wallet`,
    );
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

      const bankToken = await this.stripe.tokens.create({
        bank_account: {
          country: 'GB',
          currency: 'gbp',
          account_holder_name: details.accountName,
          account_number: details.accountNumber,
          routing_number: details.sortCode,
        },
      });

      await this.stripe.accounts.createExternalAccount(stripeAccountId, {
        external_account: bankToken.id,
        default_for_currency: true,
      });

      wallet.bankDetails = details;
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
      throw new HttpException('Amount must be greater than zero', HttpStatus.BAD_REQUEST);
    }

    const wallet = await this.getWallet(providerId);
    if (!wallet.bankDetails || !wallet.stripeConnectId) {
      throw new HttpException('Please add bank details first', HttpStatus.BAD_REQUEST);
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

    return { success: true, message: 'Withdrawal requested successfully', data: transaction };
  }

  async addEarning(providerId: string, grossAmount: number, referenceId: string) {
    const feePercentage = await this.getPlatformFee();
    const platformFee = (grossAmount * feePercentage) / 100;
    const netAmount = grossAmount - platformFee;

    const wallet = await this.getWallet(providerId);
    wallet.balance += netAmount;
    wallet.totalEarnings += grossAmount;
    await wallet.save();

    const transaction = await this.transactionModel.create({
      providerId: new Types.ObjectId(providerId),
      type: 'earning',
      amount: grossAmount,
      platformFee: platformFee,
      status: 'completed',
      description: 'Job Earning',
      referenceId,
    });

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

    const transactions = await this.transactionModel.find(query).sort({ createdAt: -1 });
    return { success: true, data: transactions };
  }
}
