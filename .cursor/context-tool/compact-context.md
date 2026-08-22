# My AI Desk — Compact Project Context

*Generated automatically on: Wed, 19 Aug 2026 13:15:22 GMT*

This file is a generated technical index for fast context recovery. `docs/PRODUCT_DEFINITION.md` remains canonical for product scope, users, roles, and access rules.

## 0. Canonical Product Definition

- My AI Desk is an internal platform for the platform administrator and administrator-created employees.
- Client companies receive a managed service and do not receive My AI Desk accounts or log in.
- The platform administrator can access every company, employee, configuration area, conversation, and audit record.
- Employees can access only explicitly assigned companies. The relationship is many-to-many: one employee may manage multiple companies, and one company may have multiple employees.
- Every company is an isolated tenant. Tenant boundaries must be enforced server-side across APIs, database queries, queues, caches, AI retrieval, files, exports, logs, and credentials.
- The server automation runtime operates continuously and independently of the dashboard.
- The target architecture must support approximately 1,000 client companies and grow beyond that without deploying a full stack per company.
- Full definition: [`docs/PRODUCT_DEFINITION.md`](../../docs/PRODUCT_DEFINITION.md).

## 1. System Core Architecture

- **Control Plane** (Express, PostgreSQL, Keycloak): Central backend managing tenants, CRM contacts, products catalog, automations registry, and knowledge sources (RAG with `pgvector`). Includes the merged Webhook Ingestion & Event Bridge.
- **Dashboard** (React, Keycloak OIDC, Vite): Internal interface for the platform administrator and employees. The administrator manages all companies and employee assignments; employees operate only explicitly assigned companies and may be assigned to more than one. Client companies do not log in. It includes AI policy, ready replies, native screens (Contacts, Products, Knowledge, Automations), and integrated access to Chatwoot and Typebot. It does not need to stay open for server automation to run.
- **Chatwoot**: The only human inbox. Manages assignments, SLAs, and direct agent/operator communication.
- **Typebot**: Conversation graph execution engine.
- **SSO & Keycloak**: Keycloak is the single user entry point. Typebot uses OIDC, while the Control Plane uses Chatwoot Platform APIs to provision account-scoped agents and issue short-lived one-time inbox login links.

## 2. Docker Infrastructure & Services

| Service | Image | Ports |
| --- | --- | --- |
| `traefik` | `traefik:v3.7` | *Internal* |
| `postgres` | `pgvector/pgvector:pg16` | *Internal* |
| `postgres-init` | `postgres:16-alpine` | *Internal* |
| `redis` | `redis:7.4-alpine` | *Internal* |
| `minio` | `minio/minio:RELEASE.2025-07-23T15-54-02Z` | *Internal* |
| `minio-init` | `minio/mc:RELEASE.2025-07-21T05-28-08Z` | *Internal* |
| `chatwoot-migrate` | `N/A` | *Internal* |
| `chatwoot-brand` | `N/A` | *Internal* |
| `chatwoot-web` | `N/A` | *Internal* |
| `chatwoot-sidekiq` | `N/A` | *Internal* |
| `typebot-builder` | `baptistearno/typebot-builder:${TYPEBOT_VERSION:-v3.17.1}` | *Internal* |
| `typebot-viewer` | `baptistearno/typebot-viewer:${TYPEBOT_VERSION:-v3.17.1}` | *Internal* |
| `keycloak` | `quay.io/keycloak/keycloak:${KEYCLOAK_VERSION:-26.6.3}` | *Internal* |
| `keycloak-init` | `quay.io/keycloak/keycloak:${KEYCLOAK_VERSION:-26.6.3}` | *Internal* |
| `control-plane` | `N/A` | *Internal* |
| `dashboard` | `N/A` | *Internal* |

## 3. Database Schema (PostgreSQL)

