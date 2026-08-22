import { z } from 'zod';

const optionalString = (schema) => z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  schema.optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  OIDC_ISSUER: z.string().url(),
  OIDC_JWKS_URL: z.string().url(),
  OIDC_CLIENT_ID: z.string().min(1).default('unified-dashboard'),
  KEYCLOAK_ADMIN_BASE_URL: z.string().url().optional(),
  KEYCLOAK_REALM: z.string().min(1).default('unified'),
  KEYCLOAK_ADMIN_CLIENT_ID: z.string().min(1).optional(),
  KEYCLOAK_ADMIN_CLIENT_SECRET: z.string().min(16).optional(),
  CORS_ORIGIN: z.string().url(),
  AUTH_DISABLED: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  BRIDGE_SERVICE_SECRET: z.string().min(16),
  WEBHOOK_SHARED_SECRET: z.string().min(16).optional(),
  CHATWOOT_BASE_URL: z.string().optional().default('http://chatwoot-web:3000'),
  CHATWOOT_PUBLIC_URL: z.string().url().optional(),
  CHATWOOT_PLATFORM_API_TOKEN: z.string().min(32).optional(),
  TYPEBOT_BASE_URL: z.string().optional().default('http://typebot-viewer:3000'),
  REDIS_URL: z.string().optional(),
  CHATWOOT_API_TOKEN: z.string().optional().default(''),
  CHATWOOT_TOKENS_JSON: z.string().optional().default('{}'),
  BRIDGE_CREDENTIALS_JSON: z.string().optional().default('{}'),
  SESSION_TTL_SECONDS: z.coerce.number().int().positive().default(604800),
  META_APP_SECRET: optionalString(z.string().min(16)),
  META_APP_ID: optionalString(z.string().min(1)),
  META_VERIFY_TOKEN: optionalString(z.string().min(16)),
  META_OAUTH_REDIRECT_URI: optionalString(z.string().url()),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v25.0'),
  META_CREDENTIALS_JSON: z.string().optional().default('{}'),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-5-mini'),
  CREDENTIAL_ENCRYPTION_KEY: optionalString(z.string().min(32)),
});

export function loadConfig(environment = process.env) {
  const result = schema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}
