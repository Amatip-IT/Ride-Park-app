import {
  IsString,
  IsEmail,
  IsOptional,
  IsIn,
  IsBoolean,
  Matches,
  MinLength,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

class AddressDto {
  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  county?: string;

  @IsOptional()
  @IsString()
  town?: string;

  @IsOptional()
  @IsString()
  country?: string;
}

export class CreateUserDto {
  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'First name is required' })
  @MaxLength(50, { message: 'First name must be at most 50 characters' })
  @Matches(/^[a-zA-Z\s\-']+$/, {
    message:
      'First name can only contain letters, spaces, hyphens, and apostrophes',
  })
  firstName: string;

  @IsString()
  @Transform(({ value }) => (typeof value === 'string' ? value.trim() : value))
  @MinLength(1, { message: 'Last name is required' })
  @MaxLength(50, { message: 'Last name must be at most 50 characters' })
  @Matches(/^[a-zA-Z\s\-']+$/, {
    message:
      'Last name can only contain letters, spaces, hyphens, and apostrophes',
  })
  lastName: string;

  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @MinLength(3, { message: 'Username must be at least 3 characters' })
  @MaxLength(30, { message: 'Username must be at most 30 characters' })
  @Matches(/^[a-z0-9_]+$/, {
    message:
      'Username can only contain lowercase letters, numbers, and underscores',
  })
  username: string;

  @IsEmail({}, { message: 'Please provide a valid email address' })
  @Transform(({ value }) =>
    typeof value === 'string' ? value.toLowerCase().trim() : value,
  )
  @MaxLength(254, { message: 'Email is too long' })
  email: string;

  @IsString()
  @Transform(({ value }) =>
    typeof value === 'string' ? value.replace(/\s/g, '') : value,
  )
  @Matches(/^\+?[1-9]\d{1,14}$/, {
    message:
      'Phone number must be in valid international format (e.g. +44712345678)',
  })
  phoneNumber: string;

  @IsString()
  @MinLength(8)
  password: string;

  @IsBoolean()
  termsAccepted: boolean;

  @IsOptional()
  @IsIn(['user', 'driver', 'taxi_driver', 'parking_provider'])
  role?: string;

  @IsOptional()
  @IsString()
  postCode?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => AddressDto)
  address?: AddressDto;

  @IsOptional()
  @IsIn(['driver_license', 'national_identity_card', 'passport'])
  idType?: string;

  @IsOptional()
  @IsString()
  identityDocumentUrl?: string;

  @IsOptional()
  @IsString()
  proofOfAddressUrl?: string;

  // Taxi driver vehicle fields
  @IsOptional()
  @IsIn(['Normal car', 'Mini Bus', 'Bus'])
  taxiType?: string;

  @IsOptional()
  @IsString()
  vehicleMake?: string;

  @IsOptional()
  @IsString()
  vehicleModel?: string;

  @IsOptional()
  @IsString()
  vehicleColor?: string;

  @IsOptional()
  @IsString()
  plateNumber?: string;
}