### Table: `tenants`
- `id`: `uuid` PK
- `name`: `text`
- `slug`: `citext`
- `status`: `text`
- `locale`: `text`
- `timezone`: `text`
- `settings`: `jsonb`
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### Table: `operators`
- `id`: `uuid` PK
- `oidc_subject`: `text`
- `email`: `citext`
- `display_name`: `text`
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### Table: `memberships`
- `tenant_id`: `uuid` FK -> tenants(id)
- `operator_id`: `uuid` FK -> operators(id)
- `roles`: `text[]`
- `created_at`: `timestamptz`

### Table: `channel_connections`
- `id`: `uuid` PK
- `tenant_id`: `uuid` FK -> tenants(id)
- `provider`: `text`
- `external_account_id`: `text`
- `display_name`: `text`
- `status`: `text`
- `credential_ref`: `text`
- `config`: `jsonb`
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### Table: `contact_profiles`
- `id`: `uuid` PK
- `tenant_id`: `uuid` FK -> tenants(id)
- `display_name`: `text`
- `email`: `citext`
- `phone`: `text`
- `status`: `text`
- `custom_fields`: `jsonb`
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### Table: `contact_identities`
- `id`: `uuid` PK
- `tenant_id`: `uuid` FK -> tenants(id)
- `contact_id`: `uuid` FK -> contact_profiles(id)
- `provider`: `text`
- `external_id`: `text`
- `username`: `text`
- `metadata`: `jsonb`
- `created_at`: `timestamptz`

### Table: `automation_definitions`
- `id`: `uuid` PK
- `tenant_id`: `uuid` FK -> tenants(id)
- `name`: `text`
- `description`: `text`
- `status`: `text`
- `engine`: `text`
- `engine_ref`: `text`
- `current_version`: `integer`
- `created_by_subject`: `text`
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### Table: `automation_versions`
- `id`: `uuid` PK
- `automation_id`: `uuid` FK -> automation_definitions(id)
- `version`: `integer`
- `engine_ref`: `text`
- `definition_snapshot`: `jsonb`
- `published_by_subject`: `text`
- `published_at`: `timestamptz`
- `created_at`: `timestamptz`

### Table: `audit_logs`
- `id`: `bigint` PK
- `tenant_id`: `uuid` FK -> tenants(id)
- `actor_subject`: `text`
- `action`: `text`
- `resource_type`: `text`
- `resource_id`: `text`
- `metadata`: `jsonb`
- `occurred_at`: `timestamptz`

### Table: `catalog_products`
- `id`: `uuid` PK
- `tenant_id`: `uuid` FK -> tenants(id)
- `sku`: `citext`
- `name`: `text`
- `description`: `text`
- `status`: `text`
- `price_minor`: `bigint`
- `currency`: `char(3)`
- `inventory_quantity`: `integer`
- `attributes`: `jsonb`
- `media_urls`: `text[]`
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### Table: `knowledge_documents`
- `id`: `uuid` PK
- `tenant_id`: `uuid` FK -> tenants(id)
- `title`: `text`
- `source_kind`: `text`
- `source_uri`: `text`
- `content`: `text`
- `status`: `text`
- `checksum`: `text`
- `metadata`: `jsonb`
- `error_message`: `text`
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### Table: `knowledge_chunks`
- `id`: `uuid` PK
- `tenant_id`: `uuid` FK -> tenants(id)
- `document_id`: `uuid` FK -> knowledge_documents(id)
- `ordinal`: `integer`
- `content`: `text`
- `token_count`: `integer`
- `embedding`: `vector`
- `metadata`: `jsonb`
- `created_at`: `timestamptz`

### Table: `tenant_chatwoot_accounts`
- `tenant_id`: `uuid` PK FK -> tenants(id)
- `chatwoot_account_id`: `bigint`
- `created_at`: `timestamptz`
- `updated_at`: `timestamptz`

### Later columns added to `channel_connections`
- `chatwoot_account_id`: `bigint`
- `chatwoot_inbox_id`: `bigint`
- `automation_id`: `uuid`

### Later columns added to `operators`
- `status`: `text`
- `created_by_subject`: `text`
- `last_login_at`: `timestamptz`

### Later columns added to `operators`
- `chatwoot_user_id`: `bigint`

