# Consolidation, Optimization & Rebranding Report — 2026-08-17

> Historical completion report. For the current product boundary and user roles, use `docs/PRODUCT_DEFINITION.md`.

## Executed Changes

### 1. Strategy 1: Merging & Service Consolidation (Tier 2 Complete)
- **Bridge Ingestion Merged into Control Plane**:
  - Moved Chatwoot webhook parser (`webhook.js`) and Typebot rich-text reply extractor (`replies.js`) into `control-plane/src/bridge/`.
  - Added native webhook handler (`/webhooks/chatwoot`) directly inside `control-plane/src/routes/webhooks.js`.
  - Configured Redis session caching, idempotency tracking, and queue management directly within `control-plane`.
  - Updated `docker-compose.yml` to route `hooks.${BASE_DOMAIN}/webhooks/chatwoot` to `control-plane`.
  - Removed the standalone `bridge` container service, saving ~150MB RAM and removing inter-container network latency.
  - Added comprehensive webhook unit tests in `control-plane/test/webhooks.test.js`.

### 2. Strategy 2: Resource Footprint Optimization & Memory Capping (Tier 1 Complete)
- **Chatwoot Rails & Sidekiq**: Capped concurrency and enabled optimized memory allocations (`WEB_CONCURRENCY=1`, `RAILS_MAX_THREADS=5`, `SIDEKIQ_CONCURRENCY=3`, `MALLOC_ARENA_MAX=2`).
- **Keycloak (JVM)**: Restricted heap usage (`JAVA_OPTS_KC_HEAP="-Xms128m -Xmx384m"` and `JAVA_OPTS_APPEND="-XX:MaxRAMPercentage=70.0"`).
- **Typebot (Node.js)**: Capped Node.js V8 memory heap (`NODE_OPTIONS="--no-node-snapshot --max-old-space-size=384"`).
- **Redis**: Capped memory and configured LRU key eviction (`--maxmemory 256mb --maxmemory-policy volatile-lru`).
- **Total Expected Resource Reduction**: Saves ~1.5 GB to 2 GB of RAM across the deployment.

### 3. Strategy 3: Original Brand Customization & White-Labeling (Tier 1 Complete)
- **Dynamic Brand Variables**: Piped `BRAND_NAME`, `TERMS_URL`, `PRIVACY_URL`, and logo URLs through the `chatwoot-brand` container directly into Chatwoot's `InstallationConfig` database table.
- **SSO Identity**: Configured `CUSTOM_OAUTH_NAME="${BRAND_NAME}"` for Typebot authentication buttons.
- **Language Policy**: Established project-wide English rule in `.cursor/rules/language.mdc`.

## Verification Results
- `control-plane` unit test suite: **13 / 13 tests passed**.
- `dashboard` production build: **Passed (`dist/` generated cleanly in 3.37s)**.
- `docker-compose` configuration: **Valid (standard & production overrides)**.

## Next Steps (Tier 3 & Tier 4)
1. **Tier 3**: Build a custom Keycloak theme in `infra/keycloak/themes/original-brand/` to fully replace the Keycloak login screen.
2. **Tier 4**: Develop native React pages for CRM Contacts, Knowledge Base (pgvector), and Products inside the Dashboard to phase out heavy iFrames.
