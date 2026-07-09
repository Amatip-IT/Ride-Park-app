/**
 * Best-effort client IP for audit / Stripe ToS acceptance.
 */
export function extractClientIp(req: {
  ip?: string;
  headers?: Record<string, string | string[] | undefined>;
}): string {
  const forwarded = req.headers?.['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  if (Array.isArray(forwarded) && forwarded[0]) {
    return forwarded[0].split(',')[0].trim();
  }
  return req.ip || '0.0.0.0';
}

/**
 * Normalize a MongoDB ObjectId, populated ref, or string to a comparable id string.
 */
export function toObjectIdString(value: unknown): string {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'object') {
    const obj = value as { _id?: unknown; toString?: () => string };
    if (obj._id != null) {
      return String(obj._id);
    }
    if (typeof obj.toString === 'function') {
      const asString = obj.toString();
      if (asString && asString !== '[object Object]') {
        return asString;
      }
    }
  }
  return String(value);
}

/**
 * User id from an authenticated request (AuthGuard attaches a Mongoose user doc).
 */
export function getRequestUserId(req: { user?: { _id?: unknown; id?: unknown } }): string {
  return toObjectIdString(req.user?._id ?? req.user?.id);
}