### Later columns added to `channel_connections`
- `IF`: `NOT`
- `IF`: `NOT`
- `IF`: `NOT`

## 4. Control Plane API Routes

### Routes in `src/routes/ai-rag.js` (Mounted at `/v1/tenants/:tenantId/ai`)
- **GET** `/v1/tenants/:tenantId/ai/policy`
- **PUT** `/v1/tenants/:tenantId/ai/policy`
- **POST** `/v1/tenants/:tenantId/ai/documents/:documentId/chunk`
- **POST** `/v1/tenants/:tenantId/ai/search`
- **POST** `/v1/tenants/:tenantId/ai/query`

### Routes in `src/routes/automations.js` (Mounted at `/v1/tenants/:tenantId/automations`)
- **GET** `/v1/tenants/:tenantId/automations`
- **POST** `/v1/tenants/:tenantId/automations`
- **POST** `/v1/tenants/:tenantId/automations/:automationId/publish`

### Routes in `src/routes/bridge-internal.js` (Mounted at `/internal/v1/bridge`)
- **GET** `/internal/v1/bridge/routes/chatwoot/:accountId/inboxes/:inboxId`

### Routes in `src/routes/channels.js` (Mounted at `/v1/tenants/:tenantId/channels`)
- **GET** `/v1/tenants/:tenantId/channels`
- **POST** `/v1/tenants/:tenantId/channels`
- **PATCH** `/v1/tenants/:tenantId/channels/:connectionId`

### Routes in `src/routes/contacts.js` (Mounted at `/v1/tenants/:tenantId/contacts`)
- **GET** `/v1/tenants/:tenantId/contacts`
- **POST** `/v1/tenants/:tenantId/contacts`
- **POST** `/v1/tenants/:tenantId/contacts/sync/chatwoot`
- **POST** `/v1/tenants/:tenantId/contacts/:contactId/sync/outbound`

### Routes in `src/routes/knowledge.js` (Mounted at `/v1/tenants/:tenantId/knowledge`)
- **GET** `/v1/tenants/:tenantId/knowledge`
- **POST** `/v1/tenants/:tenantId/knowledge`
- **GET** `/v1/tenants/:tenantId/knowledge/:documentId`
- **DELETE** `/v1/tenants/:tenantId/knowledge/:documentId`

### Routes in `src/routes/manychat.js` (Mounted at `/v1/tenants/:tenantId/manychat`)
- **GET** `/v1/tenants/:tenantId/manychat/keywords`
- **POST** `/v1/tenants/:tenantId/manychat/keywords`
- **DELETE** `/v1/tenants/:tenantId/manychat/keywords/:ruleId`
- **POST** `/v1/tenants/:tenantId/manychat/keywords/test`
- **GET** `/v1/tenants/:tenantId/manychat/sequences`
- **POST** `/v1/tenants/:tenantId/manychat/sequences`
- **POST** `/v1/tenants/:tenantId/manychat/sequences/:sequenceId/subscribe`
- **GET** `/v1/tenants/:tenantId/manychat/broadcasts`
- **POST** `/v1/tenants/:tenantId/manychat/broadcasts`
- **POST** `/v1/tenants/:tenantId/manychat/broadcasts/:campaignId/dispatch`
- **POST** `/v1/tenants/:tenantId/manychat/story-hook`
- **GET** `/v1/tenants/:tenantId/manychat/analytics`

### Routes in `src/routes/operators.js` (Mounted at `/v1/operators`)
- **GET** `/v1/operators`
- **POST** `/v1/operators`
- **PATCH** `/v1/operators/:operatorId`
- **PUT** `/v1/operators/:operatorId/memberships/:tenantId`
- **DELETE** `/v1/operators/:operatorId/memberships/:tenantId`

### Routes in `src/routes/products.js` (Mounted at `/v1/tenants/:tenantId/products`)
- **GET** `/v1/tenants/:tenantId/products`
- **POST** `/v1/tenants/:tenantId/products`
- **PATCH** `/v1/tenants/:tenantId/products/:productId`
- **DELETE** `/v1/tenants/:tenantId/products/:productId`

