import dotenv from 'dotenv';
import * as jwt from 'jsonwebtoken';
import * as otpGenerator from 'otp-generator';
import { randomUUID } from 'crypto';
dotenv.config();

export const MAX_FAILED_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCK_DURATION_MS = 15 * 60 * 1000; // 15 minutes

type TokenUser = {
  _id: string;
  role: string;
  tokenVersion?: number;
};

function getAccessSecret(): string {
  const secret = process.env.JWT_SECRET?.trim();
  if (!secret) {
    if (process.env.NODE_ENV === 'test') return 'test_jwt_secret';
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return secret;
}

/**
 * Refresh tokens must use a secret distinct from the access-token secret in production.
 * Non-production may fall back to JWT_SECRET for local DX when JWT_REFRESH_SECRET is unset.
 */
export function getRefreshSecret(): string {
  const refresh = process.env.JWT_REFRESH_SECRET?.trim();
  const access = process.env.JWT_SECRET?.trim();
  const nodeEnv = process.env.NODE_ENV || 'development';

  if (nodeEnv === 'production') {
    if (!refresh) {
      throw new Error(
        'JWT_REFRESH_SECRET is required in production and must differ from JWT_SECRET',
      );
    }
    if (access && refresh === access) {
      throw new Error(
        'JWT_REFRESH_SECRET must be different from JWT_SECRET in production',
      );
    }
    return refresh;
  }

  if (refresh) return refresh;
  if (nodeEnv === 'test') return access || 'test_jwt_refresh_secret';
  if (!access) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return access;
}

/**
 * Generate JWT access token
 * 
 * The payload structure must match what the AuthGuard expects:
 * - _id: The user's MongoDB ObjectId
 * - role: The user's role
 * - tokenVersion: Used for token revocation
 * 
 * @param user - User object containing _id, role, and optional tokenVersion
 * @returns Signed JWT access token
 */
export const generateToken = (user: TokenUser) => {
  const payload = {
    _id: user._id, // ✅ Uses _id (matches AuthGuard expectations)
    role: user.role,
    tokenVersion: user.tokenVersion ?? 0, // ✅ Uses tokenVersion (matches AuthGuard)
    issuedAt: Math.floor(Date.now() / 1000),
  };

  const token = jwt.sign(payload, getAccessSecret(), {
    expiresIn: '7d', // ✅ 7 days instead of 15m (prevents premature expiration)
    algorithm: 'HS256',
  });
  return token;
};

/**
 * Generate JWT refresh token
 * 
 * The refresh token is used to obtain new access tokens without re-authentication.
 * It has a longer lifespan and includes a unique JTI for tracking.
 * 
 * @param userId - The user's MongoDB ObjectId string
 * @param tokenVersion - Current token version for revocation checking
 * @returns Signed JWT refresh token
 */
export const generateRefreshToken = (
  userId: string,
  tokenVersion: number = 0,
) => {
  const payload = {
    _id: userId, // ✅ Uses _id (matches AuthGuard expectations)
    tokenVersion: tokenVersion, // ✅ Uses tokenVersion
    jti: randomUUID(),
    issuedAt: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: '30d', // ✅ 30 days for refresh tokens
    algorithm: 'HS256',
  });
};

/**
 * Verify a JWT refresh token
 * 
 * Returns the user ID and token version from the payload.
 * The returned structure matches what UsersService.refreshUserToken expects:
 * - id: The user's ID
 * - tv: The token version (matches the service's decodedInfo.tv)
 * 
 * @param token - The refresh token to verify
 * @returns Object containing id and tv (token version)
 * @throws Error if the token is invalid or malformed
 */
export const verifyRefreshToken = (
  token: string,
): { id: string; tv: number } => {
  const decoded = jwt.verify(token, getRefreshSecret(), {
    algorithms: ['HS256'],
  });
  
  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Invalid refresh token payload');
  }

  // Get the user ID from the payload
  const userId = decoded['_id'] || decoded['id'];
  if (typeof userId !== 'string') {
    throw new Error('Invalid refresh token payload: missing user ID');
  }

  // Get the token version (tv) from the payload
  const tv = typeof decoded['tokenVersion'] === 'number' 
    ? decoded['tokenVersion'] 
    : typeof decoded['tv'] === 'number' 
      ? decoded['tv'] 
      : 0;

  return {
    id: userId, // ✅ Returns 'id' (matches UsersService.decodedInfo.id)
    tv: tv,     // ✅ Returns 'tv' (matches UsersService.decodedInfo.tv)
  };
};

/**
 * Generate a 6-digit OTP code
 * 
 * @returns 6-digit numeric OTP string
 */
export const generateOtp = (): string => {
  return otpGenerator.generate(6, {
    digits: true,
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
};
