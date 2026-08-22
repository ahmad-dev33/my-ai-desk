-- Allow a previously disabled Meta asset to be connected again while preserving
-- its historical channel row. Active ownership remains globally unique through
-- the partial index created in migration 007.

ALTER TABLE channel_connections
  DROP CONSTRAINT IF EXISTS channel_connections_provider_external_account_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS channel_connections_provider_account_active_unique
  ON channel_connections (provider, external_account_id)
  WHERE status <> 'disabled';
