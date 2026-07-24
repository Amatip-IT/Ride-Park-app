import { SetMetadata } from '@nestjs/common';

export const RATE_LIMIT_METADATA = 'gleezip:rate-limit';

export interface RateLimitOptions {
  limit: number;
  windowMs: number;
}

export const RateLimit = (options: RateLimitOptions) =>
  SetMetadata(RATE_LIMIT_METADATA, options);
