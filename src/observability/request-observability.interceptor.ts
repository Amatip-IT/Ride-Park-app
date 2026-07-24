import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { Request, Response } from 'express';
import { Observable, catchError, tap, throwError } from 'rxjs';
import { OperationalMetricsService } from './operational-metrics.service';
import { getRequestUserId } from '../common/request.util';

@Injectable()
export class RequestObservabilityInterceptor implements NestInterceptor {
  private readonly logger = new Logger('HttpRequest');

  constructor(private readonly metrics: OperationalMetricsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();

    const http = context.switchToHttp();
    const request = http.getRequest<
      Request & { user?: { _id?: unknown; id?: unknown } }
    >();
    const response = http.getResponse<Response>();
    const suppliedRequestId = request.header('x-request-id');
    const requestId =
      suppliedRequestId && /^[A-Za-z0-9._:-]{1,100}$/.test(suppliedRequestId)
        ? suppliedRequestId
        : randomUUID();
    const startedAt = Date.now();
    response.setHeader('x-request-id', requestId);

    const record = (statusCode: number, error?: unknown) => {
      const durationMs = Date.now() - startedAt;
      const routePath = request.baseUrl || request.path;
      const route = `${request.method} ${routePath}`;
      const userId = getRequestUserId(request);
      const entry = {
        event: 'http_request',
        requestId,
        method: request.method,
        route: routePath,
        statusCode,
        durationMs,
        userId: userId || undefined,
        error: error instanceof Error ? error.name : undefined,
      };
      this.metrics.recordRequest(route, statusCode, durationMs);
      const serialized = JSON.stringify(entry);
      if (statusCode >= 500) this.logger.error(serialized);
      else if (statusCode >= 400) this.logger.warn(serialized);
      else this.logger.log(serialized);
    };

    return next.handle().pipe(
      tap(() => record(response.statusCode)),
      catchError((error: unknown) => {
        const statusCode =
          typeof error === 'object' && error !== null && 'status' in error
            ? Number((error as { status: unknown }).status)
            : 500;
        record(Number.isFinite(statusCode) ? statusCode : 500, error);
        return throwError(() => error);
      }),
    );
  }
}
