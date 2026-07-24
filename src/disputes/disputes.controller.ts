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
import { FileDisputeDto } from './dto/dispute.dto';
import { RateLimit } from 'src/common/rate-limit.decorator';

@Controller('disputes')
@UseGuards(AuthGuard)
export class DisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  @Post()
  @RateLimit({ limit: 5, windowMs: 60 * 60_000 })
  async fileDispute(@Req() req: any, @Body() body: FileDisputeDto) {
    const userId = (req.user?._id || req.user?.id)?.toString();
    const result = await this.disputesService.fileDispute(userId, {
      category: body.category || 'other',
      description: body.description,
      complaintAbout: body.complaintAbout,
      evidenceUrls: body.evidenceUrls,
      relatedServiceType: body.relatedServiceType,
      relatedServiceId: body.relatedServiceId,
      metadata: body.metadata,
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
