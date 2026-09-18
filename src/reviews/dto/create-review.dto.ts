import {
  IsIn,
  IsInt,
  IsMongoId,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { Type } from 'class-transformer';

export class CreateReviewDto {
  @IsIn(['parking', 'driver', 'taxi'])
  serviceType!: 'parking' | 'driver' | 'taxi';

  /** Taxi/Chauffeur/ParkingSpace id, or the provider/driver User id (resolved server-side). */
  @IsMongoId()
  serviceId!: string;

  @IsOptional()
  @IsMongoId()
  bookingId?: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(5)
  rating!: number;

  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  comment?: string;
}
