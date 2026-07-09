import { Injectable, forwardRef, Inject } from '@nestjs/common';
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

// Pricing constants
const RATE_PER_MILE = 1.10;
const RATE_PER_MINUTE = 0.20;

@Injectable()
export class TaxiBookingsService {
  constructor(
    @InjectModel(TaxiRideRequest.name)
    private taxiRequestModel: Model<TaxiRideRequestDocument>,
    @InjectModel(Taxi.name) private taxiModel: Model<TaxiDocument>,
    @InjectModel(Chauffeur.name) private chauffeurModel: Model<ChauffeurDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Ride.name) private rideModel: Model<RideDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly paymentsService: PaymentsService,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => TaxiBookingsGateway))
    private readonly taxiGateway: TaxiBookingsGateway,
  ) {}

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
  }): Promise<Response> {
    try {
      // 1. Verify passenger has a payment method BEFORE allowing them to request a ride
      try {
        const paymentMethods = await this.paymentsService.getPaymentMethods(data.passengerId);
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
        status: { $in: ['searching', 'accepted', 'in_progress'] },
      });

      if (existingActive) {
        return {
          success: false,
          message: 'You already have an active ride request. Cancel it first.',
        };
      }

      // Calculate estimated cost if distance is provided
      let estimatedCost: number | undefined = data.estimatedCost;
      if (estimatedCost == null && data.estimatedDistanceMiles) {
        const distanceCost = data.estimatedDistanceMiles * RATE_PER_MILE;
        const timeCost = (data.estimatedDurationMinutes || 0) * RATE_PER_MINUTE;
        estimatedCost = Math.round((distanceCost + timeCost) * 100) / 100;
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
          targetDriverName = `${userRef.firstName} ${userRef.lastName || ''}`.trim();
        }

        if (taxiRecord.status !== 'approved') {
          return {
            success: false,
            message: 'This driver is not verified yet and cannot receive bookings.',
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
          `${passengerName} requested you specifically${targetDriverNumber ? ` (Taxi #${targetDriverNumber})` : ''}. Open Ride Requests to accept.`,
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

      // Broadcast — notify all online, approved taxi drivers
      const onlineDrivers = await this.taxiModel
        .find({ status: 'approved', availability: 'online' })
        .select('user')
        .exec();

      await Promise.all(
        onlineDrivers.map((driver) =>
          this.notificationsService.sendNotification(
            driver.user.toString(),
            '🚖 New Ride Request Nearby',
            `${passengerName} is looking for a taxi nearby. Open Ride Requests to accept.`,
            'ride',
            { rideRequestId: request._id.toString(), targeted: false },
          ),
        ),
      );

      onlineDrivers.forEach((driver) => {
        this.taxiGateway.pushNewRequestToDriver(driver.user.toString(), populated);
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
      const taxiRecord = await this.taxiModel.findOne({ user: normalizedDriverId });
      const chauffeurRecord = await this.chauffeurModel.findOne({ user: normalizedDriverId });
      const driverRecord = taxiRecord || chauffeurRecord;

      if (!driverRecord) {
        return { success: false, message: 'Driver record not found. Please complete your registration.' };
      }

      if (driverRecord.status !== 'approved') {
        let statusMessage = 'Your documents have not been approved yet. ';
        if (driverRecord.status === 'not_applied') {
          statusMessage += 'Please submit your driver verification documents to go online.';
        } else if (driverRecord.status === 'pending_auto_check' || driverRecord.status === 'pending_admin_review') {
          statusMessage += 'Your documents are currently under review. You will be notified once approved.';
        } else if (driverRecord.status === 'rejected') {
          statusMessage += 'Your documents were rejected. Please resubmit valid documents.';
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
        const outwardCode = postcodeFilter.split(' ')[0].toUpperCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        filter.pickupPostcode = { $regex: new RegExp(`^${outwardCode}`, 'i') };
      }

      const requests = await this.taxiRequestModel
        .find(filter)
        .populate('passenger', 'firstName lastName phoneNumber')
        .sort({ createdAt: -1 })
        .limit(50)
        .exec();

      return {
        success: true,
        data: requests,
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
      const taxiRecord = await this.taxiModel.findOne({ user: normalizedDriverId });
      const chauffeurRecord = await this.chauffeurModel.findOne({ user: normalizedDriverId });
      const verificationRecord = taxiRecord || chauffeurRecord;

      if (!verificationRecord || verificationRecord.status !== 'approved') {
        return {
          success: false,
          message: 'You cannot accept rides until your driver documents have been approved.',
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
          message: 'This ride was requested for another driver and cannot be accepted by you.',
        };
      }

      // Atomic status update to prevent two drivers accepting the same ride
      const request = await this.taxiRequestModel.findOneAndUpdate(
        { _id: requestId, status: 'searching' },
        {
          status: 'accepted',
          acceptedDriver: normalizedDriverId,
          driverVehicle: {
            make: driverRecord?.vehicleInfo?.make || 'Standard',
            model: driverRecord?.vehicleInfo?.model || 'Vehicle',
            color: driverRecord?.vehicleInfo?.color || 'Black',
            plateNumber: driverRecord?.vehicleInfo?.plateNumber || driverRecord?.vehicleInfo?.registration || 'N/A',
          },
          driverEtaMinutes: data.etaMinutes,
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
          message: existing.status === 'accepted'
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

      // Notify passenger
      await this.notificationsService.sendNotification(
        request.passenger.toString(),
        'Ride Accepted!',
        `A driver is on their way. ETA: ${data.etaMinutes} mins. Vehicle: ${driverRecord?.vehicleInfo?.make || 'Standard'} ${driverRecord?.vehicleInfo?.model || 'Vehicle'} (${driverRecord?.vehicleInfo?.plateNumber || driverRecord?.vehicleInfo?.registration || 'N/A'})`,
        'ride',
        { rideId: request._id }
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
  async cancelRideRequest(requestId: string, passengerId: string): Promise<Response> {
    try {
      const request = await this.taxiRequestModel.findById(requestId);

      if (!request) {
        return { success: false, message: 'Ride request not found' };
      }

      if (toObjectIdString(request.passenger) !== toObjectIdString(passengerId)) {
        return { success: false, message: 'You can only cancel your own requests' };
      }

      if (!['searching', 'accepted', 'arrived'].includes(request.status)) {
        return {
          success: false,
          message:
            request.status === 'in_progress'
              ? 'Your trip has already started — contact support if you need help.'
              : `Cannot cancel a ${request.status} ride`,
        };
      }

      // Cancel linked ride record if the trip had not finished
      if (request.ride) {
        await this.rideModel.updateOne(
          { _id: request.ride, status: { $in: ['pending', 'in_progress'] } },
          { $set: { status: 'cancelled' } },
        );
      }

      // If a driver had accepted, free them up
      if (request.acceptedDriver) {
        await this.taxiModel.updateOne(
          { user: request.acceptedDriver },
          { $set: { availability: 'online' } },
        );
        await this.chauffeurModel.updateOne(
          { user: request.acceptedDriver },
          { $set: { availability: 'online' } },
        );

        await this.notificationsService.sendNotification(
          request.acceptedDriver.toString(),
          'Ride Cancelled',
          'The passenger has cancelled the ride request.',
          'ride',
          { rideId: request._id },
        );
      }

      request.status = 'cancelled';
      await request.save();

      await this.notificationsService.sendNotification(
        request.passenger.toString(),
        'Ride Cancelled',
        'Your ride request has been cancelled.',
        'ride',
        { rideId: request._id, status: 'cancelled' },
      );

      // Trigger real-time socket updates for driver/passenger
      this.taxiGateway.pushRequestUpdate(request._id.toString(), request);

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
          message: 'Ride is marked completed only after the passenger confirms payment',
        };
      }

      if (status === 'awaiting_payment') {
        if (!request.acceptedDriver) {
          return { success: false, message: 'Cannot update ride: no driver assigned' };
        }

        request.status = 'awaiting_payment';
        if (rideId) {
          request.ride = rideId as any;
        }
        await request.save();

        const populated = await this.taxiRequestModel
          .findById(requestId)
          .populate('passenger', 'firstName lastName phoneNumber')
          .populate('acceptedDriver', 'firstName lastName phoneNumber')
          .populate('ride')
          .exec();

        this.taxiGateway.pushRequestUpdate(requestId, populated);

        return {
          success: true,
          data: populated,
          message: 'Waiting for passenger to confirm location and pay',
        };
      }

      // Non-completion status updates
      request.status = status as any;
      if (rideId) {
        request.ride = rideId as any;
      }
      await request.save();

      const populated = await this.taxiRequestModel
        .findById(requestId)
        .populate('passenger', 'firstName lastName phoneNumber')
        .populate('acceptedDriver', 'firstName lastName phoneNumber')
        .exec();

      this.taxiGateway.pushRequestUpdate(requestId, populated);

      if (status === 'arrived') {
        await this.notificationsService.sendNotification(
          request.passenger.toString(),
          'Driver Arrived',
          'Your driver has arrived at the pickup location!',
          'ride',
          { rideId: request._id },
        );
      } else if (status === 'in_progress') {
        await this.notificationsService.sendNotification(
          request.passenger.toString(),
          'Ride Started',
          'Your ride is now in progress. Have a safe trip!',
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
