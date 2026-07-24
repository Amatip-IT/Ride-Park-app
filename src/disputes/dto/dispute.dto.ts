import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsMongoId,
  IsNumber,
  IsObject,
  IsOptional,
  IsString,
  IsUrl,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import {
  DISPUTE_CATEGORIES,
  DISPUTE_RESOLUTIONS,
} from 'src/schemas/dispute.schema';

export class FileDisputeDto {
  @IsOptional()
  @IsIn(DISPUTE_CATEGORIES)
  category?: string;

  @IsString()
  @MinLength(10)
  @MaxLength(2_000)
  description: string;

  @IsOptional()
  @IsMongoId()
  complaintAbout?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @IsUrl({ require_protocol: true }, { each: true })
  evidenceUrls?: string[];

  @IsOptional()
  @IsIn(['ride', 'booking', 'parking', 'driver', 'taxi'])
  relatedServiceType?: string;

  @IsOptional()
  @IsMongoId()
  relatedServiceId?: string;

  @IsOptional()
  @IsObject()
  metadata?: Record<string, unknown>;
}

export class InvestigateDisputeDto {
  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  adminNotes?: string;
}

export class ResolveDisputeDto {
  @IsIn(DISPUTE_RESOLUTIONS)
  resolution: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  notes?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2_000)
  adminNotes?: string;

  @IsOptional()
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(10_000)
  refundAmount?: number;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  suspendReason?: string;

  @IsOptional()
  @IsIn(['driver', 'taxi_driver'])
  providerType?: string;

  @IsOptional()
  @IsMongoId()
  recordId?: string;
}
