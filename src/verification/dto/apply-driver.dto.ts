import {
  IsNotEmpty,
  IsString,
  IsBoolean,
  IsNumber,
  Matches,
  MinLength,
  MaxLength,
  ValidateIf,
  Equals,
} from 'class-validator';

export class ApplyDriverDto {
  @IsString({ message: 'Vehicle registration must be a string' })
  @IsNotEmpty({ message: 'Vehicle registration is required' })
  @Matches(/^[A-Z]{1,2}\d{1,4}[A-Z]{1,3}$/i, {
    message: 'Invalid UK vehicle registration format',
  })
  registrationNumber: string;

  // USER CONFIRMATION QUESTIONS (Smart Hybrid)

  // User must answer these to prove ownership

  @IsString({ message: 'Vehicle colour must be a string' })
  @IsNotEmpty({ message: 'Please confirm the vehicle colour' })
  @MinLength(2, { message: 'Vehicle colour is too short' })
  @MaxLength(50, { message: 'Vehicle colour is too long' })
  vehicleColour: string;

  @IsString({ message: 'Vehicle make must be a string' })
  @IsNotEmpty({ message: 'Please confirm the vehicle make' })
  @MinLength(2, { message: 'Vehicle make is too short' })
  @MaxLength(50, { message: 'Vehicle make is too long' })
  vehicleMake: string;

  @IsNumber({}, { message: 'Vehicle year must be a number' })
  @IsNotEmpty({ message: 'Please confirm the year of manufacture' })
  vehicleYear: number;

  // LEGAL CONFIRMATIONS (Checkboxes)

  @IsBoolean({ message: 'Insurance confirmation must be true or false' })
  @Equals(true, { message: 'You must confirm you have valid insurance' })
  hasValidInsurance: boolean;

  @IsBoolean({ message: 'Roadworthy confirmation must be true or false' })
  @Equals(true, { message: 'You must confirm the vehicle is roadworthy' })
  isRoadworthy: boolean;

  @IsBoolean({ message: 'Permission confirmation must be true or false' })
  @Equals(true, {
    message: 'You must confirm you have permission to use this vehicle',
  })
  hasPermission: boolean;
}

export class AdminDriverDecisionDto {
  @IsString({ message: 'User ID must be a string' })
  @IsNotEmpty({ message: 'User ID is required' })
  userId: string;

  @IsString({ message: 'Decision must be a string' })
  @IsNotEmpty({ message: 'Decision is required' })
  @Matches(/^(approve|reject)$/, {
    message: 'Decision must be either "approve" or "reject"',
  })
  decision: 'approve' | 'reject';

  @ValidateIf(
    (o) => o.reason !== undefined && o.reason !== null && o.reason !== '',
  )
  @IsString({ message: 'Reason must be a string' })
  @MinLength(10, { message: 'Rejection reason must be at least 10 characters' })
  reason?: string; // Optional, but required if rejecting
}
