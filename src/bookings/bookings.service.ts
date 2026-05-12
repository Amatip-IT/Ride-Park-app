import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { BookingRequest, BookingRequestDocument } from 'src/schemas/booking-request.schema';
import { ParkingSpace, ParkingSpaceDocument } from 'src/schemas/parking-space.schema';
import { Response } from 'src/common/interfaces/response.interface';

@Injectable()
export class BookingsService {
  constructor(
    @InjectModel(BookingRequest.name) private bookingModel: Model<BookingRequestDocument>,
    @InjectModel(ParkingSpace.name) private parkingSpaceModel: Model<ParkingSpaceDocument>,
  ) {}

  /**
   * Create a new booking request (from a general user to a provider)
   */
  async createBookingRequest(data: {
    requesterId: string;
    serviceType: 'parking' | 'driver' | 'taxi';
    serviceId?: string;
    message?: string;
    startDate?: string;
    endDate?: string;
    // Driver/Taxi request fields
    pickupAddress?: string;
    pickupPostcode?: string;
    pickupLat?: number;
    pickupLng?: number;
    startTime?: string;
    endTime?: string;
    notes?: string;
    taxiType?: string;
  }): Promise<Response> {
    try {
      // Look up the service to get provider and pricing info
      let providerId: string | undefined;
      let serviceName: string;
      let quotedPrice: number | undefined;
      let pricingUnit: string | undefined;

      let space: any = null;

      if (data.serviceType === 'parking') {
        space = await this.parkingSpaceModel.findById(data.serviceId);
        if (!space) {
          return { success: false, message: 'Parking space not found' };
        }
        if (!space.isAvailable) {
          return { success: false, message: 'This parking space is not available' };
        }
        providerId = space.owner.toString();
        serviceName = space.name;
        quotedPrice = space.hourlyRate;
        pricingUnit = 'per_hour';
      } else if (data.serviceType === 'driver') {
        // Driver request — no specific provider yet (broadcast)
        serviceName = 'Driver Request';
        pricingUnit = 'per_mile';
        quotedPrice = 1.10;
      } else {
        // Taxi request — no specific provider yet (broadcast)
        serviceName = `Taxi Request${data.taxiType ? ` (${data.taxiType})` : ''}`;
        pricingUnit = 'per_ride';
        quotedPrice = undefined;
      }

      // Check user isn't requesting their own service (only relevant for parking)
      if (providerId && data.requesterId === providerId) {
        return { success: false, message: 'You cannot book your own service' };
      }

      // Check for existing pending request for the same service (only for parking)
      if (data.serviceType === 'parking' && data.serviceId && space) {
        const existingRequest = await this.bookingModel.findOne({
          requester: data.requesterId,
          serviceId: data.serviceId,
          status: 'pending',
        });

        if (existingRequest) {
          return { success: false, message: 'You already have a pending request for this space' };
        }

        // --- CAPACITY CHECK ---
        const requestedStart = data.startDate ? new Date(data.startDate) : (data.startTime ? new Date(data.startTime) : undefined);
        const requestedEnd = data.endDate ? new Date(data.endDate) : (data.endTime ? new Date(data.endTime) : undefined);

        if (requestedStart && requestedEnd) {
          // Find accepted or active bookings that overlap with requested time
          const overlappingBookings = await this.bookingModel.countDocuments({
            serviceId: data.serviceId,
            status: { $in: ['accepted', 'active'] },
            startDate: { $lt: requestedEnd }, 
            endDate: { $gt: requestedStart }
          });

          if (overlappingBookings >= space.totalSpots) {
            return { success: false, message: `Sorry, all ${space.totalSpots} spots are fully booked for the selected time period.` };
          }
        } else {
          // Fallback to checking real-time occupied spots
          if (space.occupiedSpots >= space.totalSpots) {
            return { success: false, message: `Sorry, all ${space.totalSpots} spots are currently occupied.` };
          }
        }
      }

      const booking = new this.bookingModel({
        requester: data.requesterId,
        provider: providerId || undefined,
        serviceType: data.serviceType,
        serviceId: data.serviceId || undefined,
        serviceName,
        quotedPrice,
        pricingUnit,
        message: data.message || data.notes,
        startDate: data.startDate ? new Date(data.startDate) : (data.startTime ? new Date(data.startTime) : undefined),
        endDate: data.endDate ? new Date(data.endDate) : (data.endTime ? new Date(data.endTime) : undefined),
        pickupAddress: data.pickupAddress,
        pickupPostcode: data.pickupPostcode,
        pickupCoords: data.pickupLat && data.pickupLng ? { lat: data.pickupLat, lng: data.pickupLng } : undefined,
        taxiType: data.taxiType,
        status: 'pending',
      });

      await booking.save();

      const populated = await this.bookingModel
        .findById(booking._id)
        .populate('requester', 'firstName lastName email phoneNumber')
        .populate('provider', 'firstName lastName')
        .exec();

      return {
        success: true,
        data: populated,
        message: 'Booking request sent successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to create booking: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get all booking requests for a user (as requester — consumer view)
   */
  async getMyBookings(userId: string, status?: string): Promise<Response> {
    try {
      const filter: any = { requester: userId };
      if (status) filter.status = status;

      const bookings = await this.bookingModel
        .find(filter)
        .populate('provider', 'firstName lastName')
        .sort({ createdAt: -1 })
        .exec();

      return {
        success: true,
        data: bookings,
        message: `Found ${bookings.length} booking(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch bookings: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Get all booking requests for a provider (incoming requests — provider view)
   */
  async getProviderRequests(providerId: string, status?: string): Promise<Response> {
    try {
      const filter: any = { provider: providerId };
      if (status) filter.status = status;

      const requests = await this.bookingModel
        .find(filter)
        .populate('requester', 'firstName lastName email phoneNumber')
        .sort({ createdAt: -1 })
        .exec();

      return {
        success: true,
        data: requests,
        message: `Found ${requests.length} request(s)`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to fetch requests: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Provider responds to a booking request (accept or reject)
   */
  async respondToRequest(
    requestId: string,
    providerId: string,
    action: 'accept' | 'reject',
    responseMessage?: string,
  ): Promise<Response> {
    try {
      const booking = await this.bookingModel.findById(requestId);

      if (!booking) {
        return { success: false, message: 'Booking request not found' };
      }

      if (booking.provider && booking.provider.toString() !== providerId.toString()) {
        return { success: false, message: 'You are not authorized to respond to this request' };
      }

      if (booking.status !== 'pending') {
        return { success: false, message: `This request has already been ${booking.status}` };
      }

      booking.status = action === 'accept' ? 'accepted' : 'rejected';
      booking.responseMessage = responseMessage;
      booking.respondedAt = new Date();
      await booking.save();

      const populated = await this.bookingModel
        .findById(booking._id)
        .populate('requester', 'firstName lastName email phoneNumber')
        .populate('provider', 'firstName lastName')
        .exec();

      return {
        success: true,
        data: populated,
        message: `Request ${action === 'accept' ? 'accepted' : 'rejected'} successfully`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to respond: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Cancel a booking request (by the requester)
   */
  async cancelBooking(requestId: string, requesterId: string): Promise<Response> {
    try {
      const booking = await this.bookingModel.findById(requestId);

      if (!booking) {
        return { success: false, message: 'Booking not found' };
      }

      if (booking.requester.toString() !== requesterId) {
        return { success: false, message: 'You can only cancel your own bookings' };
      }

      if (!['pending', 'accepted'].includes(booking.status)) {
        return { success: false, message: `Cannot cancel a ${booking.status} booking` };
      }

      booking.status = 'cancelled';
      await booking.save();

      return {
        success: true,
        data: booking,
        message: 'Booking cancelled successfully',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to cancel: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
