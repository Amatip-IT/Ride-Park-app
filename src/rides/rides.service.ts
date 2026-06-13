import { Injectable } from '@nestjs/common';
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

// Pricing constants
const RATE_PER_MILE = 1.10; // £1.10 per mile (both driver and taxi)
const RATE_PER_MINUTE = 0.20; // £0.20 per minute (taxi only)

@Injectable()
export class RidesService {
  constructor(
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    @InjectModel(TaxiRideRequest.name)
    private taxiRequestModel: Model<TaxiRideRequestDocument>,
    @InjectModel(Chauffeur.name) private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly walletService: WalletService,
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
    const distanceCost = Math.round(distanceMiles * RATE_PER_MILE * 100) / 100;
    const timeCost = serviceType === 'taxi'
      ? Math.round(durationMinutes * RATE_PER_MINUTE * 100) / 100
      : 0;
    const totalCost = Math.round((distanceCost + timeCost) * 100) / 100;

    return { distanceCost, timeCost, totalCost };
  }

  /**
   * Get a price estimate (no ride created yet)
   */
  async getEstimate(
    serviceType: 'driver' | 'taxi',
    distanceMiles: number,
    durationMinutes: number,
  ): Promise<Response> {
    const pricing = this.calculateCost(serviceType, distanceMiles, durationMinutes);

    return {
      success: true,
      data: {
        serviceType,
        distanceMiles: Math.round(distanceMiles * 100) / 100,
        durationMinutes: Math.round(durationMinutes),
        ratePerMile: RATE_PER_MILE,
        ratePerMinute: serviceType === 'taxi' ? RATE_PER_MINUTE : 0,
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
        ratePerMinute: data.serviceType === 'taxi' ? RATE_PER_MINUTE : 0,
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
        { rideId: ride._id }
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
   * Complete a ride — calculate final cost
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

      const pricing = this.calculateCost(
        ride.serviceType as 'driver' | 'taxi',
        distanceMiles,
        durationMinutes,
      );

      // Store pricing on the ride regardless of payment outcome
      ride.distanceMiles = Math.round(distanceMiles * 100) / 100;
      ride.durationMinutes = Math.round(durationMinutes);
      ride.distanceCost = pricing.distanceCost;
      ride.timeCost = pricing.timeCost;
      ride.totalCost = pricing.totalCost;

      // Charge the passenger BEFORE marking ride as completed
      let paymentSucceeded = false;
      try {
        await this.paymentsService.chargeCustomer(
          ride.passenger.toString(),
          pricing.totalCost,
          `Payment for Ride ${ride._id.toString()}`,
        );
        paymentSucceeded = true;
      } catch (paymentErr: any) {
        console.warn(`Payment failed for ride ${ride._id.toString()}: ${paymentErr?.message}`);
      }

      // Mark ride as completed with the actual payment status
      ride.status = 'completed';
      ride.completedAt = new Date();
      (ride as any).paymentStatus = paymentSucceeded ? 'charged' : 'payment_failed';
      await ride.save();

      // Set driver availability back to 'online'
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

      if (paymentSucceeded) {
        await this.walletService.addEarning(
          ride.driver.toString(),
          pricing.totalCost,
          ride._id.toString(),
        );

        await this.notificationsService.sendNotification(
          ride.passenger.toString(),
          'Payment Completed',
          `Your ride has been completed and £${pricing.totalCost.toFixed(2)} has been charged successfully.`,
          'payment',
          { rideId: ride._id },
        );

        await this.notificationsService.sendNotification(
          ride.driver.toString(),
          'Payment Received',
          `Ride completed. £${pricing.totalCost.toFixed(2)} (gross) has been added to your earnings.`,
          'payment',
          { rideId: ride._id },
        );
      } else {
        await this.notificationsService.sendNotification(
          ride.passenger.toString(),
          'Payment Issue',
          `Your ride is complete, but we couldn't process your payment of £${pricing.totalCost.toFixed(2)}. Please check your payment method — we'll retry shortly.`,
          'payment',
          { rideId: ride._id },
        );

        await this.notificationsService.sendNotification(
          ride.driver.toString(),
          'Ride Completed',
          `Ride completed. Payment is being processed — earnings will appear once confirmed.`,
          'ride',
          { rideId: ride._id },
        );
      }

      return {
        success: true,
        data: ride,
        message: paymentSucceeded
          ? `Ride completed. Total cost: £${pricing.totalCost.toFixed(2)}`
          : `Ride completed but payment failed. Total cost: £${pricing.totalCost.toFixed(2)}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to complete ride: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
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

      const passengerId = (ride.passenger as any)?._id?.toString() || ride.passenger.toString();
      const driverId = (ride.driver as any)?._id?.toString() || ride.driver.toString();

      if (requestingUserId !== passengerId && requestingUserId !== driverId) {
        return { success: false, message: 'You do not have access to this receipt' };
      }

      if (ride.status !== 'completed') {
        return { success: false, message: 'Receipt is available after the trip is completed' };
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
            ? 'Payment could not be processed. We will retry automatically.'
            : requestingUserId === passengerId
              ? 'Charged to your saved payment method.'
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
        return { success: false, message: 'You do not have access to this receipt' };
      }

      if (!request.ride) {
        return {
          success: false,
          message: 'Receipt is not available until the trip is completed',
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
}
