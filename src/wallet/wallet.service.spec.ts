import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { WalletService } from './wallet.service';
import { Wallet } from 'src/schemas/wallet.schema';
import { Transaction } from 'src/schemas/transaction.schema';
import { PlatformSettings } from 'src/schemas/platform-settings.schema';
import { User } from 'src/schemas/user.schema';
import { PaymentsService } from 'src/payments/payments.service';

describe('WalletService Connect webhooks', () => {
  let service: WalletService;

  const mockWalletModel = {
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockTransactionModel = {
    findById: jest.fn(),
  };

  const mockPlatformSettingsModel = {
    findOne: jest.fn(),
  };

  const mockUserModel = {};
  const mockPaymentsService = {};

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletService,
        { provide: getModelToken(Wallet.name), useValue: mockWalletModel },
        { provide: getModelToken(Transaction.name), useValue: mockTransactionModel },
        { provide: getModelToken(PlatformSettings.name), useValue: mockPlatformSettingsModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: PaymentsService, useValue: mockPaymentsService },
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
});
