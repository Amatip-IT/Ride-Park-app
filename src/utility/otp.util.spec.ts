import {
  createStoredOtp,
  hashOtp,
  otpMatches,
  MAX_OTP_ATTEMPTS,
} from './otp.util';

describe('otp.util', () => {
  it('hashes OTPs and verifies matches', () => {
    const stored = createStoredOtp('482910', new Date(Date.now() + 60_000));
    expect(stored.codeHash).toBe(hashOtp('482910'));
    expect(stored.code).toBeUndefined();
    expect(stored.attempts).toBe(0);
    expect(otpMatches(stored, '482910')).toBe(true);
    expect(otpMatches(stored, '000000')).toBe(false);
  });

  it('still accepts legacy plaintext OTPs during transition', () => {
    expect(
      otpMatches(
        { code: '111222', expiresAt: new Date() },
        '111222',
      ),
    ).toBe(true);
  });

  it('exports a finite attempt budget', () => {
    expect(MAX_OTP_ATTEMPTS).toBe(5);
  });
});
