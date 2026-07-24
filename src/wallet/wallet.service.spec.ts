import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WalletService } from './wallet.service';
import { Wallet } from 'src/schemas/wallet.schema';
import { Transaction } from 'src/schemas/transaction.schema';
import { PlatformSettings } from 'src/schemas/platform-settings.schema';
import { User } from 'src/schemas/user.schema';
import { PaymentsService } from 'src/payments/payments.service';
import { WebhookEventsService } from '../webhooks/webhook-events.service';

describe('WalletService Connect webhooks', () => {
  let service: WalletService;

  const mockWalletModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn(),
  };

  const mockTransactionModel = {
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockPlatformSettingsModel = {
    findOne: jest.fn(),
  };

  const mockUserModel = {};
  const mockPaymentsService = {};
  const mockWebhookEventsService = {
    processOnce: jest.fn(
      async (
        _provider: string,
        _id: string,
        _type: string,
        handler: () => Promise<void>,
      ) => {
        await handler();
        return true;
      },
    ),
  };

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getModelToken(Wallet.name), useValue: mockWalletModel },
        {
          provide: getModelToken(Transaction.name),
          useValue: mockTransactionModel,
        },
        {
          provide: getModelToken(PlatformSettings.name),
          useValue: mockPlatformSettingsModel,
        },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: WebhookEventsService, useValue: mockWebhookEventsService },
      ],
    }).compile();

    service = module.get<WalletService>(WalletService);
    jest.clearAllMocks();
  });

  it('refunds wallet balance when a transfer is reversed', async () => {
    const transaction = {
      _id: '507f1f77bcf86cd799439011',
      type: 'withdrawal',
      status: 'completed',
      amount: 50,
      providerId: '507f1f77bcf86cd799439012',
      save: jest.fn().mockResolvedValue(true),
    };

    mockTransactionModel.findById.mockResolvedValue(transaction);
    mockWalletModel.findOneAndUpdate.mockResolvedValue({});

    await service.handleConnectWebhookEvent({
      id: 'evt_transfer_reversed',
      type: 'transfer.reversed',
      data: {
        object: {
          id: 'tr_reversed',
          metadata: { transactionId: transaction._id },
        },
      },
    } as any);

    expect(transaction.status).toBe('failed');
    expect(transaction.save).toHaveBeenCalled();
    expect(mockWalletModel.findOneAndUpdate).toHaveBeenCalledWith(
      { providerId: transaction.providerId },
      { $inc: { balance: 50 } },
    );
  });

  it('uses an atomic reference guard so a repeated earning cannot credit twice', async () => {
    const providerId = '507f1f77bcf86cd799439012';
    const wallet = { providerId, balance: 0, save: jest.fn() };
    const transaction = { _id: 'earning-transaction' };
    mockWalletModel.findOne.mockResolvedValue(wallet);
    mockPlatformSettingsModel.findOne.mockResolvedValue({
      platformFeePercentage: 10,
    });
    mockWalletModel.updateOne
      .mockResolvedValueOnce({ modifiedCount: 1 })
      .mockResolvedValueOnce({ modifiedCount: 0 });
    mockTransactionModel.findOneAndUpdate.mockResolvedValue(transaction);

    await service.addEarning(providerId, 100, 'ride:paid-once');
    await service.addEarning(providerId, 100, 'ride:paid-once');

    expect(mockWalletModel.updateOne).toHaveBeenCalledTimes(2);
    expect(mockWalletModel.updateOne).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        creditedReferences: { $ne: 'ride:paid-once' },
      }),
      {
        $inc: { balance: 90, totalEarnings: 100 },
        $addToSet: { creditedReferences: 'ride:paid-once' },
      },
    );
    expect(mockTransactionModel.findOneAndUpdate).toHaveBeenCalledTimes(2);
  });

  it('creates an idempotent transfer and connected-account payout after approval', async () => {
    const transaction: Record<string, any> = {
      _id: { toString: () => 'withdrawal-1' },
      type: 'withdrawal',
      status: 'pending',
      amount: 45,
      providerId: { toString: () => '507f1f77bcf86cd799439012' },
      payoutAttempt: 0,
      save: jest.fn().mockResolvedValue(true),
    };
    const wallet = {
      stripeConnectId: 'acct_provider',
      manualPayoutsConfigured: false,
      save: jest.fn().mockResolvedValue(true),
    };
    const stripe = {
      accounts: {
        retrieve: jest.fn().mockResolvedValue({ payouts_enabled: true }),
      },
      balanceSettings: {
        update: jest.fn().mockResolvedValue({}),
      },
      transfers: {
        create: jest.fn().mockResolvedValue({ id: 'tr_withdrawal' }),
      },
      payouts: {
        create: jest
          .fn()
          .mockResolvedValue({ id: 'po_withdrawal', status: 'pending' }),
      },
    };

    mockTransactionModel.findById.mockResolvedValue(transaction);
    mockWalletModel.findOne.mockResolvedValue(wallet);
    (service as any).stripe = stripe;

    const result = await service.approveWithdrawal('withdrawal-1');

    expect(result.success).toBe(true);
    expect(wallet.manualPayoutsConfigured).toBe(true);
    expect(stripe.transfers.create).toHaveBeenCalledWith(
      expect.objectContaining({ destination: 'acct_provider', amount: 4500 }),
      { idempotencyKey: 'withdrawal:withdrawal-1:transfer' },
    );
    expect(stripe.payouts.create).toHaveBeenCalledWith(
      expect.objectContaining({ amount: 4500 }),
      expect.objectContaining({
        stripeAccount: 'acct_provider',
        idempotencyKey: 'withdrawal:withdrawal-1:payout:1',
      }),
    );
    expect(transaction.status).toBe('payout_pending');
    expect(transaction.stripeTransferId).toBe('tr_withdrawal');
    expect(transaction.stripePayoutId).toBe('po_withdrawal');
  });

  it('marks a withdrawal paid only from the Stripe payout event', async () => {
    const transaction: Record<string, any> = {
      _id: { toString: () => 'withdrawal-1' },
      type: 'withdrawal',
      status: 'payout_pending',
      payoutAttempt: 1,
      save: jest.fn().mockResolvedValue(true),
    };
    mockTransactionModel.findById.mockResolvedValue(transaction);

    await service.handleConnectWebhookEvent({
      id: 'evt_payout_paid',
      type: 'payout.paid',
      data: {
        object: {
          id: 'po_withdrawal',
          status: 'paid',
          metadata: { transactionId: 'withdrawal-1', payoutAttempt: '1' },
        },
      },
    } as any);

    expect(transaction.status).toBe('paid');
    expect(transaction.paidAt).toBeInstanceOf(Date);
    expect(transaction.save).toHaveBeenCalled();
  });

  it('does not refund the internal wallet when a bank payout fails', async () => {
    const transaction: Record<string, any> = {
      _id: { toString: () => 'withdrawal-1' },
      type: 'withdrawal',
      status: 'payout_pending',
      payoutAttempt: 1,
      save: jest.fn().mockResolvedValue(true),
    };
    mockTransactionModel.findById.mockResolvedValue(transaction);

    await service.handleConnectWebhookEvent({
      id: 'evt_payout_failed',
      type: 'payout.failed',
      data: {
        object: {
          id: 'po_withdrawal',
          status: 'failed',
          failure_code: 'account_closed',
          failure_message: 'The bank account is closed.',
          metadata: { transactionId: 'withdrawal-1', payoutAttempt: '1' },
        },
      },
    } as any);

    expect(transaction.status).toBe('payout_failed');
    expect(transaction.failureCode).toBe('account_closed');
    expect(mockWalletModel.findOneAndUpdate).not.toHaveBeenCalled();
  });
});
