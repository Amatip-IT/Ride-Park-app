export const PASSWORD_STRENGTH_MESSAGE =
  'Password must be at least 8 characters long and contain at least one uppercase letter, one lowercase letter, one number, and one special character.';

/** Accepts any non-alphanumeric special character (e.g. / # _ ! @). */
export function isStrongPassword(password: string): boolean {
  if (!password || password.length < 8) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/\d/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}
