# My AI Desk — Master Implementation Plan

**Status:** Approved and in progress  
**Branch:** `develop`  
**Canonical scope:** [`PRODUCT_DEFINITION.md`](./PRODUCT_DEFINITION.md)

## Outcome

Deliver an always-on internal operations platform that lets the platform administrator and administrator-created employees manage automated customer engagement for approximately 1,000 isolated client companies. Client companies do not log in. Employees may manage multiple explicitly assigned companies, while the administrator can inspect all companies and employee activity.

## Premises

1. My AI Desk is an internal managed-service platform, not a client self-service SaaS product.
2. Only the platform administrator and administrator-created employees authenticate to the management interface.
3. The platform administrator has platform-wide visibility and control.
4. Employee-to-company access is many-to-many and deny-by-default.
5. Tenant isolation must be enforced server-side across every data and execution path, not only in the dashboard.
6. Chatwoot remains the only human inbox, Typebot remains the flow engine, and the Control Plane owns canonical business state and orchestration.
7. Automation must continue when no dashboard session is open.
8. Capacity is designed around active channels, message throughput, jobs, AI calls, and provider limits, with 1,000 companies as the initial scale target.

## Current Assets to Reuse

- Keycloak OIDC verification and the `platform-admin` realm role.
- `operators`, `memberships`, and tenant-scoped tables in PostgreSQL.
- `assertTenantAccess` and tenant-filtered tenant listing.
- Dashboard tenant switcher and native contacts, products, knowledge, automation, and keyword-rule screens.
- Integrated Chatwoot/Typebot bridge with Redis sessions, idempotency, retries, and DLQ.
- Tenant-scoped catalog, knowledge, RAG, and marketing-foundation tables.
- Existing unit tests for routing, catalog, channel validation, webhooks, contact sync, and RAG/keyword behavior.

## Progress Snapshot — 2026-08-18

- Phase 0 validation passes: Control Plane tests, syntax checks, dashboard production build, Compose rendering, and Keycloak shell syntax.
- Phase 1 foundation is implemented: least-privileged Keycloak employee provisioning, administrator-only employee APIs and dashboard, many-to-many company assignments, suspension enforcement on existing tokens, audit events, and server-side tenant status/membership checks.
- Automated coverage currently passes 39 tests, including employee-admin denial, assignment audit, self-suspension prevention, suspended-token denial, tenant role denial, cross-tenant Chatwoot session denial, and downstream access revocation on suspension.
- Phase 2 foundation now uses supported integrations: Typebot OIDC and Chatwoot Platform API provisioning with short-lived, origin-validated login links. Unsupported Chatwoot Keycloak environment variables were removed.
- The live Docker baseline passes: all six database migrations are applied; dashboard, API readiness, Keycloak discovery, and both downstream SSO helper routes respond successfully; Keycloak bootstrap and Chatwoot Platform API authentication succeed.
- Remaining Phase 1 exit work is broader guessed-resource/cross-tenant integration coverage plus interactive browser verification for administrator, multi-company employee, suspension, and unified logout scenarios.

## Delivery Order

### Phase 0 — Stabilize the Current Worktree

- Run all existing Control Plane tests, dashboard production build, syntax checks, and Compose validation.
- Fix regressions in the existing uncommitted implementation before layering new features.
- Separate factual current behavior from roadmap-only claims.

**Exit:** tests/build/Compose pass and the current uncommitted feature set is understood.

### Phase 1 — Identity, Employees, Permissions, and Tenant Isolation

- Define canonical platform and tenant roles with one normalization layer.
- Add administrator-only employee lifecycle APIs: list, create/invite, activate, suspend, and inspect.
- Add administrator-only many-to-many company assignment APIs with per-assignment roles.
- Add an administrator dashboard for employees, company assignments, status, and recent activity.
- Hide administrator-only navigation and actions from employees, while retaining server-side enforcement.
- Add audit events for tenant creation, employee lifecycle changes, assignments, role changes, and sensitive configuration changes.
- Add authorization tests covering cross-tenant reads/writes, guessed IDs, missing memberships, suspended users, role denial, and administrator bypass.
- Decide and implement the Keycloak provisioning mechanism without storing employee passwords in the Control Plane.

**Exit:** an administrator can create and assign employees; employees can manage multiple assigned companies and cannot access any unassigned company through UI or API.

### Phase 2 — Complete Single Sign-On

- Keep one Keycloak login as the user entry point.
- Validate dashboard token audience, issuer, refresh, logout, and session-expiry behavior.
- Establish Chatwoot identities and permissions for administrator-created employees.
- Establish Typebot SSO without a second login prompt.
- Remove redirect loops and test direct, expired, revoked, and partially provisioned sessions.
- Ensure employee tenant assignments are authoritative in the Control Plane even when downstream engines have operational users.

**Exit:** administrator and employee accounts sign in once and reach their authorized dashboard, Chatwoot, and Typebot surfaces without credential duplication or tenant leakage.

### Phase 3 — Channel Onboarding and Credential Isolation

- Add administrator-managed Facebook/Instagram channel onboarding and provider credential references.
- Store provider secrets outside tenant-readable configuration and resolve them only server-side.
- Verify webhook signatures, map every event to exactly one tenant/channel, and reject ambiguous routes.
- Add per-tenant/provider rate limits, token refresh handling, health state, and reconnect flows.
- Harden bidirectional Chatwoot contact synchronization and conflict resolution.

