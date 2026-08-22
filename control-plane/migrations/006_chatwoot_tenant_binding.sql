ALTER TABLE operators
  ADD COLUMN chatwoot_user_id bigint UNIQUE;

CREATE TABLE tenant_chatwoot_accounts (
  tenant_id uuid PRIMARY KEY REFERENCES tenants(id) ON DELETE CASCADE,
  chatwoot_account_id bigint NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (
    SELECT tenant_id FROM channel_connections
    WHERE chatwoot_account_id IS NOT NULL
    GROUP BY tenant_id HAVING count(DISTINCT chatwoot_account_id) > 1
  ) THEN
    RAISE EXCEPTION 'A tenant is mapped to more than one Chatwoot account';
  END IF;

  IF EXISTS (
    SELECT chatwoot_account_id FROM channel_connections
    WHERE chatwoot_account_id IS NOT NULL
    GROUP BY chatwoot_account_id HAVING count(DISTINCT tenant_id) > 1
  ) THEN
    RAISE EXCEPTION 'A Chatwoot account is shared by more than one tenant';
  END IF;
END $$;

INSERT INTO tenant_chatwoot_accounts (tenant_id, chatwoot_account_id)
SELECT tenant_id, min(chatwoot_account_id)
FROM channel_connections
WHERE chatwoot_account_id IS NOT NULL
GROUP BY tenant_id;