### Routes in `src/routes/sessions.js` (Mounted at `/v1/sessions`)
- **POST** `/v1/sessions/chatwoot`

### Routes in `src/routes/tenants.js` (Mounted at `/v1/tenants`)
- **GET** `/v1/tenants`
- **POST** `/v1/tenants`

### Routes in `src/routes/webhooks.js` (Mounted at `/webhooks`)
- **POST** `/webhooks/webhooks/chatwoot`

## 5. Codebase Landscape & Functions Index

Below is a recursive index of all files in the control-plane and dashboard showing their line counts, purpose, dependencies, and all parsed functions/methods. Use this to find functions without opening files.

### Directory: `control-plane/src`

#### File: `control-plane/src/access.js` (58 lines)
- **Role**: Handles database-level authorization, workspace tenant access control, and operator upserts.
- **Functions / Methods**:
  - `upsertOperator(db, identity)`
  - `requireActiveOperator(db)`
  - `activeOperator(req, res, next)`
  - `assertTenantAccess(db, identity, tenantId, acceptedRoles = [])`

#### File: `control-plane/src/ai/tenant-answer.js` (164 lines)
- **Role**: Application source logic.
- **Dependencies (Imports)**: `rag-engine.js`
- **Functions / Methods**:
  - `relevance(query, ...values)`
  - `formatPrice(product)`
  - `deterministicReply(products, chunks)`
  - `generateWithOpenAI({ apiKey, model, systemPrompt, question, products, chunks })`
  - `loadTenantContext(db, tenantId, question)`
  - `recordDecision(db, decision)`
  - `answerTenantQuestion({ db, config, tenantId, question, channelConnectionId, contactId, inboundMessageId })`
  - `normalize(value)`
  - `words(value)`

#### File: `control-plane/src/app.js` (82 lines)
- **Role**: Express application configuration, mounts middlewares (logging, CORS, JSON), handles authentication routing (/v1), and maps routes to prefix paths.
- **Dependencies (Imports)**: `auth.js`, `tenants.js`, `contacts.js`, `automations.js`, `products.js`, `knowledge.js`, `bridge-internal.js`, `channels.js`, `webhooks.js`, `ai-rag.js`, `manychat.js`, `operators.js`, `access.js`, `identity-provider.js`, `chatwoot-platform.js`, `sessions.js`, `gateway.js`, `oauth.js`
- **Functions / Methods**:
  - `createApp({ config, db, redis })`
  - `Method: use(express.json({ limit: '1mb', verify(req, _res, buffer)`

#### File: `control-plane/src/auth.js` (56 lines)
- **Role**: Keycloak JWT verification middleware, OIDC token parsing, and user role extraction.
- **Functions / Methods**:
  - `tokenRoles(payload)`
  - `createAuth(config)`
  - `authenticate(req, res, next)`
  - `requirePlatformAdmin(req, res, next)`

#### File: `control-plane/src/bridge/queue.js` (183 lines)
- **Role**: Implements Redis-backed asynchronous message queues with backoff retries & DLQ. Gracefully falls back to promise-based serial chains on Redis outage.
- **Functions / Methods**:
  - `createBridgeQueue({ redis, processMessage, logger, maxRetries = 3, initialBackoffMs = 100, autoStart = true })`
  - `rPush(key, val)`
  - `lPop(key)`
  - `lRange(key, start, stop)`
  - `lRem(key, count, value)`
  - `claimNextJob()`
  - `recoverInFlightJobs()`
  - `pushToDlq(job, error)`
  - `processNextRedisJob()`
  - `workerLoop()`
  - `enqueueInMemory(message)`
  - `enqueue(message)`
  - `getDlq()`
  - `stop()`

#### File: `control-plane/src/bridge/replies.js` (23 lines)
- **Role**: Parses and extracts answers from Typebot flow engine and structures replies to be pushed back to Chatwoot.
- **Functions / Methods**:
  - `richTextToText(value)`
  - `extractTypebotReplies(payload)`

