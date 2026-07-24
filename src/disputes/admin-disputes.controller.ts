import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Query,
  Req,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { DisputesService } from './disputes.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';
import { AdminAuditContext } from 'src/admin/admin-audit.types';
import { InvestigateDisputeDto, ResolveDisputeDto } from './dto/dispute.dto';
import { RateLimit } from 'src/common/rate-limit.decorator';

@Controller('admin/disputes')
@UseGuards(AuthGuard, AdminGuard)
export class AdminDisputesController {
  constructor(private readonly disputesService: DisputesService) {}

  private auditContext(req: any): AdminAuditContext {
    return {
      adminId: (req.user?._id || req.user?.id)?.toString(),
      ipAddress: req.ip,
    };
  }

  @Get()
  async getDisputes(
    @Query('status') status?: string,
    @Query('category') category?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
  ) {
    const result = await this.disputesService.getAdminDisputes({
      status,
      category,
      page: page ? parseInt(page, 10) : undefined,
      limit: limit ? parseInt(limit, 10) : undefined,
    });
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get(':id')
  async getDispute(@Param('id') id: string, @Req() req: any) {
    const adminId = (req.user?._id || req.user?.id)?.toString();
    const result = await this.disputesService.getDisputeById(id, adminId, true);
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post(':id/investigate')
  @RateLimit({ limit: 30, windowMs: 60_000 })
  async investigateDispute(
    @Param('id') id: string,
    @Body() body: InvestigateDisputeDto,
    @Req() req: any,
  ) {
    const audit = this.auditContext(req);
    const result = await this.disputesService.investigateDispute(
      id,
      audit.adminId,
      body.adminNotes,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post(':id/resolve')
  @RateLimit({ limit: 20, windowMs: 60_000 })
  async resolveDispute(
    @Param('id') id: string,
    @Body() body: ResolveDisputeDto,
    @Req() req: any,
  ) {
    const audit = this.auditContext(req);
    const result = await this.disputesService.resolveDispute(
      id,
      audit.adminId,
      {
        resolution: body.resolution,
        notes: body.notes,
        adminNotes: body.adminNotes,
        refundAmount: body.refundAmount,
        suspendReason: body.suspendReason,
        providerType: body.providerType,
        recordId: body.recordId,
      },
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}
