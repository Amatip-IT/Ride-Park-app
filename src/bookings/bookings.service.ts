import { Injectable, Logger, Inject, forwardRef } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  BookingRequest,
  BookingRequestDocument,
} from 'src/schemas/booking-request.schema';
import {
  ParkingSpace,
  ParkingSpaceDocument,
} from 'src/schemas/parking-space.schema';
import { Chauffeur, ChauffeurDocument } from 'src/schemas/chauffeur.schema';
import { NotificationsService } from 'src/notifications/notifications.service';
import { WalletService } from 'src/wallet/wallet.service';
import { PaymentsService } from 'src/payments/payments.service';
import { Response } from 'src/common/interfaces/response.interface';
import {
  calculateChauffeurQuotedPrice,
  CHAUFFEUR_MIN_HOURS,
} from 'src/common/pricing.constants';
import { toObjectIdString } from 'src/common/request.util';

@Injectable()
export class BookingsService {
  private readonly logger = new Logger(BookingsService.name);

  constructor(
    @InjectModel(BookingRequest.name)
    private bookingModel: Model<BookingRequestDocument>,
    @InjectModel(ParkingSpace.name)
    private parkingSpaceModel: Model<ParkingSpaceDocument>,
    @InjectModel(Chauffeur.name)
    private chauffeurModel: Model<ChauffeurDocument>,
    private readonly notificationsService: NotificationsService,
    private readonly walletService: WalletService,
    @Inject(forwardRef(() => PaymentsService))
    private readonly paymentsService: PaymentsService,
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
          return {
            success: false,
            message:
              'This parking space is no longer available. All spots are currently occupied.',
          };
        }
        providerId = toObjectIdString(space.owner);
        if (!providerId) {
          return {
            success: false,
            message: 'Parking space owner information is missing',
          };
        }
        serviceName = space.name;

        // Calculate price based on duration and available rates
        const requestedStart = data.startDate
          ? new Date(data.startDate)
          : data.startTime
            ? new Date(data.startTime)
            : undefined;
        const requestedEnd = data.endDate
          ? new Date(data.endDate)
          : data.endTime
            ? new Date(data.endTime)
            : undefined;

