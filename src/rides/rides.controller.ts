import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { RidesService } from './rides.service';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('rides')
export class RidesController {
  constructor(private readonly ridesService: RidesService) {}

  /**
   * POST /rides/estimate
   * Get a price estimate for a ride
   */
  @Post('estimate')
  async getEstimate(
    @Body() body: {
      serviceType: 'driver' | 'taxi';
      distanceMiles: number;
      durationMinutes: number;
    },
  ) {
    if (!body.serviceType || !body.distanceMiles) {
      throw new HttpException(
        { success: false, message: 'serviceType and distanceMiles are required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    return this.ridesService.getEstimate(
      body.serviceType,
      body.distanceMiles,
      body.durationMinutes || 0,
    );
  }

  /**
   * POST /rides/start
   * Start a ride (creates a ride record, sets driver to busy)
   */
  @Post('start')
  @UseGuards(AuthGuard)
  async startRide(
    @Req() req: any,
    @Body() body: {
      passengerId?: string;
      driverId: string;
      serviceType: 'driver' | 'taxi';
      bookingId?: string;
      pickup?: { address?: string; lat?: number; lng?: number };
      dropoff?: { address?: string; lat?: number; lng?: number };
    },
  ) {
    if (!body.passengerId) {
      throw new HttpException(
        { success: false, message: 'passengerId is required to start a ride' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const callerId = (req.user._id || req.user.id)?.toString();
    if (callerId !== body.passengerId && callerId !== body.driverId) {
      throw new HttpException(
        { success: false, message: 'You can only start rides you are part of' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.ridesService.createRide({
      passengerId: body.passengerId,
      driverId: body.driverId,
      serviceType: body.serviceType,
      bookingId: body.bookingId,
      pickup: body.pickup,
      dropoff: body.dropoff,
    });

    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * POST /rides/:id/complete
   * Complete a ride with final distance and duration
   */
  @Post(':id/complete')
  @UseGuards(AuthGuard)
  async completeRide(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: {
      distanceMiles: number;
      durationMinutes: number;
    },
  ) {
    const callerId = (req.user._id || req.user.id)?.toString();

    const rideResult = await this.ridesService.getRide(id);
    if (!rideResult.success) {
      throw new HttpException(rideResult, HttpStatus.NOT_FOUND);
    }

    const ride = rideResult.data as any;
    const driverId = ride.driver?._id?.toString() || ride.driver?.toString();
    if (callerId !== driverId) {
      throw new HttpException(
        { success: false, message: 'Only the driver can complete this ride' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.ridesService.completeRide(
      id,
      body.distanceMiles,
      body.durationMinutes,
    );

    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * POST /rides/:id/confirm-arrival
   * Passenger confirms they are at the destination
   */
  @Post(':id/confirm-arrival')
  @UseGuards(AuthGuard)
  async confirmArrival(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user._id || req.user.id)?.toString();
    const result = await this.ridesService.confirmPassengerAtDestination(id, userId);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * POST /rides/:id/pay
   * Passenger explicitly confirms payment (no auto-charge)
   */
  @Post(':id/pay')
  @UseGuards(AuthGuard)
  async payRide(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user._id || req.user.id)?.toString();
    const result = await this.ridesService.payRide(id, userId);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * POST /rides/:id/retry-payment
   * @deprecated Use POST /rides/:id/pay after confirming arrival
   */
  @Post(':id/retry-payment')
  @UseGuards(AuthGuard)
  async retryPayment(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user._id || req.user.id)?.toString();
    const result = await this.ridesService.payRide(id, userId);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * GET /rides/:id/receipt
   * Trip receipt (passenger or driver on that ride)
   */
  @Get(':id/receipt')
  @UseGuards(AuthGuard)
  async getRideReceipt(@Param('id') id: string, @Req() req: any) {
    const userId = req.user._id || req.user.id;
    const result = await this.ridesService.getRideReceipt(id, userId);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * GET /rides/:id
   * Get ride details
   */
  @Get(':id')
  @UseGuards(AuthGuard)
  async getRide(@Req() req: any, @Param('id') id: string) {
    const result = await this.ridesService.getRide(id);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.NOT_FOUND);
    }

    const callerId = (req.user._id || req.user.id)?.toString();
    const ride = result.data as any;
    const passengerId = ride.passenger?._id?.toString() || ride.passenger?.toString();
    const driverId = ride.driver?._id?.toString() || ride.driver?.toString();

    if (callerId !== passengerId && callerId !== driverId && req.user.role !== 'admin') {
      throw new HttpException(
        { success: false, message: 'You do not have access to this ride' },
        HttpStatus.FORBIDDEN,
      );
    }

    return result;
  }
}
