import {
  IsEmail,
  IsOptional,
  IsString,
  Length,
  MaxLength,
  MinLength,
} from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(254)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  password: string;

  @IsOptional()
  @IsString()
  @Length(4, 10)
  otp?: string;
}

export class EmailRequestDto {
  @IsEmail()
  @MaxLength(254)
  email: string;
}

export class ResetPasswordDto extends EmailRequestDto {
  @IsString()
  @Length(4, 10)
  otp: string;

  @IsString()
  @MinLength(8)
  @MaxLength(128)
  newPassword: string;
}

export class RefreshTokenDto {
  @IsString()
  @MinLength(20)
  @MaxLength(4096)
  refreshToken: string;
}
