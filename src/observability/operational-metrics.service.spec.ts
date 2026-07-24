import { OperationalMetricsService } from './operational-metrics.service';

describe('OperationalMetricsService', () => {
  it('aggregates requests, errors, latency, and operational counters', () => {
    const metrics = new OperationalMetricsService();
    metrics.recordRequest('GET /health', 200, 10);
    metrics.recordRequest('GET /health', 503, 30);
    metrics.increment('webhook.payments.failed');

    const snapshot = metrics.snapshot();

    expect(snapshot.counters).toEqual({ 'webhook.payments.failed': 1 });
    expect(snapshot.routes).toContainEqual({
      route: 'GET /health',
      requests: 2,
      errors: 1,
      averageDurationMs: 20,
      maxDurationMs: 30,
    });
  });
});
