import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { User } from 'src/schemas/user.schema';
import { Ride } from 'src/schemas/ride.schema';
import { Transaction } from 'src/schemas/transaction.schema';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockUserModel = { findById: jest.fn() };
  const mockRideModel = { findByIdAndUpdate: jest.fn().mockResolvedValue({}) };
  const mockTransactionModel = { updateOne: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET = 'whsec_test';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Ride.name), useValue: mockRideModel },
        { provide: getModelToken(Transaction.name), useValue: mockTransactionModel },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    jest.clearAllMocks();
  });

  describe('handlePaymentWebhookEvent', () => {
    it('updates ride payment status on payment_intent.succeeded for rides', async () => {
      const event = {
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_ride_123',
            metadata: { type: 'ride', rideId: '507f1f77bcf86cd799439011' },
          },
        },
      } as any;

      await service.handlePaymentWebhookEvent(event);

      expect(mockRideModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        { paymentStatus: 'charged', paymentIntentId: 'pi_ride_123' },
      );
      expect(mockTransactionModel.updateOne).toHaveBeenCalledWith(
        { referenceId: 'pi_ride_123' },
        { $set: { status: 'completed' } },
      );
    });

    it('marks ride payment failed on payment_intent.payment_failed', async () => {
      const event = {
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_ride_fail',
            metadata: { type: 'ride', rideId: '507f1f77bcf86cd799439012' },
          },
        },
      } as any;

      await service.handlePaymentWebhookEvent(event);

      expect(mockRideModel.findByIdAndUpdate).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        { paymentStatus: 'payment_failed', paymentIntentId: 'pi_ride_fail' },
      );
      expect(mockTransactionModel.updateOne).toHaveBeenCalledWith(
        { referenceId: 'pi_ride_fail' },
        { $set: { status: 'failed' } },
      );
    });
  });
});
