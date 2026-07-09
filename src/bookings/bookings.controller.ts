import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
  Req,
} from '@nestjs/common';
import { BookingsService } from './bookings.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { getRequestUserId } from 'src/common/request.util';

@Controller('bookings')
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  /**
   * POST /bookings
   * Create a new booking request (consumer → provider)
   */
  @Post()
  async createBooking(
    @Req() req: any,
    @Body() body: {
      serviceType: 'parking' | 'driver' | 'taxi';
      serviceId: string;
      message?: string;
      startDate?: string;
      endDate?: string;
    },
  ) {
    if (!body.serviceType) {
      throw new HttpException(
        { message: 'serviceType is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    
    // Broadcast requests might omit serviceId
    if (body.serviceType === 'parking' && !body.serviceId) {
      throw new HttpException(
        { message: 'serviceId is required for parking bookings' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.bookingsService.createBookingRequest({
      requesterId: getRequestUserId(req),
      ...body,
    });

    if (!result.success) {
      throw new HttpException(
        { success: false, message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  /**
   * GET /bookings/my
   * Get current user's bookings (consumer view)
   */
  @Get('my')
  async getMyBookings(
    @Req() req: any,
    @Query('status') status?: string,
  ) {
    return this.bookingsService.getMyBookings(
      getRequestUserId(req),
      status,
    );
  }

  /**
   * GET /bookings/provider
   * Get incoming requests for a provider (provider dashboard)
   */
  @Get('provider')
  async getProviderRequests(
    @Req() req: any,
    @Query('status') status?: string,
  ) {
    return this.bookingsService.getProviderRequests(
      getRequestUserId(req),
      status,
    );
  }

  /**
   * PATCH /bookings/:id/respond
   * Provider accepts or rejects a booking request
   */
  @Patch(':id/respond')
  async respondToRequest(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { action: 'accept' | 'reject'; responseMessage?: string },
  ) {
    if (!body.action || !['accept', 'reject'].includes(body.action)) {
      throw new HttpException(
        { message: 'Action must be "accept" or "reject"' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.bookingsService.respondToRequest(
      id,
      getRequestUserId(req),
      body.action,
      body.responseMessage,
    );

    if (!result.success) {
      throw new HttpException(
        { success: false, message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  /**
   * PATCH /bookings/:id/complete
   * Provider marks a booking as completed — frees the parking spot
   */
  @Patch(':id/complete')
  async completeBooking(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const result = await this.bookingsService.completeBooking(
      id,
      getRequestUserId(req),
    );

    if (!result.success) {
      throw new HttpException(
        { success: false, message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  /**
   * POST /bookings/:id/confirm-arrival
   * Consumer confirms they are at the service location
   */
  @Post(':id/confirm-arrival')
  async confirmArrival(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const result = await this.bookingsService.confirmBookingArrival(
      id,
      getRequestUserId(req),
    );

    if (!result.success) {
      throw new HttpException(
        { success: false, message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  /**
   * POST /bookings/:id/pay
   * Consumer confirms payment for a booking awaiting payment
   */
  @Post(':id/pay')
  async payBooking(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const result = await this.bookingsService.payBooking(
      id,
      getRequestUserId(req),
    );

    if (!result.success) {
      throw new HttpException(
        { success: false, message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  /**
   * GET /bookings/:id/receipt
   * Receipt for a completed parking or chauffeur booking
   */
  @Get(':id/receipt')
  async getBookingReceipt(@Req() req: any, @Param('id') id: string) {
    const result = await this.bookingsService.getBookingReceipt(
      id,
      getRequestUserId(req),
    );

    if (!result.success) {
      throw new HttpException(
        { success: false, message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  /**
   * PATCH /bookings/:id/cancel
   * Consumer cancels their own booking
   */
  @Patch(':id/cancel')
  async cancelBooking(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    const result = await this.bookingsService.cancelBooking(
      id,
      getRequestUserId(req),
    );

    if (!result.success) {
      throw new HttpException(
        { success: false, message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  /**
   * POST /bookings/auto-complete
   * Admin/system endpoint to auto-complete all expired bookings
   */
  @Post('auto-complete')
  async autoCompleteExpired() {
    const result = await this.bookingsService.autoCompleteExpiredBookings();
    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
    return result;
  }
}