#### File: `control-plane/src/bridge/webhook.js` (21 lines)
- **Role**: Filters, cleans, and parses incoming webhook payloads from Chatwoot, safeguarding operator privacy.
- **Functions / Methods**:
  - `getIncomingMessage(body)`

#### File: `control-plane/src/chatwoot-platform.js` (74 lines)
- **Role**: Uses Chatwoot Platform APIs to provision account-scoped agents and issue validated short-lived SSO links.
- **Functions / Methods**:
  - `platformError(code, statusCode, cause)`
  - `createChatwootPlatform(config, fetchImpl = fetch)`
  - `request(path, options = {})`
  - `ensureUserAccount({ email, name, accountId, role = 'agent' })`
  - `removeUserAccount({ userId, accountId })`
  - `createSession({ userId, accountId })`

#### File: `control-plane/src/chatwoot/meta-mirror.js` (123 lines)
- **Role**: Application source logic.
- **Functions / Methods**:
  - `credential(config, channel)`
  - `request(config, token, path, options = {}, fetchImpl = fetch)`
  - `contactShape(body, inboxId)`
  - `mirrorInboundToChatwoot({ db, config, channel, event, contactId, fetchImpl = fetch })`
  - `mirrorOutboundToChatwoot({ db, config, channel, message, fetchImpl = fetch })`
  - `parseJson(value)`

#### File: `control-plane/src/config.js` (52 lines)
- **Role**: Parses and validates environment variables with sensible defaults and error handling.
- **Functions / Methods**:
  - `loadConfig(environment = process.env)`
  - `optionalString(schema)`

#### File: `control-plane/src/credentials/store.js` (67 lines)
- **Role**: Application source logic.
- **Functions / Methods**:
  - `encryptionKey(config)`
  - `encryptCredential(config, value)`
  - `decryptCredential(config, row)`
  - `saveCredential(db, config, { credentialRef, provider, value, metadata = {}, expiresAt = null })`
  - `resolveCredential(db, config, credentialRef)`
  - `deleteCredential(db, credentialRef)`

#### File: `control-plane/src/crm/contact-sync.js` (195 lines)
- **Role**: Synchronizes contacts bi-directionally between the Chatwoot contact catalog and the canonical Control Plane CRM contacts database.
- **Functions / Methods**:
  - `syncContactFromChatwoot(db, tenantId, payload, provider = 'chatwoot')`
  - `syncContactToChatwoot(db, tenantId, contactId, options = {})`

#### File: `control-plane/src/db.js` (32 lines)
- **Role**: Initializes PostgreSQL pool client (`pg`), manages query helper wrapper, and provides transaction execution workflows.
- **Functions / Methods**:
  - `createDatabase(connectionString)`
  - `Method: transaction(work)`

#### File: `control-plane/src/identity-provider.js` (97 lines)
- **Role**: Provisions and controls employee identities through the least-privileged Keycloak administration client.
- **Functions / Methods**:
  - `providerError(code, statusCode, cause)`
  - `createIdentityProvider(config, fetchImpl = fetch)`
  - `getToken()`
  - `request(path, options = {})`
  - `createEmployee({ email, displayName, temporaryPassword })`
  - `setEmployeeEnabled(subject, enabled)`
  - `deleteEmployee(subject)`

#### File: `control-plane/src/manychat/parity-engine.js` (218 lines)
- **Role**: Application source logic.
- **Functions / Methods**:
  - `evaluateKeywords(db, tenantId, messageText, channelProvider = 'all')`
  - `processStoryReplyOrComment(db, tenantId, payload)`
  - `subscribeContactToDrip(db, tenantId, sequenceId, contactId)`
  - `dispatchBroadcast(db, tenantId, campaignId)`
  - `recordCampaignEvent(db, tenantId, campaignType, campaignId, eventType, contactId = null, metadata = {})`
  - `getCampaignAnalyticsLedger(db, tenantId)`

