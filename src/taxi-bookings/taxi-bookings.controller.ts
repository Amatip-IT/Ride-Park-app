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
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('taxi-bookings')
@UseGuards(AuthGuard)
export class TaxiBookingsController {
  constructor(private readonly taxiBookingsService: TaxiBookingsService) {}

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
   * GET /taxi-bookings/:id
   * Get ride request details
   */
  @Get(':id')
  async getRequest(@Param('id') id: string) {
    const result = await this.taxiBookingsService.getRideRequest(id);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.NOT_FOUND);
    }
    return result;
  }

  /**
   * GET /taxi-bookings/admin/active
   * Admin: get all active ride requests for the dashboard
   */
  @Get('admin/active')
  async getAdminActiveRequests() {
    return this.taxiBookingsService.getAllActiveRequests();
  }
}
