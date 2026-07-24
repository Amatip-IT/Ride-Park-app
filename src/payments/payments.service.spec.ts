import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { PaymentsService } from './payments.service';
import { User } from 'src/schemas/user.schema';
import { Ride } from 'src/schemas/ride.schema';
import { Transaction } from 'src/schemas/transaction.schema';
import { WebhookEventsService } from '../webhooks/webhook-events.service';
import { RidesService } from 'src/rides/rides.service';
import { BookingsService } from 'src/bookings/bookings.service';

describe('PaymentsService', () => {
  let service: PaymentsService;

  const mockUserModel = { findById: jest.fn() };
  const mockRideModel = { findByIdAndUpdate: jest.fn().mockResolvedValue({}) };
  const mockTransactionModel = {
    updateOne: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
  };
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
  const mockRidesService = {
    reconcilePaymentSucceeded: jest.fn().mockResolvedValue(undefined),
    reconcilePaymentFailed: jest.fn().mockResolvedValue(undefined),
  };
  const mockBookingsService = {
    reconcilePaymentSucceeded: jest.fn().mockResolvedValue(undefined),
    reconcilePaymentFailed: jest.fn().mockResolvedValue(undefined),
  };

  beforeEach(async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock';
    process.env.STRIPE_PAYMENTS_WEBHOOK_SECRET = 'whsec_test';

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentsService,
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: getModelToken(Ride.name), useValue: mockRideModel },
        {
          provide: getModelToken(Transaction.name),
          useValue: mockTransactionModel,
        },
        { provide: WebhookEventsService, useValue: mockWebhookEventsService },
        { provide: RidesService, useValue: mockRidesService },
        { provide: BookingsService, useValue: mockBookingsService },
      ],
    }).compile();

    service = module.get<PaymentsService>(PaymentsService);
    jest.clearAllMocks();
  });

  describe('handlePaymentWebhookEvent', () => {
    it('marks provider earnings for administrative recovery when Stripe opens a dispute', async () => {
      const event = {
        id: 'evt_dispute_created',
        type: 'charge.dispute.created',
        data: {
          object: {
            id: 'dp_123',
            payment_intent: 'pi_disputed',
            status: 'needs_response',
            amount: 2500,
          },
        },
      } as any;

      await service.handlePaymentWebhookEvent(event);

      expect(mockTransactionModel.updateMany).toHaveBeenCalledWith(
        { stripePaymentIntentId: 'pi_disputed', type: 'earning' },
        expect.objectContaining({
          $set: expect.objectContaining({ status: 'disputed' }),
        }),
      );
    });

    it('reconciles ride payment on payment_intent.succeeded', async () => {
      const event = {
        id: 'evt_ride_succeeded',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_ride_123',
            metadata: { type: 'ride', rideId: '507f1f77bcf86cd799439011' },
          },
        },
      } as any;

      await service.handlePaymentWebhookEvent(event);

      expect(mockWebhookEventsService.processOnce).toHaveBeenCalledWith(
        'payments',
        event.id,
        event.type,
        expect.any(Function),
      );
      expect(mockRidesService.reconcilePaymentSucceeded).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439011',
        'pi_ride_123',
      );
      expect(mockTransactionModel.updateOne).toHaveBeenCalledWith(
        { referenceId: 'pi_ride_123' },
        { $set: { status: 'completed' } },
      );
    });

    it('reconciles booking payment on payment_intent.succeeded', async () => {
      const event = {
        id: 'evt_booking_succeeded',
        type: 'payment_intent.succeeded',
        data: {
          object: {
            id: 'pi_booking_123',
            metadata: {
              type: 'booking',
              bookingId: '507f1f77bcf86cd799439022',
            },
          },
        },
      } as any;

      await service.handlePaymentWebhookEvent(event);

      expect(
        mockBookingsService.reconcilePaymentSucceeded,
      ).toHaveBeenCalledWith('507f1f77bcf86cd799439022', 'pi_booking_123');
      expect(mockTransactionModel.updateOne).toHaveBeenCalledWith(
        { referenceId: 'pi_booking_123' },
        { $set: { status: 'completed' } },
      );
    });

    it('marks ride payment failed on payment_intent.payment_failed', async () => {
      const event = {
        id: 'evt_ride_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_ride_fail',
            metadata: { type: 'ride', rideId: '507f1f77bcf86cd799439012' },
          },
        },
      } as any;

      await service.handlePaymentWebhookEvent(event);

      expect(mockRidesService.reconcilePaymentFailed).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439012',
        'pi_ride_fail',
      );
      expect(mockTransactionModel.updateOne).toHaveBeenCalledWith(
        { referenceId: 'pi_ride_fail' },
        { $set: { status: 'failed' } },
      );
    });

    it('marks booking payment failed on payment_intent.payment_failed', async () => {
      const event = {
        id: 'evt_booking_failed',
        type: 'payment_intent.payment_failed',
        data: {
          object: {
            id: 'pi_booking_fail',
            metadata: {
              type: 'booking',
              bookingId: '507f1f77bcf86cd799439033',
            },
          },
        },
      } as any;

      await service.handlePaymentWebhookEvent(event);

      expect(mockBookingsService.reconcilePaymentFailed).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439033',
        'pi_booking_fail',
      );
      expect(mockTransactionModel.updateOne).toHaveBeenCalledWith(
        { referenceId: 'pi_booking_fail' },
        { $set: { status: 'failed' } },
      );
    });
  });

  it('does not treat a non-succeeded PaymentIntent as a completed charge', async () => {
    mockUserModel.findById.mockReturnValue({
      select: jest.fn().mockResolvedValue({ stripeCustomerId: 'cus_123' }),
    });
    (service as any).stripe = {
      paymentMethods: {
        list: jest.fn().mockResolvedValue({ data: [{ id: 'pm_123' }] }),
      },
      paymentIntents: {
        create: jest.fn().mockResolvedValue({
          id: 'pi_requires_action',
          status: 'requires_action',
        }),
      },
    };

    await expect(
      service.chargeCustomer('507f1f77bcf86cd799439011', 25, 'Ride payment'),
    ).rejects.toThrow('Payment was not completed');
  });
});