#### File: `control-plane/src/meta/gateway.js` (266 lines)
- **Role**: Application source logic.
- **Dependencies (Imports)**: `access.js`, `tenant-answer.js`, `parity-engine.js`, `outbox.js`, `meta-mirror.js`, `normalize.js`, `security.js`
- **Functions / Methods**:
  - `resolveChannel(db, event)`
  - `claimEvent(db, channel, event)`
  - `upsertMetaContact(db, channel, event)`
  - `openMessagingWindow(db, channel, event, contactId)`
  - `keywordReply(rule)`
  - `decideReply({ db, config, channel, event, contactId })`
  - `createMetaGateway({ db, config })`
  - `processPayload(payload, logger = console)`
  - `metaPublicRoutes({ db, config })`
  - `metaTenantRoutes({ db, config })`
  - `parseJson(value, fallback = {})`

#### File: `control-plane/src/meta/normalize.js` (107 lines)
- **Role**: Application source logic.
- **Functions / Methods**:
  - `stableEventId(parts)`
  - `messagingEvents(object, entry)`
  - `changeEvents(object, entry)`
  - `whatsappEvents(entry)`
  - `normalizeMetaPayload(payload)`

#### File: `control-plane/src/meta/oauth.js` (317 lines)
- **Role**: Application source logic.
- **Dependencies (Imports)**: `access.js`, `store.js`
- **Functions / Methods**:
  - `configured(config)`
  - `graphRequest(config, path, accessToken, options = {})`
  - `subscriptionUrl(config, provider, accountId, graphMode = 'facebook_login')`
  - `updateWebhookSubscription({ config, provider, accountId, accessToken, graphMode = 'facebook_login', subscribe = true, fetchImpl = fetch, })`
  - `exchangeCode(config, code)`
  - `loadSession(db, config, tenantId, actorSubject, sessionId)`
  - `listAssets(config, accessToken)`
  - `metaOAuthPublicRoutes({ db, config })`
  - `metaOAuthTenantRoutes({ db, config })`
  - `stateHash(state)`

#### File: `control-plane/src/meta/security.js` (19 lines)
- **Role**: Application source logic.
- **Functions / Methods**:
  - `secureEqual(left = '', right = '')`
  - `signMetaPayload(rawBody, appSecret)`
  - `verifyMetaSignature(rawBody, signature, appSecret)`

#### File: `control-plane/src/migrate.js` (31 lines)
- **Role**: Executes SQL database migrations in sequential order and tracks schema version history.
- **Dependencies (Imports)**: `db.js`
- **Functions / Methods**:
  - `migrate(connectionString)`

#### File: `control-plane/src/outbox/outbox.js` (217 lines)
- **Role**: Application source logic.
- **Dependencies (Imports)**: `meta-mirror.js`, `store.js`
- **Functions / Methods**:
  - `parseCredentials(value)`
  - `enqueueOutboundMessage(db, message)`
  - `metaEndpoint(config, channel)`
  - `requestBody(channel, message)`
  - `deliverOutboundMessage({ config, channel, message, providerCredential = null, fetchImpl = fetch })`
  - `claimNext(db)`
  - `markFailure(db, message, error)`
  - `createOutboxWorker({ db, config, logger = console, fetchImpl = fetch, autoStart = true })`
  - `applyProviderReceipt(db, event)`
  - `processNext()`
  - `tick()`
  - `Method: stop()`

#### File: `control-plane/src/rag/rag-engine.js` (271 lines)
- **Role**: AI content processor. Handles token chunking, pgvector semantic search, similarity embeddings, and agent handoff configurations.
- **Functions / Methods**:
  - `chunkText(text, options = {})`
  - `generateEmbedding(text, dimensions = 1536)`
  - `evaluateHandoff(db, tenantId, messageText)`
  - `searchKnowledge(db, tenantId, queryText, topK = 3)`
  - `processDocumentChunks(db, tenantId, documentId)`

#### File: `control-plane/src/routes/ai-rag.js` (112 lines)
- **Role**: REST endpoints for managing semantic policies, chunking documents, and querying knowledge vectors.
- **Dependencies (Imports)**: `access.js`, `tenant-answer.js`, `rag-engine.js`
- **Functions / Methods**:
  - `serializePolicy(row, tenantId, config)`
  - `aiRagRoutes(db, config = {})`

