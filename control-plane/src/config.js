import { z } from 'zod';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  OIDC_ISSUER: z.string().url(),
  OIDC_JWKS_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1).default('unified-dashboard'),
  CORS_ORIGIN: z.string().url(),
  AUTH_DISABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BRIDGE_SERVICE_SECRET: z.string().min(16),
});

export function loadConfig(environment = process.env) {
  const result = schema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
