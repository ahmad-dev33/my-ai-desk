# Control-plane plan decision

- Approved approach: hybrid modular control plane (Plan B).
- Expansion mode: selective, phased expansion.
- Product boundary: the dashboard and control-plane API are the product; Chatwoot and Typebot are replaceable internal engines.
- Chatwoot owns human inbox operations. Typebot owns conversational graph execution.
- The control plane owns tenants, operators, memberships, canonical contacts, channel identities, automation registry, versions, usage, and audit.
- First implementation slice: OIDC-protected control plane, tenant/contact/automation foundation, native tenant dashboard, Compose wiring, and corrected source-build paths.
- Next slice: durable event ingestion with outbox, retries, dead-letter queue, and migration away from the synchronous bridge.
