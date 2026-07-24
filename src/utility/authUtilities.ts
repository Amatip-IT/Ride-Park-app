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

// Function to generate JWT token
export const generateToken = (user: TokenUser) => {
  const payload = {
    id: user._id,
    role: user.role,
    tv: user.tokenVersion ?? 0,
    issuedAt: Math.floor(Date.now() / 1000),
  };

  const token = jwt.sign(payload, getAccessSecret(), {
    expiresIn: '15m',
    algorithm: 'HS256',
  });
  return token;
};

// Function to generate JWT refresh token
export const generateRefreshToken = (
  userId: string,
  tokenVersion: number = 0,
) => {
  const payload = {
    id: userId,
    tv: tokenVersion,
    jti: randomUUID(),
    issuedAt: Math.floor(Date.now() / 1000),
  };

  return jwt.sign(payload, getRefreshSecret(), {
    expiresIn: '7d',
    algorithm: 'HS256',
  });
};

// Function to verify a JWT refresh token
export const verifyRefreshToken = (
  token: string,
): { id: string; tv?: number } => {
  const decoded = jwt.verify(token, getRefreshSecret(), {
    algorithms: ['HS256'],
  });
  if (!decoded || typeof decoded !== 'object' || typeof decoded['id'] !== 'string') {
    throw new Error('Invalid refresh token payload');
  }
  return {
    id: decoded['id'],
    tv: typeof decoded['tv'] === 'number' ? decoded['tv'] : 0,
  };
};

/**
 * Generate a 6-digit OTP code
 * @returns 6-digit numeric OTP
 */
export const generateOtp = (): string => {
  return otpGenerator.generate(6, {
    digits: true,
    lowerCaseAlphabets: false,
    upperCaseAlphabets: false,
    specialChars: false,
  });
};