#### File: `control-plane/src/routes/automations.js` (71 lines)
- **Role**: REST endpoints for CRUD on flow definitions, metadata, and publishing version snapshots.
- **Dependencies (Imports)**: `access.js`
- **Functions / Methods**:
  - `automationRoutes(db)`

#### File: `control-plane/src/routes/bridge-internal.js` (42 lines)
- **Role**: Internal REST endpoints for webhook ingestion and resolver mappings.
- **Functions / Methods**:
  - `secureEqual(left = '', right = '')`
  - `bridgeInternalRoutes(db, serviceSecret)`

#### File: `control-plane/src/routes/channels.js` (133 lines)
- **Role**: REST endpoints for creating, activating, and updating multi-channel connection credentials.
- **Dependencies (Imports)**: `access.js`
- **Functions / Methods**:
  - `containsSensitiveConfig(value)`
  - `values(input)`
  - `bindChatwootAccount(client, tenantId, accountId)`
  - `channelRoutes(db)`

#### File: `control-plane/src/routes/contacts.js` (94 lines)
- **Role**: REST endpoints for Contact Profiles and Identities CRM actions, and outbound sync requests.
- **Dependencies (Imports)**: `access.js`, `validation.js`, `contact-sync.js`
- **Functions / Methods**:
  - `contactRoutes(db, config)`

#### File: `control-plane/src/routes/knowledge.js` (74 lines)
- **Role**: REST endpoints for document source CRUD, chunk indexing, and raw file uploads.
- **Dependencies (Imports)**: `access.js`, `validation.js`
- **Functions / Methods**:
  - `knowledgeRoutes(db)`

#### File: `control-plane/src/routes/manychat.js` (170 lines)
- **Role**: Application source logic.
- **Dependencies (Imports)**: `access.js`, `validation.js`
- **Functions / Methods**:
  - `manychatRoutes(db)`

#### File: `control-plane/src/routes/operators.js` (204 lines)
- **Role**: Administrator-only employee lifecycle and many-to-many company assignment APIs with audit logging.
- **Dependencies (Imports)**: `auth.js`
- **Functions / Methods**:
  - `unavailable()`
  - `chatwootUnavailable()`
  - `operatorRoutes(db, identityProvider, chatwootPlatform = null)`

#### File: `control-plane/src/routes/products.js` (95 lines)
- **Role**: REST endpoints for CRUD on unified products catalogs, conversion of price metrics, and stock allocations.
- **Dependencies (Imports)**: `access.js`, `validation.js`
- **Functions / Methods**:
  - `productRoutes(db)`

#### File: `control-plane/src/routes/sessions.js` (46 lines)
- **Role**: Creates tenant-authorized downstream engine sessions without exposing persistent service credentials.
- **Dependencies (Imports)**: `access.js`
- **Functions / Methods**:
  - `unavailable()`
  - `sessionRoutes(db, chatwootPlatform)`

#### File: `control-plane/src/routes/tenants.js` (68 lines)
- **Role**: REST endpoints for listing memberships and registering new tenant workspaces.
- **Dependencies (Imports)**: `auth.js`, `access.js`, `validation.js`
- **Functions / Methods**:
  - `tenantRoutes(db)`

#### File: `control-plane/src/routes/webhooks.js` (162 lines)
- **Role**: The event loop webhooks orchestrator. Manages Typebot sessions, continueChat/startChat API routing, and direct response dispatch back to Chatwoot.
- **Dependencies (Imports)**: `webhook.js`, `replies.js`, `queue.js`
- **Functions / Methods**:
  - `secureEqual(left = '', right = '')`
  - `webhookRoutes({ db, config, redis })`
  - `fetchJson(url, options = {})`
  - `parseJson(str, fallback = {})`
  - `startTypebot(publicId, message)`
  - `continueTypebot(sessionId, message)`
  - `sendChatwootReply(accountId, conversationId, content, token)`
  - `getBridgeRoute(message)`
  - `processMessage(message)`

