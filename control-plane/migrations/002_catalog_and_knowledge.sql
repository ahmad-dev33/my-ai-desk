CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE catalog_products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  sku citext,
  name text NOT NULL,
  description text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  price_minor bigint NOT NULL DEFAULT 0 CHECK (price_minor >= 0),
  currency char(3) NOT NULL DEFAULT 'USD' CHECK (currency ~ '^[A-Z]{3}$'),
  inventory_quantity integer CHECK (inventory_quantity IS NULL OR inventory_quantity >= 0),
  attributes jsonb NOT NULL DEFAULT '{}',
  media_urls text[] NOT NULL DEFAULT ARRAY[]::text[],
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX catalog_products_tenant_sku_unique
  ON catalog_products (tenant_id, sku) WHERE sku IS NOT NULL;
CREATE INDEX catalog_products_tenant_status_updated_idx
  ON catalog_products (tenant_id, status, updated_at DESC);
CREATE INDEX catalog_products_attributes_idx ON catalog_products USING gin (attributes);

CREATE TABLE knowledge_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  title text NOT NULL,
  source_kind text NOT NULL DEFAULT 'text' CHECK (source_kind IN ('text', 'url', 'file', 'catalog', 'faq')),
  source_uri text,
  content text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'ready', 'error', 'archived')),
  checksum text,
  metadata jsonb NOT NULL DEFAULT '{}',
  error_message text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX knowledge_documents_tenant_status_idx
  ON knowledge_documents (tenant_id, status, updated_at DESC);

CREATE TABLE knowledge_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES knowledge_documents(id) ON DELETE CASCADE,
  ordinal integer NOT NULL CHECK (ordinal >= 0),
  content text NOT NULL,
  token_count integer CHECK (token_count IS NULL OR token_count >= 0),
  embedding vector,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (document_id, ordinal)
);
CREATE INDEX knowledge_chunks_tenant_document_idx
  ON knowledge_chunks (tenant_id, document_id, ordinal);

