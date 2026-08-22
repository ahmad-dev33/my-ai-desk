# My AI Desk — Product Definition

**Status:** Canonical  
**Defined:** 2026-08-18

## Purpose

My AI Desk is an internal, multi-company operations platform used by the platform owner and their employees to provide automated customer-response, conversational AI, and human-inbox services for client companies.

It is intended to replace the owner's operational use of ManyChat. It is not currently a self-service SaaS product and client companies do not receive accounts or log in to the platform.

## Users and access

### Platform administrator

The owner is the platform administrator and can:

- Create, activate, suspend, and inspect client-company workspaces.
- Create, activate, suspend, and assign employee accounts.
- Access every company, conversation, product, automation, knowledge source, channel, report, and audit record.
- Review what employees changed and when they changed it.
- Configure platform-wide policies and integrations.

### Employees / operators

Employees use accounts created by the platform administrator. An employee can:

- Sign in to the internal My AI Desk interface.
- Access only the company workspaces explicitly assigned to them.
- Supervise conversations and handle AI-to-human handoffs.
- Maintain the assigned companies' products, prices, knowledge, prepared replies, and automations.
- Train and correct the AI using information belonging to the assigned company.

Employees must never see, search, infer, export, or modify data belonging to unassigned companies.

The employee-to-company relationship is many-to-many:

- One employee may manage multiple client companies.
- One client company may be managed by multiple employees.
- Every assignment is explicit, independently permissioned, auditable, and revocable.
- Access to one assigned company never grants access to any other company.

### Client companies

Client companies receive the managed service but do not log in to My AI Desk. Their pages, channels, products, prices, contacts, conversations, knowledge, AI configuration, automations, and analytics remain in an isolated workspace operated by the owner's team.

## Tenant isolation

Each client company is a tenant. Every tenant-owned record and background job must carry a tenant identifier. Isolation must be enforced server-side in authorization checks, database queries, queues, caches, AI retrieval, files, exports, logs, and channel credentials. Hiding another tenant in the interface is not sufficient security.

No company's products, prices, contacts, conversations, prompts, knowledge chunks, AI answers, credentials, campaign data, or analytics may leak into another company's workspace.

## Roles

The minimum role model is:

- `platform_admin`: unrestricted platform-wide access.
- `operator`: access only through explicit tenant memberships.

More granular tenant roles may be added later, such as supervisor, conversation agent, automation editor, knowledge editor, and read-only auditor. These must refine tenant access rather than bypass it.

## Always-on operation

The dashboard is a management client, not the automation runtime. Automated replies and scheduled work must continue when all administrators' and employees' computers are turned off and no browser is open.

The server-side system must continuously:

- Receive messages and channel events.
- Resolve the owning tenant and channel securely.
- Execute keyword rules, conversation flows, and AI policies.
- Retrieve knowledge only from the owning tenant.
- Send automated replies and record outcomes.
- Route conversations requiring a person to Chatwoot.
- Process retries, delayed work, failures, and delivery receipts durably.

## Engine boundaries

- The Control Plane is the canonical source for tenants, employee memberships, contacts, products, knowledge, channel ownership, automations, and audit history.
- Chatwoot is the only human conversation inbox.
- Typebot executes conversation graphs.
- Keycloak provides one login for the administrator and employees.
- Chatwoot and Typebot remain replaceable upstream engines and must not become the source of truth for tenant or CRM data.

## Scale target

The architecture must be designed to manage approximately 1,000 client companies and grow beyond that without deploying a complete copy of the platform for every company.

Scale must come from shared stateless application services, strict tenant-scoped data, durable queues and outbox processing, per-tenant/provider rate limits, horizontal workers, observability, and workload isolation. A busy or failing company must not block or expose another company.

The meaningful capacity measurements are active channels, inbound messages per second, concurrent conversations, AI requests, scheduled jobs, storage, and provider limits, not only the number of registered companies.

## Core product outcome

The platform owner can operate a large managed customer-engagement business from one administrative system. Employees receive separated workspaces for only their assigned companies. Client data never mixes, and automated service continues around the clock independently of the dashboard.

## Non-goals unless explicitly changed later

- Client-company self-registration or client logins.
- A public SaaS billing and subscription portal.
- Duplicating Chatwoot's inbox inside Typebot.
- Storing canonical CRM or tenant state in Chatwoot or Typebot.
- Running one full infrastructure stack per client company by default.
