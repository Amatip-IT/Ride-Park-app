import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { TaxiBookingsService } from './taxi-bookings.service';
import { RidesService } from 'src/rides/rides.service';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('taxi-bookings')
@UseGuards(AuthGuard)
export class TaxiBookingsController {
  constructor(
    private readonly taxiBookingsService: TaxiBookingsService,
    private readonly ridesService: RidesService,
  ) {}

  /**
   * POST /taxi-bookings/request
   * Passenger creates a ride request (broadcast to all drivers)
   */
  @Post('request')
  async createRequest(
    @Req() req: any,
    @Body()
    body: {
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
      estimatedCost?: number;
    },
  ) {
    const passengerId = req.user._id || req.user.id;

    if (!body.destinationAddress) {
      throw new HttpException(
        { success: false, message: 'Destination address is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (!body.pickupAddress && !body.pickupPostcode && !body.pickupLat) {
      throw new HttpException(
        {
          success: false,
          message: 'Please provide a pickup location (address, postcode, or GPS)',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.taxiBookingsService.createRideRequest({
      passengerId,
      ...body,
    });

    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * GET /taxi-bookings/available
   * Drivers see all active ride requests (broadcast list)
   */
  @Get('available')
  async getAvailableRequests(
    @Req() req: any,
    @Query('postcode') postcode?: string,
  ) {
    const driverId = req.user._id || req.user.id;
    return this.taxiBookingsService.getAvailableRequests(driverId, postcode);
  }

  /**
   * GET /taxi-bookings/driver/active
   * Drivers check if they have any ongoing rides
   */
  @Get('driver/active')
  async getDriverActiveRequests(@Req() req: any) {
    const driverId = req.user._id || req.user.id;
    return this.taxiBookingsService.getDriverActiveRequests(driverId);
  }

  /**
   * POST /taxi-bookings/:id/accept
   * Driver accepts a ride request with vehicle details + ETA
   */
  @Post(':id/accept')
  async acceptRequest(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      vehicleMake?: string;
      vehicleModel?: string;
      vehicleColor?: string;
      plateNumber?: string;
      etaMinutes: number;
    },
  ) {
    const driverId = req.user._id || req.user.id;

    if (!body.etaMinutes) {
      throw new HttpException(
        { success: false, message: 'Please provide your estimated arrival time' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.taxiBookingsService.acceptRideRequest(
      id,
      driverId,
      body,
    );

    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * PATCH /taxi-bookings/:id/status
   * Driver updates the status of a ride request (e.g. arrived, in_progress, completed)
   */
  @Patch(':id/status')
  async updateStatus(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { status: string; rideId?: string },
  ) {
    if (!body.status) {
      throw new HttpException(
        { success: false, message: 'Status is required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const callerId = (req.user._id || req.user.id)?.toString();

    const booking = await this.taxiBookingsService.getRideRequest(id);
    if (!booking.success) {
      throw new HttpException(booking, HttpStatus.NOT_FOUND);
    }

    const acceptedDriverId = (booking.data as any)?.acceptedDriver?._id?.toString()
      || (booking.data as any)?.acceptedDriver?.toString();

    if (callerId !== acceptedDriverId && req.user.role !== 'admin') {
      throw new HttpException(
        { success: false, message: 'Only the accepted driver can update ride status' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.taxiBookingsService.updateRequestStatus(
      id,
      body.status,
      body.rideId,
    );

    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * PATCH /taxi-bookings/:id/cancel
   * Passenger cancels their ride request
   */
  @Patch(':id/cancel')
  async cancelRequest(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const passengerId = req.user._id || req.user.id;
    const result = await this.taxiBookingsService.cancelRideRequest(id, passengerId);

    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * GET /taxi-bookings/my-requests
   * Passenger's ride request history
   */
  @Get('my-requests')
  async getMyRequests(@Req() req: any) {
    const passengerId = req.user._id || req.user.id;
    return this.taxiBookingsService.getMyRideRequests(passengerId);
  }

  /**
   * GET /taxi-bookings/admin/active
   * Admin: get all active ride requests for the dashboard
   */
  @Get('admin/active')
  async getAdminActiveRequests() {
    return this.taxiBookingsService.getAllActiveRequests();
  }

  /**
   * GET /taxi-bookings/:id/receipt
   * Trip receipt for a completed taxi request
   */
  @Get(':id/receipt')
  async getRequestReceipt(@Param('id') id: string, @Req() req: any) {
    const userId = req.user._id || req.user.id;
    const result = await this.ridesService.getReceiptByTaxiRequest(id, userId);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * GET /taxi-bookings/:id
   * Get ride request details (must be LAST — catches all unmatched paths)
   */
  @Get(':id')
  async getRequest(@Req() req: any, @Param('id') id: string) {
    const result = await this.taxiBookingsService.getRideRequest(id);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.NOT_FOUND);
    }

    const callerId = (req.user._id || req.user.id)?.toString();
    const booking = result.data as any;
    const passengerId = booking.passenger?._id?.toString() || booking.passenger?.toString();
    const acceptedDriverId = booking.acceptedDriver?._id?.toString() || booking.acceptedDriver?.toString();

    if (callerId !== passengerId && callerId !== acceptedDriverId && req.user.role !== 'admin') {
      throw new HttpException(
        { success: false, message: 'You do not have access to this booking' },
        HttpStatus.FORBIDDEN,
      );
    }

    return result;
  }
}
