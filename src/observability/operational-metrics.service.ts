import { Injectable } from '@nestjs/common';

interface RouteMetrics {
  requests: number;
  errors: number;
  totalDurationMs: number;
  maxDurationMs: number;
}

@Injectable()
export class OperationalMetricsService {
  private readonly startedAt = new Date();
  private readonly routes = new Map<string, RouteMetrics>();
  private readonly counters = new Map<string, number>();

  recordRequest(route: string, statusCode: number, durationMs: number): void {
    const current = this.routes.get(route) || {
      requests: 0,
      errors: 0,
      totalDurationMs: 0,
      maxDurationMs: 0,
    };
    current.requests += 1;
    current.errors += statusCode >= 500 ? 1 : 0;
    current.totalDurationMs += durationMs;
    current.maxDurationMs = Math.max(current.maxDurationMs, durationMs);
    this.routes.set(route, current);
  }

  increment(name: string): void {
    this.counters.set(name, (this.counters.get(name) || 0) + 1);
  }

  snapshot() {
    return {
      startedAt: this.startedAt.toISOString(),
      generatedAt: new Date().toISOString(),
      counters: Object.fromEntries(this.counters),
      routes: Array.from(this.routes.entries()).map(([route, value]) => ({
        route,
        requests: value.requests,
        errors: value.errors,
        averageDurationMs:
          value.requests === 0
            ? 0
            : Math.round(value.totalDurationMs / value.requests),
        maxDurationMs: value.maxDurationMs,
      })),
    };
  }
}
