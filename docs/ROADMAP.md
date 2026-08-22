# Platform Execution Roadmap

> Canonical product scope and access model: [PRODUCT_DEFINITION.md](./PRODUCT_DEFINITION.md).

## Completed

- Consolidated Docker infrastructure for Chatwoot, Typebot, PostgreSQL (pgvector), Redis, MinIO, Keycloak, and Traefik.
- Unified dashboard shell and centralized Keycloak OIDC login for My AI Desk.
- Multi-tenant data model, operator memberships, unified contacts, and automation registries.
- Product catalog, pricing, and inventory per tenant.
- Isolated knowledge sources per tenant and pgvector tables for semantic vector search.
- Channel management and automation versioning APIs.
- **Service Consolidation**: Successfully merged the webhook ingestion and Typebot/Chatwoot bridge directly into `control-plane`, removing the standalone `bridge` container and eliminating inter-service network hops.
- **Resource Footprint Optimization**: Configured memory caps and concurrency limits for Rails, Sidekiq, Keycloak JVM, Typebot Node processes, and Redis volatile-lru caching, reducing RAM usage by ~1.5 GB.
- **My AI Desk Branding**: The dashboard and runtime configuration use the final product name, with a custom Keycloak login theme and Arabic/English localization.
- **Durable Event Queue**: Redis-backed asynchronous event queue with backoff retries and Dead-Letter Queue (DLQ) for resilient webhook processing.
- **Native Dashboard Screens**: Integrated React screens for CRM contacts, catalog products, knowledge sources, automation registry, and keyword rules with tenant switching.
- **Employee Access Foundation**: Added least-privileged Keycloak employee provisioning, administrator-only employee lifecycle and many-to-many company assignment APIs, an employee-management dashboard, audit events, and immediate server-side denial for suspended or unregistered employees.
- **Downstream SSO Foundation**: Typebot uses Keycloak OIDC; Chatwoot now uses its supported Platform API for account-scoped user provisioning and short-lived one-time login links instead of unsupported Keycloak environment variables.
- **Live Stack Baseline**: The development stack is running with all six Control Plane migrations applied; dashboard, API readiness, Keycloak discovery, Typebot SSO helper, and Chatwoot logout helper return successful responses, and the Chatwoot Platform API credential is accepted.
- **Typebot Template Imports**: Typebot now reaches MinIO over the internal Docker endpoint (`minio:9000`) while published assets keep their public custom domain, so bundled templates can be cloned successfully.
- **Unified Workspace Shell**: Grouped Arabic-first navigation, persistent embedded-engine frames, bounded non-blocking loading feedback, visible company context, and a documented single-login/session-translation contract are implemented. Typebot remains mounted across navigation; Chatwoot refreshes only when its owning company changes.
- **Tenant AI Operations Screen**: Operators can configure tenant-scoped agent instructions, confidence and handoff rules, and see whether OpenAI is configured without exposing its key. Live channel messages use the canonical product/knowledge answer pipeline.
- **Legacy Bridge Cleanup**: Removed the obsolete standalone `bridge` source and the unused pre-rebrand Keycloak theme after confirming the merged Control Plane bridge and `my-ai-desk` theme are the only runtime references.
- **Meta Secret-Safety Baseline**: Added local generation for independent webhook-verification and credential-encryption secrets, plus request-log sanitization for OAuth codes, state values, access tokens, webhook tokens, and client secrets. Live webhook verification and log redaction pass without exposing secret values.
- **Installable Operator Client**: The dashboard is an installable PWA with a standalone desktop window, while the automation services continue running independently on the server.
- **Deployment Baseline**: Added production readiness checks, database backup tooling, a production profile that excludes the local ngrok tunnel, and an operator deployment runbook. The local signed Meta webhook is publicly reachable through ngrok.

## In Progress

- **Access-Control Hardening**: The administrator/employee lifecycle and assignment foundation is implemented and the live Keycloak/database bootstrap passes. Complete exhaustive guessed-resource and cross-tenant integration coverage before closing the phase.
- **End-to-End SSO Verification**: Validate dashboard, Typebot, and Chatwoot login/session/logout behavior in the live Docker stack, including revoked employees and downstream account removal.
- **RAG Production Integration**: Configure a real embedding provider, index documents from the dashboard, add reliable background ingestion, and connect guarded answers/handoffs to channel conversations.
- **CRM Sync Hardening**: Resolve outbound Chatwoot credentials exclusively on the server through channel `credential_ref`; add inbound event wiring and conflict-safe field merges.
- **Marketing Automation Foundation**: Keyword-rule storage and analytics schema exist. The durable Meta reply outbox is running, but campaign segmentation, scheduling and provider-backed delivery still need their own worker path; campaigns must not report delivery until provider receipts exist.
- **Production Hardening & Deployment**: Automated database backup verification, rate limiting, and observability.
- **Meta Channel Onboarding**: The signed webhook gateway, tenant routing, contact identity,
  durable outbox, messaging-window guard, receipts, Chatwoot mirror, grounded reply pipeline,
  Facebook Login asset selection, automatic webhook subscription, and safe disconnect
  are implemented. Real credentials, WhatsApp Embedded Signup, and provider health
  checks, Private Reply review, and Meta App Review remain external/onboarding work.

## Next

1. **Administrator and employee workflow**: finish administrator screens for companies, employee accounts, assignments, and audit activity; finish employee views for AI reply policy, ready replies, agent handoff, and channel status within assigned companies only. The dashboard is an internal management client and is not required to remain open for automation to run.
2. **Always-on server workflow**: add a durable outbox worker, provider delivery receipts, monitoring, backup verification, and deployment configuration for the server environment.
3. **AI reply workflow**: configure the embedding and generation providers, index tenant knowledge asynchronously, enforce confidence/handoff rules, and record every AI decision in the event ledger.
4. **Human-agent workflow**: keep Chatwoot as the single human inbox; sync contacts safely and expose the right deep links or native dashboard actions without duplicating inbox logic.
5. **Marketing workflow**: build segment evaluation, sequence scheduling, compliant broadcast delivery, and provider-confirmed analytics on top of the implemented direct Meta adapter.

## Single Source of Truth Decisions

| Capability | Canonical Source | Downstream Handling |
| --- | --- | --- |
| Conversation Inbox, Assignment & SLAs | Chatwoot | Do not duplicate in Typebot |
| Conversational Flow Execution | Typebot | Restrict Chatwoot Automations to inbox-level workflows |
| Tenants, Roles & Channel Ownership | Control Plane | Store Chatwoot/Typebot IDs as foreign references only |
| Canonical Contacts & Identities | Control Plane | Chatwoot holds operational copy with bi-directional sync |
| AI & Knowledge Base | AI Service & Control Plane | Do not use Typebot session variables as knowledge base |
| Analytics & Campaign History | Control Plane | Aggregate events from engines into single ledger |

## Access Model Decisions

| Actor | Access |
| --- | --- |
| Platform administrator | All companies, employees, configuration, conversations, and audit records |
| Employee / operator | Only explicitly assigned companies; one employee may manage multiple companies |
| Client company | No My AI Desk account or login; receives the managed service only |
