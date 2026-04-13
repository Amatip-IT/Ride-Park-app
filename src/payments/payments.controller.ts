import { Controller, Post, Get, UseGuards, Req } from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { AuthGuard } from 'src/guards/auth.guard';

@Controller('payments')
@UseGuards(AuthGuard)
export class PaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  @Post('setup-intent')
  async createSetupIntent(@Req() req: any) {
    const userId = req.user._id || req.user.id;
    const data = await this.paymentsService.createSetupIntent(userId);
    return { success: true, data };
  }

  @Get('methods')
  async getPaymentMethods(@Req() req: any) {
    const userId = req.user._id || req.user.id;
    const methods = await this.paymentsService.getPaymentMethods(userId);
    return { success: true, data: methods };
  }
}
