import { Injectable, HttpException, HttpStatus } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { Wallet, WalletDocument } from 'src/schemas/wallet.schema';
import { Transaction, TransactionDocument } from 'src/schemas/transaction.schema';
import { PlatformSettings, PlatformSettingsDocument } from 'src/schemas/platform-settings.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { PaymentsService } from 'src/payments/payments.service';
import Stripe from 'stripe';

@Injectable()
export class WalletService {
  private stripe: Stripe;

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

  async topUpWallet(userId: string, amount: number) {
    // 1. Charge via PaymentsService
    const paymentIntent = await this.paymentsService.chargeCustomer(userId, amount, 'Wallet Top Up');
    
    // 2. Increase balance
    const wallet = await this.getWallet(userId);
    wallet.balance += amount;
    await wallet.save();

    // 3. Create transaction
    await this.transactionModel.create({
      providerId: new Types.ObjectId(userId),
      type: 'deposit',
      amount: amount,
      status: 'completed',
      description: 'Wallet Top Up via Card',
      referenceId: paymentIntent.id
    });

    return { success: true, message: 'Top up successful', data: wallet };
  }

  async updateBankDetails(providerId: string, details: { accountName: string; accountNumber: string; sortCode: string }) {
    const user = await this.userModel.findById(providerId);
    if (!user) throw new HttpException('Provider not found', HttpStatus.NOT_FOUND);

    const wallet = await this.getWallet(providerId);

    try {
      // 1. Create or retrieve Stripe Connect Custom Account
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
            ip: '127.0.0.1', // Should ideally pass from request
          },
        });
        stripeAccountId = account.id;
        wallet.stripeConnectId = stripeAccountId;
      }

      // 2. Tokenize bank account
      const bankToken = await this.stripe.tokens.create({
        bank_account: {
          country: 'GB',
          currency: 'gbp',
          account_holder_name: details.accountName,
          account_number: details.accountNumber,
          routing_number: details.sortCode,
        },
      });

      // 3. Attach bank account to Connect Account
      await this.stripe.accounts.createExternalAccount(
        stripeAccountId,
        { external_account: bankToken.id, default_for_currency: true }
      );

      // Save to DB
      wallet.bankDetails = details;
      wallet.stripeConnectStatus = 'active';
      await wallet.save();

      return { success: true, message: 'Bank details updated successfully', data: wallet };
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

    // Atomic balance check and decrement to prevent double-spend race condition
    const result = await this.walletModel.findOneAndUpdate(
      { providerId: new Types.ObjectId(providerId), balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true },
    );

    if (!result) {
      throw new HttpException('Insufficient balance', HttpStatus.BAD_REQUEST);
    }

    // Create pending transaction
    const transaction = await this.transactionModel.create({
      providerId: new Types.ObjectId(providerId),
      type: 'withdrawal',
      amount: amount,
      status: 'pending',
      description: 'Withdrawal to Bank Account',
    });

    return { success: true, message: 'Withdrawal requested successfully', data: transaction };
  }

  // Mock method to simulate earning from a job
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
      let startDate = new Date();
      if (period === 'day') startDate.setDate(now.getDate() - 1);
      else if (period === 'week') startDate.setDate(now.getDate() - 7);
      else if (period === 'month') startDate.setMonth(now.getMonth() - 1);
      
      query.createdAt = { $gte: startDate };
    }

    const transactions = await this.transactionModel.find(query).sort({ createdAt: -1 });
    return { success: true, data: transactions };
  }
}