#### File: `control-plane/src/server.js` (37 lines)
- **Role**: Main backend entrypoint. Connects to Postgres & Redis pools, and launches the HTTP server.
- **Dependencies (Imports)**: `config.js`, `db.js`, `migrate.js`, `app.js`, `outbox.js`
- **Functions / Methods**:
  - `shutdown(signal)`

#### File: `control-plane/src/validation.js` (16 lines)
- **Role**: Zod-backed utility functions for query parsing, pagination params, and validation schemas.
- **Functions / Methods**:
  - `slugify(value)`
  - `pagination(query)`

### Directory: `dashboard/src`

#### File: `dashboard/src/icons.jsx` (38 lines)
- **Role**: Application source logic.
- **Functions / Methods**:
  - `Icon({ name, size = 20, className = '' })`

#### File: `dashboard/src/main.jsx` (1346 lines)
- **Role**: Frontend entrypoint. Initializes Keycloak OIDC SSO, implements administrator employee management and tenant-scoped native screens, and manages the workspace switcher.
- **Dependencies (Imports)**: `api-errors.js`, `frame-loading.js`, `layout.js`, `icons.jsx`
- **Functions / Methods**:
  - `apiRequest(path, options = {})`
  - `logoutEngine(engine, origin)`
  - `TenantBar({ tenants, selectedId, onSelect })`
  - `Overview({ tenants, onRefresh, isAdmin })`
  - `EmployeesView({ tenants, currentSubject })`
  - `ContactsView({ tenantId })`
  - `ProductsView({ tenantId })`
  - `KnowledgeView({ tenantId })`
  - `AiAgentView({ tenantId })`
  - `AutomationsView({ tenantId })`
  - `ManychatView({ tenantId })`
  - `MetaChannelsView({ tenantId, isAdmin })`
  - `App()`
  - `serviceUrl(subdomain)`
  - `cleanup()`
  - `onMessage(event)`
  - `createTenant(event)`
  - `loadOperators()`
  - `createEmployee(event)`
  - `saveAssignment(event)`
  - `removeAssignment(operatorId, tenantId)`
  - `toggleStatus(operator)`
  - `loadContacts()`
  - `handleAdd(e)`
  - `loadProducts()`
  - `archiveProduct(productId)`
  - `loadDocs()`
  - `archiveDoc(docId)`
  - `loadPolicy()`
  - `savePolicy(event)`
  - `loadAutomations()`
  - `publishAutomation(automationId, engineRef)`
  - `loadData()`
  - `handleAddKeyword(e)`
  - `deleteKeyword(ruleId)`
  - `load()`
  - `startOnboarding(provider)`
  - `completeOnboarding(assetId)`
  - `disconnectChannel(channel)`
  - `loadTenants()`
  - `beginFrameLoading(key)`
  - `finishFrameLoading(key)`
  - `selectService(key, updateHistory = true, forceReload = false)`
  - `frameSource(key, item)`
  - `logout()`

## 6. Development Progress & Roadmap

### Current Phase (In Progress)
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

### Next Objectives
1. **Administrator and employee workflow**: finish administrator screens for companies, employee accounts, assignments, and audit activity; finish employee views for AI reply policy, ready replies, agent handoff, and channel status within assigned companies only. The dashboard is an internal management client and is not required to remain open for automation to run.
2. **Always-on server workflow**: add a durable outbox worker, provider delivery receipts, monitoring, backup verification, and deployment configuration for the server environment.
3. **AI reply workflow**: configure the embedding and generation providers, index tenant knowledge asynchronously, enforce confidence/handoff rules, and record every AI decision in the event ledger.
4. **Human-agent workflow**: keep Chatwoot as the single human inbox; sync contacts safely and expose the right deep links or native dashboard actions without duplicating inbox logic.
5. **Marketing workflow**: implement the Meta adapter, segment evaluation, sequence scheduling, broadcast delivery, and provider-confirmed analytics.

