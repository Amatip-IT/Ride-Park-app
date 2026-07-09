import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  Req,
  UseGuards,
  HttpException,
  HttpStatus,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProviderService } from './provider.service';
import { FileUploadService } from '../verification/services/file/file-upload.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';
import { ProviderGuard } from 'src/guards/provider.guard';

@Controller('provider')
@UseGuards(AuthGuard)
export class ProviderController {
  constructor(
    private readonly providerService: ProviderService,
    private readonly fileUploadService: FileUploadService,
  ) {}

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
   * Wallet-backed earnings for providers (net of platform fees)
   */
  @Get('earnings')
  @UseGuards(ProviderGuard)
  async getEarnings(@Req() req: any) {
    const user = req.user;
    return this.providerService.getEarnings(user._id || user.id);
  }

  /**
   * GET /provider/my-spaces
   * Get all approved parking spaces owned by this provider with stats
   */
  @Get('my-spaces')
  async getMySpaces(@Req() req: any) {
    const user = req.user;
    if (user.role !== 'parking_provider') {
      throw new HttpException(
        { message: 'Only parking providers can manage spaces' },
        HttpStatus.FORBIDDEN,
      );
    }
    return this.providerService.getMySpaces(user._id || user.id);
  }

  /**
   * PATCH /provider/spaces/:id
   * Update a parking space's details (pricing, description, capacity, photos, etc.)
   */
  @Patch('spaces/:id')
  async updateSpace(
    @Req() req: any,
    @Param('id') spaceId: string,
    @Body() body: Record<string, any>,
  ) {
    const user = req.user;
    if (user.role !== 'parking_provider') {
      throw new HttpException(
        { message: 'Only parking providers can update spaces' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.updateSpace(
      user._id || user.id,
      spaceId,
      body,
    );

    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * PATCH /provider/spaces/:id/toggle-availability
   * Toggle a parking space on/off (manually pause/resume listings)
   */
  @Patch('spaces/:id/toggle-availability')
  async toggleSpaceAvailability(
    @Req() req: any,
    @Param('id') spaceId: string,
  ) {
    const user = req.user;
    if (user.role !== 'parking_provider') {
      throw new HttpException(
        { message: 'Only parking providers can toggle space availability' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.toggleSpaceAvailability(
      user._id || user.id,
      spaceId,
    );

    if (!result.success) {
      throw new HttpException({ message: result.message }, HttpStatus.BAD_REQUEST);
    }
    return result;
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
   * Submit a single driver document with its dedicated field name
   */
  @Post('submit-driver-verification')
  async submitDriverVerification(
    @Req() req: any,
    @Body() body: {
      docField: string;
      docUrl: string;
    },
  ) {
    const user = req.user;
    if (user.role !== 'driver') {
      throw new HttpException(
        { message: 'Only drivers can submit driver verification' },
        HttpStatus.FORBIDDEN,
      );
    }

    if (!body.docField || !body.docUrl) {
      throw new HttpException(
        { message: 'docField and docUrl are required' },
        HttpStatus.BAD_REQUEST,
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
   * Submit a single taxi driver document with its dedicated field name
   */
  @Post('submit-taxi-verification')
  async submitTaxiVerification(
    @Req() req: any,
    @Body() body: {
      docField: string;
      docUrl: string;
      plateNumber?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      vehicleYear?: string;
    },
  ) {
    const user = req.user;
    if (user.role !== 'taxi_driver') {
      throw new HttpException(
        { message: 'Only taxi drivers can submit taxi verification' },
        HttpStatus.FORBIDDEN,
      );
    }

    if (!body.docField || !body.docUrl) {
      throw new HttpException(
        { message: 'docField and docUrl are required' },
        HttpStatus.BAD_REQUEST,
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
    @Body() body: { status: 'online' | 'offline'; lat?: number; lng?: number },
  ) {
    const user = req.user;
    const userId = user._id || user.id;

    if (!['driver', 'taxi_driver'].includes(user.role)) {
      throw new HttpException(
        { message: 'Only drivers and taxi drivers can toggle status' },
        HttpStatus.FORBIDDEN,
      );
    }

    const location =
      body.lat != null && body.lng != null
        ? { lat: Number(body.lat), lng: Number(body.lng) }
        : undefined;

    const result = await this.providerService.toggleAvailability(
      userId,
      user.role,
      body.status,
      location,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  /**
   * POST /provider/location
   * Update live GPS coordinates for nearby matching
   */
  @Post('location')
  async updateLocation(
    @Req() req: any,
    @Body() body: { lat: number; lng: number },
  ) {
    const user = req.user;
    const userId = user._id || user.id;

    if (!['driver', 'taxi_driver'].includes(user.role)) {
      throw new HttpException(
        { message: 'Only drivers and taxi drivers can update location' },
        HttpStatus.FORBIDDEN,
      );
    }

    if (body.lat == null || body.lng == null) {
      throw new HttpException(
        { message: 'lat and lng are required' },
        HttpStatus.BAD_REQUEST,
      );
    }

    const result = await this.providerService.updateDriverLocation(
      userId,
      user.role,
      { lat: Number(body.lat), lng: Number(body.lng) },
    );
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

  /**
   * POST /provider/upload-document
   * Upload a document to S3
   */
  @Post('upload-document')
  @UseInterceptors(FileInterceptor('file'))
  async uploadDocument(
    @Req() req: any,
    @UploadedFile() file: any,
  ) {
    if (!file) {
      throw new HttpException({ message: 'No file provided' }, HttpStatus.BAD_REQUEST);
    }

    const user = req.user;
    const userId = user._id || user.id;
    
    // Validate file type (allow images and pdfs)
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!this.fileUploadService.validateFileType(file, allowedTypes)) {
      throw new HttpException({ message: 'Invalid file type. Only JPEG, PNG, WEBP and PDF are allowed.' }, HttpStatus.BAD_REQUEST);
    }

    // Validate size (e.g. 10MB)
    if (!this.fileUploadService.validateFileSize(file, 10)) {
      throw new HttpException({ message: 'File too large. Maximum size is 10MB.' }, HttpStatus.BAD_REQUEST);
    }

    try {
      const folder = `provider-documents/${userId}`;
      const url = await this.fileUploadService.uploadFile(file, folder);
      return { success: true, url, message: 'Document uploaded successfully' };
    } catch (error: any) {
      throw new HttpException({ message: `S3 Error: ${error.message}` }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
  }

  /**
   * GET /provider/document-url
   * Returns a time-limited presigned S3 URL so admins can view private documents.
   */
  @Get('document-url')
  @UseGuards(AuthGuard, AdminGuard)
  async getDocumentUrl(@Query('url') url: string) {
    if (!url) {
      throw new HttpException(
        { message: 'url query parameter is required' },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const presignedUrl = await this.fileUploadService.getPresignedUrl(url);
      return { success: true, url: presignedUrl };
    } catch (error: any) {
      throw new HttpException(
        { message: `Failed to generate presigned URL: ${error.message}` },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
