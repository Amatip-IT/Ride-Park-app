import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { RidesService } from './rides.service';
import { Ride } from 'src/schemas/ride.schema';
import { TaxiRideRequest } from 'src/schemas/taxi-ride-request.schema';
import { Chauffeur } from 'src/schemas/chauffeur.schema';
import { Taxi } from 'src/schemas/taxi.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import { WalletService } from 'src/wallet/wallet.service';
import { PaymentsService } from 'src/payments/payments.service';

describe('RidesService', () => {
  let service: RidesService;

  const mockPaymentsService = {
    chargeCustomer: jest.fn().mockResolvedValue({ id: 'pi_test_123' }),
  };

  const mockWalletService = {
    addEarning: jest.fn().mockResolvedValue(undefined),
  };

  const mockNotificationsService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockRideModel = {
    findById: jest.fn(),
    findOneAndUpdate: jest.fn(),
  };

  const mockTaxiRequestModel = {
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const mockChauffeurModel = { updateOne: jest.fn().mockResolvedValue({}) };
  const mockTaxiModel = { updateOne: jest.fn().mockResolvedValue({}) };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RidesService,
        { provide: getModelToken(Ride.name), useValue: mockRideModel },
        {
          provide: getModelToken(TaxiRideRequest.name),
          useValue: mockTaxiRequestModel,
        },
        {
          provide: getModelToken(Chauffeur.name),
          useValue: mockChauffeurModel,
        },
        { provide: getModelToken(Taxi.name), useValue: mockTaxiModel },
        { provide: NotificationsService, useValue: mockNotificationsService },
        { provide: WalletService, useValue: mockWalletService },
        { provide: PaymentsService, useValue: mockPaymentsService },
      ],
    }).compile();

    service = module.get<RidesService>(RidesService);
    jest.clearAllMocks();
  });

  describe('completeRide', () => {
    it('does not auto-charge and moves ride to awaiting_payment', async () => {
      const rideId = '507f1f77bcf86cd799439011';
      const passengerId = '507f1f77bcf86cd799439012';
      const driverId = '507f1f77bcf86cd799439013';

      const ride: any = {
        _id: rideId,
        status: 'in_progress',
        serviceType: 'taxi',
        passenger: passengerId,
        driver: driverId,
        booking: '507f1f77bcf86cd799439020',
        paymentStatus: 'pending',
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockRideModel.findById.mockResolvedValue(ride);

      const result = await service.completeRide(rideId, 5, 20);

      expect(result.success).toBe(true);
      expect(mockPaymentsService.chargeCustomer).not.toHaveBeenCalled();
      expect(mockWalletService.addEarning).not.toHaveBeenCalled();
      expect(ride.status).toBe('awaiting_payment');
      expect(ride.paymentStatus).toBe('pending');
      expect(mockTaxiRequestModel.updateOne).toHaveBeenCalledWith(
        { _id: ride.booking },
        { $set: { status: 'awaiting_payment' } },
      );
    });
  });

  describe('payRide', () => {
    it('charges only after passenger confirms arrival', async () => {
      const rideId = '507f1f77bcf86cd799439011';
      const passengerId = '507f1f77bcf86cd799439012';

      const ride: any = {
        _id: rideId,
        status: 'awaiting_payment',
        serviceType: 'taxi',
        passenger: passengerId,
        driver: '507f1f77bcf86cd799439013',
        totalCost: 12.5,
        passengerConfirmedAt: undefined,
        save: jest.fn().mockImplementation(function (this: any) {
          return Promise.resolve(this);
        }),
      };

      mockRideModel.findById.mockResolvedValue(ride);

      const blocked = await service.payRide(rideId, passengerId);
      expect(blocked.success).toBe(false);
      expect(mockPaymentsService.chargeCustomer).not.toHaveBeenCalled();

      ride.passengerConfirmedAt = new Date();
      ride.paymentStatus = 'pending';
      ride.paymentAttempt = 1;
      mockRideModel.findOneAndUpdate.mockResolvedValue(ride);
      const paid = await service.payRide(rideId, passengerId);

      expect(paid.success).toBe(true);
      expect(mockPaymentsService.chargeCustomer).toHaveBeenCalledTimes(1);
      expect(mockWalletService.addEarning).toHaveBeenCalledTimes(1);
      expect(ride.status).toBe('completed');
      expect(ride.paymentStatus).toBe('charged');
    });

    it('does not charge when another request already claimed payment', async () => {
      const rideId = '507f1f77bcf86cd799439021';
      const passengerId = '507f1f77bcf86cd799439022';
      const ride: any = {
        _id: rideId,
        status: 'awaiting_payment',
        paymentStatus: 'pending',
        passenger: passengerId,
        passengerConfirmedAt: new Date(),
        totalCost: 20,
      };

      mockRideModel.findById
        .mockResolvedValueOnce(ride)
        .mockResolvedValueOnce({ ...ride, paymentStatus: 'processing' });
      mockRideModel.findOneAndUpdate.mockResolvedValue(null);

      const result = await service.payRide(rideId, passengerId);

      expect(result.success).toBe(false);
      expect(result.message).toContain('already being processed');
      expect(mockPaymentsService.chargeCustomer).not.toHaveBeenCalled();
      expect(mockWalletService.addEarning).not.toHaveBeenCalled();
    });
  });
});
