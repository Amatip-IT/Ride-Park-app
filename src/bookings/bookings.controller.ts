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
      requesterId: req.user._id || req.user.id,
      ...body,
    });

    if (!result.success) {
      throw new HttpException(
        { message: result.message },
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
      req.user._id || req.user.id,
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
      req.user._id || req.user.id,
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
      req.user._id || req.user.id,
      body.action,
      body.responseMessage,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message },
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
      req.user._id || req.user.id,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }
}
