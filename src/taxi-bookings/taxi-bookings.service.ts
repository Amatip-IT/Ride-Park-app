import { Injectable, forwardRef, Inject, Logger } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TaxiRideRequest,
  TaxiRideRequestDocument,
} from 'src/schemas/taxi-ride-request.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Ride, RideDocument } from 'src/schemas/ride.schema';
import { Response } from 'src/common/interfaces/response.interface';
import { NotificationsService } from 'src/notifications/notifications.service';
import { TaxiBookingsGateway } from './taxi-bookings.gateway';
import { PaymentsService } from 'src/payments/payments.service';
import { WalletService } from 'src/wallet/wallet.service';
import { toObjectIdString } from 'src/common/request.util';
import {
  notificationLines,
  tripFactLines,
  vehicleLine,
} from 'src/notifications/notification-copy';

import { RidesService } from 'src/rides/rides.service';
import {
  CATEGORY_RANK,
  RidePricingService,
} from 'src/rides/ride-pricing.service';
import {
  calculateFare,
  metersToMiles,
  penceToPounds,
  PricingRules,
  VEHICLE_CATEGORY_LABELS,
  VehicleCategory,
  vehicleCategoryFrom,
} from 'src/pricing/fare';
import { estimatedLeg, isValidLatLng } from 'src/search/routes.service';

function personName(
  person?: { firstName?: string; lastName?: string } | null,
  fallback = 'Your driver',
): string {
  if (!person?.firstName) return fallback;
  return `${person.firstName} ${person.lastName || ''}`.trim();
}

const TAXI_REQUEST_TRANSITIONS: Record<string, readonly string[]> = {
  accepted: ['arrived'],
  arrived: ['in_progress'],
  in_progress: ['awaiting_payment'],
};

@Injectable()
export class TaxiBookingsService {
  private readonly logger = new Logger(TaxiBookingsService.name);

