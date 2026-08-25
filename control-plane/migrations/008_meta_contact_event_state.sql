-- Migration 008: Persist per-contact Meta automation ownership and event context.
-- Raw events remain canonical in provider_webhook_events; these columns contain
-- only the current state required by the reply gateway.

ALTER TABLE channel_contact_permissions
  ADD COLUMN IF NOT EXISTS automation_state text NOT NULL DEFAULT 'active'
    CHECK (automation_state IN ('active', 'paused')),
  ADD COLUMN IF NOT EXISTS last_provider_event_type text,
  ADD COLUMN IF NOT EXISTS last_provider_event_at timestamptz,
  ADD COLUMN IF NOT EXISTS provider_context jsonb NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS channel_contact_permissions_automation_state_idx
  ON channel_contact_permissions (channel_connection_id, automation_state);
