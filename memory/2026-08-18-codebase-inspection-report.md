# Codebase Architecture & Deep Inspection Report — 2026-08-18

> Historical code inspection. Current product scope and access rules are defined in `docs/PRODUCT_DEFINITION.md` and take precedence over ambiguous role descriptions in this report.

This document serves as a persistent technical study of the Unified AI Desk repository. It details the file structures, business logic, single-source-of-truth boundaries, and potential error points to optimize future context recovery and speed up bug resolution.

---

## 1. Directory Structure & Key Files

The project is organized as a monorepo consisting of a centralized control plane, a frontend dashboard, and infrastructure orchestrations.

```
├── .env.example                       # Reference environment configuration
├── docker-compose.yml                 # Master stack definitions
├── docker-compose.low-memory.yml      # Capped-resource override configuration
├── control-plane/                     # Canonical Backend & Unified Event Bridge
│   ├── src/
│   │   ├── app.js                     # Express application configuration
│   │   ├── server.js                  # App bootstrap and port listener
│   │   ├── config.js                  # Standardized config parsing & fallback
│   │   ├── db.js                      # Postgres pg-pool configuration
│   │   ├── auth.js                    # Keycloak JWT verification middleware
│   │   ├── bridge/                    # Chatwoot-Typebot Event Translator Engine
│   │   │   ├── webhook.js             # Parses raw Chatwoot messages
│   │   │   ├── queue.js               # Redis-backed job queue with DLQ support
│   │   │   └── replies.js             # Extracts formatted Typebot responses
│   │   └── routes/
│   │       ├── webhooks.js            # Ingestion endpoint, session management, & outbound routing
│   │       ├── contacts.js            # CRM unified Contact API
│   │       ├── products.js            # Catalog Product API
│   │       ├── knowledge.js           # Knowledge Documents & semantic search embeddings
│   │       └── tenants.js             # Tenant creation and switching API
└── dashboard/                         # White-Labeled React Single Page App
    ├── index.html                     # Entry HTML, RTL (Arabic default configuration)
    ├── src/
    │   ├── main.jsx                   # Central React shell, Keycloak OIDC, and Native CRM pages
    │   └── styles.css                 # Minimalist responsive layout styling
```

---

## 2. Deep Dive: Event Bridge & Webhook Processing Flow

The Event Bridge receives messages from Chatwoot, determines the execution path (route mapping), triggers Typebot flow progression, and sends replies back.

```
[Chatwoot Event] -> [webhooks.js: /webhooks/chatwoot]
                           |
                     (Token Verification)
                           |
                           v
         [bridge/webhook.js: getIncomingMessage]
                           |
                           v
                [bridge/queue.js: enqueue]
                           |
           +---------------+---------------+
           | (If Redis Available)          | (If Redis Unavailable)
           v                               v
    [Redis Queue List]            [In-Memory Promise Chain]
           |                               |
           +---------------+---------------+
                           |
                           v
             [webhooks.js: processMessage]
                           |
               (Idempotency Key Verification)
                           |
                           v
        [webhooks.js: getBridgeRoute] (From SQL: channel_connections)
                           |
                           v
     [webhooks.js: Manage Session Key] (Typebot Session ID)
                           |
            +--------------+--------------+
            | (If session exists)         | (If new session)
            v                             v
     [continueChat API]             [startChat API]
            |                             |
            +--------------+--------------+
                           |
                           v
       [bridge/replies.js: Extract Typebot Answers]
                           |
                           v
        [webhooks.js: sendChatwootReply] (Looping Replies)
```

### Detailed Execution Mechanics

1. **Token Ingestion & Verification**:
   The webhook endpoint `/webhooks/chatwoot` accepts a query token (`?token=...`) or a custom HTTP header (`x-webhook-token`). It uses a time-constant comparison (`crypto.timingSafeEqual`) to prevent timing attacks.

2. **Incoming Event Filter**:
   `webhook.js:getIncomingMessage` filters incoming requests. It ignores any message that is:
   - Not of event type `message_created`.
   - Not categorized as `incoming` (checks `message_type` is `'incoming'`, `'0'`, or `0`).
   - Flagged as `private` (to protect operator notes).

