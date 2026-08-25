CREATE TABLE IF NOT EXISTS meta_data_deletion_requests (
  confirmation_code text PRIMARY KEY,
  account_hash text NOT NULL,
  status text NOT NULL CHECK (status IN ('completed', 'deauthorized')),
  requested_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE INDEX IF NOT EXISTS meta_data_deletion_requests_requested_idx
  ON meta_data_deletion_requests (requested_at DESC);
