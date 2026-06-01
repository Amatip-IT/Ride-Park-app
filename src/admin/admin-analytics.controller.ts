import {
  Controller,
  Get,
  Query,
  HttpException,
  HttpStatus,
  UseGuards,
} from '@nestjs/common';
import { AdminAnalyticsService } from './admin-analytics.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { AdminGuard } from 'src/guards/admin.guard';

type Period = 'week' | 'month' | 'year' | 'all';

@Controller('admin/analytics')
@UseGuards(AuthGuard, AdminGuard)
export class AdminAnalyticsController {
  constructor(private readonly analyticsService: AdminAnalyticsService) {}

  private parsePeriod(period?: string): Period {
    if (period && ['week', 'month', 'year', 'all'].includes(period)) {
      return period as Period;
    }
    return 'month';
  }

  @Get('dashboard')
  async getDashboard(@Query('period') period?: string) {
    const result = await this.analyticsService.getDashboardSummary(this.parsePeriod(period));
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get('revenue')
  async getRevenue(@Query('period') period?: string) {
    const result = await this.analyticsService.getRevenueAnalytics(this.parsePeriod(period));
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get('verifications')
  async getVerifications(@Query('period') period?: string) {
    const result = await this.analyticsService.getVerificationAnalytics(this.parsePeriod(period));
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get('users')
  async getUsers(@Query('period') period?: string) {
    const result = await this.analyticsService.getUserAnalytics(this.parsePeriod(period));
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }

  @Get('queue-health')
  async getQueueHealth() {
    const result = await this.analyticsService.getQueueHealth();
    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }
}
