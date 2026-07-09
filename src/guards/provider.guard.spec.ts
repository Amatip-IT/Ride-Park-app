import { ForbiddenException } from '@nestjs/common';
import { ProviderGuard } from './provider.guard';

describe('ProviderGuard', () => {
  const guard = new ProviderGuard();

  const createContext = (role?: string) =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({ user: role ? { role } : undefined }),
      }),
    }) as any;

  it('allows provider roles', () => {
    expect(guard.canActivate(createContext('driver'))).toBe(true);
    expect(guard.canActivate(createContext('parking_provider'))).toBe(true);
    expect(guard.canActivate(createContext('taxi_driver'))).toBe(true);
  });

  it('blocks general users', () => {
    expect(() => guard.canActivate(createContext('user'))).toThrow(
      ForbiddenException,
    );
  });
});
