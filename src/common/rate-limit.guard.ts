import {
  CanActivate,
  ExecutionContext,
  HttpException,
  HttpStatus,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request, Response } from 'express';
import { RATE_LIMIT_METADATA, RateLimitOptions } from './rate-limit.decorator';
import { getRequestUserId } from './request.util';

interface RateBucket {
  count: number;
  resetAt: number;
}

const DEFAULT_LIMIT: RateLimitOptions = {
  limit: 300,
  windowMs: 60_000,
};

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly buckets = new Map<string, RateBucket>();
  private lastPrunedAt = 0;

  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    if (context.getType() !== 'http') return true;

    const options =
      this.reflector.getAllAndOverride<RateLimitOptions>(RATE_LIMIT_METADATA, [
        context.getHandler(),
        context.getClass(),
      ]) || DEFAULT_LIMIT;

    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { user?: { _id?: unknown; id?: unknown } }
    >();
    const response = http.getResponse<Response>();
    const now = Date.now();
    this.pruneExpiredBuckets(now);

    const userId = getRequestUserId(request);
    const identity = userId
      ? `user:${userId}`
      : `ip:${request.ip || 'unknown'}`;
    const route = `${context.getClass().name}.${context.getHandler().name}`;
    const key = `${route}:${identity}`;
    const current = this.buckets.get(key);
    const bucket =
      !current || current.resetAt <= now
        ? { count: 0, resetAt: now + options.windowMs }
        : current;

    bucket.count += 1;
    this.buckets.set(key, bucket);

    response.setHeader('RateLimit-Limit', String(options.limit));
    response.setHeader(
      'RateLimit-Remaining',
      String(Math.max(0, options.limit - bucket.count)),
    );
    response.setHeader(
      'RateLimit-Reset',
      String(Math.ceil(bucket.resetAt / 1000)),
    );

    if (bucket.count > options.limit) {
      response.setHeader(
        'Retry-After',
        String(Math.ceil((bucket.resetAt - now) / 1000)),
      );
      throw new HttpException(
        'Too many requests. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    return true;
  }

  private pruneExpiredBuckets(now: number): void {
    if (now - this.lastPrunedAt < 60_000 && this.buckets.size < 10_000) return;
    this.lastPrunedAt = now;
    for (const [key, bucket] of this.buckets) {
      if (bucket.resetAt <= now) this.buckets.delete(key);
    }
  }
}
