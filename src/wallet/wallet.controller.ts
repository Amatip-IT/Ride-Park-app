import { Controller, Get, Post, Body, Req, UseGuards, Query, HttpException, HttpStatus } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { AuthGuard } from 'src/guards/auth.guard';
import { ProviderGuard } from 'src/guards/provider.guard';
import { extractClientIp } from 'src/common/request.util';

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
  async topUpWallet(@Req() req: any, @Body() body: { amount: number }) {
    const userId = String(req.user._id || req.user.id);
    if (!body.amount || body.amount <= 0) {
      throw new HttpException('Valid amount is required', HttpStatus.BAD_REQUEST);
    }
    return this.walletService.topUpWallet(userId, body.amount);
  }

  @Post('bank-details')
  @UseGuards(ProviderGuard)
  async updateBankDetails(
    @Req() req: any,
    @Body()
    body: {
      accountName: string;
      accountNumber: string;
      sortCode: string;
      acceptedStripeTerms?: boolean;
    },
  ) {
    const userId = req.user._id || req.user.id;
    if (!body.accountName || !body.accountNumber || !body.sortCode) {
      throw new HttpException('Missing bank details', HttpStatus.BAD_REQUEST);
    }
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
  async requestWithdrawal(@Req() req: any, @Body() body: { amount: number }) {
    const userId = req.user._id || req.user.id;
    if (!body.amount) throw new HttpException('Amount is required', HttpStatus.BAD_REQUEST);
    return this.walletService.requestWithdrawal(userId, body.amount);
  }

  @Get('transactions')
  async getTransactions(@Req() req: any, @Query('period') period?: 'day' | 'week' | 'month') {
    const userId = req.user._id || req.user.id;
    return this.walletService.getTransactions(userId, period);
  }
}
