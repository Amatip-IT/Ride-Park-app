import {
  Controller,
  Get,
  Post,
  Body,
  Req,
  UseGuards,
  Query,
} from '@nestjs/common';
import { WalletService } from './wallet.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { ProviderGuard } from 'src/guards/provider.guard';
import { extractClientIp } from 'src/common/request.util';
import { RateLimit } from 'src/common/rate-limit.decorator';
import { UpdateBankDetailsDto, WalletAmountDto } from './dto/wallet.dto';

@Controller('wallet')
@UseGuards(AuthGuard)
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get()
  async getWalletInfo(@Req() req: any) {
    const userId = req.user._id || req.user.id;
    const wallet = await this.walletService.getWallet(userId);
    return { success: true, data: wallet };
  }

  @Get('connect-status')
  @UseGuards(ProviderGuard)
  async getConnectStatus(@Req() req: any) {
    const userId = req.user._id || req.user.id;
    return this.walletService.getConnectStatus(userId);
  }

  @Post('top-up')
  @RateLimit({ limit: 5, windowMs: 10 * 60_000 })
  async topUpWallet(@Req() req: any, @Body() body: WalletAmountDto) {
    const userId = String(req.user._id || req.user.id);
    return this.walletService.topUpWallet(userId, body.amount);
  }

  @Post('bank-details')
  @UseGuards(ProviderGuard)
  @RateLimit({ limit: 5, windowMs: 60 * 60_000 })
  async updateBankDetails(@Req() req: any, @Body() body: UpdateBankDetailsDto) {
    const userId = req.user._id || req.user.id;
    return this.walletService.updateBankDetails(
      userId,
      {
        accountName: body.accountName,
        accountNumber: body.accountNumber,
        sortCode: body.sortCode,
      },
      {
        clientIp: extractClientIp(req),
        acceptedStripeTerms: Boolean(body.acceptedStripeTerms),
      },
    );
  }

  @Post('withdraw')
  @UseGuards(ProviderGuard)
  @RateLimit({ limit: 5, windowMs: 60 * 60_000 })
  async requestWithdrawal(@Req() req: any, @Body() body: WalletAmountDto) {
    const userId = req.user._id || req.user.id;
    return this.walletService.requestWithdrawal(userId, body.amount);
  }

  @Get('transactions')
  async getTransactions(
    @Req() req: any,
    @Query('period') period?: 'day' | 'week' | 'month',
  ) {
    const userId = req.user._id || req.user.id;
    return this.walletService.getTransactions(userId, period);
  }
}
