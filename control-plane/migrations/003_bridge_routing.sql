ALTER TABLE channel_connections
  ADD COLUMN chatwoot_account_id bigint CHECK (chatwoot_account_id IS NULL OR chatwoot_account_id > 0),
  ADD COLUMN chatwoot_inbox_id bigint CHECK (chatwoot_inbox_id IS NULL OR chatwoot_inbox_id > 0),
  ADD COLUMN automation_id uuid REFERENCES automation_definitions(id) ON DELETE SET NULL;

CREATE UNIQUE INDEX channel_connections_chatwoot_route_unique
  ON channel_connections (chatwoot_account_id, chatwoot_inbox_id)
  WHERE chatwoot_account_id IS NOT NULL AND chatwoot_inbox_id IS NOT NULL;

CREATE INDEX channel_connections_tenant_automation_idx
  ON channel_connections (tenant_id, automation_id);