3. **Multi-Tenant Queue Processing**:
   `queue.js` coordinates sequential command processing:
   - **With Redis**: Pushes jobs into `bridge:queue:pending` and pops them within a worker loop. On failure, it implements exponential backoff retries (`initialBackoffMs * 2^(attempt-1)`). If it exceeds maximum retries, the job is pushed into the Dead-Letter Queue (`bridge:queue:dlq`).
   - **Without Redis (Fallback)**: Spawns an in-memory queue using a Promise-based serialized dictionary, indexed by `${accountId}:${conversationId}`. This guarantees that messages from the same user conversation are strictly processed sequentially, avoiding race conditions in Typebot session states.

4. **Session Key Mapping & State Recovery**:
   The session mapping in Redis is structured as:
   `bridge:session:${tenant_id}:${channel_connection_id}:${conversationId}`
   If the session is missing, a call to `/startChat` is initiated. If it exists but is invalid (e.g., returns `404 Not Found` because the Typebot session expired on Typebot's side), the bridge handles the error gracefully by deleting the dead session key and calling `/startChat` again automatically.

5. **API Token Mapping**:
   Chatwoot authentication token is fetched conditionally to support multiple accounts:
   - First Priority: `BRIDGE_CREDENTIALS_JSON[route.credential_ref]`
   - Second Priority: `CHATWOOT_TOKENS_JSON[message.accountId]`
   - Third Priority (Fallback): `config.CHATWOOT_API_TOKEN`

---

## 3. Deep Dive: SSO & Dashboard Architecture

The dashboard is built as a single-entrypoint React application (`main.jsx`) wrapped in a Keycloak OpenID Connect (OIDC) flow.

### SSO Loop Detection & Inter-App Routing
Keycloak is configured to handle the main unified realm authentication. To achieve true SSO with Typebot builder:
- When the dashboard initializes, it checks the URL query parameter `sso`.
- If the parameter equals `typebot` or `typebot-error`, it indicates successful landing.
- If missing, it dynamically redirects the user to Typebot's SSO hook:
  `${flows_url}/sso/typebot.html?return=${encodedReturnUrl}`
- This ensures that logging into the main dashboard automatically authenticates the user inside the Typebot environment inside the iframe.

### Native Screens State Switching
The sidebar options switch between dynamic iFrames (`flows` and `inbox`) and custom native React views:
- **TenantBar**: Provides a top-level workspace switcher, injecting `selectedTenantId` into state.
- **Native Views**: ContactsView, ProductsView, KnowledgeView, and AutomationsView load data contextually by hitting:
  `/v1/tenants/${tenantId}/contacts`
  `/v1/tenants/${tenantId}/products`
  `/v1/tenants/${tenantId}/knowledge`
  `/v1/tenants/${tenantId}/automations`

---

## 4. Potential Vulnerabilities & Technical Risks

1. **Chatwoot Token Mapping Fallbacks**:
   If an operator adds a channel connection but forgets to configure the matching token inside `BRIDGE_CREDENTIALS_JSON` or `CHATWOOT_TOKENS_JSON`, the system falls back to `CHATWOOT_API_TOKEN`. If this default token does not have admin permissions across all target accounts, the bridge replies will fail with `HTTP 401/403`.

2. **Redis Outage Degradation**:
   If Redis crashes, the queue falls back to in-memory promise chains. However:
   - Idempotency checks cannot persist, making the system susceptible to duplicate messages from Chatwoot retries.
   - Session keys are lost, resulting in the termination of ongoing Typebot flows and forcing active chats to start from the beginning.
   - Job queues are lost during a container restart.

3. **Keycloak DNS & SSO Timing**:
   Keycloak tokens are refreshed every 30 seconds. If Keycloak or DNS experiences minor latency, `keycloak.updateToken` calls will fail, which may trigger a redirection back to Keycloak login, disrupting active operator workflows.

4. **Large File Upload Embeddings (RAG)**:
   In `knowledge.js`, processing massive documents can block the event loop or crash the control-plane container due to high memory consumption during parsing. Memory limits on the container must be strictly managed alongside async batch workers for chunk embedding generation.
