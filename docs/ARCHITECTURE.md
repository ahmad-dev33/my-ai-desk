# My AI Desk architecture

## Product boundary

The canonical product and access definition is [PRODUCT_DEFINITION.md](./PRODUCT_DEFINITION.md).

My AI Desk is an internal, desktop-first management product with a server-side service plane. It is used by the platform administrator and employees, not by client companies. The administrator creates companies and employee accounts and can inspect all activity. Employees manage customers, AI policies, ready replies, products, knowledge, and automation only for companies explicitly assigned to them. An employee may be assigned to multiple companies, and a company may have multiple employees.

The server side runs continuously and independently, receives channel events, sends automated AI replies, and keeps conversation state durable even while no dashboard is open.

The product is the dashboard and control plane. Chatwoot and Typebot are internal engines and must not become independent sources of tenant, employee identity, membership, or channel ownership.

## Sources of truth

| Domain | Owner |
| --- | --- |
| Tenants, operators, roles, usage, audit | Control plane |
| Unified contacts and channel identities | Control plane |
| Channel connections and inbound event identity | Control plane/channel gateway |
| Inbox, human messages, assignment, SLA | Chatwoot |
| Conversational graph and flow execution | Typebot |
| Automation registry, versions, triggers, sequences | Control plane |
| Customer-facing AI, tenant knowledge, reply policy, and handoff | Control Plane RAG and AI orchestration |
| Support-agent AI suggestions | Chatwoot Captain, if enabled |
| Unified product analytics | Control-plane event ledger (next phase) |

## Non-negotiable integration rules

1. A production channel account is connected to one ingress only.
2. Typebot variables are execution state, not CRM records.
3. Chatwoot automation rules are limited to inbox operations; conversational decisions belong to Typebot.
4. Downstream IDs are stored as mappings and never exposed as the product's canonical IDs.
5. Every inbound provider event must eventually have an idempotency key before asynchronous processing is enabled.
6. No engine code rewrites or translations: Third-party open-source engines (Chatwoot, Typebot, etc.) remain isolated, untouched upstream services/containers to ensure seamless upstream upgrades and security patches. All inter-engine translation, CRM data, tenant ownership, and event handling belong exclusively in the Control Plane.
7. Client companies do not authenticate to My AI Desk. Only the platform administrator and administrator-created employee accounts can sign in.
8. Every tenant-owned API request, query, cache key, job, AI retrieval, export, and credential lookup is tenant-scoped on the server. UI filtering alone is never an authorization boundary.
9. Employee-to-company access is many-to-many through explicit, auditable, and revocable memberships.
10. Each My AI Desk tenant maps to exactly one globally unique Chatwoot account. Multiple channels for that tenant may share that account, but two tenants must never share one Chatwoot account.
11. Keycloak is the login authority for My AI Desk and Typebot. Chatwoot access is provisioned through its supported Platform API and entered through a short-lived one-time link only after Control Plane tenant authorization.

## Delivery phases

1. Foundation: control plane, tenant model, OIDC authorization, source builds, Compose wiring.
2. Reliability: durable event queue, outbox, retries, dead-letter queue, and recovery of in-flight jobs.
3. ManyChat core: channel onboarding, keywords, comment-to-DM, story events, sequences, broadcasts.
4. Intelligence: isolated tenant knowledge bases, RAG, AI handoff policy, usage metering.
5. Native dashboard: replace high-frequency iframes with API-driven contacts, automations, campaigns, and analytics pages.
6. Production hardening: backups, observability, rate limits, load tests, disaster recovery.

## First release acceptance criteria

- The platform administrator can access all isolated tenants and audit employee activity.
- An employee can access multiple assigned tenants but cannot discover or access an unassigned tenant.
- Client companies have no My AI Desk login or self-registration path.
- One canonical contact can own multiple channel identities.
- A flow can be registered without leaking Typebot IDs into public APIs.
- Chatwoot remains the only human inbox for agents who log in and reply themselves.
- AI can reply automatically according to each tenant's policy, with a guarded handoff to the human inbox.
- Health checks fail when the control-plane database is unavailable.
- Compose can build from both pinned images and the downloaded source directories.
