// configure environment variables
import dotenv from 'dotenv';
import * as jwt from 'jsonwebtoken';
import * as otpGenerator from 'otp-generator';
dotenv.config();

// Function to generate JWT token
export const generateToken = (user: { _id: string; role: string }) => {
  const payload = {
    id: user._id,
    role: user.role,
    issuedAt: Math.floor(Date.now() / 1000), // Issued at time (in seconds)
  };

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  const token = jwt.sign(payload, secret, { expiresIn: '15m' }); // Short-lived access token
  return token;
};

// Function to generate JWT refresh token
export const generateRefreshToken = (userId: string) => {
  const payload = {
    id: userId,
    issuedAt: Math.floor(Date.now() / 1000),
  };

  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  
  // Refresh token valid for 7 days
  const token = jwt.sign(payload, secret as string, { expiresIn: '7d' });
  return token;
};

// Function to verify a JWT refresh token
export const verifyRefreshToken = (token: string): any => {
  const secret = process.env.JWT_REFRESH_SECRET || process.env.JWT_SECRET;
  if (!secret) {
    throw new Error('JWT_SECRET is not defined in environment variables');
  }
  return jwt.verify(token, secret as string);
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
