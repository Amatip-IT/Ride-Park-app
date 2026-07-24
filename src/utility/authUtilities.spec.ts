import {
  generateToken,
  generateRefreshToken,
  verifyRefreshToken,
  getRefreshSecret,
} from './authUtilities';

describe('authUtilities', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('signs and verifies refresh tokens with JWT_REFRESH_SECRET', () => {
    process.env.NODE_ENV = 'test';
    process.env.JWT_SECRET = 'access_secret';
    process.env.JWT_REFRESH_SECRET = 'refresh_secret';

    const token = generateRefreshToken('user123', 4);
    const decoded = verifyRefreshToken(token);
    expect(decoded.id).toBe('user123');
    expect(decoded.tv).toBe(4);
  });

  it('embeds tokenVersion in access tokens', () => {
    process.env.JWT_SECRET = 'access_secret';
    process.env.JWT_REFRESH_SECRET = 'refresh_secret';

    const token = generateToken({
      _id: 'user123',
      role: 'user',
      tokenVersion: 7,
    });
    // decode without verify helper — jwt payload is middle segment
    const payload = JSON.parse(
      Buffer.from(token.split('.')[1], 'base64url').toString('utf8'),
    );
    expect(payload.tv).toBe(7);
    expect(payload.id).toBe('user123');
  });

  it('requires a distinct refresh secret in production', () => {
    process.env.NODE_ENV = 'production';
    process.env.JWT_SECRET = 'same_secret';
    process.env.JWT_REFRESH_SECRET = 'same_secret';
    expect(() => getRefreshSecret()).toThrow(/different from JWT_SECRET/i);
  });
});
