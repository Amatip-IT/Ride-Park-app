import { createHash, timingSafeEqual } from 'crypto';

export const MAX_OTP_ATTEMPTS = 5;

export type StoredOtp = {
  /** SHA-256 hex digest of the OTP (legacy plaintext may still be present briefly) */
  codeHash?: string;
  /** @deprecated plaintext — only read for migration/compat, never write */
  code?: string;
  expiresAt: Date;
  attempts?: number;
};

export function hashOtp(code: string): string {
  return createHash('sha256').update(code.trim()).digest('hex');
}

/**
 * Constant-time compare of a submitted OTP against a stored record.
 * Supports hashed storage and a one-release plaintext fallback.
 */
export function otpMatches(stored: StoredOtp, submitted: string): boolean {
  const normalized = submitted.trim();
  if (stored.codeHash) {
    const submittedHash = hashOtp(normalized);
    try {
      const a = Buffer.from(stored.codeHash, 'hex');
      const b = Buffer.from(submittedHash, 'hex');
      if (a.length !== b.length) return false;
      return timingSafeEqual(a, b);
    } catch {
      return false;
    }
  }
  if (stored.code) {
    const a = Buffer.from(stored.code);
    const b = Buffer.from(normalized);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  }
  return false;
}

export function createStoredOtp(plainCode: string, expiresAt: Date): StoredOtp {
  return {
    codeHash: hashOtp(plainCode),
    expiresAt,
    attempts: 0,
  };
}
