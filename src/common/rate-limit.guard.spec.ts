import { ExecutionContext, HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RateLimitGuard } from './rate-limit.guard';

describe('RateLimitGuard', () => {
  it('returns rate headers and rejects requests above the route limit', () => {
    const reflector = {
      getAllAndOverride: jest
        .fn()
        .mockReturnValue({ limit: 1, windowMs: 60_000 }),
    } as unknown as Reflector;
    const setHeader = jest.fn();
    const request = { ip: '203.0.113.10' };
    const context = {
      getType: () => 'http',
      getHandler: () => ({ name: 'login' }),
      getClass: () => ({ name: 'UsersController' }),
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({ setHeader }),
      }),
    } as unknown as ExecutionContext;
    const guard = new RateLimitGuard(reflector);

    expect(guard.canActivate(context)).toBe(true);
    expect(setHeader).toHaveBeenCalledWith('RateLimit-Remaining', '0');

    try {
      guard.canActivate(context);
      throw new Error('Expected rate limiter to reject the request');
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
    expect(setHeader).toHaveBeenCalledWith('Retry-After', expect.any(String));
  });
});
