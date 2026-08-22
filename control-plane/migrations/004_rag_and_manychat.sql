-- Migration 004: RAG Engine, AI Handoff Policies, and ManyChat Parity Engine

CREATE TABLE IF NOT EXISTS ai_handoff_policies (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  confidence_threshold numeric(3,2) NOT NULL DEFAULT 0.75 CHECK (confidence_threshold BETWEEN 0.0 AND 1.0),
  sentiment_escalation_enabled boolean NOT NULL DEFAULT true,
  fallback_reply text NOT NULL DEFAULT 'I am connecting you with a human representative who can assist you further.',
  custom_system_prompt text NOT NULL DEFAULT 'You are a helpful customer support AI assistant. Rely strictly on the provided tenant knowledge base.',
  auto_handoff_keywords text[] NOT NULL DEFAULT ARRAY['human', 'agent', 'support', 'help', 'representative', 'person', 'انسان', 'موظف', 'دعم', 'مساعدة']::text[],
  escalation_inbox_id bigint,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS keyword_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  keyword text NOT NULL,
  match_type text NOT NULL DEFAULT 'contains' CHECK (match_type IN ('exact', 'contains', 'starts_with', 'regex')),
  channel_provider text NOT NULL DEFAULT 'all',
  action_type text NOT NULL DEFAULT 'trigger_automation' CHECK (action_type IN ('trigger_automation', 'send_reply', 'add_tag', 'handoff_human', 'ai_rag_query')),
  action_payload jsonb NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 10,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS keyword_rules_tenant_status_idx ON keyword_rules (tenant_id, status, priority DESC);

CREATE TABLE IF NOT EXISTS drip_sequences (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'paused', 'archived')),
  steps jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS drip_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sequence_id uuid NOT NULL REFERENCES drip_sequences(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contact_profiles(id) ON DELETE CASCADE,
  current_step integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'paused', 'cancelled')),
  next_run_at timestamptz NOT NULL DEFAULT now(),
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (sequence_id, contact_id)
);
CREATE INDEX IF NOT EXISTS drip_subscriptions_schedule_idx ON drip_subscriptions (tenant_id, status, next_run_at);

CREATE TABLE IF NOT EXISTS broadcast_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  target_filter jsonb NOT NULL DEFAULT '{}',
  content jsonb NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'scheduled', 'sending', 'completed', 'failed')),
  total_recipients integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  scheduled_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS campaign_analytics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  campaign_type text NOT NULL CHECK (campaign_type IN ('broadcast', 'sequence', 'keyword', 'automation', 'ai_rag')),
  campaign_id text NOT NULL,
  event_type text NOT NULL CHECK (event_type IN ('triggered', 'sent', 'delivered', 'read', 'clicked', 'replied', 'failed', 'handoff')),
  contact_id uuid REFERENCES contact_profiles(id) ON DELETE SET NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS campaign_analytics_tenant_time_idx ON campaign_analytics (tenant_id, occurred_at DESC);