        if (requestedStart && requestedEnd && space.dailyRate) {
          const hours =
            (requestedEnd.getTime() - requestedStart.getTime()) /
            (1000 * 60 * 60);
          if (hours >= 24) {
            const days = Math.ceil(hours / 24);
            quotedPrice = days * space.dailyRate;
            pricingUnit = 'per_day';
          } else {
            quotedPrice = Math.ceil(hours) * space.hourlyRate;
            pricingUnit = 'per_hour';
          }
        } else {
          quotedPrice = space.hourlyRate;
          pricingUnit = 'per_hour';
        }
      } else if (data.serviceType === 'driver') {
        serviceName = 'Driver Request';
        pricingUnit = 'per_session';

        const requestedStart = data.startTime
          ? new Date(data.startTime)
          : data.startDate
            ? new Date(data.startDate)
            : undefined;
        const requestedEnd = data.endTime
          ? new Date(data.endTime)
          : data.endDate
            ? new Date(data.endDate)
            : undefined;

        if (requestedStart && requestedEnd && requestedEnd > requestedStart) {
          const quote = calculateChauffeurQuotedPrice(
            requestedStart,
            requestedEnd,
          );
          quotedPrice = quote.quotedPrice;
        } else {
          const quote = calculateChauffeurQuotedPrice(
            new Date(),
            new Date(Date.now() + CHAUFFEUR_MIN_HOURS * 60 * 60 * 1000),
          );
          quotedPrice = quote.quotedPrice;
        }

        if (data.serviceId) {
          const chauffeurRecord = await this.chauffeurModel.findById(
            data.serviceId,
          );
          if (chauffeurRecord) {
            providerId = toObjectIdString(chauffeurRecord.user);
          }
        }
      } else {
        // Taxi request — no specific provider yet (broadcast)
        serviceName = `Taxi Request${data.taxiType ? ` (${data.taxiType})` : ''}`;
        pricingUnit = 'per_ride';
        quotedPrice = undefined;
      }

      // Require a saved card before parking/chauffeur requests (same as taxi)
      if (data.serviceType === 'parking' || data.serviceType === 'driver') {
        try {
          const paymentMethods = await this.paymentsService.getPaymentMethods(
            data.requesterId,
          );
          if (!paymentMethods || paymentMethods.length === 0) {
            return {
              success: false,
              message:
                'Please add a payment method before booking. You can add a card in Wallet.',
            };
          }
        } catch {
          return {
            success: false,
            message:
              'Could not verify payment method. Please add a card in Wallet and try again.',
          };
        }
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
          return {
            success: false,
            message: 'You already have a pending request for this space',
          };
        }

        // --- CAPACITY CHECK ---
        const requestedStart = data.startDate
          ? new Date(data.startDate)
          : data.startTime
            ? new Date(data.startTime)
            : undefined;
        const requestedEnd = data.endDate
          ? new Date(data.endDate)
          : data.endTime
            ? new Date(data.endTime)
            : undefined;

        if (requestedStart && requestedEnd) {
          // Find accepted or active bookings that overlap with requested time
          const overlappingBookings = await this.bookingModel.countDocuments({
            serviceId: data.serviceId,
            status: { $in: ['accepted', 'active'] },
            startDate: { $lt: requestedEnd },
            endDate: { $gt: requestedStart },
          });

          if (overlappingBookings >= space.totalSpots) {
            return {
              success: false,
              message: `Sorry, all ${space.totalSpots} spots are fully booked for the selected time period.`,
            };
          }
        } else {
          // Fallback to checking real-time occupied spots
          if (space.occupiedSpots >= space.totalSpots) {
            return {
              success: false,
              message: `Sorry, all ${space.totalSpots} spots are currently occupied. This space is no longer available.`,
            };
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
        startDate: data.startDate
          ? new Date(data.startDate)
          : data.startTime
            ? new Date(data.startTime)
            : undefined,
        endDate: data.endDate
          ? new Date(data.endDate)
          : data.endTime
            ? new Date(data.endTime)
            : undefined,
        pickupAddress: data.pickupAddress,
        pickupPostcode: data.pickupPostcode,
        pickupCoords:
          data.pickupLat && data.pickupLng
            ? { lat: data.pickupLat, lng: data.pickupLng }
            : undefined,
        taxiType: data.taxiType,
        status: 'pending',
      });

      await booking.save();

      const populated = await this.bookingModel
        .findById(booking._id)
        .populate('requester', 'firstName lastName email phoneNumber')
        .populate('provider', 'firstName lastName')
        .exec();

      // ── Notify the provider about the new request ──
      if (providerId) {
        try {
          const requesterData = populated?.requester as any;
          const requesterName = requesterData?.firstName
            ? `${requesterData.firstName} ${requesterData.lastName}`
            : 'A user';

          await this.notificationsService.sendNotification(
            providerId,
            '📥 New Booking Request',
            `${requesterName} has requested to book "${serviceName}".`,
            'booking',
            {
              bookingId: booking._id.toString(),
              serviceType: data.serviceType,
            },
          );
        } catch (err) {
          this.logger.warn(
            'Failed to send new-request notification to provider',
            err,
          );
        }
      }

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
  async getProviderRequests(
    providerId: string,
    status?: string,
  ): Promise<Response> {
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
   *
   * On ACCEPT:
   *   1. Increment occupiedSpots on the ParkingSpace
   *   2. If occupiedSpots >= totalSpots → set isAvailable = false
   *   3. Notify the requester
   *   4. If space just became full → notify provider
   *
   * On REJECT:
   *   1. Notify the requester
   */
  async respondToRequest(
    requestId: string,
    providerId: string,
    action: 'accept' | 'reject',
    responseMessage?: string,
  ): Promise<Response> {
    try {
      const currentBooking = await this.bookingModel.findById(requestId);

      if (!currentBooking) {
        return { success: false, message: 'Booking request not found' };
      }

      if (
        currentBooking.provider &&
        currentBooking.provider.toString() !== providerId.toString()
      ) {
        return {
          success: false,
          message: 'You are not authorized to respond to this request',
        };
      }

      if (currentBooking.status !== 'pending') {
        return {
          success: false,
          message: `This request has already been ${currentBooking.status}`,
        };
      }

      const nextStatus = action === 'accept' ? 'accepted' : 'rejected';
      const respondedAt = new Date();
      const booking = await this.bookingModel.findOneAndUpdate(
        { _id: requestId, status: 'pending' },
        {
          $set: {
            status: nextStatus,
            responseMessage,
            respondedAt,
          },
        },
        { new: true },
      );

      if (!booking) {
        return {
          success: false,
          message: 'This request was already handled by another operation',
        };
      }

      // ── For parking: validate capacity atomically before accepting ──
      let parkingSpace: any = null;
      if (
        action === 'accept' &&
        booking.serviceType === 'parking' &&
        booking.serviceId
      ) {
        const space = await this.parkingSpaceModel.findById(booking.serviceId);
        if (!space) {
          await this.rollbackBookingResponse(requestId, nextStatus);
          return { success: false, message: 'Parking space not found' };
        }
        // Atomic check-and-increment to prevent race condition where two accepts pass the capacity check
        parkingSpace = await this.parkingSpaceModel.findOneAndUpdate(
          { _id: booking.serviceId, occupiedSpots: { $lt: space.totalSpots } },
          { $inc: { occupiedSpots: 1 } },
          { new: true },
        );
        if (!parkingSpace) {
          await this.rollbackBookingResponse(requestId, nextStatus);
          return {
            success: false,
            message: `Cannot accept — all ${space.totalSpots} spots are already occupied. Reject this request or wait for a spot to free up.`,
          };
        }
      }

      // No service is charged on accept — payment is requested when the provider completes
      // ── Check if the space just became full (already incremented atomically above) ──
      let spaceBecameFull = false;
      if (
        action === 'accept' &&
        booking.serviceType === 'parking' &&
        parkingSpace
      ) {
        if (parkingSpace.occupiedSpots >= parkingSpace.totalSpots) {
          parkingSpace.isAvailable = false;
          await parkingSpace.save();
          spaceBecameFull = true;
          this.logger.log(
            `Parking space "${parkingSpace.name}" (${parkingSpace._id}) is now FULL ` +
              `(${parkingSpace.occupiedSpots}/${parkingSpace.totalSpots}). Marked as unavailable.`,
          );
        }
      }

      const populated = await this.bookingModel
        .findById(booking._id)
        .populate('requester', 'firstName lastName email phoneNumber')
        .populate('provider', 'firstName lastName')
        .exec();

      // ── FIX BUG 3: Send notifications ──
      const requesterId = booking.requester.toString();
      const bookingName = booking.serviceName || 'your service';

      try {
        if (action === 'accept') {
          await this.notificationsService.sendNotification(
            requesterId,
            '✅ Booking Accepted!',
            `Your request for "${bookingName}" has been accepted! Your spot is confirmed.`,
            'booking',
            { bookingId: booking._id.toString(), status: 'accepted' },
          );
        } else {
          const reason = responseMessage ? ` Reason: ${responseMessage}` : '';
          await this.notificationsService.sendNotification(
            requesterId,
            '❌ Booking Declined',
            `Your request for "${bookingName}" was declined.${reason}`,
            'booking',
            { bookingId: booking._id.toString(), status: 'rejected' },
          );
        }

        // Notify provider if space just became full
        if (spaceBecameFull) {
          await this.notificationsService.sendNotification(
            providerId,
            '🅿️ Space Full!',
            `"${bookingName}" is now fully occupied. No new bookings will be accepted until a spot frees up.`,
            'system',
            { serviceId: booking.serviceId?.toString() },
          );

          // Also reject all remaining pending requests for this full space
          const pendingForSpace = await this.bookingModel.find({
            serviceId: booking.serviceId,
            status: 'pending',
          });

          for (const pendingBooking of pendingForSpace) {
            pendingBooking.status = 'rejected';
            pendingBooking.responseMessage =
              'This parking space is no longer available — all spots are occupied.';
            pendingBooking.respondedAt = new Date();
            await pendingBooking.save();

            // Notify each waiting user
            try {
              await this.notificationsService.sendNotification(
                pendingBooking.requester.toString(),
                '🅿️ Space No Longer Available',
                `Sorry, "${bookingName}" is now fully booked. Your pending request has been automatically declined.`,
                'booking',
                {
                  bookingId: pendingBooking._id.toString(),
                  status: 'rejected',
                },
              );
            } catch (notifErr) {
              this.logger.warn(
                'Failed to notify user about auto-rejected booking',
                notifErr,
              );
            }
          }

          if (pendingForSpace.length > 0) {
            this.logger.log(
              `Auto-rejected ${pendingForSpace.length} pending requests for full space ${booking.serviceId}`,
            );
          }
        }
      } catch (notifErr) {
        this.logger.warn(
          'Failed to send booking response notification',
          notifErr,
        );
      }

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

  private async rollbackBookingResponse(
    requestId: string,
    claimedStatus: string,
  ): Promise<void> {
    await this.bookingModel.updateOne(
      { _id: requestId, status: claimedStatus },
      {
        $set: { status: 'pending' },
        $unset: { responseMessage: 1, respondedAt: 1 },
      },
    );
  }

  /**
   * Free one parking capacity slot after the booking is fully finished
   * (paid, free completion, or cancelled while still accepted — not while payment is due).
   */
  private async releaseParkingSpot(serviceId: string | undefined): Promise<void> {
    if (!serviceId) return;

    const updatedSpace = await this.parkingSpaceModel.findByIdAndUpdate(
      serviceId,
      { $inc: { occupiedSpots: -1 } },
      { new: true },
    );

    if (!updatedSpace) return;

    if (updatedSpace.occupiedSpots < 0) {
      updatedSpace.occupiedSpots = 0;
      await updatedSpace.save();
    }

    if (
      !updatedSpace.isAvailable &&
      updatedSpace.occupiedSpots < updatedSpace.totalSpots
    ) {
      updatedSpace.isAvailable = true;
      await updatedSpace.save();
      this.logger.log(
        `Parking space "${updatedSpace.name}" (${updatedSpace._id}) has a free spot again. ` +
          `Marked as available (${updatedSpace.occupiedSpots}/${updatedSpace.totalSpots}).`,
      );
    }
  }

  /**
   * Cancel a booking request (by the requester)
   *
   * If the booking was already accepted (parking), decrement occupiedSpots
   * and re-enable the space if it was previously full.
   * Bookings awaiting payment cannot be cancelled — the consumer must pay.
   */
  async cancelBooking(
    requestId: string,
    requesterId: string,
  ): Promise<Response> {
    try {
      const booking = await this.bookingModel.findById(requestId);

      if (!booking) {
        return { success: false, message: 'Booking not found' };
      }

      if (
        toObjectIdString(booking.requester) !== toObjectIdString(requesterId)
      ) {
        return {
          success: false,
          message: 'You can only cancel your own bookings',
        };
      }

      if (booking.status === 'awaiting_payment') {
        return {
          success: false,
          message:
            'This service has finished and payment is due. Please confirm your location and pay — cancellation is no longer available.',
        };
      }

      if (!['pending', 'accepted'].includes(booking.status)) {
        return {
          success: false,
          message: `Cannot cancel a ${booking.status} booking`,
        };
      }

      const wasAccepted = booking.status === 'accepted';

      // ── Refund the customer if they were already charged ──
      if (
        wasAccepted &&
        booking.paymentIntentId &&
        booking.quotedPrice &&
        booking.quotedPrice > 0
      ) {
        try {
          await this.paymentsService.refundCustomer(booking.paymentIntentId);
          this.logger.log(
            `Refund issued for booking ${booking._id} (PaymentIntent: ${booking.paymentIntentId})`,
          );
        } catch (refundErr) {
          this.logger.error(
            `Refund failed for booking ${booking._id} (PaymentIntent: ${booking.paymentIntentId}). ` +
              `Manual resolution required. Error: ${refundErr}`,
          );
        }
      }

      booking.status = 'cancelled';
      await booking.save();

      if (booking.provider) {
        try {
          const serviceLabel =
            booking.serviceType === 'parking'
              ? 'parking space'
              : booking.serviceType === 'driver'
                ? 'chauffeur request'
                : 'booking';

          await this.notificationsService.sendNotification(
            booking.provider.toString(),
            '🔄 Booking Cancelled',
            wasAccepted
              ? `A user cancelled their accepted ${serviceLabel} for "${booking.serviceName || 'your service'}".${booking.serviceType === 'parking' ? ' The spot is available again.' : ''}`
              : `A user cancelled their pending ${serviceLabel} for "${booking.serviceName || 'your service'}".`,
            'booking',
            { bookingId: booking._id.toString(), status: 'cancelled' },
          );
        } catch (notifErr) {
          this.logger.warn(
            'Failed to send cancellation notification to provider',
            notifErr,
          );
        }
      }

      if (wasAccepted && booking.serviceType === 'driver' && booking.provider) {
        await this.chauffeurModel.updateOne(
          { user: booking.provider },
          { $set: { availability: 'online' } },
        );
      }

      if (
        wasAccepted &&
        booking.serviceType === 'parking' &&
        booking.serviceId
      ) {
        await this.releaseParkingSpot(booking.serviceId.toString());
      }

      const refundNote =
        wasAccepted && booking.paymentIntentId
          ? ' Any payment taken will be refunded to your card.'
          : '';

      return {
        success: true,
        data: booking,
        message: `Booking cancelled successfully.${refundNote}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to cancel: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Complete a booking (by the provider or auto-triggered)
   *
   * For PARKING and DRIVER/CHAUFFEUR: transitions to 'awaiting_payment' and notifies
   * the consumer to confirm their location and pay. No auto-charge.
   */
  async completeBooking(
    requestId: string,
    providerId: string,
  ): Promise<Response> {
    try {
      const booking = await this.bookingModel.findById(requestId);

      if (!booking) {
        return { success: false, message: 'Booking not found' };
      }

      if (
        booking.provider &&
        booking.provider.toString() !== providerId.toString()
      ) {
        return {
          success: false,
          message: 'You are not authorized to complete this booking',
        };
      }

      if (booking.status !== 'accepted') {
        return {
          success: false,
          message: `Cannot complete a ${booking.status} booking. Only accepted bookings can be completed.`,
        };
      }

      // ── Parking and chauffeur bookings: request payment from the consumer ──
      if (
        booking.serviceType === 'parking' ||
        booking.serviceType === 'driver'
      ) {
        booking.status = 'awaiting_payment';
        booking.completedAt = new Date();
        await booking.save();

        const serviceLabel =
          booking.serviceType === 'parking'
            ? 'parking session'
            : 'chauffeur service';
        try {
          await this.notificationsService.sendNotification(
            booking.requester.toString(),
            '💳 Payment Requested',
            `Your ${serviceLabel} "${booking.serviceName || 'service'}" is complete. Confirm you are at the location, then pay £${(booking.quotedPrice || 0).toFixed(2)}.`,
            'payment',
            {
              bookingId: booking._id.toString(),
              status: 'awaiting_payment',
              action: 'pay',
            },
          );
        } catch (notifErr) {
          this.logger.warn(
            'Failed to send payment request notification',
            notifErr,
          );
        }

        const populated = await this.bookingModel
          .findById(booking._id)
          .populate('requester', 'firstName lastName email phoneNumber')
          .populate('provider', 'firstName lastName')
          .exec();

        return {
          success: true,
          data: populated || booking,
          message: `Payment request sent to the customer for £${(booking.quotedPrice || 0).toFixed(2)}.`,
        };
      }

      // ── Other booking types: complete without payment flow ──
      booking.status = 'completed';
      booking.completedAt = new Date();
      await booking.save();

      // Taxi earnings are credited by the paid ride lifecycle, not by this
      // booking-state transition. This prevents an uncharged or duplicate credit.

      // Notify the requester
      try {
        await this.notificationsService.sendNotification(
          booking.requester.toString(),
          '🏁 Booking Completed',
          `Your booking for "${booking.serviceName || 'service'}" has been completed. Thank you for using Gleezip!`,
          'booking',
          { bookingId: booking._id.toString(), status: 'completed' },
        );
      } catch (notifErr) {
        this.logger.warn('Failed to send completion notification', notifErr);
      }

      const populated = await this.bookingModel
        .findById(booking._id)
        .populate('requester', 'firstName lastName email phoneNumber')
        .populate('provider', 'firstName lastName')
        .exec();

      return {
        success: true,
        data: populated,
        message:
          'Booking completed successfully. The parking spot has been freed.',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to complete booking: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Consumer confirms they are at the service location before paying.
   */
  async confirmBookingArrival(
    requestId: string,
    consumerId: string,
  ): Promise<Response> {
    try {
      const booking = await this.bookingModel.findById(requestId);

      if (!booking) {
        return { success: false, message: 'Booking not found' };
      }

      if (
        toObjectIdString(booking.requester) !== toObjectIdString(consumerId)
      ) {
        return {
          success: false,
          message: 'You can only confirm arrival for your own bookings',
        };
      }

      if (booking.status !== 'awaiting_payment') {
        return {
          success: false,
          message: 'Arrival can only be confirmed when payment is due',
        };
      }

      booking.passengerConfirmedAt = new Date();
      await booking.save();

      return {
        success: true,
        data: booking,
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
   * Consumer confirms payment for a booking that is awaiting_payment.
   * Charges the consumer's card, credits the provider's wallet, and generates a receipt.
   */
  async payBooking(requestId: string, consumerId: string): Promise<Response> {
    try {
      const existingBooking = await this.bookingModel.findById(requestId);

      if (!existingBooking) {
        return { success: false, message: 'Booking not found' };
      }

      if (
        toObjectIdString(existingBooking.requester) !==
        toObjectIdString(consumerId)
      ) {
        return {
          success: false,
          message: 'You can only pay for your own bookings',
        };
      }

      if (existingBooking.status !== 'awaiting_payment') {
        return {
          success: false,
          message:
            existingBooking.status === 'completed'
              ? 'This booking has already been paid.'
              : `Cannot pay a booking with status "${existingBooking.status}".`,
        };
      }

      if (!existingBooking.passengerConfirmedAt) {
        return {
          success: false,
          message: 'Please confirm you are at the location before paying',
        };
      }

      const booking = await this.bookingModel.findOneAndUpdate(
        {
          _id: requestId,
          status: 'awaiting_payment',
          passengerConfirmedAt: { $ne: null },
          $or: [
            { paymentStatus: { $in: ['pending', 'payment_failed'] } },
            { paymentStatus: { $exists: false } },
          ],
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

      if (!booking) {
        const latest = await this.bookingModel.findById(requestId);
        if (
          latest?.status === 'completed' &&
          latest.paymentStatus === 'charged'
        ) {
          return {
            success: true,
            data: latest,
            message: 'This booking has already been paid.',
          };
        }
        return {
          success: false,
          message: 'A payment for this booking is already being processed.',
        };
      }

      if (!booking.quotedPrice || booking.quotedPrice <= 0) {
        booking.status = 'completed';
        booking.paymentStatus = 'charged';
        await booking.save();
        if (booking.serviceType === 'parking') {
          await this.releaseParkingSpot(booking.serviceId?.toString());
        }
        return {
          success: true,
          data: booking,
          message: 'No payment required — booking completed.',
        };
      }

      // Charge the consumer's saved payment method
      let paymentIntentId: string;
      try {
        const paymentIntent = await this.paymentsService.chargeCustomer(
          booking.requester.toString(),
          booking.quotedPrice,
          `Parking at ${booking.serviceName || 'parking space'}`,
          { type: 'booking', bookingId: booking._id.toString() },
          `booking:${booking._id.toString()}:payment:${booking.paymentAttempt}`,
        );
        paymentIntentId = paymentIntent.id;
      } catch (chargeErr: any) {
        booking.paymentStatus = 'payment_failed';
        await booking.save();
        return {
          success: false,
          message: `Payment failed — ${chargeErr?.message || 'could not charge your card'}. Please check your payment method and try again.`,
        };
      }

      // Mark as completed with payment info
      booking.status = 'completed';
      booking.paymentStatus = 'charged';
      booking.paymentIntentId = paymentIntentId;
      await booking.save();

      // Free parking capacity only after successful payment
      if (booking.serviceType === 'parking') {
        await this.releaseParkingSpot(booking.serviceId?.toString());
      }

      // Credit the provider's wallet
      if (booking.provider) {
        try {
          await this.walletService.addEarning(
            booking.provider.toString(),
            booking.quotedPrice,
            booking._id.toString(),
            booking.paymentIntentId,
          );
        } catch (walletErr) {
          this.logger.error(
            `Failed to credit provider wallet for booking ${booking._id}: ${walletErr}`,
          );
        }
      }

      // Notify the provider that payment has been received
      if (booking.provider) {
        try {
          await this.notificationsService.sendNotification(
            booking.provider.toString(),
            '✅ Payment Received',
            `Payment of £${booking.quotedPrice.toFixed(2)} confirmed for "${booking.serviceName || 'parking'}". Earnings credited to your wallet.`,
            'payment',
            { bookingId: booking._id.toString(), status: 'completed' },
          );
        } catch (notifErr) {
          this.logger.warn(
            'Failed to send payment received notification',
            notifErr,
          );
        }
      }

      // Notify the consumer with receipt
      try {
        await this.notificationsService.sendNotification(
          booking.requester.toString(),
          '🧾 Payment Successful',
          `£${booking.quotedPrice.toFixed(2)} charged for "${booking.serviceName || 'parking'}". Your receipt is ready.`,
          'payment',
          {
            bookingId: booking._id.toString(),
            status: 'completed',
            action: 'receipt',
          },
        );
      } catch (notifErr) {
        this.logger.warn(
          'Failed to send payment success notification',
          notifErr,
        );
      }

      const populated = await this.bookingModel
        .findById(booking._id)
        .populate('requester', 'firstName lastName email phoneNumber')
        .populate('provider', 'firstName lastName')
        .exec();

      return {
        success: true,
        data: populated || booking,
        message: `Payment of £${booking.quotedPrice.toFixed(2)} successful. Receipt generated.`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Payment failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Idempotent recovery when Stripe confirms booking payment but the HTTP handler died.
   */
  async reconcilePaymentSucceeded(
    bookingId: string,
    paymentIntentId: string,
  ): Promise<void> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) return;

    const alreadyPaid =
      booking.status === 'completed' && booking.paymentStatus === 'charged';

    if (!alreadyPaid) {
      booking.status = 'completed';
      booking.completedAt = booking.completedAt || new Date();
      booking.paymentStatus = 'charged';
      booking.paymentIntentId = paymentIntentId;
      await booking.save();

      if (booking.serviceType === 'parking') {
        await this.releaseParkingSpot(booking.serviceId?.toString());
      }
    }

    if (
      booking.provider &&
      booking.quotedPrice &&
      booking.quotedPrice > 0
    ) {
      try {
        await this.walletService.addEarning(
          booking.provider.toString(),
          booking.quotedPrice,
          booking._id.toString(),
          booking.paymentIntentId || paymentIntentId,
        );
      } catch (walletErr) {
        this.logger.error(
          `Webhook earning credit failed for booking ${bookingId}: ${walletErr}`,
        );
      }
    }
  }

  async reconcilePaymentFailed(
    bookingId: string,
    paymentIntentId: string,
  ): Promise<void> {
    const booking = await this.bookingModel.findById(bookingId);
    if (!booking) return;
    if (booking.paymentStatus === 'charged' && booking.status === 'completed') {
      return;
    }

    booking.paymentStatus = 'payment_failed';
    booking.paymentIntentId = paymentIntentId;
    if (booking.status !== 'completed') {
      booking.status = 'awaiting_payment';
    }
    await booking.save();
  }

  /**
   * Auto-complete expired bookings (call from a scheduled job or admin)
   * Finds all accepted parking bookings whose endDate has passed and completes them.
   */
  async autoCompleteExpiredBookings(): Promise<Response> {
    try {
      const now = new Date();

      const expiredBookings = await this.bookingModel.find({
        status: 'accepted',
        serviceType: 'parking',
        endDate: { $lte: now },
      });

      let completedCount = 0;

      for (const booking of expiredBookings) {
        const paymentRequired = Boolean(
          booking.quotedPrice && booking.quotedPrice > 0,
        );
        booking.status = paymentRequired ? 'awaiting_payment' : 'completed';
        booking.completedAt = now;
        await booking.save();

        // Hold the spot while payment is due. Free it only when no payment is owed.
        if (!paymentRequired && booking.serviceId) {
          await this.releaseParkingSpot(booking.serviceId.toString());
        }

        // Notify the user
        try {
          await this.notificationsService.sendNotification(
            booking.requester.toString(),
            paymentRequired
              ? '💳 Parking Payment Required'
              : '🏁 Parking Session Ended',
            paymentRequired
              ? `Your parking session at "${booking.serviceName || 'the parking space'}" has ended. Pay £${(booking.quotedPrice || 0).toFixed(2)} to complete it.`
              : `Your parking session at "${booking.serviceName || 'the parking space'}" has ended. Thank you!`,
            paymentRequired ? 'payment' : 'booking',
            {
              bookingId: booking._id.toString(),
              status: booking.status,
              ...(paymentRequired ? { action: 'pay' } : {}),
            },
          );
        } catch (notifErr) {
          this.logger.warn(
            'Failed to send auto-completion notification',
            notifErr,
          );
        }

        completedCount++;
      }

      return {
        success: true,
        message: `Processed ${completedCount} expired booking(s)`,
        data: { completedCount },
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to auto-complete: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }

  /**
   * Receipt for a completed parking or chauffeur (driver) booking
   */
  async getBookingReceipt(
    bookingId: string,
    requestingUserId: string,
  ): Promise<Response> {
    try {
      const booking = await this.bookingModel
        .findById(bookingId)
        .populate('requester', 'firstName lastName email phoneNumber')
        .populate('provider', 'firstName lastName email phoneNumber')
        .exec();

      if (!booking) {
        return { success: false, message: 'Booking not found' };
      }

      if (!['parking', 'driver'].includes(booking.serviceType)) {
        return {
          success: false,
          message: 'Use the trip receipt endpoint for taxi bookings',
        };
      }

      const requesterId =
        (booking.requester as any)?._id?.toString() ||
        booking.requester.toString();
      const providerId = booking.provider
        ? (booking.provider as any)?._id?.toString() ||
          booking.provider.toString()
        : null;

      if (
        requestingUserId !== requesterId &&
        (!providerId || requestingUserId !== providerId)
      ) {
        return {
          success: false,
          message: 'You do not have access to this receipt',
        };
      }

      if (booking.status !== 'completed') {
        return {
          success: false,
          message: 'Receipt is available after the booking is completed',
        };
      }

      if (
        ['parking', 'driver'].includes(booking.serviceType) &&
        !booking.paymentIntentId
      ) {
        return {
          success: false,
          message: 'Receipt is available after payment has been confirmed',
        };
      }

      const requester = booking.requester as any;
      const provider = booking.provider as any;
      const isRequester = requestingUserId === requesterId;

      const receipt = {
        bookingId: booking._id.toString(),
        role: isRequester ? 'passenger' : 'provider',
        serviceType: booking.serviceType,
        serviceName:
          booking.serviceName ||
          (booking.serviceType === 'parking' ? 'Parking' : 'Chauffeur'),
        completedAt: booking.completedAt,
        startDate: booking.startDate,
        endDate: booking.endDate,
        requester: {
          name: `${requester?.firstName || ''} ${requester?.lastName || ''}`.trim(),
          email: requester?.email,
        },
        provider: {
          name: provider
            ? `${provider.firstName || ''} ${provider.lastName || ''}`.trim()
            : undefined,
          email: provider?.email,
        },
        quotedPrice: booking.quotedPrice,
        pricingUnit: booking.pricingUnit,
        totalCost: booking.quotedPrice,
        paymentIntentId: booking.paymentIntentId,
        paymentStatus: booking.paymentIntentId ? 'charged' : 'pending',
        paymentNote: booking.paymentIntentId
          ? isRequester
            ? 'Charged to your saved payment method.'
            : 'Earnings credited to your wallet (after platform fee).'
          : 'No payment record on file for this booking.',
      };

      return {
        success: true,
        data: receipt,
        message: 'Booking receipt',
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to load receipt: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}
