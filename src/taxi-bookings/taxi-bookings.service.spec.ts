import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { TaxiBookingsService } from './taxi-bookings.service';
import { TaxiRideRequest } from 'src/schemas/taxi-ride-request.schema';
import { Taxi } from 'src/schemas/taxi.schema';
import { Chauffeur } from 'src/schemas/chauffeur.schema';
import { User } from 'src/schemas/user.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import { PaymentsService } from 'src/payments/payments.service';
import { WalletService } from 'src/wallet/wallet.service';
import { TaxiBookingsGateway } from './taxi-bookings.gateway';
import { Ride } from 'src/schemas/ride.schema';

describe('TaxiBookingsService', () => {
  let service: TaxiBookingsService;

  const mockPaymentsService = {
    chargeCustomer: jest.fn(),
    getPaymentMethods: jest.fn(),
  };

  const mockWalletService = {
    addEarning: jest.fn(),
  };

  const mockNotificationsService = {
    sendNotification: jest.fn(),
  };

  const mockTaxiGateway = {
    pushRequestUpdate: jest.fn(),
    pushNewRequestToDriver: jest.fn(),
  };

  let mockTaxiRequestModel: any;

  const mockTaxiModel: any = {
    findById: jest.fn(),
    find: jest.fn(),
    findOne: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const mockChauffeurModel: any = { findOne: jest.fn(), updateOne: jest.fn().mockResolvedValue({}) };
  const mockRideModel = { updateOne: jest.fn().mockResolvedValue({}) };
  const mockUserModel = {};

  beforeEach(async () => {
    mockTaxiRequestModel = jest.fn().mockImplementation((dto) => ({
      ...dto,
      _id: '507f1f77bcf86cd799439021',
      save: jest.fn().mockResolvedValue({ _id: '507f1f77bcf86cd799439021', ...dto }),
    }));
    mockTaxiRequestModel.findById = jest.fn();
    mockTaxiRequestModel.findOne = jest.fn();
    mockTaxiRequestModel.findOneAndUpdate = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TaxiBookingsService,
        { provide: getModelToken(TaxiRideRequest.name), useValue: mockTaxiRequestModel },
        { provide: getModelToken(Taxi.name), useValue: mockTaxiModel },
        { provide: getModelToken(Chauffeur.name), useValue: mockChauffeurModel },
        { provide: getModelToken(Ride.name), useValue: mockRideModel },
        { provide: getModelToken(User.name), useValue: mockUserModel },
        { provide: PaymentsService, useValue: mockPaymentsService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: TaxiBookingsGateway, useValue: mockTaxiGateway },
      ],
    }).compile();

    service = module.get<TaxiBookingsService>(TaxiBookingsService);
    jest.clearAllMocks();
  });

  describe('createRideRequest (targeted)', () => {
    const passengerId = '507f1f77bcf86cd799439013';
    const taxiId = '507f1f77bcf86cd799439020';
    const driverUserId = '507f1f77bcf86cd799439014';

    beforeEach(() => {
      mockPaymentsService.getPaymentMethods.mockResolvedValue([{ id: 'pm_1' }]);
      mockTaxiRequestModel.findOne.mockResolvedValue(null);
    });

    it('rejects when targeted driver is offline', async () => {
      mockTaxiModel.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          user: { _id: driverUserId, firstName: 'John', lastName: 'Doe' },
          driverNumber: '001',
          status: 'approved',
          availability: 'offline',
        }),
      });

      const result = await service.createRideRequest({
        passengerId,
        destinationAddress: 'Airport',
        timingType: 'now',
        targetDriverId: taxiId,
      });

      expect(result.success).toBe(false);
      expect(result.message).toContain('not available');
      expect(mockNotificationsService.sendNotification).not.toHaveBeenCalled();
    });

    it('notifies only the targeted driver when online', async () => {
      mockTaxiModel.findById.mockReturnValue({
        populate: jest.fn().mockResolvedValue({
          user: { _id: driverUserId, firstName: 'John', lastName: 'Doe' },
          driverNumber: '001',
          status: 'approved',
          availability: 'online',
        }),
      });

      mockTaxiRequestModel.findById.mockReturnValue({
        populate: jest.fn().mockReturnValue({
          exec: jest.fn().mockResolvedValue({
            passenger: { firstName: 'Jane', lastName: 'Smith' },
          }),
        }),
      });

      const result = await service.createRideRequest({
        passengerId,
        destinationAddress: 'Airport',
        timingType: 'now',
        targetDriverId: taxiId,
      });

      expect(result.success).toBe(true);
      expect(result.message).toContain('directly');
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledTimes(1);
      expect(mockNotificationsService.sendNotification).toHaveBeenCalledWith(
        driverUserId,
        expect.stringContaining('Direct Ride Request'),
        expect.any(String),
        'ride',
        expect.objectContaining({ targeted: true }),
      );
      expect(mockTaxiGateway.pushNewRequestToDriver).toHaveBeenCalledWith(
        driverUserId,
        expect.anything(),
      );
    });
  });

  describe('acceptRideRequest (targeted)', () => {
    it('rejects when a different driver tries to accept a targeted request', async () => {
      const requestId = '507f1f77bcf86cd799439011';
      const wrongDriverId = '507f1f77bcf86cd799439099';

      mockTaxiModel.findOne.mockResolvedValue({
        status: 'approved',
        vehicleInfo: {},
        availability: 'online',
        save: jest.fn(),
      });
      mockChauffeurModel.findOne.mockResolvedValue(null);
      mockTaxiRequestModel.findById.mockResolvedValue({
        _id: requestId,
        targetDriver: '507f1f77bcf86cd799439014',
      });

      const result = await service.acceptRideRequest(requestId, wrongDriverId, { etaMinutes: 5 });

      expect(result.success).toBe(false);
      expect(result.message).toContain('another driver');
    });

    it('allows the targeted driver to accept when driverId is an ObjectId-like value', async () => {
      const requestId = '507f1f77bcf86cd799439011';
      const driverUserId = '507f1f77bcf86cd799439014';
      const driverIdObject = { _id: driverUserId, toString: () => driverUserId };

      mockTaxiModel.findOne.mockResolvedValue({
        status: 'approved',
        vehicleInfo: { make: 'Toyota', model: 'Camry', color: 'Black', plateNumber: 'AB12 CDE' },
        driverNumber: '001',
        availability: 'online',
        save: jest.fn(),
      });
      mockChauffeurModel.findOne.mockResolvedValue(null);
      mockTaxiRequestModel.findById
        .mockResolvedValueOnce({
          _id: requestId,
          targetDriver: driverUserId,
          passenger: driverUserId,
        })
        .mockReturnValue({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              exec: jest.fn().mockResolvedValue({
                _id: requestId,
                status: 'accepted',
                passenger: { firstName: 'Jane', lastName: 'Smith' },
                acceptedDriver: { firstName: 'John', lastName: 'Doe' },
              }),
            }),
          }),
        });
      mockTaxiRequestModel.findOneAndUpdate.mockResolvedValue({
        _id: requestId,
        status: 'accepted',
        passenger: driverUserId,
      });

      const result = await service.acceptRideRequest(requestId, driverIdObject as any, { etaMinutes: 5 });

      expect(result.success).toBe(true);
      expect(mockTaxiRequestModel.findOneAndUpdate).toHaveBeenCalledWith(
        { _id: requestId, status: 'searching' },
        expect.objectContaining({ acceptedDriver: driverUserId }),
        { new: true },
      );
    });
  });

  describe('updateRequestStatus (payment flow)', () => {
    const requestId = '507f1f77bcf86cd799439011';
    const rideId = '507f1f77bcf86cd799439012';
    const passengerId = '507f1f77bcf86cd799439013';
    const driverId = '507f1f77bcf86cd799439014';

    it('moves request to awaiting_payment without charging', async () => {
      const request = {
        _id: requestId,
        status: 'in_progress',
        passenger: passengerId,
        acceptedDriver: driverId,
        estimatedCost: 25,
        save: jest.fn().mockResolvedValue(true),
      };

      const populated = { ...request, status: 'awaiting_payment' };

      mockTaxiRequestModel.findById
        .mockResolvedValueOnce(request)
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(populated),
              }),
            }),
          }),
        });

      const result = await service.updateRequestStatus(requestId, 'awaiting_payment', rideId);

      expect(result.success).toBe(true);
      expect(request.status).toBe('awaiting_payment');
      expect(request.save).toHaveBeenCalled();
      expect(mockPaymentsService.chargeCustomer).not.toHaveBeenCalled();
      expect(mockWalletService.addEarning).not.toHaveBeenCalled();
      expect(mockTaxiGateway.pushRequestUpdate).toHaveBeenCalledWith(requestId, populated);
    });

    it('rejects direct completed updates until passenger pays', async () => {
      const request = {
        _id: requestId,
        status: 'awaiting_payment',
        passenger: passengerId,
        acceptedDriver: driverId,
      };

      mockTaxiRequestModel.findById.mockResolvedValue(request);

      const result = await service.updateRequestStatus(requestId, 'completed', rideId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('passenger confirms payment');
      expect(mockPaymentsService.chargeCustomer).not.toHaveBeenCalled();
      expect(mockWalletService.addEarning).not.toHaveBeenCalled();
    });

    it('returns idempotently when request is already completed', async () => {
      const request = {
        _id: requestId,
        status: 'completed',
        passenger: passengerId,
        acceptedDriver: driverId,
      };

      mockTaxiRequestModel.findById
        .mockResolvedValueOnce(request)
        .mockReturnValueOnce({
          populate: jest.fn().mockReturnValue({
            populate: jest.fn().mockReturnValue({
              populate: jest.fn().mockReturnValue({
                exec: jest.fn().mockResolvedValue(request),
              }),
            }),
          }),
        });

      const result = await service.updateRequestStatus(requestId, 'completed', rideId);

      expect(result.success).toBe(true);
      expect(result.message).toContain('already completed');
      expect(mockPaymentsService.chargeCustomer).not.toHaveBeenCalled();
      expect(mockWalletService.addEarning).not.toHaveBeenCalled();
    });
  });

  describe('cancelRideRequest', () => {
    it('allows passenger to cancel an arrived ride', async () => {
      const requestId = '507f1f77bcf86cd799439011';
      const passengerId = '507f1f77bcf86cd799439013';
      const driverId = '507f1f77bcf86cd799439014';

      const request = {
        _id: requestId,
        status: 'arrived',
        passenger: passengerId,
        acceptedDriver: driverId,
        ride: '507f1f77bcf86cd799439015',
        save: jest.fn().mockResolvedValue(true),
      };

      mockTaxiRequestModel.findById.mockResolvedValue(request);

      const result = await service.cancelRideRequest(requestId, passengerId);

      expect(result.success).toBe(true);
      expect(request.status).toBe('cancelled');
      expect(mockRideModel.updateOne).toHaveBeenCalled();
      expect(mockTaxiModel.updateOne).toHaveBeenCalled();
    });

    it('allows cancel when passenger id from auth is an ObjectId', async () => {
      const requestId = '507f1f77bcf86cd799439011';
      const passengerId = '507f1f77bcf86cd799439013';
      const objectIdLike = { toString: () => passengerId };

      const request = {
        _id: requestId,
        status: 'searching',
        passenger: passengerId,
        save: jest.fn().mockResolvedValue(true),
      };

      mockTaxiRequestModel.findById.mockResolvedValue(request);

      const result = await service.cancelRideRequest(requestId, objectIdLike as any);

      expect(result.success).toBe(true);
      expect(request.status).toBe('cancelled');
    });
  });
});
