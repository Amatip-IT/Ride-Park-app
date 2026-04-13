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
      driverId: string;
      serviceType: 'driver' | 'taxi';
      bookingId?: string;
      pickup?: { address?: string; lat?: number; lng?: number };
      dropoff?: { address?: string; lat?: number; lng?: number };
    },
  ) {
    const passengerId = req.user._id || req.user.id;

    const result = await this.ridesService.createRide({
      passengerId,
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
    @Param('id') id: string,
    @Body() body: {
      distanceMiles: number;
      durationMinutes: number;
    },
  ) {
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
   * GET /rides/:id
   * Get ride details
   */
  @Get(':id')
  @UseGuards(AuthGuard)
  async getRide(@Param('id') id: string) {
    const result = await this.ridesService.getRide(id);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.NOT_FOUND);
    }
    return result;
  }
}
