import {
  IsString,
  IsEmail,
  IsOptional,
  IsIn,
  IsBoolean,
  Matches,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @IsString()
  firstName: string;

  @IsString()
  lastName: string;

  @IsString()
  username: string;

  @IsEmail()
  email: string;

  @IsString()
  @Matches(/^\+?[1-9]\d{1,14}$/)
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
