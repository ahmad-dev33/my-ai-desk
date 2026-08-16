CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug citext NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
  locale text NOT NULL DEFAULT 'ar',
  timezone text NOT NULL DEFAULT 'UTC',
  settings jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE operators (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  oidc_subject text NOT NULL UNIQUE,
  email citext NOT NULL,
  display_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  operator_id uuid NOT NULL REFERENCES operators(id) ON DELETE CASCADE,
  roles text[] NOT NULL DEFAULT ARRAY['operator']::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, operator_id)
);

CREATE TABLE channel_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('instagram', 'whatsapp', 'messenger', 'telegram', 'email', 'sms', 'api')),
  external_account_id text NOT NULL,
  display_name text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active', 'error', 'disabled')),
  credential_ref text,
  config jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, external_account_id)
);

CREATE TABLE contact_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  email citext,
  phone text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'blocked', 'deleted')),
  custom_fields jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX contact_profiles_tenant_updated_idx ON contact_profiles (tenant_id, updated_at DESC);
CREATE INDEX contact_profiles_custom_fields_idx ON contact_profiles USING gin (custom_fields);

CREATE TABLE contact_identities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  contact_id uuid NOT NULL REFERENCES contact_profiles(id) ON DELETE CASCADE,
  provider text NOT NULL,
  external_id text NOT NULL,
  username text,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, provider, external_id)
);
CREATE INDEX contact_identities_contact_idx ON contact_identities (contact_id);

CREATE TABLE automation_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'paused', 'archived')),
  engine text NOT NULL DEFAULT 'typebot' CHECK (engine IN ('typebot')),
  engine_ref text,
  current_version integer NOT NULL DEFAULT 0,
  created_by_subject text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_definitions_tenant_idx ON automation_definitions (tenant_id, updated_at DESC);

CREATE TABLE automation_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES automation_definitions(id) ON DELETE CASCADE,
  version integer NOT NULL,
  engine_ref text NOT NULL,
  definition_snapshot jsonb NOT NULL DEFAULT '{}',
  published_by_subject text,
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (automation_id, version)
);

CREATE TABLE audit_logs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_subject text NOT NULL,
  action text NOT NULL,
  resource_type text NOT NULL,
  resource_id text,
  metadata jsonb NOT NULL DEFAULT '{}',
  occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX audit_logs_tenant_time_idx ON audit_logs (tenant_id, occurred_at DESC);
