import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  TaxiRideRequest,
  TaxiRideRequestDocument,
} from 'src/schemas/taxi-ride-request.schema';
import { Taxi, TaxiDocument } from 'src/schemas/taxi.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { User, UserDocument } from 'src/schemas/user.schema';
import { Response } from 'src/common/interfaces/response.interface';

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
    estimatedDistanceMiles?: number;
    estimatedDurationMinutes?: number;
  }): Promise<Response> {
    try {
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
      let estimatedCost: number | undefined;
      if (data.estimatedDistanceMiles) {
        const distanceCost = data.estimatedDistanceMiles * RATE_PER_MILE;
        const timeCost = (data.estimatedDurationMinutes || 0) * RATE_PER_MINUTE;
        estimatedCost = Math.round((distanceCost + timeCost) * 100) / 100;
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

      return {
        success: true,
        data: populated,
        message: 'Ride request created! Notifying nearby drivers...',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create request: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get available ride requests for drivers (broadcast list)
   * Drivers see all 'searching' requests, optionally filtered by postcode area
   */
  async getAvailableRequests(
    driverId: string,
    postcodeFilter?: string,
  ): Promise<Response> {
    try {
      const filter: any = { status: 'searching' };

      // If postcode filter provided, match the first part (outward code)
      if (postcodeFilter) {
        const outwardCode = postcodeFilter.split(' ')[0].toUpperCase();
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
          status: { $in: ['accepted', 'in_progress'] },
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
      const request = await this.taxiRequestModel.findById(requestId);

      if (!request) {
        return { success: false, message: 'Ride request not found' };
      }

      if (request.status !== 'searching') {
        return {
          success: false,
          message: request.status === 'accepted'
            ? 'This ride has already been accepted by another driver'
            : `This ride request is ${request.status}`,
        };
      }

      // Look up the driver's number
      const driverRecord: any =
        (await this.taxiModel.findOne({ user: driverId })) ||
        (await this.chauffeurModel.findOne({ user: driverId }));

      // Update the request
      request.status = 'accepted';
      request.acceptedDriver = driverId;
      request.driverVehicle = {
        make: data.vehicleMake,
        model: data.vehicleModel,
        color: data.vehicleColor,
        plateNumber: data.plateNumber,
      };
      request.driverEtaMinutes = data.etaMinutes;
      request.driverNumber = driverRecord?.driverNumber || undefined;
      request.acceptedAt = new Date();

      await request.save();

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

      if (request.passenger.toString() !== passengerId) {
        return { success: false, message: 'You can only cancel your own requests' };
      }

      if (!['searching', 'accepted'].includes(request.status)) {
        return { success: false, message: `Cannot cancel a ${request.status} ride` };
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
      }

      request.status = 'cancelled';
      await request.save();

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
}
