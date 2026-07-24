export function getAllowedCorsOrigins(
  nodeEnv = process.env.NODE_ENV,
  configuredOrigins = process.env.CORS_ORIGINS,
): true | string[] {
  if (nodeEnv !== 'production') return true;

  const origins = (configuredOrigins || '')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  if (origins.length === 0 || origins.includes('*')) {
    throw new Error(
      'CORS_ORIGINS must list explicit comma-separated origins in production',
    );
  }

  return origins;
}

/** Fail fast on production misconfiguration that would weaken security. */
export function assertProductionSecurityConfig(
  nodeEnv = process.env.NODE_ENV,
  configuredOrigins = process.env.CORS_ORIGINS,
): void {
  if (nodeEnv !== 'production') return;
  getAllowedCorsOrigins(nodeEnv, configuredOrigins);
}
