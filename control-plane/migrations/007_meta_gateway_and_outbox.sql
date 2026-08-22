-- Migration 007: Meta ingress ledger, tenant-scoped contacts, durable outbound delivery,
-- and AI decision auditing. Provider credentials remain outside PostgreSQL and are
-- referenced only through channel_connections.credential_ref.

CREATE TABLE IF NOT EXISTS provider_webhook_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  channel_connection_id uuid REFERENCES channel_connections(id) ON DELETE CASCADE,
  provider text NOT NULL,
  provider_event_id text NOT NULL,
  event_type text NOT NULL,
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'processed', 'ignored', 'failed')),
  payload jsonb NOT NULL DEFAULT '{}',
  error_message text,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  UNIQUE (provider, provider_event_id)
);
CREATE INDEX IF NOT EXISTS provider_webhook_events_tenant_time_idx
  ON provider_webhook_events (tenant_id, received_at DESC);

CREATE TABLE IF NOT EXISTS outbound_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_connection_id uuid NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contact_profiles(id) ON DELETE SET NULL,
  provider_recipient_id text NOT NULL,
  reply_to_provider_message_id text,
  message_type text NOT NULL DEFAULT 'text' CHECK (message_type IN ('text')),
  content jsonb NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'sent', 'delivered', 'read', 'failed', 'dead', 'cancelled')),
  idempotency_key text NOT NULL UNIQUE,
  attempt_count integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 5 CHECK (max_attempts BETWEEN 1 AND 20),
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  provider_message_id text,
  provider_response jsonb,
  last_error text,
  sent_at timestamptz,
  delivered_at timestamptz,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS outbound_messages_worker_idx
  ON outbound_messages (status, next_attempt_at, created_at)
  WHERE status IN ('pending', 'failed', 'processing');
CREATE INDEX IF NOT EXISTS outbound_messages_tenant_time_idx
  ON outbound_messages (tenant_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS outbound_messages_provider_id_unique
  ON outbound_messages (channel_connection_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS ai_decision_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_connection_id uuid REFERENCES channel_connections(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contact_profiles(id) ON DELETE SET NULL,
  inbound_provider_message_id text,
  action text NOT NULL CHECK (action IN ('answer', 'handoff', 'no_context', 'keyword_reply', 'blocked')),
  confidence numeric(4,3) CHECK (confidence BETWEEN 0.0 AND 1.0),
  model text,
  prompt_version text NOT NULL DEFAULT 'tenant-rag-v1',
  source_document_ids uuid[] NOT NULL DEFAULT '{}',
  source_product_ids uuid[] NOT NULL DEFAULT '{}',
  latency_ms integer,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_decision_events_tenant_time_idx
  ON ai_decision_events (tenant_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS channel_conversation_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_connection_id uuid NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contact_profiles(id) ON DELETE CASCADE,
  provider_sender_id text NOT NULL,
  provider_thread_id text,
  chatwoot_contact_id bigint,
  chatwoot_source_id text,
  chatwoot_conversation_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (channel_connection_id, provider_sender_id)
);
CREATE INDEX IF NOT EXISTS channel_conversation_links_tenant_contact_idx
  ON channel_conversation_links (tenant_id, contact_id);

CREATE TABLE IF NOT EXISTS channel_contact_permissions (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  channel_connection_id uuid NOT NULL REFERENCES channel_connections(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contact_profiles(id) ON DELETE CASCADE,
  provider_recipient_id text NOT NULL,
  last_user_message_at timestamptz,
  messaging_window_expires_at timestamptz,
  marketing_opt_in_at timestamptz,
  marketing_opt_out_at timestamptz,
  consent_source text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (channel_connection_id, contact_id),
  UNIQUE (channel_connection_id, provider_recipient_id)
);
CREATE INDEX IF NOT EXISTS channel_contact_permissions_window_idx
  ON channel_contact_permissions (messaging_window_expires_at)
  WHERE messaging_window_expires_at IS NOT NULL;

ALTER TABLE channel_connections
  ADD COLUMN IF NOT EXISTS last_health_check_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_error text;

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_provider_account_active_unique
  ON channel_connections (provider, external_account_id)
  WHERE status <> 'disabled';

CREATE TABLE IF NOT EXISTS provider_credentials (
  credential_ref text PRIMARY KEY,
  provider text NOT NULL,
  ciphertext bytea NOT NULL,
  iv bytea NOT NULL,
  auth_tag bytea NOT NULL,
  key_version integer NOT NULL DEFAULT 1,
  metadata jsonb NOT NULL DEFAULT '{}',
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS meta_oauth_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  actor_subject text NOT NULL,
  provider text NOT NULL CHECK (provider IN ('messenger', 'instagram')),
  state_hash text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'authorized', 'completed', 'failed', 'expired')),
  onboarding_credential_ref text REFERENCES provider_credentials(credential_ref) ON DELETE SET NULL,
  error_message text,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX IF NOT EXISTS meta_oauth_sessions_tenant_time_idx
  ON meta_oauth_sessions (tenant_id, created_at DESC);
