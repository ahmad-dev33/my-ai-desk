# Project Inspection Report — 2026-08-17

> Historical snapshot of the implementation on this date. It does not define current product access. The canonical definition is `docs/PRODUCT_DEFINITION.md`.

## Overview
- **Unified AI Desk/Dashboard**: An internal white-label platform that consolidates Chatwoot (as the inbox/human agent engine) and Typebot (as the conversational flow builder).
- **Control Plane**: Serves as the central backend API (Express/Node.js) and is the source of truth for clients (tenants), operator memberships, unified contact profiles, and automation registries.
- **Bridge**: A translator service (Express/Node.js) that handles webhooks from Chatwoot, matches them to a Typebot flow, invokes Typebot's session APIs, and pipes responses back to Chatwoot.
- **SSO and Auth**: Handled entirely through Keycloak with OIDC protocol, allowing seamless single-sign-on (SSO) across the React dashboard and Typebot builder/viewer.

## Architectural Boundaries & Decisions
- **Unified CRM & Identity**: The Control Plane owns the canonical CRM records. Typebot's variables are execution states, not CRM records.
- **Bridge Routing**: The Control Plane guides the Bridge by mapping inbound Chatwoot accounts/inboxes to the designated Typebot public flow ID.
- **Frontend Integration**: High-frequency interfaces (like Chatwoot inbox and Typebot builder) are loaded as iframes within the React dashboard, leveraging advanced security headers (`frame-ancestors`) to ensure secure multi-tenant hosting.

## Database & Multi-Tenancy Analysis
The Control Plane uses PostgreSQL with standard isolation and custom tables:
1. `tenants` and `operators` are bound via `memberships` providing strong user-to-tenant isolation.
2. `channel_connections` maps specific inbox integrations using unique composite index `(chatwoot_account_id, chatwoot_inbox_id)`.
3. `knowledge_documents` and `knowledge_chunks` integrate `pgvector` (`vector` datatype) for Semantic search & RAG capabilities.

## Execution Flow (Message Lifecycle)
1. Chatwoot receives an incoming message and triggers a webhook to the Bridge.
2. Bridge checks tokens, verifies the idempotency key in Redis, and requests routing from Control Plane's `/internal/v1/bridge/routes`.
3. Bridge fetches or starts the Typebot session (`startChat` / `continueChat`), parses the replies, and publishes them back to Chatwoot API.

## Pending Tasks & Next Steps
1. **Durable Event Queue**: Upgrade the synchronous Bridge to use a durable queue (e.g., Redis-based queue) with Outbox pattern, Retries, and a Dead-Letter Queue (DLQ).
2. **Native Dashboard Screens**: Build native UI screens for tenants to manage products, catalogs, knowledge document uploads, and automations.
3. **AI Service Integration**: Fully configure and connect the AI Service for chunk processing, vector embeddings generation, and pgvector querying.
