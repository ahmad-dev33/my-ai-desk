# Control-plane plan decision

> Historical snapshot. For current product scope and access rules, use `docs/PRODUCT_DEFINITION.md`. In particular, client companies do not log in; the platform administrator creates employees, and employees may manage multiple explicitly assigned companies.

- Approved approach: hybrid modular control plane (Plan B).
- Expansion mode: selective, phased expansion.
- Product boundary: the dashboard and control-plane API are the product; Chatwoot and Typebot are replaceable internal engines.
- Chatwoot owns human inbox operations. Typebot owns conversational graph execution.
- The control plane owns tenants, operators, memberships, canonical contacts, channel identities, automation registry, versions, usage, and audit.
- First implementation slice: OIDC-protected control plane, tenant/contact/automation foundation, internal administrator/operator dashboard, Compose wiring, and corrected source-build paths.
- Next slice: durable event ingestion with outbox, retries, dead-letter queue, and migration away from the synchronous bridge.
