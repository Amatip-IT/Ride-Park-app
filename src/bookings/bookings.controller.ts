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
import { Types } from 'mongoose';
import { BookingsService } from './bookings.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';
import { RateLimit } from 'src/common/rate-limit.decorator';
import { getRequestUserId } from 'src/common/request.util';
import { ObjectIdPipe } from 'src/common/object-id.pipe';
import { validateObjectId } from 'src/common/object-id.utils';

@Controller('bookings')
@UseGuards(AuthGuard)
export class BookingsController {
  constructor(private readonly bookingsService: BookingsService) {}

  @Post()
  async createBooking(
    @Req() req: any,
    @Body()
    body: {
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

    if (body.serviceType === 'parking' && !body.serviceId) {
      throw new HttpException(
        { message: 'serviceId is required for parking bookings' },
        HttpStatus.BAD_REQUEST,
      );
    }

    if (body.serviceId) {
      validateObjectId(body.serviceId);
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

  @Get('my')
  async getMyBookings(@Req() req: any, @Query('status') status?: string) {
    return this.bookingsService.getMyBookings(getRequestUserId(req), status);
  }

  @Get('provider')
  async getProviderRequests(@Req() req: any, @Query('status') status?: string) {
    return this.bookingsService.getProviderRequests(
      getRequestUserId(req),
      status,
    );
  }

  @Patch(':id/respond')
  async respondToRequest(
    @Req() req: any,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
    @Body() body: { action: 'accept' | 'reject'; responseMessage?: string },
  ) {
    if (!body.action || !['accept', 'reject'].includes(body.action)) {
      throw new HttpException(
        { message: 'Action must be "accept" or "reject"' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.bookingsService.respondToRequest(
      id.toString(),
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

  @Patch(':id/complete')
  async completeBooking(
    @Req() req: any,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ) {
    const result = await this.bookingsService.completeBooking(
      id.toString(),
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

  @Post(':id/confirm-arrival')
  async confirmArrival(
    @Req() req: any,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ) {
    const result = await this.bookingsService.confirmBookingArrival(
      id.toString(),
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

  @Post(':id/pay')
  @RateLimit({ limit: 5, windowMs: 10 * 60_000 })
  async payBooking(
    @Req() req: any,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ) {
    const result = await this.bookingsService.payBooking(
      id.toString(),
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

  @Get(':id/receipt')
  async getBookingReceipt(
    @Req() req: any,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ) {
    const result = await this.bookingsService.getBookingReceipt(
      id.toString(),
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

  @Patch(':id/cancel')
  async cancelBooking(
    @Req() req: any,
    @Param('id', ObjectIdPipe) id: Types.ObjectId,
  ) {
    const result = await this.bookingsService.cancelBooking(
      id.toString(),
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

  @Post('auto-complete')
  @UseGuards(AdminGuard)
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
