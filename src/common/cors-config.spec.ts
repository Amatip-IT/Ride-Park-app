import {
  assertProductionSecurityConfig,
  getAllowedCorsOrigins,
} from './cors-config';

describe('getAllowedCorsOrigins', () => {
  it('allows development origins for local clients', () => {
    expect(getAllowedCorsOrigins('development')).toBe(true);
  });

  it('parses an explicit production allowlist', () => {
    expect(
      getAllowedCorsOrigins(
        'production',
        'https://admin.gleezip.com, https://app.gleezip.com',
      ),
    ).toEqual(['https://admin.gleezip.com', 'https://app.gleezip.com']);
  });

  it.each([undefined, '', '*'])(
    'rejects unsafe production value %p',
    (value) => {
      expect(() => getAllowedCorsOrigins('production', value)).toThrow(
        'CORS_ORIGINS',
      );
    },
  );
});

describe('assertProductionSecurityConfig', () => {
  it('no-ops outside production', () => {
    expect(() =>
      assertProductionSecurityConfig('development', undefined),
    ).not.toThrow();
  });

  it('fails fast in production without CORS_ORIGINS', () => {
    expect(() => assertProductionSecurityConfig('production', '')).toThrow(
      'CORS_ORIGINS',
    );
  });
});
