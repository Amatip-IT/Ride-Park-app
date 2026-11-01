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
import { RideWalletService } from 'src/wallet/ride-wallet.service';
import { RidePricingService, reconcileTripMeters } from './ride-pricing.service';
import { calculateFare, DEFAULT_PRICING_RULES } from 'src/pricing/fare';

describe('RidesService', () => {
  let service: RidesService;

  const mockPaymentsService = {
    chargeCustomer: jest.fn().mockResolvedValue({ id: 'pi_test_123' }),
  };

  const mockWalletService = {
    addEarning: jest.fn().mockResolvedValue(undefined),
  };

  const mockRideWallet = {
    holdRideFunds: jest.fn(),
    captureRideHold: jest.fn(),
    releaseRideHold: jest.fn(),
  };

  const mockRidePricing = {
    getRules: jest.fn().mockResolvedValue(DEFAULT_PRICING_RULES),
    fare: jest.fn((input: any) => calculateFare(input, input.rules)),
    leg: jest.fn().mockResolvedValue({ distanceMeters: 8000, durationSeconds: 900, roadRoute: true }),
  };

  const mockNotificationsService = {
    sendNotification: jest.fn().mockResolvedValue(undefined),
  };

  const mockRideModel: any = {
    findById: jest.fn(),
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({}),
    deleteOne: jest.fn().mockResolvedValue({}),
  };

  const mockTaxiRequestModel = {
    findById: jest.fn(),
    updateOne: jest.fn().mockResolvedValue({}),
  };
  const mockChauffeurModel = { updateOne: jest.fn().mockResolvedValue({}) };
  const mockTaxiModel = { updateOne: jest.fn().mockResolvedValue({}) };

  const execOf = (value: any) => ({ exec: jest.fn().mockResolvedValue(value) });

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
        { provide: RideWalletService, useValue: mockRideWallet },
        { provide: RidePricingService, useValue: mockRidePricing },
      ],
    }).compile();

    service = module.get<RidesService>(RidesService);
    jest.clearAllMocks();
    mockRidePricing.getRules.mockResolvedValue(DEFAULT_PRICING_RULES);
    mockRidePricing.fare.mockImplementation((input: any) => calculateFare(input, input.rules));
  });

  describe('completeRide', () => {
    it('prices from server time, approach + trip distance, and does not charge', async () => {
      const rideId = '507f1f77bcf86cd799439011';
      const ride: any = {
        _id: rideId,
        status: 'in_progress',
        serviceType: 'taxi',
        vehicleCategory: 'medium',
        passenger: '507f1f77bcf86cd799439012',
        driver: '507f1f77bcf86cd799439013',
        booking: '507f1f77bcf86cd799439020',
        startedAt: new Date(Date.now() - 20 * 60_000),
        approachMeters: 3219, // ~2 mi
        estimatedTripMeters: 12875, // ~8 mi
        pricingSnapshot: DEFAULT_PRICING_RULES,
        hold: { status: 'held', amountPence: 1700 },
        stops: [{ initiatedBy: 'customer', durationSeconds: 120, endedAt: new Date() }],
      };
      mockRideModel.findById.mockResolvedValue(ride);
      mockRideModel.findOneAndUpdate.mockImplementation((_q: any, update: any) =>
        Promise.resolve({ ...ride, ...update.$set, toObject() { return { ...ride, ...update.$set }; } }),
      );

      const result = await service.completeRide(rideId, 8, 999);

      expect(result.success).toBe(true);
      expect(mockPaymentsService.chargeCustomer).not.toHaveBeenCalled();
      expect(mockRideWallet.captureRideHold).not.toHaveBeenCalled();
      const set = mockRideModel.findOneAndUpdate.mock.calls[0][1].$set;
      expect(set.status).toBe('awaiting_payment');
      // 10 mi × 110p + ~18 min (20 min minus 2 min stop) × 20p + £2 medium + £1 stop
      expect(set.fareBreakdown.billableMeters).toBe(3219 + 12875);
      expect(set.fareBreakdown.vehicleSurchargePence).toBe(200);
      expect(set.fareBreakdown.stopChargePence).toBe(100);
      expect(set.fareBreakdown.billableMinutes).toBeCloseTo(18, 0);
      expect(set.totalCostPence).toBe(set.fareBreakdown.totalPence);
      expect(mockTaxiRequestModel.updateOne).toHaveBeenCalledWith(
        { _id: ride.booking },
        { $set: { status: 'awaiting_payment' } },
      );
    });
  });

  describe('createRide', () => {
    const passengerId = '507f1f77bcf86cd799439012';
    const driverId = '507f1f77bcf86cd799439013';
    const bookingId = '507f1f77bcf86cd799439020';

    const request = {
      _id: bookingId,
      passenger: passengerId,
      acceptedDriver: driverId,
      status: 'arrived',
      vehicleCategory: 'small',
      pricingSnapshot: DEFAULT_PRICING_RULES,
      approachMeters: 1000,
      estimatedTripMeters: 5000,
      estimatedCostPence: 1234,
    };

    beforeEach(() => {
      mockTaxiRequestModel.findById.mockReturnValue(execOf(request));
      mockRideModel.findOne.mockReturnValue(execOf(null));
    });

    it('does not start the ride when funds cannot be held', async () => {
      const saved: any[] = [];
      const RideCtor: any = jest.fn().mockImplementation((doc: any) => {
        const ride = { ...doc, _id: { toString: () => 'ride1' }, save: jest.fn().mockResolvedValue(true) };
        saved.push(ride);
        return ride;
      });
      Object.assign(RideCtor, mockRideModel);
      (service as any).rideModel = RideCtor;
      mockRideWallet.holdRideFunds.mockResolvedValue({ ok: false, message: 'Card declined' });

      const result = await service.createRide({
        passengerId,
        driverId,
        serviceType: 'taxi',
        bookingId,
      });

      expect(result.success).toBe(false);
      expect(mockRideWallet.holdRideFunds).toHaveBeenCalledWith(
        expect.objectContaining({ amountPence: 1234, passengerId }),
      );
      expect(mockRideModel.deleteOne).toHaveBeenCalled();
      expect(saved[0].status).toBe('pending');
    });

    it('holds the quoted fare and starts the ride', async () => {
      const RideCtor: any = jest.fn().mockImplementation((doc: any) => ({
        ...doc,
        _id: { toString: () => 'ride2' },
        save: jest.fn().mockResolvedValue(true),
      }));
      Object.assign(RideCtor, mockRideModel);
      (service as any).rideModel = RideCtor;
      mockRideWallet.holdRideFunds.mockResolvedValue({ ok: true, topUpPence: 0 });

      const result = await service.createRide({
        passengerId,
        driverId,
        serviceType: 'taxi',
        bookingId,
      });

      expect(result.success).toBe(true);
      expect(result.data.status).toBe('in_progress');
      expect(result.data.hold.status).toBe('held');
      expect(result.data.hold.amountPence).toBe(1234);
      expect(mockWalletService.addEarning).not.toHaveBeenCalled();
    });

    it('refuses a driver who is not assigned to the request', async () => {
      const result = await service.createRide({
        passengerId,
        driverId: '507f1f77bcf86cd799439099',
        serviceType: 'taxi',
        bookingId,
      });
      expect(result.success).toBe(false);
      expect(mockRideWallet.holdRideFunds).not.toHaveBeenCalled();
    });
  });

  describe('payRide', () => {
    it('legacy card rides charge only after passenger confirms arrival', async () => {
      const rideId = '507f1f77bcf86cd799439011';
      const passengerId = '507f1f77bcf86cd799439012';

      const ride: any = {
        _id: rideId,
        status: 'awaiting_payment',
        serviceType: 'taxi',
        passenger: passengerId,
        driver: '507f1f77bcf86cd799439013',
        totalCost: 12.5,
        paymentMethod: 'card',
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

    it('wallet rides capture the hold and only then pay the driver', async () => {
      const rideId = '507f1f77bcf86cd799439031';
      const passengerId = '507f1f77bcf86cd799439032';
      const ride: any = {
        _id: { toString: () => rideId },
        status: 'awaiting_payment',
        serviceType: 'taxi',
        passenger: passengerId,
        driver: '507f1f77bcf86cd799439033',
        totalCost: 15,
        totalCostPence: 1500,
        paymentMethod: 'wallet',
        paymentStatus: 'pending',
        passengerConfirmedAt: new Date(),
        hold: { status: 'held', amountPence: 1700 },
      };
      mockRideModel.findById.mockResolvedValue(ride);
      mockRideModel.findOneAndUpdate
        .mockResolvedValueOnce({ ...ride, paymentStatus: 'processing' })
        .mockResolvedValueOnce({
          ...ride,
          status: 'completed',
          paymentStatus: 'charged',
          hold: { status: 'captured', amountPence: 1700 },
        });
      mockRideWallet.captureRideHold.mockResolvedValue({ ok: true, topUpPence: 0, extraChargedPence: 0 });

      const result = await service.payRide(rideId, passengerId);

      expect(result.success).toBe(true);
      expect(mockPaymentsService.chargeCustomer).not.toHaveBeenCalled();
      expect(mockRideWallet.captureRideHold).toHaveBeenCalledWith(
        expect.objectContaining({ heldPence: 1700, finalPence: 1500 }),
      );
      expect(mockWalletService.addEarning).toHaveBeenCalledWith(
        '507f1f77bcf86cd799439033',
        15,
        rideId,
        undefined,
        { fundedByCustomerWallet: true },
      );
    });

    it('does not pay the driver when wallet capture fails', async () => {
      const rideId = '507f1f77bcf86cd799439041';
      const passengerId = '507f1f77bcf86cd799439042';
      const ride: any = {
        _id: { toString: () => rideId },
        status: 'awaiting_payment',
        passenger: passengerId,
        driver: '507f1f77bcf86cd799439043',
        totalCostPence: 2500,
        paymentMethod: 'wallet',
        paymentStatus: 'pending',
        passengerConfirmedAt: new Date(),
        hold: { status: 'held', amountPence: 1700 },
      };
      mockRideModel.findById.mockResolvedValue(ride);
      mockRideModel.findOneAndUpdate.mockResolvedValueOnce({ ...ride, paymentStatus: 'processing' });
      mockRideWallet.captureRideHold.mockResolvedValue({ ok: false, message: 'Card declined' });

      const result = await service.payRide(rideId, passengerId);

      expect(result.success).toBe(false);
      expect(mockWalletService.addEarning).not.toHaveBeenCalled();
      expect(mockRideModel.updateOne).toHaveBeenCalledWith(
        { _id: rideId },
        expect.objectContaining({ $set: expect.objectContaining({ paymentStatus: 'payment_failed', 'hold.status': 'held' }) }),
      );
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

  describe('stops', () => {
    const rideId = '507f1f77bcf86cd799439051';
    const passengerId = '507f1f77bcf86cd799439052';
    const driverId = '507f1f77bcf86cd799439053';
    const baseRide = {
      _id: rideId,
      status: 'in_progress',
      passenger: passengerId,
      driver: driverId,
      pricingSnapshot: DEFAULT_PRICING_RULES,
      stops: [],
    };

    it('charges customer-initiated stops at the configured rate', async () => {
      mockRideModel.findById.mockResolvedValue(baseRide);
      mockRideModel.findOneAndUpdate.mockResolvedValue({ ...baseRide });

      await service.startStop(rideId, passengerId);

      const pushed = mockRideModel.findOneAndUpdate.mock.calls[0][1].$push.stops;
      expect(pushed.initiatedBy).toBe('customer');
      expect(pushed.ratePencePerMinute).toBe(50);
      expect(pushed.startedAt).toBeInstanceOf(Date);
    });

    it('records driver-initiated stops at £0 for the customer', async () => {
      mockRideModel.findById.mockResolvedValue(baseRide);
      mockRideModel.findOneAndUpdate.mockResolvedValue({ ...baseRide });

      await service.startStop(rideId, driverId);

      const pushed = mockRideModel.findOneAndUpdate.mock.calls[0][1].$push.stops;
      expect(pushed.initiatedBy).toBe('driver');
      expect(pushed.ratePencePerMinute).toBe(0);
    });

    it('rejects a second stop while one is open (no duplicate events)', async () => {
      const open = { ...baseRide, stops: [{ initiatedBy: 'customer', startedAt: new Date(), endedAt: null }] };
      mockRideModel.findById.mockResolvedValueOnce(baseRide).mockResolvedValueOnce(open);
      mockRideModel.findOneAndUpdate.mockResolvedValue(null);

      const result = await service.startStop(rideId, passengerId);
      expect(result.message).toContain('already in progress');
    });
  });
});

describe('reconcileTripMeters', () => {
  it('uses the GPS recording when it is plausible', () => {
    expect(reconcileTripMeters(10_000, 11_000)).toEqual({ billedMeters: 11_000, basis: 'recorded' });
  });
  it('falls back to the road estimate when nothing was recorded', () => {
    expect(reconcileTripMeters(10_000, 0)).toEqual({ billedMeters: 10_000, basis: 'estimated' });
  });
  it('clamps implausible recordings', () => {
    expect(reconcileTripMeters(10_000, 100_000).billedMeters).toBe(18_000);
    expect(reconcileTripMeters(10_000, 1_000).billedMeters).toBe(5_000);
  });
});
