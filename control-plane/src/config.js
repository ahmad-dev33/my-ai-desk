import { z } from 'zod';

const optionalString = (schema) => z.preprocess(
  (value) => value === '' || value === null ? undefined : value,
  schema.optional(),
);

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PRODUCTION_MODE: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
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
  META_INSTAGRAM_APP_SECRET: optionalString(z.string().min(16)),
  META_INSTAGRAM_APP_ID: optionalString(z.string().min(1)),
  META_VERIFY_TOKEN: optionalString(z.string().min(16)),
  META_OAUTH_REDIRECT_URI: optionalString(z.string().url()),
  META_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default('v26.0'),
  META_ENABLE_COMMENT_MANAGEMENT: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  META_CREDENTIALS_JSON: z.string().optional().default('{}'),
  META_TOKEN_REFRESH_INTERVAL_MS: z.coerce.number().int().min(3600000).max(86400000).default(43200000),
  DATA_RETENTION_DAYS: z.coerce.number().int().min(30).max(730).default(90),
  LEGAL_ENTITY_NAME: z.string().min(2).default('My AI Desk'),
  PRIVACY_CONTACT_EMAIL: optionalString(z.string().email()),
  OUTBOX_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  OUTBOX_MAX_ATTEMPTS: z.coerce.number().int().min(1).max(20).default(5),
  META_OUTBOUND_CHANNEL_INTERVAL_MS: z.coerce.number().int().min(100).max(60000).default(1000),
  META_OUTBOUND_CONTACT_COOLDOWN_MS: z.coerce.number().int().min(100).max(60000).default(1500),
  META_OUTBOUND_REPLY_WINDOW_MS: z.coerce.number().int().min(60000).max(86400000).default(600000),
  META_OUTBOUND_MAX_REPLIES_PER_WINDOW: z.coerce.number().int().min(1).max(100).default(6),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-5-mini'),
  CREDENTIAL_ENCRYPTION_KEY: optionalString(z.string().min(32)),
});

export function loadConfig(environment = process.env) {
  const result = schema.safeParse(environment);
  if (!result.success) {
    throw new Error(`Invalid configuration: ${z.prettifyError(result.error)}`);
  }
  const config = result.data;
  if (config.PRODUCTION_MODE) {
    const violations = [];
    if (config.AUTH_DISABLED) violations.push('AUTH_DISABLED must be false');
    if (!config.CORS_ORIGIN.startsWith('https://')) violations.push('CORS_ORIGIN must use HTTPS');
    if (!config.META_OAUTH_REDIRECT_URI?.startsWith('https://')) violations.push('META_OAUTH_REDIRECT_URI must use HTTPS');
    if (config.META_OAUTH_REDIRECT_URI && /(?:localhost|\.localhost|ngrok-free\.(?:app|dev))$/i.test(new URL(config.META_OAUTH_REDIRECT_URI).hostname)) {
      violations.push('META_OAUTH_REDIRECT_URI must use a permanent production domain');
    }
    if (!config.PRIVACY_CONTACT_EMAIL) violations.push('PRIVACY_CONTACT_EMAIL is required');
    if (violations.length) throw new Error(`Invalid production configuration: ${violations.join('; ')}`);
  }
  return config;
}
