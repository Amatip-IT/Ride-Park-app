import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  UseInterceptors,
  UploadedFiles,
  Query,
  BadRequestException,
} from '@nestjs/common';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { TaxiVerificationService } from './verification.service';
import {
  ApplyDriverDto,
  AdminDriverDecisionDto,
} from '../dto/apply-driver.dto';
import { AuthGuard } from '../../guards/auth.guard';
import { IdentityVerifiedGuard } from '../../guards/identity-verified.guard';
import { AdminGuard } from '../../guards/admin.guard';

interface AuthenticatedRequest {
  user: {
    _id: {
      toString(): string;
    };
  };
}

@Controller('verification/taxi')
export class TaxiVerificationController {
  constructor(
    private readonly taxiVerificationService: TaxiVerificationService,
  ) {}

  /**
   * Check vehicle details (Step 1 - before full application)
   * GET /verification/driver/check-vehicle?registration=AB12CDE
   */
  @UseGuards(AuthGuard, IdentityVerifiedGuard)
  @Get('check-vehicle')
  checkVehicle(
    @Request() req: AuthenticatedRequest,
    @Query('registration') registration: string,
  ) {
    if (!registration) {
      throw new BadRequestException('Registration number is required');
    }

    const userId = req.user._id.toString();
    return this.taxiVerificationService.checkVehicleDetails(
      userId,
      registration,
    );
  }

  /**
   * Submit driver application (Step 2 - with confirmations and files)
   * POST /verification/driver/apply
   *
   * Files:
   * - vehiclePhotos[]: 4 images (front, side, rear, interior)
   * - insuranceCertificate: 1 PDF
   */
  @UseGuards(AuthGuard, IdentityVerifiedGuard)
  @Post('apply')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'vehiclePhotos', maxCount: 4 },
      { name: 'insuranceCertificate', maxCount: 1 },
    ]),
  )
  applyTaxi(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: {
      registrationNumber: string;
      vehicleColour: string;
      vehicleMake: string;
      vehicleYear: string;
      hasValidInsurance: string;
      isRoadworthy: string;
      hasPermission: string;
    },
    @UploadedFiles()
    files: {
      vehiclePhotos?: Express.Multer.File[];
      insuranceCertificate?: Express.Multer.File[];
    },
  ) {
    const userId = req.user._id.toString();

    if (!files.vehiclePhotos || !files.insuranceCertificate) {
      throw new BadRequestException(
        'Please upload vehicle photos and insurance certificate',
      );
    }

    const applyDriverDto: ApplyDriverDto = {
      registrationNumber: body.registrationNumber,
      vehicleColour: body.vehicleColour,
      vehicleMake: body.vehicleMake,
      vehicleYear: parseInt(body.vehicleYear, 10),
      hasValidInsurance: body.hasValidInsurance === 'true',
      isRoadworthy: body.isRoadworthy === 'true',
      hasPermission: body.hasPermission === 'true',
    };

    return this.taxiVerificationService.applyDriver(
      userId,
      applyDriverDto,
      files.vehiclePhotos,
      files.insuranceCertificate[0],
    );
  }

  /**
   * Check driver application status
   * GET /verification/driver/status
   */
  @UseGuards(AuthGuard)
  @Get('status')
  checkStatus(@Request() req: AuthenticatedRequest) {
    const userId = req.user._id.toString();
    return this.taxiVerificationService.checkDriverStatus(userId);
  }

  /**
   * Admin: Approve driver application
   * POST /verification/driver/admin/approve-reject
   */
  @UseGuards(AuthGuard, AdminGuard)
  @Post('admin/approve-reject')
  approveDriver(
    @Request() req: AuthenticatedRequest,
    @Body() decision: AdminDriverDecisionDto,
  ) {
    const adminId = req.user._id.toString();

    if (decision.decision === 'approve') {
      return this.taxiVerificationService.approveDriver(
        decision.userId,
        adminId,
      );
    } else {
      if (!decision.reason) {
        throw new BadRequestException(
          'Rejection reason is required when rejecting',
        );
      }
      return this.taxiVerificationService.rejectDriver(
        decision.userId,
        adminId,
        decision.reason,
      );
    }
  }
}
