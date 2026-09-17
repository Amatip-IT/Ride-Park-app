import { IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';

function trimString(value: unknown) {
  return typeof value === 'string' ? value.trim() : value;
}

function normalizePhone(value: unknown) {
  if (typeof value !== 'string') return value;
  const stripped = value.replace(/[\s()-]/g, '');
  return stripped.length ? stripped : undefined;
}

export class UpdateProfileDto {
  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1, { message: 'First name is required' })
  @MaxLength(50, { message: 'First name must be at most 50 characters' })
  firstName?: string;

  @IsOptional()
  @Transform(({ value }) => trimString(value))
  @IsString()
  @MinLength(1, { message: 'Last name is required' })
  @MaxLength(50, { message: 'Last name must be at most 50 characters' })
  lastName?: string;

  @IsOptional()
  @Transform(({ value }) => normalizePhone(value))
  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message:
      'Phone number must be in international format with no spaces (e.g. +447123456789)',
  })
  phoneNumber?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  profileImageUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4096)
  pushToken?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  identityDocumentUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2048)
  proofOfAddressUrl?: string;
}
