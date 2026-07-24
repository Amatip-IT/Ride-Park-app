import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Ride, RideDocument } from 'src/schemas/ride.schema';
import {
  TaxiRideRequest,
  TaxiRideRequestDocument,
} from 'src/schemas/taxi-ride-request.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { NotificationsService } from 'src/notifications/notifications.service';
import { WalletService } from 'src/wallet/wallet.service';
import { PaymentsService } from 'src/payments/payments.service';
import {
  calculateRideCost,
  RATE_PER_MILE,
  RATE_PER_MINUTE_TAXI,
} from 'src/common/pricing.constants';
import { toObjectIdString } from 'src/common/request.util';

@Injectable()
export class RidesService {
  private readonly logger = new Logger(RidesService.name);

  constructor(
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    @InjectModel(TaxiRideRequest.name)
    private taxiRequestModel: Model<TaxiRideRequestDocument>,
    @InjectModel(Chauffeur.name)
    private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * Calculate estimated ride cost
   */
  calculateCost(
    serviceType: 'driver' | 'taxi',
    distanceMiles: number,
    durationMinutes: number,
  ): { distanceCost: number; timeCost: number; totalCost: number } {
    return calculateRideCost(serviceType, distanceMiles, durationMinutes);
  }

  /**
   * Get a price estimate (no ride created yet)
   */
  async getEstimate(
    serviceType: 'driver' | 'taxi',
    distanceMiles: number,
    durationMinutes: number,
  ): Promise<Response> {
    const pricing = this.calculateCost(
      serviceType,
      distanceMiles,
      durationMinutes,
    );

    return {
      success: true,
      data: {
        serviceType,
        distanceMiles: Math.round(distanceMiles * 100) / 100,
        durationMinutes: Math.round(durationMinutes),
        ratePerMile: RATE_PER_MILE,
        ratePerMinute: serviceType === 'taxi' ? RATE_PER_MINUTE_TAXI : 0,
        ...pricing,
      },
      message: `Estimated cost: £${pricing.totalCost.toFixed(2)}`,
    };
  }

  /**
   * Create a ride record when a trip starts
   */
  async createRide(data: {
    passengerId: string;
    driverId: string;
    serviceType: 'driver' | 'taxi';
    bookingId?: string;
    pickup?: { address?: string; lat?: number; lng?: number };
    dropoff?: { address?: string; lat?: number; lng?: number };
  }): Promise<Response> {
    try {
      const ride = new this.rideModel({
        passenger: data.passengerId,
        driver: data.driverId,
        serviceType: data.serviceType,
        booking: data.bookingId,
        pickup: data.pickup,
        dropoff: data.dropoff,
        ratePerMile: RATE_PER_MILE,
        ratePerMinute: data.serviceType === 'taxi' ? RATE_PER_MINUTE_TAXI : 0,
        status: 'in_progress',
        startedAt: new Date(),
      });

      await ride.save();

      // Set the driver's availability to 'busy'
      if (data.serviceType === 'driver') {
        await this.chauffeurModel.updateOne(
          { user: data.driverId },
          { $set: { availability: 'busy' } },
        );
      } else {
        await this.taxiModel.updateOne(
          { user: data.driverId },
          { $set: { availability: 'busy' } },
        );
      }

      // Notify Passenger
      await this.notificationsService.sendNotification(
        data.passengerId,
        'Ride Started',
        'Your ride has started! Have a safe journey.',
        'ride',
        { rideId: ride._id },
      );

      return {
        success: true,
        data: ride,
        message: 'Ride started',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to start ride: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Driver ends the trip — calculate fare and request passenger payment (no auto-charge).
   */
  async completeRide(
    rideId: string,
    distanceMiles: number,
    durationMinutes: number,
  ): Promise<Response> {
    try {
      const ride = await this.rideModel.findById(rideId);
      if (!ride) {
        return { success: false, message: 'Ride not found' };
      }

      if (ride.status === 'completed') {
        return { success: false, message: 'Ride is already completed' };
      }

      if (ride.status === 'awaiting_payment') {
        return {
          success: true,
          data: ride,
          message: 'Ride is already awaiting passenger payment',
        };
      }

      const pricing = this.calculateCost(
        ride.serviceType as 'driver' | 'taxi',
        distanceMiles,
        durationMinutes,
      );

      ride.distanceMiles = Math.round(distanceMiles * 100) / 100;
      ride.durationMinutes = Math.round(durationMinutes);
      ride.distanceCost = pricing.distanceCost;
      ride.timeCost = pricing.timeCost;
      ride.totalCost = pricing.totalCost;
      ride.status = 'awaiting_payment';
      ride.paymentStatus = 'pending';
      await ride.save();

      if (ride.booking) {
        await this.taxiRequestModel.updateOne(
          { _id: ride.booking },
          { $set: { status: 'awaiting_payment' } },
        );
      }

      await this.notificationsService.sendNotification(
        ride.passenger.toString(),
        'Confirm & Pay',
        `Your ride is complete. Confirm you are at your destination, then pay £${pricing.totalCost.toFixed(2)}.`,
        'payment',
        { rideId: ride._id, action: 'pay' },
      );

      await this.notificationsService.sendNotification(
        ride.driver.toString(),
        'Awaiting Payment',
        `Trip ended. Fare: £${pricing.totalCost.toFixed(2)}. Waiting for the passenger to confirm and pay.`,
        'payment',
        { rideId: ride._id },
      );

      return {
        success: true,
        data: ride,
        message: `Trip ended. Waiting for passenger to confirm and pay £${pricing.totalCost.toFixed(2)}.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to complete ride: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Passenger confirms they are at the destination before paying.
   */
  async confirmPassengerAtDestination(
    rideId: string,
    passengerId: string,
  ): Promise<Response> {
    try {
      const ride = await this.rideModel.findById(rideId);
      if (!ride) {
        return { success: false, message: 'Ride not found' };
      }

      if (toObjectIdString(ride.passenger) !== toObjectIdString(passengerId)) {
        return {
          success: false,
          message: 'Only the passenger can confirm arrival',
        };
      }

      if (ride.status !== 'awaiting_payment') {
        return {
          success: false,
          message: 'Arrival can only be confirmed when payment is due',
        };
      }

      ride.passengerConfirmedAt = new Date();
      await ride.save();

      if (ride.booking) {
        await this.taxiRequestModel.updateOne(
          { _id: ride.booking },
          { $set: { passengerConfirmedAt: ride.passengerConfirmedAt } },
        );
      }

      return {
        success: true,
        data: ride,
        message: 'Location confirmed. You can now complete payment.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to confirm arrival: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Passenger explicitly confirms payment for a completed trip.
   */
  async payRide(rideId: string, passengerId: string): Promise<Response> {
    try {
      const existingRide = await this.rideModel.findById(rideId);
      if (!existingRide) {
        return { success: false, message: 'Ride not found' };
      }

      if (
        toObjectIdString(existingRide.passenger) !==
        toObjectIdString(passengerId)
      ) {
        return {
          success: false,
          message: 'Only the passenger can pay for this ride',
        };
      }

      if (
        existingRide.status === 'completed' &&
        existingRide.paymentStatus === 'charged'
      ) {
        return {
          success: true,
          data: existingRide,
          message: 'This ride has already been paid.',
        };
      }

      if (existingRide.status !== 'awaiting_payment') {
        return {
          success: false,
          message: 'Payment is not available for this ride yet',
        };
      }

      if (!existingRide.passengerConfirmedAt) {
        return {
          success: false,
          message: 'Please confirm you are at your destination before paying',
        };
      }

      const ride = await this.rideModel.findOneAndUpdate(
        {
          _id: rideId,
          status: 'awaiting_payment',
          passengerConfirmedAt: { $ne: null },
          paymentStatus: { $in: ['pending', 'payment_failed'] },
        },
        {
          $set: {
            paymentStatus: 'processing',
            paymentProcessingAt: new Date(),
          },
          $inc: { paymentAttempt: 1 },
        },
        { new: true },
      );

      if (!ride) {
        const latest = await this.rideModel.findById(rideId);
        if (
          latest?.status === 'completed' &&
          latest.paymentStatus === 'charged'
        ) {
          return {
            success: true,
            data: latest,
            message: 'This ride has already been paid.',
          };
        }
        return {
          success: false,
          message: 'A payment for this ride is already being processed.',
        };
      }

      if (!ride.totalCost || ride.totalCost <= 0) {
        ride.status = 'completed';
        ride.completedAt = new Date();
        ride.paymentStatus = 'charged';
        await ride.save();
        await this.finalizePaidRide(ride);
        return {
          success: true,
          data: ride,
          message: 'No payment required — ride completed.',
        };
      }

      let paymentIntentId: string;
      try {
        const paymentIntent = await this.paymentsService.chargeCustomer(
          toObjectIdString(ride.passenger),
          ride.totalCost,
          `Payment for Ride ${ride._id.toString()}`,
          { type: 'ride', rideId: ride._id.toString() },
          `ride:${ride._id.toString()}:payment:${ride.paymentAttempt}`,
        );
        paymentIntentId = paymentIntent.id;
      } catch (paymentErr: any) {
        ride.paymentStatus = 'payment_failed';
        await ride.save();
        return {
          success: false,
          message: `Payment failed — ${paymentErr?.message || 'could not charge your card'}. Please check your payment method and try again.`,
        };
      }

      ride.status = 'completed';
      ride.completedAt = new Date();
      ride.paymentStatus = 'charged';
      ride.paymentIntentId = paymentIntentId;
      await ride.save();

      await this.finalizePaidRide(ride);

      await this.notificationsService.sendNotification(
        ride.passenger.toString(),
        'Payment Successful',
        `£${ride.totalCost.toFixed(2)} paid. Your trip receipt is now available.`,
        'payment',
        { rideId: ride._id, action: 'receipt' },
      );

      await this.notificationsService.sendNotification(
        ride.driver.toString(),
        'Payment Received',
        `£${ride.totalCost.toFixed(2)} received. Earnings credited to your wallet.`,
        'payment',
        { rideId: ride._id },
      );

      return {
        success: true,
        data: ride,
        message: `Payment successful. £${ride.totalCost.toFixed(2)} paid.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Payment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  private async finalizePaidRide(ride: RideDocument): Promise<void> {
    if (ride.booking) {
      await this.taxiRequestModel.updateOne(
        { _id: ride.booking },
        { $set: { status: 'completed' } },
      );
    }

    if (ride.serviceType === 'driver') {
      await this.chauffeurModel.updateOne(
        { user: ride.driver },
        { $set: { availability: 'online' } },
      );
    } else {
      await this.taxiModel.updateOne(
        { user: ride.driver },
        { $set: { availability: 'online' } },
      );
    }

    if (ride.totalCost > 0) {
      await this.walletService.addEarning(
        ride.driver.toString(),
        ride.totalCost,
        ride._id.toString(),
        ride.paymentIntentId,
      );
    }
  }

  /**
   * Idempotent recovery when Stripe confirms payment but the HTTP pay handler died mid-flight.
   */
  async reconcilePaymentSucceeded(
    rideId: string,
    paymentIntentId: string,
  ): Promise<void> {
    const ride = await this.rideModel.findById(rideId);
    if (!ride) return;

    if (
      ride.status !== 'completed' ||
      ride.paymentStatus !== 'charged' ||
      !ride.paymentIntentId
    ) {
      ride.status = 'completed';
      ride.completedAt = ride.completedAt || new Date();
      ride.paymentStatus = 'charged';
      ride.paymentIntentId = paymentIntentId;
      await ride.save();
    } else if (ride.paymentIntentId !== paymentIntentId) {
      // Already charged under another PI — do not overwrite; still ensure earnings path
      this.logger.warn(
        `Ride ${rideId} already charged with ${ride.paymentIntentId}; webhook PI ${paymentIntentId}`,
      );
    }

    await this.finalizePaidRide(ride);
  }

  async reconcilePaymentFailed(
    rideId: string,
    paymentIntentId: string,
  ): Promise<void> {
    const ride = await this.rideModel.findById(rideId);
    if (!ride) return;
    if (ride.paymentStatus === 'charged' && ride.status === 'completed') {
      return;
    }

    ride.paymentStatus = 'payment_failed';
    ride.paymentIntentId = paymentIntentId;
    if (ride.status !== 'completed') {
      ride.status = 'awaiting_payment';
    }
    await ride.save();
  }

  /**
   * Trip receipt for passenger or driver on a completed ride
   */
  async getRideReceipt(
    rideId: string,
    requestingUserId: string,
  ): Promise<Response> {
    try {
      const ride = await this.rideModel
        .findById(rideId)
        .populate('passenger', 'firstName lastName email phoneNumber')
        .populate('driver', 'firstName lastName email phoneNumber')
        .exec();

      if (!ride) {
        return { success: false, message: 'Ride not found' };
      }

      const passengerId =
        (ride.passenger as any)?._id?.toString() || ride.passenger.toString();
      const driverId =
        (ride.driver as any)?._id?.toString() || ride.driver.toString();

      if (requestingUserId !== passengerId && requestingUserId !== driverId) {
        return {
          success: false,
          message: 'You do not have access to this receipt',
        };
      }

      if (ride.status !== 'completed' || ride.paymentStatus !== 'charged') {
        return {
          success: false,
          message: 'Receipt is available after payment has been completed',
        };
      }

      let taxiRequest: TaxiRideRequestDocument | null = null;
      if (ride.booking) {
        taxiRequest = await this.taxiRequestModel.findById(ride.booking).exec();
      }

      const passenger = ride.passenger as any;
      const driver = ride.driver as any;

      const receipt = {
        rideId: ride._id.toString(),
        requestId: taxiRequest?._id?.toString() || ride.booking?.toString(),
        role: requestingUserId === passengerId ? 'passenger' : 'driver',
        serviceType: ride.serviceType,
        completedAt: ride.completedAt,
        startedAt: ride.startedAt,
        passenger: {
          name: `${passenger?.firstName || ''} ${passenger?.lastName || ''}`.trim(),
          email: passenger?.email,
        },
        driver: {
          name: `${driver?.firstName || ''} ${driver?.lastName || ''}`.trim(),
          email: driver?.email,
        },
        pickup: ride.pickup,
        dropoff: ride.dropoff,
        distanceMiles: ride.distanceMiles,
        durationMinutes: ride.durationMinutes,
        distanceCost: ride.distanceCost,
        timeCost: ride.timeCost,
        totalCost: ride.totalCost,
        ratePerMile: ride.ratePerMile,
        ratePerMinute: ride.ratePerMinute,
        paymentStatus: (ride as any).paymentStatus || 'charged',
        paymentNote:
          (ride as any).paymentStatus === 'payment_failed'
            ? 'Payment could not be processed. Please try again from your bookings.'
            : requestingUserId === passengerId
              ? 'Paid via your confirmed payment.'
              : 'Earnings credited to your wallet (after platform fee).',
        vehicle: taxiRequest?.driverVehicle || null,
        estimatedCost: taxiRequest?.estimatedCost,
      };

      return {
        success: true,
        data: receipt,
        message: 'Trip receipt',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to load receipt: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Receipt via taxi booking request id
   */
  async getReceiptByTaxiRequest(
    requestId: string,
    requestingUserId: string,
  ): Promise<Response> {
    try {
      const request = await this.taxiRequestModel.findById(requestId).exec();
      if (!request) {
        return { success: false, message: 'Ride request not found' };
      }

      const passengerId = request.passenger.toString();
      const driverId = request.acceptedDriver?.toString();

      if (
        requestingUserId !== passengerId &&
        (!driverId || requestingUserId !== driverId)
      ) {
        return {
          success: false,
          message: 'You do not have access to this receipt',
        };
      }

      if (!request.ride) {
        return {
          success: false,
          message: 'Receipt is not available until the trip is completed',
        };
      }

      const linkedRide = await this.rideModel.findById(request.ride).exec();
      if (!linkedRide) {
        return { success: false, message: 'Linked ride not found' };
      }

      if (linkedRide.status === 'awaiting_payment') {
        return {
          success: false,
          message:
            'Receipt is available after you confirm your location and complete payment',
        };
      }

      return this.getRideReceipt(request.ride.toString(), requestingUserId);
    } catch (error) {
      return {
        success: false,
        message: `Failed to load receipt: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get ride details
   */
  async getRide(rideId: string): Promise<Response> {
    try {
      const ride = await this.rideModel
        .findById(rideId)
        .populate('passenger', 'firstName lastName')
        .populate('driver', 'firstName lastName')
        .exec();

      if (!ride) {
        return { success: false, message: 'Ride not found' };
      }

      return { success: true, data: ride, message: 'Ride details retrieved' };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch ride: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Past rides + light stats for the logged-in driver/taxi driver.
   */
  async getDriverRideHistory(
    driverId: string,
    period?: 'day' | 'week' | 'month',
  ): Promise<Response> {
    try {
      const filter: Record<string, unknown> = {
        driver: driverId,
        status: { $in: ['awaiting_payment', 'completed'] },
      };

      if (period) {
        const since = new Date();
        if (period === 'day') since.setHours(since.getHours() - 24);
        else if (period === 'week') since.setDate(since.getDate() - 7);
        else if (period === 'month') since.setMonth(since.getMonth() - 1);
        filter.createdAt = { $gte: since };
      }

      const rides = await this.rideModel
        .find(filter)
        .populate('passenger', 'firstName lastName phoneNumber')
        .sort({ completedAt: -1, createdAt: -1 })
        .limit(100)
        .exec();

      const paid = rides.filter((r) => r.paymentStatus === 'charged');
      const awaitingPayment = rides.filter(
        (r) => r.status === 'awaiting_payment' || r.paymentStatus === 'processing',
      );

      const stats = {
        totalRides: rides.length,
        paidRides: paid.length,
        awaitingPayment: awaitingPayment.length,
        totalMiles: Number(
          rides.reduce((sum, r) => sum + (r.distanceMiles || 0), 0).toFixed(1),
        ),
        totalMinutes: Math.round(
          rides.reduce((sum, r) => sum + (r.durationMinutes || 0), 0),
        ),
        grossEarnings: Number(
          paid.reduce((sum, r) => sum + (r.totalCost || 0), 0).toFixed(2),
        ),
        pendingEarnings: Number(
          awaitingPayment
            .reduce((sum, r) => sum + (r.totalCost || 0), 0)
            .toFixed(2),
        ),
      };

      return {
        success: true,
        data: { rides, stats },
        message: `Found ${rides.length} past rides`,
        meta: { total: rides.length },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch ride history: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