  constructor(
    @InjectModel(TaxiRideRequest.name)
    private taxiRequestModel: Model<TaxiRideRequestDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(Chauffeur.name)
    private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => TaxiBookingsGateway))
    private readonly taxiGateway: TaxiBookingsGateway,
    private readonly ridesService: RidesService,
    private readonly ridePricing: RidePricingService,
  ) {}

  /** Category a driver's vehicle belongs to (from their registered taxi type). */
  private async driverCategoryFor(userId: string): Promise<VehicleCategory> {
    const user = await this.userModel.findById(userId).select('taxiType').lean().exec();
    return vehicleCategoryFrom((user as any)?.taxiType);
  }

  /** Short human reference shown to drivers and passengers, e.g. "GZ-4F2A9C". */
  private rideReference(requestId: string): string {
    return `GZ-${requestId.slice(-6).toUpperCase()}`;
  }

  /**
   * Passenger creates a ride request (broadcast to nearby drivers)
   */
  async createRideRequest(data: {
    passengerId: string;
    pickupAddress?: string;
    pickupPostcode?: string;
    pickupLat?: number;
    pickupLng?: number;
    pickupFromGps?: boolean;
    destinationAddress: string;
    destinationPostcode?: string;
    destinationLat?: number;
    destinationLng?: number;
    timingType: 'now' | 'leave_at' | 'arrive_by';
    scheduledTime?: string;
    passengerNote?: string;
    targetDriverId?: string;
    estimatedDistanceMiles?: number;
    estimatedDurationMinutes?: number;
    estimatedCost?: number;
    taxiType?: string;
    vehicleCategory?: string;
  }): Promise<Response> {
    try {
      const vehicleCategory = vehicleCategoryFrom(data.vehicleCategory || data.taxiType);
      // 1. Verify passenger has a payment method BEFORE allowing them to request a ride
      try {
        const paymentMethods = await this.paymentsService.getPaymentMethods(
          data.passengerId,
        );
        if (!paymentMethods || paymentMethods.length === 0) {
          return {
            success: false,
            message: 'Please add a payment method before requesting a ride.',
          };
        }
      } catch (err: any) {
        return {
          success: false,
          message: 'Could not verify payment method. Please check your wallet.',
        };
      }

      // Check for existing active request
      const existingActive = await this.taxiRequestModel.findOne({
        passenger: data.passengerId,
        status: {
          $in: [
            'searching',
            'accepted',
            'arrived',
            'in_progress',
            'awaiting_payment',
          ],
        },
      });

      if (existingActive) {
        return {
          success: false,
          message: 'You already have an active ride request. Cancel it first.',
        };
      }

      let targetDriverUserId: string | undefined;
      let targetDriverNumber: string | undefined;
      let targetDriverName: string | undefined;

      if (data.targetDriverId) {
        const taxiRecord = await this.taxiModel
          .findById(data.targetDriverId)
          .populate('user', 'firstName lastName');
        if (!taxiRecord) {
          return {
            success: false,
            message: 'The selected taxi driver could not be found.',
          };
        }

        const userRef = taxiRecord.user as any;
        targetDriverUserId = toObjectIdString(userRef);
        targetDriverNumber = taxiRecord.driverNumber;

        if (userRef?.firstName) {
          targetDriverName =
            `${userRef.firstName} ${userRef.lastName || ''}`.trim();
        }

        if (taxiRecord.status !== 'approved') {
          return {
            success: false,
            message:
              'This driver is not verified yet and cannot receive bookings.',
          };
        }

        if (taxiRecord.availability !== 'online') {
          const statusLabel =
            taxiRecord.availability === 'busy'
              ? 'busy on another trip'
              : 'offline';
          return {
            success: false,
            message: `This driver is not available at the moment (${statusLabel}). Try "Near me" to find an available taxi nearby.`,
          };
        }

        const targetCategory = await this.driverCategoryFor(targetDriverUserId!);
        if (CATEGORY_RANK[targetCategory] < CATEGORY_RANK[vehicleCategory]) {
          return {
            success: false,
            message: `This driver's vehicle is smaller than a ${VEHICLE_CATEGORY_LABELS[vehicleCategory]}. Choose a different vehicle type or driver.`,
          };
        }
      }

      // Server-side quote: the client's estimate is never trusted for pricing
      const pickup = { lat: Number(data.pickupLat), lng: Number(data.pickupLng) };
      const destination = { lat: Number(data.destinationLat), lng: Number(data.destinationLng) };
      const rules: PricingRules = await this.ridePricing.getRules();
      let quoteFields: Record<string, unknown> = { pricingSnapshot: rules, vehicleCategory };
      let estimatedCost: number | undefined;

      if (isValidLatLng(pickup) && isValidLatLng(destination)) {
        const quote = await this.ridePricing.quote({
          pickup,
          destination,
          targetTaxiId: data.targetDriverId,
          rules,
        });
        const fare = quote.fares[vehicleCategory];
        const approach = quote.approach[vehicleCategory];
        estimatedCost = penceToPounds(fare.totalPence);
        quoteFields = {
          ...quoteFields,
          estimatedTripMeters: quote.trip.distanceMeters,
          estimatedTripSeconds: quote.trip.durationSeconds,
          approachMeters: approach.distanceMeters,
          approachSeconds: approach.durationSeconds,
          approachSource: approach.source,
          quoteBreakdown: fare,
          estimatedCostPence: fare.totalPence,
          estimatedDistanceMiles: metersToMiles(quote.trip.distanceMeters),
          estimatedDurationMinutes: Math.max(1, Math.round(quote.trip.durationSeconds / 60)),
        };
      } else if (data.estimatedDistanceMiles) {
        // No coordinates (postcode-only booking): price the passenger's stated distance
        const fare = calculateFare(
          {
            serviceType: 'taxi',
            vehicleCategory,
            approachMeters: 0,
            tripMeters: data.estimatedDistanceMiles * 1609.344,
            tripMinutes: data.estimatedDurationMinutes || 0,
          },
          rules,
        );
        estimatedCost = penceToPounds(fare.totalPence);
        quoteFields = {
          ...quoteFields,
          approachSource: 'none',
          quoteBreakdown: fare,
          estimatedCostPence: fare.totalPence,
          estimatedDistanceMiles: data.estimatedDistanceMiles,
          estimatedDurationMinutes: data.estimatedDurationMinutes,
        };
      }

      const request = new this.taxiRequestModel({
        passenger: data.passengerId,
        pickupAddress: data.pickupAddress,
        pickupPostcode: data.pickupPostcode?.toUpperCase(),
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        pickupFromGps: data.pickupFromGps || false,
        destinationAddress: data.destinationAddress,
        destinationPostcode: data.destinationPostcode?.toUpperCase(),
        destinationLat: data.destinationLat,
        destinationLng: data.destinationLng,
        timingType: data.timingType,
        scheduledTime:
          data.timingType !== 'now' && data.scheduledTime
            ? new Date(data.scheduledTime)
            : undefined,
        passengerNote: data.passengerNote,
        targetDriver: targetDriverUserId || undefined,
        estimatedDistanceMiles: data.estimatedDistanceMiles,
        estimatedDurationMinutes: data.estimatedDurationMinutes,
        ...quoteFields,
        estimatedCost,
        status: 'searching',
      });

      await request.save();

      const populated = await this.taxiRequestModel
        .findById(request._id)
        .populate('passenger', 'firstName lastName phoneNumber')
        .exec();

      const passengerName = (populated?.passenger as any)?.firstName
        ? `${(populated?.passenger as any).firstName} ${(populated?.passenger as any).lastName || ''}`.trim()
        : 'A passenger';

      if (targetDriverUserId) {
        // Direct booking — notify only the requested driver
        await this.notificationsService.sendNotification(
          targetDriverUserId,
          '🚖 Direct Ride Request',
          notificationLines(
            `${passengerName} asked for you specifically${targetDriverNumber ? ` (Taxi #${targetDriverNumber})` : ''}.`,
            ...tripFactLines(request),
            'Open Ride Requests to accept or decline.',
          ),
          'ride',
          { rideRequestId: request._id.toString(), targeted: true },
        );
        this.taxiGateway.pushNewRequestToDriver(targetDriverUserId, populated);

        return {
          success: true,
          data: populated,
          message: targetDriverName
            ? `Your request was sent directly to ${targetDriverName}.`
            : 'Your request was sent directly to your selected driver.',
        };
      }

      // Broadcast — notify online, approved taxi drivers whose vehicle is big enough
      const onlineDriverRecords = await this.taxiModel
        .find({ status: 'approved', availability: 'online' })
        .select('user')
        .populate('user', 'taxiType')
        .exec();
      const onlineDrivers = onlineDriverRecords
        .filter(
          (driver) =>
            CATEGORY_RANK[vehicleCategoryFrom((driver.user as any)?.taxiType)] >=
            CATEGORY_RANK[vehicleCategory],
        )
        .map((driver) => ({
          user: toObjectIdString((driver.user as any)?._id || driver.user),
        }));

      await Promise.all(
        onlineDrivers.map((driver) =>
          this.notificationsService.sendNotification(
            driver.user.toString(),
            '🚖 New Ride Request Nearby',
            notificationLines(
              `${passengerName} needs a taxi nearby.`,
              ...tripFactLines(request),
              'Open Ride Requests to accept.',
            ),
            'ride',
            { rideRequestId: request._id.toString(), targeted: false },
          ),
        ),
      );

      onlineDrivers.forEach((driver) => {
        this.taxiGateway.pushNewRequestToDriver(
          driver.user.toString(),
          populated,
        );
      });

      return {
        success: true,
        data: populated,
        message: 'Ride request created! Notifying nearby available drivers...',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create request: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get available ride requests for drivers.
   * Broadcast requests are visible to all online taxi drivers.
   * Targeted requests are visible only to the requested driver.
   */
  async getAvailableRequests(
    driverId: string,
    postcodeFilter?: string,
  ): Promise<Response> {
    try {
      const normalizedDriverId = toObjectIdString(driverId);

      // Check if driver's documents are approved before showing requests
      const taxiRecord = await this.taxiModel.findOne({
        user: normalizedDriverId,
      });
      const chauffeurRecord = await this.chauffeurModel.findOne({
        user: normalizedDriverId,
      });
      const driverRecord = taxiRecord || chauffeurRecord;

      if (!driverRecord) {
        return {
          success: false,
          message:
            'Driver record not found. Please complete your registration.',
        };
      }

      if (driverRecord.status !== 'approved') {
        let statusMessage = 'Your documents have not been approved yet. ';
        if (driverRecord.status === 'not_applied') {
          statusMessage +=
            'Please submit your driver verification documents to go online.';
        } else if (
          driverRecord.status === 'pending_auto_check' ||
          driverRecord.status === 'pending_admin_review'
        ) {
          statusMessage +=
            'Your documents are currently under review. You will be notified once approved.';
        } else if (driverRecord.status === 'rejected') {
          statusMessage +=
            'Your documents were rejected. Please resubmit valid documents.';
        }
        return { success: false, message: statusMessage };
      }

      const filter: any = {
        status: 'searching',
        $or: [
          { targetDriver: { $exists: false } },
          { targetDriver: null },
          { targetDriver: normalizedDriverId },
        ],
      };

      // Non-taxi providers only see requests explicitly targeted at them
      if (!taxiRecord) {
        filter.$or = [{ targetDriver: normalizedDriverId }];
      }

      // If postcode filter provided, match the first part (outward code)
      if (postcodeFilter) {
        const outwardCode = postcodeFilter
          .split(' ')[0]
          .toUpperCase()
          .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.pickupPostcode = { $regex: new RegExp(`^${outwardCode}`, 'i') };
      }

      // Drivers only see requests their vehicle can serve (a larger vehicle may take a smaller job)
      const driverCategory = await this.driverCategoryFor(normalizedDriverId);
      const servable = (['small', 'medium', 'large'] as VehicleCategory[]).filter(
        (c) => CATEGORY_RANK[c] <= CATEGORY_RANK[driverCategory],
      );
      filter.$and = [
        {
          $or: [
            { vehicleCategory: { $in: servable } },
            { vehicleCategory: { $exists: false } },
          ],
        },
      ];

      const requests = await this.taxiRequestModel
        .find(filter)
        .populate('passenger', 'firstName lastName phoneNumber')
        .sort({ createdAt: -1 })
        .limit(50)
        .exec();

      // Straight-line approach preview for the list; the app fetches the road route on open
      const driverPosition = this.ridePricing.driverPosition(driverRecord);
      const data = requests.map((r) => {
        const item: any = r.toObject();
        const pickup = { lat: Number(r.pickupLat), lng: Number(r.pickupLng) };
        if (driverPosition && isValidLatLng(pickup)) {
          const preview = estimatedLeg(driverPosition, pickup);
          item.approachPreviewMeters = preview.distanceMeters;
          item.approachPreviewSeconds = preview.durationSeconds;
        }
        item.rideReference = this.rideReference(r._id.toString());
        return item;
      });

      return {
        success: true,
        data,
        message: `${requests.length} ride request(s) available`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch requests: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get the active ride request for a specific driver (e.g. accepted but not finished)
   */
  async getDriverActiveRequests(driverId: string): Promise<Response> {
    try {
      const requests = await this.taxiRequestModel
        .find({
          acceptedDriver: driverId,
          status: { $in: ['accepted', 'arrived', 'in_progress'] },
        })
        .populate('passenger', 'firstName lastName phoneNumber')
        .sort({ createdAt: -1 })
        .exec();

      return {
        success: true,
        data: requests,
        message: 'Driver active requests fetched',
      };
    } catch (error) {
      return {
        success: false,
        message: 'Failed to fetch driver active requests',
      };
    }
  }

  /**
   * Driver accepts a ride request
   */
  async acceptRideRequest(
    requestId: string,
    driverId: string,
    data: {
      vehicleMake?: string;
      vehicleModel?: string;
      vehicleColor?: string;
      plateNumber?: string;
      etaMinutes: number;
    },
  ): Promise<Response> {
    try {
      const normalizedDriverId = toObjectIdString(driverId);

      // Check if driver's documents are approved
      const taxiRecord = await this.taxiModel.findOne({
        user: normalizedDriverId,
      });
      const chauffeurRecord = await this.chauffeurModel.findOne({
        user: normalizedDriverId,
      });
      const verificationRecord = taxiRecord || chauffeurRecord;

      if (!verificationRecord || verificationRecord.status !== 'approved') {
        return {
          success: false,
          message:
            'You cannot accept rides until your driver documents have been approved.',
        };
      }

      // Look up the driver's number and vehicle details
      const driverRecord: any = taxiRecord || chauffeurRecord;

      const existingRequest = await this.taxiRequestModel.findById(requestId);
      if (!existingRequest) {
        return { success: false, message: 'Ride request not found' };
      }

      if (
        existingRequest.targetDriver &&
        toObjectIdString(existingRequest.targetDriver) !== normalizedDriverId
      ) {
        return {
          success: false,
          message:
            'This ride was requested for another driver and cannot be accepted by you.',
        };
      }

      if (existingRequest.status !== 'searching') {
        return {
          success: false,
          message:
            existingRequest.status === 'accepted'
              ? 'This ride has already been accepted by another driver'
              : `This ride request is ${existingRequest.status}`,
        };
      }

      const driverCategory = await this.driverCategoryFor(normalizedDriverId);
      if (
        CATEGORY_RANK[driverCategory] <
        CATEGORY_RANK[vehicleCategoryFrom(existingRequest.vehicleCategory)]
      ) {
        return {
          success: false,
          message: 'Your vehicle is smaller than the vehicle type the passenger booked.',
        };
      }

      // Billable approach starts where the driver is when they accept
      const pickup = {
        lat: Number(existingRequest.pickupLat),
        lng: Number(existingRequest.pickupLng),
      };
      const driverPosition = this.ridePricing.driverPosition(driverRecord);
      const pricingFields: Record<string, unknown> = {};
      let etaMinutes = data.etaMinutes;

      if (driverPosition && isValidLatLng(pickup)) {
        const approach = await this.ridePricing.leg(driverPosition, pickup);
        const rules =
          (existingRequest.pricingSnapshot as PricingRules) || (await this.ridePricing.getRules());
        const tripMeters =
          existingRequest.estimatedTripMeters ??
          (existingRequest.estimatedDistanceMiles || 0) * 1609.344;
        const tripSeconds =
          existingRequest.estimatedTripSeconds ??
          (existingRequest.estimatedDurationMinutes || 0) * 60;
        const fare = calculateFare(
          {
            serviceType: 'taxi',
            vehicleCategory: vehicleCategoryFrom(existingRequest.vehicleCategory),
            approachMeters: approach.distanceMeters,
            tripMeters,
            tripMinutes: tripSeconds / 60,
          },
          rules,
        );
        etaMinutes = Math.max(1, Math.round(approach.durationSeconds / 60));
        Object.assign(pricingFields, {
          approachMeters: approach.distanceMeters,
          approachSeconds: approach.durationSeconds,
          approachSource: 'accepted_driver',
          driverStartLocation: { ...driverPosition, capturedAt: new Date() },
          pricingSnapshot: rules,
          quoteBreakdown: fare,
          estimatedCostPence: fare.totalPence,
          estimatedCost: penceToPounds(fare.totalPence),
        });
      } else {
        this.logger.warn(
          JSON.stringify({ event: 'accept_without_gps', requestId, driverId: normalizedDriverId }),
        );
      }

      // Atomic status update to prevent two drivers accepting the same ride
      const request = await this.taxiRequestModel.findOneAndUpdate(
        { _id: requestId, status: 'searching' },
        {
          ...pricingFields,
          status: 'accepted',
          acceptedDriver: normalizedDriverId,
          driverVehicle: {
            make: driverRecord?.vehicleInfo?.make || 'Standard',
            model: driverRecord?.vehicleInfo?.model || 'Vehicle',
            color: driverRecord?.vehicleInfo?.color || 'Black',
            plateNumber:
              driverRecord?.vehicleInfo?.plateNumber ||
              driverRecord?.vehicleInfo?.registration ||
              'N/A',
          },
          driverEtaMinutes: etaMinutes,
          driverNumber: driverRecord?.driverNumber || undefined,
          acceptedAt: new Date(),
        },
        { new: true },
      );

      if (!request) {
        const existing = await this.taxiRequestModel.findById(requestId);
        if (!existing) {
          return { success: false, message: 'Ride request not found' };
        }
        return {
          success: false,
          message:
            existing.status === 'accepted'
              ? 'This ride has already been accepted by another driver'
              : `This ride request is ${existing.status}`,
        };
      }

      // Set driver to busy
      if (driverRecord) {
        driverRecord.availability = 'busy';
        await driverRecord.save();
      }

      const populated = await this.taxiRequestModel
        .findById(request._id)
        .populate('passenger', 'firstName lastName phoneNumber')
        .populate('acceptedDriver', 'firstName lastName phoneNumber')
        .exec();

      // Trigger real-time socket updates for passenger
      this.taxiGateway.pushRequestUpdate(request._id.toString(), populated);

      const driverUser = populated?.acceptedDriver as
        | { firstName?: string; lastName?: string }
        | undefined;
      const driverName = driverUser?.firstName
        ? `${driverUser.firstName} ${driverUser.lastName || ''}`.trim()
        : 'Your driver';
      const acceptedVehicle = {
        color: driverRecord?.vehicleInfo?.color,
        make: driverRecord?.vehicleInfo?.make || 'Standard',
        model: driverRecord?.vehicleInfo?.model || 'Vehicle',
        plateNumber:
          driverRecord?.vehicleInfo?.plateNumber ||
          driverRecord?.vehicleInfo?.registration ||
          'N/A',
      };

      await this.notificationsService.sendNotification(
        request.passenger.toString(),
        'Ride Accepted!',
        notificationLines(
          `${driverName} accepted your ride and is on the way.`,
          vehicleLine(acceptedVehicle),
          driverRecord?.driverNumber
            ? `Taxi number: ${driverRecord.driverNumber}`
            : undefined,
          `ETA: ${etaMinutes} min`,
          request.estimatedCostPence != null
            ? `Updated fare estimate: £${penceToPounds(request.estimatedCostPence).toFixed(2)} (includes the driver's ${metersToMiles(request.approachMeters || 0).toFixed(1)} mi to you)`
            : undefined,
          ...tripFactLines(request, { includeEstimate: false }),
        ),
        'ride',
        { rideId: request._id },
      );

      return {
        success: true,
        data: populated,
        message: 'Ride accepted! The passenger has been notified.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to accept: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Cancel a ride request (by passenger)
   */
  async cancelRideRequest(
    requestId: string,
    passengerId: string,
  ): Promise<Response> {
    try {
      const existing = await this.taxiRequestModel.findById(requestId);

      if (!existing) {
        return { success: false, message: 'Ride request not found' };
      }

      if (
        toObjectIdString(existing.passenger) !== toObjectIdString(passengerId)
      ) {
        return {
          success: false,
          message: 'You can only cancel your own requests',
        };
      }

      if (existing.status === 'cancelled') {
        return { success: true, data: existing, message: 'Ride request already cancelled' };
      }

      if (!['searching', 'accepted', 'arrived'].includes(existing.status)) {
        return {
          success: false,
          message:
            existing.status === 'in_progress'
              ? 'Your trip has already started — contact support if you need help.'
              : `Cannot cancel a ${existing.status} ride`,
        };
      }

      // Single conditional transition: concurrent cancels / driver status updates can't both win
      const cancelled = await this.taxiRequestModel.findOneAndUpdate(
        { _id: requestId, status: { $in: ['searching', 'accepted', 'arrived'] } },
        {
          $set: {
            status: 'cancelled',
            cancelledAt: new Date(),
            cancelledBy: 'passenger',
          },
        },
        { new: true },
      );

      if (!cancelled) {
        const latest = await this.taxiRequestModel.findById(requestId);
        if (latest?.status === 'cancelled') {
          return { success: true, data: latest, message: 'Ride request already cancelled' };
        }
        return {
          success: false,
          message:
            latest?.status === 'in_progress'
              ? 'Your trip has already started — contact support if you need help.'
              : `Cannot cancel a ${latest?.status || 'missing'} ride`,
        };
      }

      // Cancel the linked ride (it may exist before the request is linked, mid-start) and return held funds
      const linkedRide =
        (cancelled.ride && (await this.rideModel.findById(cancelled.ride).select('_id').lean().exec())) ||
        (await this.rideModel.findOne({ booking: cancelled._id }).select('_id').lean().exec());
      if (linkedRide) {
        await this.rideModel.updateOne(
          { _id: linkedRide._id, status: { $in: ['pending', 'in_progress'] } },
          { $set: { status: 'cancelled' } },
        );
        await this.ridesService.releaseHoldForRide(
          linkedRide._id.toString(),
          'ride cancelled by passenger',
        );
      }

      this.taxiGateway.pushRequestUpdate(cancelled._id.toString(), cancelled);

      // If a driver had accepted, free them up and tell them immediately
      if (cancelled.acceptedDriver) {
        const driverId = cancelled.acceptedDriver.toString();
        await this.taxiModel.updateOne(
          { user: cancelled.acceptedDriver },
          { $set: { availability: 'online' } },
        );
        await this.chauffeurModel.updateOne(
          { user: cancelled.acceptedDriver },
          { $set: { availability: 'online' } },
        );

        this.taxiGateway.pushRideCancelledToDriver(driverId, {
          requestId: cancelled._id.toString(),
          rideReference: this.rideReference(cancelled._id.toString()),
          title: 'Ride Cancelled',
          message: 'The customer has cancelled this booking.',
          cancelledAt: cancelled.cancelledAt,
        });

        await this.notificationsService.sendNotification(
          driverId,
          'Ride Cancelled',
          notificationLines(
            `The customer has cancelled this booking (${this.rideReference(cancelled._id.toString())}).`,
            ...tripFactLines(cancelled, { includeEstimate: false }),
            'You are available for new requests again.',
          ),
          'ride',
          { rideId: cancelled._id, requestId: cancelled._id.toString(), status: 'cancelled' },
        );
      }

      this.logger.log(
        JSON.stringify({ event: 'ride_cancelled', requestId, by: 'passenger', hadDriver: !!cancelled.acceptedDriver }),
      );
      const request = cancelled;

      await this.notificationsService.sendNotification(
        request.passenger.toString(),
        'Ride Cancelled',
        notificationLines(
          'Your ride request has been cancelled.',
          ...tripFactLines(request, { includeEstimate: false }),
          'You can request another taxi whenever you are ready.',
        ),
        'ride',
        { rideId: request._id, status: 'cancelled' },
      );

      return {
        success: true,
        data: request,
        message: 'Ride request cancelled',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to cancel: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Start or end a stop on the trip linked to this request, then push the change
   * to both apps through the ride room.
   */
  async changeStop(
    requestId: string,
    userId: string,
    action: 'start' | 'end',
  ): Promise<Response> {
    const request = await this.taxiRequestModel.findById(requestId).select('ride status').lean().exec();
    if (!request?.ride) {
      return { success: false, message: 'Stops are available once the ride has started' };
    }
    const rideId = request.ride.toString();
    const result =
      action === 'start'
        ? await this.ridesService.startStop(rideId, userId)
        : await this.ridesService.endStop(rideId, userId);

    if (result.success) {
      const populated = await this.getRideRequest(requestId);
      if (populated.success) this.taxiGateway.pushRequestUpdate(requestId, populated.data);
    }
    return result;
  }

  /** Cancelled rides the driver hasn't acknowledged yet (replayed when they reconnect). */
  async getUnacknowledgedCancellations(driverId: string) {
    const since = new Date(Date.now() - 24 * 60 * 60_000);
    const requests = await this.taxiRequestModel
      .find({
        acceptedDriver: driverId,
        status: 'cancelled',
        cancelledBy: 'passenger',
        cancelledAt: { $gte: since },
        driverCancelAcknowledgedAt: null,
      })
      .select('_id cancelledAt')
      .lean()
      .exec();
    return requests.map((r) => ({
      requestId: r._id.toString(),
      rideReference: this.rideReference(r._id.toString()),
      title: 'Ride Cancelled',
      message: 'The customer has cancelled this booking.',
      cancelledAt: r.cancelledAt,
    }));
  }

  async acknowledgeCancellation(requestId: string, driverId: string): Promise<Response> {
    await this.taxiRequestModel.updateOne(
      { _id: requestId, acceptedDriver: driverId, status: 'cancelled' },
      { $set: { driverCancelAcknowledgedAt: new Date() } },
    );
    return { success: true, message: 'Cancellation acknowledged' };
  }

  /**
   * Get ride request details
   */
  async getRideRequest(requestId: string): Promise<Response> {
    try {
      const request = await this.taxiRequestModel
        .findById(requestId)
        .populate('passenger', 'firstName lastName phoneNumber')
        .populate('acceptedDriver', 'firstName lastName phoneNumber')
        .populate('ride')
        .exec();

      if (!request) {
        return { success: false, message: 'Ride request not found' };
      }

      return { success: true, data: request, message: 'Ride request details' };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get passenger's ride requests (history + active)
   */
  async getMyRideRequests(passengerId: string): Promise<Response> {
    try {
      const requests = await this.taxiRequestModel
        .find({ passenger: passengerId })
        .populate('acceptedDriver', 'firstName lastName phoneNumber')
        .populate('ride')
        .sort({ createdAt: -1 })
        .limit(50)
        .exec();

      return {
        success: true,
        data: requests,
        message: `Found ${requests.length} ride request(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Admin: get all active ride requests (for dashboard notification)
   */
  async getAllActiveRequests(): Promise<Response> {
    try {
      const requests = await this.taxiRequestModel
        .find({ status: { $in: ['searching', 'accepted', 'in_progress'] } })
        .populate('passenger', 'firstName lastName phoneNumber')
        .populate('acceptedDriver', 'firstName lastName phoneNumber')
        .sort({ createdAt: -1 })
        .exec();

      return {
        success: true,
        data: requests,
        message: `${requests.length} active ride request(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Update request status and push live websocket event to the passenger
   */
  async updateRequestStatus(
    requestId: string,
    status: string,
    rideId?: string,
  ): Promise<Response> {
    try {
      const request = await this.taxiRequestModel.findById(requestId);
      if (!request) {
        return { success: false, message: 'Ride request not found' };
      }

      // Completion is set by RidesService.payRide after passenger pays
      if (status === 'completed') {
        if (request.status === 'completed') {
          const alreadyCompleted = await this.taxiRequestModel
            .findById(requestId)
            .populate('passenger', 'firstName lastName phoneNumber')
            .populate('acceptedDriver', 'firstName lastName phoneNumber')
            .populate('ride')
            .exec();

          return {
            success: true,
            data: alreadyCompleted,
            message: 'Ride request is already completed',
          };
        }

        return {
          success: false,
          message:
            'Ride is marked completed only after the passenger confirms payment',
        };
      }

      if (!request.acceptedDriver) {
        return {
          success: false,
          message: 'Cannot update ride: no driver assigned',
        };
      }

      if (request.status === status) {
        return {
          success: true,
          data: request,
          message: `Request is already ${status}`,
        };
      }

      const allowedNextStatuses =
        TAXI_REQUEST_TRANSITIONS[request.status] || [];
      if (!allowedNextStatuses.includes(status)) {
        return {
          success: false,
          message: `Invalid ride transition from ${request.status} to ${status}`,
        };
      }

      const update: Record<string, unknown> = { status };
      if (rideId) {
        update.ride = rideId;
      }

      const transitioned = await this.taxiRequestModel.findOneAndUpdate(
        { _id: requestId, status: request.status },
        { $set: update },
        { new: true },
      );

      if (!transitioned) {
        return {
          success: false,
          message:
            'Ride status changed in another request. Refresh and try again.',
        };
      }

      const populated = await this.taxiRequestModel
        .findById(requestId)
        .populate('passenger', 'firstName lastName phoneNumber')
        .populate('acceptedDriver', 'firstName lastName phoneNumber')
        .exec();

      this.taxiGateway.pushRequestUpdate(requestId, populated);

      if (status === 'awaiting_payment') {
        return {
          success: true,
          data: populated,
          message: 'Waiting for passenger to confirm location and pay',
        };
      }

      if (status === 'arrived') {
        await this.notificationsService.sendNotification(
          request.passenger.toString(),
          'Driver Arrived',
          notificationLines(
            `${personName(populated?.acceptedDriver as { firstName?: string; lastName?: string } | undefined)} is waiting at the pickup.`,
            vehicleLine(request.driverVehicle),
            request.driverNumber
              ? `Taxi number: ${request.driverNumber}`
              : undefined,
            ...tripFactLines(request, {
              includeTiming: false,
              includeEstimate: false,
            }),
          ),
          'ride',
          { rideId: request._id },
        );
      } else if (status === 'in_progress') {
        await this.notificationsService.sendNotification(
          request.passenger.toString(),
          'Ride Started',
          notificationLines(
            `${personName(populated?.acceptedDriver as { firstName?: string; lastName?: string } | undefined)} has started the trip.`,
            vehicleLine(request.driverVehicle),
            ...tripFactLines(request, {
              includeTiming: false,
              includeEstimate: false,
            }),
            'Have a safe journey.',
          ),
          'ride',
          { rideId: request._id },
        );
      }

      return {
        success: true,
        data: populated,
        message: `Request status updated to ${status}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to update status: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
