import {
  Controller,
  Get,
  Param,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AdminService } from './admin.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';

@Controller('admin/users')
@UseGuards(AuthGuard, AdminGuard)
export class AdminUsersController {
  constructor(private readonly adminService: AdminService) {}

  /**
   * GET /admin/users/:id/dossier
   * Aggregated profile, bookings, rides, wallet, and activity for one user.
   */
  @Get(':id/dossier')
  async getUserDossier(@Param('id') id: string) {
    const result = await this.adminService.getUserDossier(id);
    if (!result.success) {
      throw new HttpException(
        result,
        result.message === 'User not found'
          ? HttpStatus.NOT_FOUND
          : HttpStatus.BAD_REQUEST,
      );
    }
    return result;
  }
}
