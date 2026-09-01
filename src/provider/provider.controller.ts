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
import { Types } from 'mongoose';
import { FileInterceptor } from '@nestjs/platform-express';
import { ProviderService } from './provider.service';
import { FileUploadService } from '../verification/services/file/file-upload.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';
import { ProviderGuard } from 'src/guards/provider.guard';
import { ObjectIdPipe } from 'src/common/object-id.pipe';
import { validateObjectId } from 'src/common/object-id.utils';

@Controller('provider')
@UseGuards(AuthGuard)
export class ProviderController {
  constructor(
    private readonly providerService: ProviderService,
    private readonly fileUploadService: FileUploadService,
  ) {}

  @Get('verification-status')
  async getVerificationStatus(@Req() req: any) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
    return this.providerService.getVerificationStatus(
      userId.toString(),
      user.role,
    );
  }

  @Get('earnings')
  @UseGuards(ProviderGuard)
  async getEarnings(@Req() req: any) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
    return this.providerService.getEarnings(userId.toString());
  }

  @Get('my-spaces')
  async getMySpaces(@Req() req: any) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
    if (user.role !== 'parking_provider') {
      throw new HttpException(
        { message: 'Only parking providers can manage spaces' },
        HttpStatus.FORBIDDEN,
      );
    }
    return this.providerService.getMySpaces(userId.toString());
  }

  @Patch('spaces/:id')
  async updateSpace(
    @Req() req: any,
    @Param('id', ObjectIdPipe) spaceId: Types.ObjectId,
    @Body() body: Record<string, any>,
  ) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
    if (user.role !== 'parking_provider') {
      throw new HttpException(
        { message: 'Only parking providers can update spaces' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.updateSpace(
      userId.toString(),
      spaceId.toString(),
      body,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Patch('spaces/:id/toggle-availability')
  async toggleSpaceAvailability(
    @Req() req: any,
    @Param('id', ObjectIdPipe) spaceId: Types.ObjectId,
  ) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
    if (user.role !== 'parking_provider') {
      throw new HttpException(
        { message: 'Only parking providers can toggle space availability' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.toggleSpaceAvailability(
      userId.toString(),
      spaceId.toString(),
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Post('submit-parking-verification')
  async submitParkingVerification(
    @Req() req: any,
    @Body() body: Record<string, any>,
  ) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
    if (user.role !== 'parking_provider') {
      throw new HttpException(
        { message: 'Only parking providers can submit parking verification' },
        HttpStatus.FORBIDDEN,
      );
    }

    const result = await this.providerService.submitParkingVerification(
      userId.toString(),
      body,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Post('submit-driver-verification')
  async submitDriverVerification(
    @Req() req: any,
    @Body()
    body: {
      docField: string;
      docUrl: string;
    },
  ) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
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
      userId.toString(),
      body,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Post('submit-taxi-verification')
  async submitTaxiVerification(
    @Req() req: any,
    @Body()
    body: {
      docField: string;
      docUrl: string;
      plateNumber?: string;
      vehicleMake?: string;
      vehicleModel?: string;
      vehicleYear?: string;
    },
  ) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
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
      userId.toString(),
      body,
    );

    if (!result.success) {
      throw new HttpException(
        { message: result.message },
        HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }

  @Post('toggle-status')
  async toggleStatus(
    @Req() req: any,
    @Body() body: { status: 'online' | 'offline'; lat?: number; lng?: number },
  ) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);

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
      userId.toString(),
      user.role,
      body.status,
      location,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post('location')
  async updateLocation(
    @Req() req: any,
    @Body() body: { lat: number; lng: number },
  ) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);

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
      userId.toString(),
      user.role,
      { lat: Number(body.lat), lng: Number(body.lng) },
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Get('my-driver-number')
  async getMyDriverNumber(@Req() req: any) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);
    return this.providerService.getDriverNumber(userId.toString(), user.role);
  }

  // ============================================================
  // UPLOAD DOCUMENT - Now saves to database with documentType
  // ============================================================
  @Post('upload-document')
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }),
  )
  async uploadDocument(@Req() req: any, @UploadedFile() file: any) {
    // 1. VALIDATE: File is required
    if (!file) {
      throw new HttpException(
        {
          success: false,
          message: 'No file provided. Please upload a document file.'
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 2. VALIDATE: documentType is required
    const documentType = req.body?.documentType;
    if (!documentType) {
      throw new HttpException(
        {
          success: false,
          message: 'documentType is required. Valid types: vat_certificate, driver_license, insurance, vehicle_registration, id_document, proof_of_address'
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 3. VALIDATE: documentType is valid
    const validDocumentTypes = [
      'vat_certificate',
      'driver_license',
      'insurance',
      'vehicle_registration',
      'id_document',
      'proof_of_address',
    ];
    if (!validDocumentTypes.includes(documentType)) {
      throw new HttpException(
        {
          success: false,
          message: `Invalid documentType. Must be one of: ${validDocumentTypes.join(', ')}`
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 4. Get user info
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);

    // 5. VALIDATE: File type is allowed
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
    ];
    if (!this.fileUploadService.validateFileType(file, allowedTypes)) {
      throw new HttpException(
        {
          success: false,
          message: 'Invalid file type. Only JPEG, PNG, WEBP and PDF are allowed.',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 6. VALIDATE: File size is within limit
    if (!this.fileUploadService.validateFileSize(file, 10)) {
      throw new HttpException(
        {
          success: false,
          message: 'File too large. Maximum size is 10MB.'
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    // 7. Upload the file to S3
    try {
      const folder = `provider-documents/${userId}/${documentType}`;
      const url = await this.fileUploadService.uploadFile(file, folder);

      // 8. SAVE TO DATABASE - NEW!
      const savedDocument = await this.providerService.saveProviderDocument(
        userId.toString(),
        documentType,
        url,
        file.originalname || 'document',
        file.size,
        file.mimetype || 'application/octet-stream'
      );

      return {
        success: true,
        url,
        documentType,
        document: savedDocument,
        message: 'Document uploaded successfully'
      };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: `Upload failed: ${error.message}`
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // ============================================================
  // NEW: Get all documents for the current user
  // ============================================================
  @Get('documents')
  async getDocuments(@Req() req: any) {
    const user = req.user;
    const userId = user._id || user.id;
    validateObjectId(userId);

    const documents = await this.providerService.getUserDocuments(userId.toString());
    return {
      success: true,
      data: documents,
      message: `Found ${documents.length} document(s)`
    };
  }

  @Get('document-url')
  @UseGuards(AuthGuard, AdminGuard)
  async getDocumentUrl(@Query('url') url: string) {
    if (!url) {
      throw new HttpException(
        {
          success: false,
          message: 'url query parameter is required'
        },
        HttpStatus.BAD_REQUEST,
      );
    }
    try {
      const presignedUrl = await this.fileUploadService.getPresignedUrl(url);
      return { success: true, url: presignedUrl };
    } catch (error: any) {
      throw new HttpException(
        {
          success: false,
          message: `Failed to generate presigned URL: ${error.message}`
        },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
