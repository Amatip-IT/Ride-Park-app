import { Type } from 'class-transformer';
import {
  Equals,
  IsBoolean,
  IsNumber,
  IsString,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';

export class WalletAmountDto {
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(1)
  @Max(10_000)
  amount: number;
}

export class UpdateBankDetailsDto {
  @IsString()
  @Length(2, 100)
  accountName: string;

  @IsString()
  @Matches(/^\d{8}$/, {
    message: 'accountNumber must contain exactly 8 digits',
  })
  accountNumber: string;

  @IsString()
  @Matches(/^\d{6}$/, { message: 'sortCode must contain exactly 6 digits' })
  sortCode: string;

  @IsBoolean()
  @Equals(true, {
    message: 'Stripe Connected Account Agreement must be accepted',
  })
  acceptedStripeTerms: boolean;
}
