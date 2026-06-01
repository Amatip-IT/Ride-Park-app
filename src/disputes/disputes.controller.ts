import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Req,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('disputes')
@UseGuards(AuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  async fileDispute(
    @Req() req: any,
    @Body('category') category: string,
    @Body('description') description: string,
    @Body('complaintAbout') complaintAbout?: string,
    @Body('evidenceUrls') evidenceUrls?: string[],
    @Body('relatedServiceType') relatedServiceType?: string,
    @Body('relatedServiceId') relatedServiceId?: string,
    @Body('metadata') metadata?: Record<string, unknown>,
  ) {
    const userId = (req.user?._id || req.user?.id)?.toString();
    const result = await this.disputesService.fileDispute(userId, {
      category: category || 'other',
      description,
      complaintAbout,
      evidenceUrls,
      relatedServiceType,
      relatedServiceId,
      metadata,
    });
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Get('my')
  async getMyDisputes(@Req() req: any) {
    const userId = (req.user?._id || req.user?.id)?.toString();
    const result = await this.disputesService.getMyDisputes(userId);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get(':id')
  async getDispute(@Param('id') id: string, @Req() req: any) {
    const userId = (req.user?._id || req.user?.id)?.toString();
    const result = await this.disputesService.getDisputeById(id, userId, false);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}
