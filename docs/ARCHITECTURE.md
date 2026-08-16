# Unified AI Desk architecture

## Product boundary

The product is the dashboard and control plane. Chatwoot and Typebot are internal engines and must not become independent sources of tenant, identity, billing, or channel ownership.

## Sources of truth

| Domain | Owner |
| --- | --- |
| Tenants, operators, roles, usage, audit | Control plane |
| Unified contacts and channel identities | Control plane |
| Channel connections and inbound event identity | Control plane/channel gateway |
| Inbox, human messages, assignment, SLA | Chatwoot |
| Conversational graph and flow execution | Typebot |
| Automation registry, versions, triggers, sequences | Control plane |
| Customer-facing AI and tenant knowledge | Dedicated AI/RAG service (next phase) |
| Support-agent AI suggestions | Chatwoot Captain, if enabled |
| Unified product analytics | Control-plane event ledger (next phase) |

## Non-negotiable integration rules

1. A production channel account is connected to one ingress only.
2. Typebot variables are execution state, not CRM records.
3. Chatwoot automation rules are limited to inbox operations; conversational decisions belong to Typebot.
4. Downstream IDs are stored as mappings and never exposed as the product's canonical IDs.
5. Every inbound provider event must eventually have an idempotency key before asynchronous processing is enabled.

## Delivery phases

1. Foundation: control plane, tenant model, OIDC authorization, source builds, Compose wiring.
2. Reliability: durable event queue, outbox, retries, dead-letter queue, bridge migration.
3. ManyChat core: channel onboarding, keywords, comment-to-DM, story events, sequences, broadcasts.
4. Intelligence: isolated tenant knowledge bases, RAG, AI handoff policy, usage metering.
5. Native dashboard: replace high-frequency iframes with API-driven contacts, automations, campaigns, and analytics pages.
6. Production hardening: backups, observability, rate limits, load tests, disaster recovery.

## First release acceptance criteria

- One operator login controls multiple isolated tenants.
- One canonical contact can own multiple channel identities.
- A flow can be registered without leaking Typebot IDs into public APIs.
- Chatwoot remains the only human inbox.
- Health checks fail when the control-plane database is unavailable.
- Compose can build from both pinned images and the downloaded source directories.
