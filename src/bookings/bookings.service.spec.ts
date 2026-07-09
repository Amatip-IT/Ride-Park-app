import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BookingsService } from './bookings.service';
import { BookingRequest } from 'src/schemas/booking-request.schema';
import { ParkingSpace } from 'src/schemas/parking-space.schema';
import { Chauffeur } from 'src/schemas/chauffeur.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import { WalletService } from 'src/wallet/wallet.service';
import { PaymentsService } from 'src/payments/payments.service';

describe('BookingsService', () => {
  let service: BookingsService;

  const mockWalletService = {
    addEarning: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotificationsService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockPaymentsService = {
    getPaymentMethods: jest.fn(),
  };

  const mockBookingModel: any = jest.fn().mockImplementation((data) => ({
    ...data,
    _id: '507f1f77bcf86cd799439099',
    save: jest.fn().mockResolvedValue(true),
  }));
  mockBookingModel.find = jest.fn();
  mockBookingModel.findOne = jest.fn();
  mockBookingModel.findById = jest.fn();

  const mockParkingSpaceModel = {
    findById: jest.fn(),
    findByIdAndUpdate: jest.fn(),
  };

  const mockChauffeurModel = {};

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BookingsService,
        { provide: getModelToken(BookingRequest.name), useValue: mockBookingModel },
        { provide: getModelToken(ParkingSpace.name), useValue: mockParkingSpaceModel },
        { provide: getModelToken(Chauffeur.name), useValue: mockChauffeurModel },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: PaymentsService, useValue: mockPaymentsService },
      ],
    }).compile();

    service = module.get<BookingsService>(BookingsService);
    jest.clearAllMocks();
  });

  describe('autoCompleteExpiredBookings', () => {
    it('credits provider wallet when auto-completing expired parking bookings', async () => {
      const bookingId = '507f1f77bcf86cd799439011';
      const providerId = '507f1f77bcf86cd799439012';
      const requesterId = '507f1f77bcf86cd799439013';
      const serviceId = '507f1f77bcf86cd799439014';

      const booking = {
        _id: bookingId,
        status: 'accepted',
        serviceType: 'parking',
        quotedPrice: 15,
        provider: providerId,
        requester: requesterId,
        serviceId,
        serviceName: 'City Centre Parking',
        save: jest.fn().mockResolvedValue(true),
      };

      mockBookingModel.find.mockResolvedValue([booking]);
      mockParkingSpaceModel.findByIdAndUpdate.mockResolvedValue({
        occupiedSpots: 0,
        totalSpots: 10,
        isAvailable: false,
        save: jest.fn().mockResolvedValue(true),
      });

      const result = await service.autoCompleteExpiredBookings();

      expect(result.success).toBe(true);
      expect(result.data?.completedCount).toBe(1);
      expect(mockWalletService.addEarning).toHaveBeenCalledWith(
        providerId,
        15,
        bookingId,
      );
      expect(booking.status).toBe('completed');
    });

    it('skips wallet credit when quotedPrice is zero', async () => {
      const booking = {
        _id: '507f1f77bcf86cd799439011',
        status: 'accepted',
        serviceType: 'parking',
        quotedPrice: 0,
        provider: '507f1f77bcf86cd799439012',
        requester: '507f1f77bcf86cd799439013',
        save: jest.fn().mockResolvedValue(true),
      };

      mockBookingModel.find.mockResolvedValue([booking]);

      const result = await service.autoCompleteExpiredBookings();

      expect(result.success).toBe(true);
      expect(mockWalletService.addEarning).not.toHaveBeenCalled();
    });
  });

  describe('createBookingRequest', () => {
    it('rejects parking booking when user has no payment method', async () => {
      mockPaymentsService.getPaymentMethods.mockResolvedValue([]);
      mockParkingSpaceModel.findById.mockResolvedValue({
        _id: '507f1f77bcf86cd799439014',
        owner: '507f1f77bcf86cd799439015',
        name: 'City Parking',
        isAvailable: true,
        hourlyRate: 5,
        dailyRate: 20,
        totalSpots: 10,
        occupiedSpots: 0,
      });

      const result = await service.createBookingRequest({
        requesterId: '507f1f77bcf86cd799439013',
        serviceType: 'parking',
        serviceId: '507f1f77bcf86cd799439014',
        startDate: '2026-07-01T10:00:00Z',
        endDate: '2026-07-01T14:00:00Z',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('payment method');
    });

    it('rejects chauffeur booking when user has no payment method', async () => {
      mockPaymentsService.getPaymentMethods.mockResolvedValue([]);

      const result = await service.createBookingRequest({
        requesterId: '507f1f77bcf86cd799439013',
        serviceType: 'driver',
        startTime: '2026-07-01T10:00:00Z',
        endTime: '2026-07-01T12:00:00Z',
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('payment method');
    });

    it('quotes chauffeur price from booked duration', async () => {
      mockPaymentsService.getPaymentMethods.mockResolvedValue([{ id: 'pm_1' }]);
      mockBookingModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          populate: jest.fn().mockReturnValue({
            exec: jest.fn().mockResolvedValue({
              quotedPrice: 44,
              pricingUnit: 'per_session',
            }),
          }),
        }),
      });

      const result = await service.createBookingRequest({
        requesterId: '507f1f77bcf86cd799439013',
        serviceType: 'driver',
        startTime: '2026-07-01T10:00:00Z',
        endTime: '2026-07-01T12:00:00Z',
      });

      expect(result.success).toBe(true);
      expect(mockBookingModel).toHaveBeenCalledWith(
        expect.objectContaining({
          quotedPrice: 44,
          pricingUnit: 'per_session',
        }),
      );
    });
  });

  describe('cancelBooking', () => {
    it('allows the requester to cancel when user id is a Mongoose ObjectId', async () => {
      const requestId = '507f1f77bcf86cd799439011';
      const requesterId = '507f1f77bcf86cd799439013';
      const objectIdLike = { toString: () => requesterId };

      const booking = {
        _id: requestId,
        status: 'pending',
        requester: requesterId,
        serviceType: 'parking',
        save: jest.fn().mockResolvedValue(true),
      };

      mockBookingModel.findById = jest.fn().mockResolvedValue(booking);

      const result = await service.cancelBooking(requestId, objectIdLike as any);

      expect(result.success).toBe(true);
      expect(booking.status).toBe('cancelled');
      expect(booking.save).toHaveBeenCalled();
    });
  });
});
