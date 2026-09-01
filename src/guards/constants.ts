// src/guards/constants.ts
export const JWT_SECRET = process.env.JWT_SECRET || 'your-super-secret-key-change-this';
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || '30d';
