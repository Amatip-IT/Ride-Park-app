import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { ProviderService } from './provider.service';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('provider')
@UseGuards(AuthGuard)
export class ProviderController {
  constructor(private readonly providerService: ProviderService) {}

  /**
   * GET /provider/verification-status
   * Get current provider's verification status
   */
  @Get('verification-status')
  async getVerificationStatus(@Req() req: any) {
    const user = req.user;
    return this.providerService.getVerificationStatus(
      user._id || user.id,
      user.role,
    );
  }

  /**
   * GET /provider/earnings
   * Get earnings history and stats for the provider
   */
  @Get('earnings')
  async getEarnings(@Req() req: any) {
    const user = req.user;
    return this.providerService.getEarnings(user._id || user.id);
  }

  /**
   * POST /provider/submit-parking-verification
   * Submit parking provider verification documents
   */
  @Post('submit-parking-verification')
  async submitParkingVerification(
    @Req() req: any,
    @Body() body: Record<string, any>,
  ) {
    const user = req.user;
    if (user.role !== 'parking_provider') {
      throw new HttpException(
        { message: 'Only parking providers can submit parking verification' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.submitParkingVerification(
      user._id || user.id,
      body,
    );

    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * POST /provider/submit-driver-verification
   * Submit driver (chauffeur) verification documents
   */
  @Post('submit-driver-verification')
  async submitDriverVerification(
    @Req() req: any,
    @Body() body: {
      driverLicenseUrl?: string;
      driverLicenseNumber?: string;
      nationalIdUrl?: string;
      proofOfAddressUrl?: string;
      proofOfAddressType?: string;
    },
  ) {
    const user = req.user;
    if (user.role !== 'driver') {
      throw new HttpException(
        { message: 'Only drivers can submit driver verification' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.submitDriverVerification(
      user._id || user.id,
      body,
    );

    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * POST /provider/submit-taxi-verification
   * Submit taxi driver verification documents
   */
  @Post('submit-taxi-verification')
  async submitTaxiVerification(
    @Req() req: any,
    @Body() body: {
      driverLicenseUrl?: string;
      driverLicenseNumber?: string;
      plateNumber?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      vehicleYear?: string;
      nationalIdUrl?: string;
      proofOfAddressUrl?: string;
      proofOfAddressType?: string;
    },
  ) {
    const user = req.user;
    if (user.role !== 'taxi_driver') {
      throw new HttpException(
        { message: 'Only taxi drivers can submit taxi verification' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.submitTaxiVerification(
      user._id || user.id,
      body,
    );

    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * POST /provider/toggle-status
   * Toggle driver/taxi online/offline status
   */
  @Post('toggle-status')
  async toggleStatus(
    @Req() req: any,
    @Body() body: { status: 'online' | 'offline' },
  ) {
    const user = req.user;
    const userId = user._id || user.id;

    if (!['driver', 'taxi_driver'].includes(user.role)) {
      throw new HttpException(
        { message: 'Only drivers and taxi drivers can toggle status' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.toggleAvailability(userId, user.role, body.status);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * GET /provider/my-driver-number
   * Get current driver's assigned number
   */
  @Get('my-driver-number')
  async getMyDriverNumber(@Req() req: any) {
    const user = req.user;
    const userId = user._id || user.id;
    return this.providerService.getDriverNumber(userId, user.role);
  }
}
