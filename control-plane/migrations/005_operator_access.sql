ALTER TABLE operators
  ADD COLUMN status text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'suspended')),
  ADD COLUMN created_by_subject text,
  ADD COLUMN last_login_at timestamptz;

CREATE INDEX operators_status_created_idx
  ON operators (status, created_at DESC);

CREATE INDEX memberships_operator_tenant_idx
  ON memberships (operator_id, tenant_id);

