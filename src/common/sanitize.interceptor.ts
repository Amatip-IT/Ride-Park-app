import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Recursively sanitize all string values in an object.
 * Strips HTML/script tags, null bytes, and trims whitespace.
 */
function sanitizeValue(value: unknown): unknown {
  if (typeof value === 'string') {
    return value
      .replace(/<\/?[^>]+(>|$)/g, '') // strip HTML tags
      .replace(/\x00/g, '') // strip null bytes
      .replace(/javascript:/gi, '') // strip JS protocol
      .replace(/on\w+\s*=/gi, '') // strip inline event handlers
      .trim();
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeValue);
  }

  if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
    sanitizeObjectInPlace(value as Record<string, unknown>);
    return value;
  }

  return value;
}

function sanitizeObjectInPlace(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const sanitized = sanitizeValue(obj[key]);
    if (sanitized !== obj[key]) {
      obj[key] = sanitized;
    }
  }
}

@Injectable()
export class SanitizeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();

    // Body can be reassigned; query/params are read-only on Express req — mutate in place only.
    if (
      request.body &&
      typeof request.body === 'object' &&
      !Array.isArray(request.body)
    ) {
      sanitizeObjectInPlace(request.body);
    }

    if (request.query && typeof request.query === 'object') {
      sanitizeObjectInPlace(request.query as Record<string, unknown>);
    }

    if (request.params && typeof request.params === 'object') {
      sanitizeObjectInPlace(request.params as Record<string, unknown>);
    }

    return next.handle();
  }
}
