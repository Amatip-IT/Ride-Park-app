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
import { RideWalletService } from 'src/wallet/ride-wallet.service';
import { RidePricingService, reconcileTripMeters } from './ride-pricing.service';
import {
  calculateFare,
  FareBreakdown,
  metersToMiles,
  milesToMeters,
  penceToPounds,
  PricingRules,
  VehicleCategory,
  vehicleCategoryFrom,
} from 'src/pricing/fare';
import { isValidLatLng } from 'src/search/routes.service';
import { Cron, CronExpression } from '@nestjs/schedule';
import { toObjectIdString } from 'src/common/request.util';
import {
  gbp,
  notificationLines,
  placeLine,
} from 'src/notifications/notification-copy';

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
    @Inject(forwardRef(() => WalletService))
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
    @Inject(forwardRef(() => RideWalletService))
    private readonly rideWallet: RideWalletService,
    private readonly ridePricing: RidePricingService,
  ) {}

  /** Legacy pound fields kept in sync with the pence breakdown for existing screens. */
  private legacyFareFields(fare: FareBreakdown) {
    return {
      distanceCost: penceToPounds(fare.distanceChargePence),
      timeCost: penceToPounds(fare.timeChargePence),
      totalCost: penceToPounds(fare.totalPence),
      totalCostPence: fare.totalPence,
    };
  }

  /**
   * Price estimate for a known distance (no routing). Uses the same engine as live
   * quotes so the minimum fare and vehicle surcharge are applied consistently.
   */
  async getEstimate(
    serviceType: 'driver' | 'taxi',
    distanceMiles: number,
    durationMinutes: number,
    vehicleCategory?: string,
  ): Promise<Response> {
    const rules = await this.ridePricing.getRules();
    const fare = calculateFare(
      {
        serviceType,
        vehicleCategory: vehicleCategoryFrom(vehicleCategory),
        approachMeters: 0,
        tripMeters: milesToMeters(distanceMiles),
        tripMinutes: durationMinutes,
      },
      rules,
    );

    return {
      success: true,
      data: {
        serviceType,
        distanceMiles: Math.round(distanceMiles * 100) / 100,
        durationMinutes: Math.round(durationMinutes),
        ratePerMile: penceToPounds(rules.ratePerMilePence),
        ratePerMinute: serviceType === 'taxi' ? penceToPounds(rules.ratePerMinuteTaxiPence) : 0,
        fareBreakdown: fare,
        ...this.legacyFareFields(fare),
      },
      message: `Estimated cost: £${penceToPounds(fare.totalPence).toFixed(2)}`,
    };
  }

  /**
   * Road-route quote for every vehicle category: driver → pickup (nearest suitable
   * driver, or the chosen driver) plus pickup → destination.
   */
  async getQuote(input: {
    pickupLat: number;
    pickupLng: number;
    destinationLat: number;
    destinationLng: number;
    targetTaxiId?: string;
  }): Promise<Response> {
    const pickup = { lat: Number(input.pickupLat), lng: Number(input.pickupLng) };
    const destination = { lat: Number(input.destinationLat), lng: Number(input.destinationLng) };
    if (!isValidLatLng(pickup) || !isValidLatLng(destination)) {
      return { success: false, message: 'A valid pickup and destination are required for a quote.' };
    }
    try {
      const quote = await this.ridePricing.quote({
        pickup,
        destination,
        targetTaxiId: input.targetTaxiId,
      });
      return {
        success: true,
        data: {
          trip: quote.trip,
          approach: quote.approach,
          fares: quote.fares,
          rules: quote.rules,
        },
        message: 'Quote calculated',
      };
    } catch (error) {
      this.logger.error(`Quote failed: ${error instanceof Error ? error.message : error}`);
      return { success: false, message: 'We could not calculate a price right now. Please try again.' };
    }
  }

  /**
   * Create a ride record when the driver starts the trip, and hold the quoted fare
   * in the passenger's wallet. The ride does not start if funds can't be secured.
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
      let request: TaxiRideRequestDocument | null = null;
      if (data.bookingId) {
        request = await this.taxiRequestModel.findById(data.bookingId).exec();
        if (!request) return { success: false, message: 'Ride request not found' };
        if (toObjectIdString(request.acceptedDriver) !== toObjectIdString(data.driverId)) {
          return { success: false, message: 'Only the assigned driver can start this ride' };
        }
        if (toObjectIdString(request.passenger) !== toObjectIdString(data.passengerId)) {
          return { success: false, message: 'Passenger does not match this ride request' };
        }
        if (!['accepted', 'arrived', 'in_progress'].includes(request.status)) {
          return { success: false, message: `This ride is ${request.status} and cannot be started` };
        }

        // Double tap / retry: return the ride that already exists for this request
        const existing = await this.rideModel.findOne({ booking: data.bookingId }).exec();
        if (existing && existing.status !== 'cancelled') {
          return { success: true, data: existing, message: 'Ride already started' };
        }
      }

      const rules: PricingRules =
        (request?.pricingSnapshot as PricingRules) || (await this.ridePricing.getRules());
      const vehicleCategory = vehicleCategoryFrom(request?.vehicleCategory);

      let estimatedFarePence = request?.estimatedCostPence;
      if (estimatedFarePence == null) {
        const tripMeters =
          request?.estimatedTripMeters ?? milesToMeters(request?.estimatedDistanceMiles || 0);
        estimatedFarePence = calculateFare(
          {
            serviceType: data.serviceType,
            vehicleCategory,
            approachMeters: request?.approachMeters || 0,
            tripMeters,
            tripMinutes: (request?.estimatedTripSeconds ?? (request?.estimatedDurationMinutes || 0) * 60) / 60,
          },
          rules,
        ).totalPence;
      }

      const ride = new this.rideModel({
        passenger: data.passengerId,
        driver: data.driverId,
        serviceType: data.serviceType,
        booking: data.bookingId,
        pickup: data.pickup,
        dropoff: data.dropoff,
        ratePerMile: penceToPounds(rules.ratePerMilePence),
        ratePerMinute: data.serviceType === 'taxi' ? penceToPounds(rules.ratePerMinuteTaxiPence) : 0,
        vehicleCategory,
        pricingSnapshot: rules,
        approachMeters: request?.approachMeters || 0,
        estimatedTripMeters: request?.estimatedTripMeters,
        estimatedFarePence,
        paymentMethod: 'wallet',
        hold: { status: 'holding', amountPence: estimatedFarePence },
        status: 'pending',
      });
      await ride.save();

      const hold = await this.rideWallet.holdRideFunds({
        rideId: ride._id.toString(),
        passengerId: data.passengerId,
        amountPence: estimatedFarePence,
      });

      if (!hold.ok) {
        await this.rideModel.deleteOne({ _id: ride._id, 'hold.status': 'holding' });
        this.logger.warn(
          JSON.stringify({ event: 'ride_hold_failed', bookingId: data.bookingId, reason: hold.message }),
        );
        await this.notificationsService.sendNotification(
          data.passengerId,
          'Payment needed to start your ride',
          notificationLines(
            `We couldn't hold ${gbp(penceToPounds(estimatedFarePence))} for your ride.`,
            hold.message,
          ),
          'payment',
          { requestId: data.bookingId },
        );
        return {
          success: false,
          message: `The passenger's payment could not be secured, so the ride can't start yet. ${hold.message}`,
        };
      }

      ride.hold = {
        ...ride.hold,
        status: 'held',
        amountPence: estimatedFarePence,
        heldAt: new Date(),
        topUpPaymentIntentId: hold.topUpPaymentIntentId,
      };
      ride.status = 'in_progress';
      ride.startedAt = new Date();
      await ride.save();
      this.logger.log(
        JSON.stringify({
          event: 'ride_started',
          rideId: ride._id.toString(),
          heldPence: estimatedFarePence,
          topUpPence: hold.topUpPence,
        }),
      );

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
        notificationLines(
          `Your ${data.serviceType === 'taxi' ? 'taxi' : 'chauffeur'} trip has started.`,
          `Pickup: ${placeLine(data.pickup?.address) || 'Shared in the app'}`,
          `Drop-off: ${placeLine(data.dropoff?.address) || 'Shared in the app'}`,
          `${gbp(penceToPounds(estimatedFarePence))} is held in your wallet until the trip ends.`,
          'Have a safe journey.',
        ),
        'ride',
        { rideId: ride._id },
      );

      return {
        success: true,
        data: ride,
        message: 'Ride started',
      };
    } catch (error: any) {
      if (error?.code === 11000 && data.bookingId) {
        const existing = await this.rideModel.findOne({ booking: data.bookingId }).exec();
        if (existing) return { success: true, data: existing, message: 'Ride already started' };
      }
      this.logger.error(`Failed to start ride: ${error?.message || error}`);
      return {
        success: false,
        message: 'Failed to start ride. Please try again.',
      };
    }
  }

  private requesterRole(ride: RideDocument, userId: string): 'customer' | 'driver' | null {
    const caller = toObjectIdString(userId);
    if (caller === toObjectIdString(ride.passenger)) return 'customer';
    if (caller === toObjectIdString(ride.driver)) return 'driver';
    return null;
  }

  /**
   * Start a stop on an in-progress ride. Server time is the source of truth.
   * Customer stops are charged at the snapshot rate; driver stops at the driver rate (default £0).
   */
  async startStop(rideId: string, userId: string): Promise<Response> {
    const ride = await this.rideModel.findById(rideId);
    if (!ride) return { success: false, message: 'Ride not found' };
    const role = this.requesterRole(ride, userId);
    if (!role) return { success: false, message: 'You are not part of this ride' };
    if (ride.status !== 'in_progress') {
      return { success: false, message: 'Stops can only be started during an active ride' };
    }

    const rules = (ride.pricingSnapshot as PricingRules) || (await this.ridePricing.getRules());
    const rate =
      role === 'customer' ? rules.customerStopRatePencePerMinute : rules.driverStopRatePencePerMinute;

    const updated = await this.rideModel.findOneAndUpdate(
      {
        _id: rideId,
        status: 'in_progress',
        stops: { $not: { $elemMatch: { endedAt: null } } },
      },
      {
        $push: {
          stops: {
            initiatedBy: role,
            initiatorId: userId,
            startedAt: new Date(),
            endedAt: null,
            durationSeconds: 0,
            ratePencePerMinute: rate,
            chargePence: 0,
          },
        },
      },
      { new: true },
    );

    if (!updated) {
      const latest = await this.rideModel.findById(rideId);
      const open = latest?.stops?.find((s) => !s.endedAt);
      if (open) return { success: true, data: latest, message: 'A stop is already in progress' };
      return { success: false, message: 'Stops can only be started during an active ride' };
    }

    this.logger.log(JSON.stringify({ event: 'ride_stop_started', rideId, initiatedBy: role }));
    return {
      success: true,
      data: updated,
      message:
        role === 'customer'
          ? `Stop started. Waiting time is charged at ${gbp(penceToPounds(rate))} per minute.`
          : 'Stop started. Driver stops are not charged to the passenger.',
    };
  }

  /** End the open stop and price it from server timestamps (rounded once). */
  async endStop(rideId: string, userId: string): Promise<Response> {
    const ride = await this.rideModel.findById(rideId);
    if (!ride) return { success: false, message: 'Ride not found' };
    if (!this.requesterRole(ride, userId)) {
      return { success: false, message: 'You are not part of this ride' };
    }
    const updated = await this.closeOpenStop(rideId, userId);
    if (!updated) {
      return { success: true, data: ride, message: 'There is no stop in progress' };
    }
    this.logger.log(JSON.stringify({ event: 'ride_stop_ended', rideId }));
    return { success: true, data: updated, message: 'Stop ended. Ride tracking resumed.' };
  }

  private async closeOpenStop(rideId: string, endedBy?: string): Promise<RideDocument | null> {
    const ride = await this.rideModel.findById(rideId);
    const open = ride?.stops?.find((s) => !s.endedAt);
    if (!ride || !open) return null;

    const endedAt = new Date();
    const durationSeconds = Math.max(
      0,
      Math.round((endedAt.getTime() - new Date(open.startedAt).getTime()) / 1000),
    );
    const chargePence = Math.round((durationSeconds * (open.ratePencePerMinute || 0)) / 60);

    return this.rideModel.findOneAndUpdate(
      { _id: rideId, stops: { $elemMatch: { _id: open._id, endedAt: null } } },
      {
        $set: {
          'stops.$.endedAt': endedAt,
          'stops.$.durationSeconds': durationSeconds,
          'stops.$.chargePence': chargePence,
          ...(endedBy ? { 'stops.$.endedBy': endedBy } : {}),
        },
      },
      { new: true },
    );
  }

  /**
   * Release a ride's wallet hold back to the passenger (cancelled/failed rides, admin action).
   * Safe to call repeatedly.
   */
  async releaseHoldForRide(rideId: string, reason: string): Promise<boolean> {
    const ride = await this.rideModel.findById(rideId);
    if (!ride || !['held', 'releasing'].includes(ride.hold?.status)) return false;

    await this.rideModel.updateOne({ _id: rideId, 'hold.status': 'held' }, { $set: { 'hold.status': 'releasing' } });
    const result = await this.rideWallet.releaseRideHold({
      rideId,
      passengerId: toObjectIdString(ride.passenger),
      heldPence: ride.hold.amountPence,
      reason,
    });
    if (!result.ok) return false;
    await this.rideModel.updateOne(
      { _id: rideId },
      { $set: { 'hold.status': 'released', 'hold.releasedAt': new Date() } },
    );
    this.logger.log(JSON.stringify({ event: 'ride_hold_released', rideId, reason }));
    return true;
  }

  /**
   * Driver ends the trip — calculate fare and request passenger payment (no auto-charge).
   */
  async completeRide(
    rideId: string,
    recordedDistanceMiles: number,
    _clientDurationMinutes?: number,
  ): Promise<Response> {
    try {
      const existing = await this.rideModel.findById(rideId);
      if (!existing) {
        return { success: false, message: 'Ride not found' };
      }

      if (existing.status === 'completed') {
        return { success: false, message: 'Ride is already completed' };
      }

      if (existing.status === 'awaiting_payment') {
        return {
          success: true,
          data: existing,
          message: 'Ride is already awaiting passenger payment',
        };
      }

      if (existing.status !== 'in_progress') {
        return { success: false, message: `A ${existing.status} ride cannot be completed` };
      }

      // Stop timers end with the trip
      await this.closeOpenStop(rideId);
      const ride = (await this.rideModel.findById(rideId))!;

      const completedAt = new Date();
      const startedAt = ride.startedAt || ride.createdAt || completedAt;
      const tripSeconds = Math.max(
        0,
        Math.round((completedAt.getTime() - new Date(startedAt).getTime()) / 1000),
      );
      const stopSeconds = (ride.stops || []).reduce((sum, s) => sum + (s.durationSeconds || 0), 0);

      const recordedMiles = Number(recordedDistanceMiles);
      const recordedTripMeters =
        Number.isFinite(recordedMiles) && recordedMiles > 0 && recordedMiles < 1000
          ? milesToMeters(recordedMiles)
          : undefined;

      let estimatedTripMeters = ride.estimatedTripMeters;
      if (!estimatedTripMeters && isValidLatLng(ride.pickup as any) && isValidLatLng(ride.dropoff as any)) {
        const leg = await this.ridePricing.leg(ride.pickup as any, ride.dropoff as any);
        estimatedTripMeters = leg.distanceMeters;
      }
      const { billedMeters, basis } = reconcileTripMeters(estimatedTripMeters, recordedTripMeters);

      const rules = (ride.pricingSnapshot as PricingRules) || (await this.ridePricing.getRules());
      const fare = this.ridePricing.fare({
        serviceType: ride.serviceType as 'driver' | 'taxi',
        vehicleCategory: vehicleCategoryFrom(ride.vehicleCategory) as VehicleCategory,
        approachMeters: ride.approachMeters || 0,
        tripMeters: billedMeters,
        // Stop time is billed by the stop rules, so it is excluded from the per-minute charge
        tripMinutes: Math.max(0, tripSeconds - stopSeconds) / 60,
        stops: (ride.stops || []).map((s) => ({
          initiatedBy: s.initiatedBy,
          durationSeconds: s.durationSeconds || 0,
        })),
        rules,
      });

      const legacy = this.legacyFareFields(fare);
      const updated = await this.rideModel.findOneAndUpdate(
        { _id: rideId, status: 'in_progress' },
        {
          $set: {
            status: 'awaiting_payment',
            paymentStatus: 'pending',
            completedAt,
            tripSeconds,
            estimatedTripMeters,
            recordedTripMeters,
            billedTripMeters: billedMeters,
            fareBreakdown: { ...fare, tripDistanceBasis: basis },
            distanceMiles: metersToMiles(fare.billableMeters),
            durationMinutes: Math.round(tripSeconds / 60),
            ...legacy,
          },
        },
        { new: true },
      );
      if (!updated) {
        const latest = await this.rideModel.findById(rideId);
        return { success: true, data: latest, message: 'Ride is already awaiting passenger payment' };
      }
      const pricing = { totalCost: legacy.totalCost };
      Object.assign(ride, updated.toObject());
      this.logger.log(
        JSON.stringify({
          event: 'ride_completed',
          rideId,
          totalPence: fare.totalPence,
          heldPence: ride.hold?.amountPence,
          tripDistanceBasis: basis,
        }),
      );

      if (ride.booking) {
        await this.taxiRequestModel.updateOne(
          { _id: ride.booking },
          { $set: { status: 'awaiting_payment' } },
        );
      }

      const fareSummary = notificationLines(
        'The trip has ended.',
        `Pickup: ${placeLine(ride.pickup?.address) || 'Shared in the app'}`,
        `Drop-off: ${placeLine(ride.dropoff?.address) || 'Shared in the app'}`,
        `Distance: ${metersToMiles(fare.tripMeters).toFixed(1)} mi trip + ${metersToMiles(fare.approachMeters).toFixed(1)} mi driver approach`,
        `Time: ${ride.durationMinutes} min`,
        fare.stopChargePence > 0 ? `Waiting charges: ${gbp(penceToPounds(fare.stopChargePence))}` : undefined,
        fare.minimumFareAdjustmentPence > 0 ? 'Minimum fare applied' : undefined,
        `Fare: ${gbp(pricing.totalCost)}`,
      );

      await this.notificationsService.sendNotification(
        ride.passenger.toString(),
        'Confirm & Pay',
        notificationLines(
          fareSummary,
          'Confirm you are at the destination, then pay in the app.',
        ),
        'payment',
        { rideId: ride._id, action: 'pay' },
      );

      await this.notificationsService.sendNotification(
        ride.driver.toString(),
        'Awaiting Payment',
        notificationLines(
          fareSummary,
          'Waiting for the passenger to confirm and pay.',
        ),
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

      if (ride.paymentMethod === 'wallet' && ['held', 'capturing'].includes(ride.hold?.status)) {
        return this.settleFromWalletHold(ride);
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

      const paidSummary = notificationLines(
        `${gbp(ride.totalCost)} paid for this trip.`,
        `Pickup: ${placeLine(ride.pickup?.address) || 'Shared in the app'}`,
        `Drop-off: ${placeLine(ride.dropoff?.address) || 'Shared in the app'}`,
        ride.distanceMiles
          ? `Distance: ${ride.distanceMiles.toFixed(1)} mi`
          : undefined,
        ride.durationMinutes ? `Time: ${ride.durationMinutes} min` : undefined,
      );

      await this.notificationsService.sendNotification(
        ride.passenger.toString(),
        'Payment Successful',
        notificationLines(paidSummary, 'Your trip receipt is ready in the app.'),
        'payment',
        { rideId: ride._id, action: 'receipt' },
      );

      await this.notificationsService.sendNotification(
        ride.driver.toString(),
        'Payment Received',
        notificationLines(
          paidSummary,
          'The fare has been added to your wallet.',
        ),
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

  /**
   * Capture the held wallet funds at the final fare. The ride must already be claimed
   * (paymentStatus=processing) by the caller, so only one settlement runs at a time.
   */
  private async settleFromWalletHold(ride: RideDocument): Promise<Response> {
    const rideId = ride._id.toString();
    const finalPence = ride.totalCostPence ?? Math.round((ride.totalCost || 0) * 100);

    await this.rideModel.updateOne({ _id: rideId }, { $set: { 'hold.status': 'capturing' } });
    const capture = await this.rideWallet.captureRideHold({
      rideId,
      passengerId: toObjectIdString(ride.passenger),
      heldPence: ride.hold.amountPence,
      finalPence,
    });

    if (!capture.ok) {
      await this.rideModel.updateOne(
        { _id: rideId },
        {
          $set: {
            paymentStatus: 'payment_failed',
            'hold.status': 'held',
            'hold.failureReason': capture.message,
          },
        },
      );
      this.logger.warn(JSON.stringify({ event: 'ride_capture_failed', rideId, reason: capture.message }));
      return { success: false, message: capture.message };
    }

    const settled = await this.rideModel.findOneAndUpdate(
      { _id: rideId },
      {
        $set: {
          status: 'completed',
          paymentStatus: 'charged',
          'hold.status': 'captured',
          'hold.capturedAt': new Date(),
          'hold.capturedAmountPence': finalPence,
          'hold.extraChargedPence': capture.extraChargedPence || 0,
        },
      },
      { new: true },
    );
    if (!settled) return { success: false, message: 'Ride not found' };

    await this.finalizePaidRide(settled);
    this.logger.log(
      JSON.stringify({
        event: 'ride_payment_captured',
        rideId,
        finalPence,
        heldPence: ride.hold.amountPence,
        topUpPence: capture.topUpPence,
      }),
    );

    const heldPence = ride.hold.amountPence;
    const adjustment =
      finalPence < heldPence
        ? `${gbp(penceToPounds(heldPence - finalPence))} of the held amount was returned to your wallet.`
        : finalPence > heldPence
          ? `${gbp(penceToPounds(finalPence - heldPence))} more than the estimate was taken from your wallet.`
          : undefined;

    await this.notificationsService.sendNotification(
      settled.passenger.toString(),
      'Payment Successful',
      notificationLines(
        `${gbp(penceToPounds(finalPence))} paid from your wallet for this trip.`,
        adjustment,
        'Your trip receipt is ready in the app.',
      ),
      'payment',
      { rideId: settled._id, action: 'receipt' },
    );
    await this.notificationsService.sendNotification(
      settled.driver.toString(),
      'Payment Received',
      notificationLines(
        `${gbp(penceToPounds(finalPence))} was paid for this trip.`,
        'The fare has been added to your wallet.',
      ),
      'payment',
      { rideId: settled._id },
    );

    return {
      success: true,
      data: settled,
      message: `Payment successful. ${gbp(penceToPounds(finalPence))} paid from your wallet.`,
    };
  }

  /**
   * Passengers who never confirm arrival would otherwise leave the driver unpaid.
   * Wallet-held rides are settled automatically after a grace period.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async autoSettleWalletRides(): Promise<void> {
    const graceMs = 30 * 60_000;
    const due = await this.rideModel
      .find({
        status: 'awaiting_payment',
        paymentMethod: 'wallet',
        'hold.status': 'held',
        paymentStatus: { $in: ['pending'] },
        completedAt: { $lte: new Date(Date.now() - graceMs) },
      })
      .limit(50)
      .exec();

    for (const candidate of due) {
      const claimed = await this.rideModel.findOneAndUpdate(
        {
          _id: candidate._id,
          status: 'awaiting_payment',
          paymentStatus: 'pending',
          'hold.status': 'held',
        },
        {
          $set: {
            paymentStatus: 'processing',
            paymentProcessingAt: new Date(),
            passengerConfirmedAt: candidate.passengerConfirmedAt || new Date(),
          },
          $inc: { paymentAttempt: 1 },
        },
        { new: true },
      );
      if (!claimed) continue;
      try {
        await this.settleFromWalletHold(claimed);
      } catch (error) {
        this.logger.error(
          `Auto-settle failed for ride ${candidate._id}: ${error instanceof Error ? error.message : error}`,
        );
      }
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
        { fundedByCustomerWallet: ride.paymentMethod === 'wallet' && ride.hold?.status === 'captured' },
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

      const callerId = toObjectIdString(requestingUserId);
      const passengerId = toObjectIdString(ride.passenger);
      const driverId = toObjectIdString(ride.driver);

      if (callerId !== passengerId && callerId !== driverId) {
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
        role: callerId === passengerId ? 'passenger' : 'driver',
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
        paymentMethod: ride.paymentMethod,
        fareBreakdown: ride.fareBreakdown || null,
        totalCostPence: ride.totalCostPence,
        vehicleCategory: ride.vehicleCategory,
        stops: (ride.stops || []).map((s) => ({
          initiatedBy: s.initiatedBy,
          startedAt: s.startedAt,
          endedAt: s.endedAt,
          durationSeconds: s.durationSeconds,
          chargePence: s.chargePence,
        })),
        heldPence: ride.hold?.amountPence,
        paymentNote:
          (ride as any).paymentStatus === 'payment_failed'
            ? 'Payment could not be processed. Please try again from your bookings.'
            : callerId === passengerId
              ? ride.paymentMethod === 'wallet'
                ? 'Paid from your Gleezip wallet (held at pickup, settled at the final fare).'
                : 'Paid via your confirmed payment.'
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

      const callerId = toObjectIdString(requestingUserId);
      const passengerId = toObjectIdString(request.passenger);
      const driverId = toObjectIdString(request.acceptedDriver);

      if (callerId !== passengerId && (!driverId || callerId !== driverId)) {
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

      return this.getRideReceipt(request.ride.toString(), callerId);
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
