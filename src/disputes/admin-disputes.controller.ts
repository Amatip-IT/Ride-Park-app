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
  async investigateDispute(
    @Param('id') id: string,
    @Body('adminNotes') adminNotes: string,
    @Req() req: any,
  ) {
    const audit = this.auditContext(req);
    const result = await this.disputesService.investigateDispute(
      id,
      audit.adminId,
      adminNotes,
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }

  @Post(':id/resolve')
  async resolveDispute(
    @Param('id') id: string,
    @Body('resolution') resolution: string,
    @Body('notes') notes: string,
    @Body('adminNotes') adminNotes: string,
    @Body('refundAmount') refundAmount: number,
    @Body('suspendReason') suspendReason: string,
    @Body('providerType') providerType: string,
    @Body('recordId') recordId: string,
    @Req() req: any,
  ) {
    if (!resolution) {
      throw new HttpException({ success: false, message: 'resolution is required' }, HttpStatus.BAD_REQUEST);
    }

    const audit = this.auditContext(req);
    const result = await this.disputesService.resolveDispute(
      id,
      audit.adminId,
      {
        resolution,
        notes,
        adminNotes,
        refundAmount,
        suspendReason,
        providerType,
        recordId,
      },
      audit,
    );
    if (!result.success) {
      throw new HttpException(result, HttpStatus.BAD_REQUEST);
    }
    return result;
  }
}