**Exit:** channels can be connected, monitored, rotated, and disconnected without exposing credentials or mixing tenants.

### Phase 4 — Production AI Reply Workflow

- Integrate real embedding and generation providers behind provider interfaces.
- Move document ingestion, parsing, chunking, and embeddings to durable background jobs.
- Enforce tenant-scoped retrieval, confidence thresholds, source attribution, fallback replies, and human handoff.
- Record every AI decision, source set, confidence result, latency, cost, outcome, and override in an event ledger.
- Add prompt-injection defenses, content limits, retry policy, provider timeouts, and safe degradation.
- Add administrator/employee screens for knowledge status, reply policy, prepared replies, tests, and handoff rules.

**Exit:** AI answers only from the correct company's approved knowledge and safely hands uncertain conversations to Chatwoot.

### Phase 5 — ManyChat Replacement Workflows

- Complete keyword rules, comment-to-message, story reply/mention triggers, and prepared replies.
- Implement segment evaluation, sequence scheduling, subscription state, broadcasts, and cancellation.
- Add a durable transactional outbox and horizontally scalable workers.
- Treat provider receipts as the source of delivery/read status; never infer delivery from enqueue success.
- Add campaign analytics, per-company quotas, scheduling in tenant timezone, and failure recovery.

**Exit:** the core workflows currently needed from ManyChat operate continuously with provider-confirmed outcomes.

### Phase 6 — Scale, Security, Operations, and Deployment

- Add structured logs, metrics, traces, queue depth, DLQ inspection, provider health, AI cost, and tenant-level diagnostics.
- Add database backup automation and verified restore drills.
- Add load tests based on active channels, burst messages, concurrent conversations, scheduled jobs, and AI provider limits.
- Add fair scheduling and tenant quotas so one noisy company cannot starve others.
- Add retention, export, deletion, credential rotation, and incident procedures.
- Produce production deployment configuration, rollback procedures, and upgrade checks for upstream engines.

**Exit:** measured capacity supports the agreed operating target, failures are observable and recoverable, and deployment does not depend on a developer workstation.

## Cross-Cutting Acceptance Criteria

- No client-company login or self-registration path exists.
- Every tenant-owned route proves membership or platform-administrator authority before data access.
- Every background job and cache/session key carries tenant identity.
- Cross-tenant negative tests exist for every resource family.
- Sensitive administrator and employee actions are auditable.
- No provider credential is returned to the dashboard after initial entry.
- Automation remains functional with all dashboards closed.
- Chatwoot and Typebot remain upgradeable upstream services rather than forks containing canonical business logic.

## Failure Modes Requiring Explicit Coverage

| Failure | Required behavior |
| --- | --- |
| Employee guesses another tenant or resource ID | Return denial without revealing existence or metadata |
| Employee assignment is revoked mid-session | Subsequent API calls fail; cached tenant state is discarded |
| Keycloak succeeds but downstream provisioning is incomplete | Dashboard explains the recoverable state; no unauthorized fallback |
| Redis is unavailable | Degrade explicitly; do not silently lose durable delivery guarantees |
| Provider retries a webhook | Idempotency prevents duplicate automation and replies |
| One tenant floods the system | Quotas/fair scheduling preserve other tenants' service |
| AI provider fails or confidence is low | Safe fallback and human handoff; no fabricated answer |
| Credential expires | Channel becomes unhealthy, alerts, and stops unsafe delivery attempts |
| Worker crashes after provider send | Reconciliation prevents duplicate send and records uncertain outcome |
| Backup exists but cannot restore | Deployment remains unhealthy until a restore drill succeeds |

## Not in Scope Without a New Product Decision

- Accounts or dashboards for client companies.
- Public signup, subscriptions, billing, or a client-facing SaaS portal.
- Rewriting Chatwoot or Typebot into the Control Plane.
- One complete infrastructure deployment per company by default.
- Claiming delivery, read, or campaign success without provider receipts.

## Initial Test Strategy

- Unit tests for role normalization, membership decisions, validators, and event classification.
- API integration tests for administrator and employee lifecycle and every cross-tenant denial path.
- SSO browser tests for administrator, multi-company employee, revoked employee, expired token, and logout.
- Worker integration tests for idempotency, retries, leases, crash recovery, and DLQ replay.
- Contract tests for Chatwoot, Typebot, and Meta provider adapters.
- Load tests with realistic tenant skew and provider-rate constraints.
- Backup restore and deployment smoke tests in an isolated environment.

## Decision Audit Trail

| # | Phase | Decision | Classification | Principle | Rationale | Rejected |
|---|---|---|---|---|---|---|
| 1 | Intake | Start with identity and tenant isolation before channel and AI expansion | Mechanical | Security and dependency order | Every later feature depends on trustworthy tenant ownership and employee authorization | Building more automation on incomplete authorization |
| 2 | Intake | Reuse one shared multi-tenant platform rather than deploy per company | Mechanical | Explicit and scalable | Matches the 1,000-company target and existing schema | Full stack per company |
| 3 | Intake | Keep client companies outside the authentication model | Mechanical | Canonical product definition | The service is operated by the owner and employees | Client self-service portal |
| 4 | SSO | Use Chatwoot Platform API instead of unsupported Keycloak environment variables | Mechanical | Upstream compatibility and security | Chatwoot Community exposes supported user, account-membership, and one-time-login APIs while remaining an untouched upstream image | Fake environment configuration or an internal-model sidecar |
