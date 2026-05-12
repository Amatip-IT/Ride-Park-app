import { Controller, Get, Post, Body, Req, UseGuards, Query, HttpException, HttpStatus } from '@nestjs/common';
import { WalletService } from './wallet.service';
import { AuthGuard } from 'src/guards/auth.guard';

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

  @Post('bank-details')
  async updateBankDetails(@Req() req: any, @Body() body: { accountName: string; accountNumber: string; sortCode: string }) {
    const userId = req.user._id || req.user.id;
    if (!body.accountName || !body.accountNumber || !body.sortCode) {
      throw new HttpException('Missing bank details', HttpStatus.BAD_REQUEST);
    }
    return this.walletService.updateBankDetails(userId, body);
  }

  @Post('withdraw')
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
