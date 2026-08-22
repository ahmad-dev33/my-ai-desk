# Meta channel setup and compliance checklist

This document separates what the server already enforces from the values the
platform owner must obtain from Meta. Never paste App Secrets or access tokens
into tickets, chat messages, tenant-visible configuration, or PostgreSQL.

## Implemented server contract

- Webhook verification: `GET https://hooks.<domain>/webhooks/meta`
- Signed events: `POST https://hooks.<domain>/webhooks/meta`
- OAuth callback: `GET https://hooks.<domain>/oauth/meta/callback`
- Exact raw-body `X-Hub-Signature-256` HMAC verification.
- Unique ownership of an active provider account across tenants.
- Provider-event idempotency and a durable event ledger.
- Tenant-scoped Meta contact identities and conversation links.
- A database outbox with retries, stale-job recovery, provider receipts, and a dead state.
- 24-hour user-initiated messaging-window enforcement for ordinary automated replies.
- Secrets resolved server-side by `credential_ref`.
- Product/knowledge-grounded replies, confidence fallback, human handoff, and AI auditing.
- WhatsApp Cloud message/status webhook normalization and text delivery by phone-number ID.
- Best-effort mirroring of real Meta conversations into the tenant's Chatwoot account.
- Automatic `subscribed_apps` registration after a Facebook Page or linked
  Instagram professional account is selected.
- Safe disconnect that disables the channel, removes its encrypted credential,
  and unsubscribes that Page or Instagram account from this app's Webhooks.

Comment-to-DM is deliberately not sent through the ordinary message endpoint.
It stays pending until the provider-specific Private Reply adapter and its reviewed
permission are enabled. Broadcast delivery also remains disabled until consent,
approved use cases, provider receipts, and template/window rules are proven.

## Values supplied by the platform owner

For an existing local installation, run `./scripts/prepare-meta.ps1` once. It
creates `META_VERIFY_TOKEN` and `CREDENTIAL_ENCRYPTION_KEY` directly in the
git-ignored `.env` file without printing either value. It never fills or
overwrites `META_APP_ID` or `META_APP_SECRET`.

| Setting | Source | Storage |
| --- | --- | --- |
| `META_APP_SECRET` | Meta App Dashboard | Server secret store |
| `META_APP_ID` | Meta App Dashboard | Environment configuration |
| `META_VERIFY_TOKEN` | Generate a random value | Server secret store and Meta Webhooks form |
| `META_OAUTH_REDIRECT_URI` | Public callback URL above | Meta Login settings and environment |
| `CREDENTIAL_ENCRYPTION_KEY` | Generate a separate 32-byte key | Server secret store; never PostgreSQL |
| `META_GRAPH_VERSION` | Version selected for the release | Environment configuration |
| Page/IG/WABA access token | Meta onboarding flow | Secret store under a `credential_ref` |
| Page or Instagram account ID | Meta onboarding result | `channel_connections.external_account_id` |
| WhatsApp phone-number ID | WhatsApp onboarding result | Channel external ID/config |
| Chatwoot account/inbox IDs | Tenant provisioning | Channel routing columns |

Example secret injection shape (never commit the real value):

```json
{
  "meta-company-a-facebook": { "accessToken": "injected-by-secret-store" },
  "meta-company-b-instagram": { "accessToken": "injected-by-secret-store" }
}
```

The channel row stores only `credential_ref=meta-company-a-facebook`.

## Meta App Dashboard checklist

1. Own the app through the platform company's verified Business Portfolio.
2. Configure the privacy policy, terms, data-deletion instructions, support email,
   app icon, owned domain, and production HTTPS URLs.
3. Add Messenger, Webhooks, Instagram API, and optionally WhatsApp Cloud API.
4. Configure the callback URL above and the exact `META_VERIFY_TOKEN`.
5. Start with the smallest permission set needed for the recorded review scenario.
6. In Development mode, test only with app-role users and owned test assets.
7. Record review evidence showing: connect asset, receive user message, grounded
   automated reply, Chatwoot handoff, disconnect/revoke, and data deletion.
8. Request Advanced Access only after the complete test passes.
9. Switch to Live only after Business Verification and App Review succeed.

Typical permissions (Meta can rename or regroup them; confirm in the current App Dashboard):

- Facebook messages: `pages_show_list`, `pages_manage_metadata`, `pages_messaging`.
- Page comment use cases: `pages_read_engagement`, `pages_manage_engagement` as required.
- Instagram Login: `instagram_business_basic`,
  `instagram_business_manage_messages`, `instagram_business_manage_comments`.
- WhatsApp: `whatsapp_business_management`, `whatsapp_business_messaging`.

## First owned account workflow

The first pilot uses Facebook Login because the account already managed a Page
and linked Instagram professional account through ManyChat.

1. Do not copy the Facebook/Instagram password into My AI Desk or `.env`.
2. Configure the Meta App values above and a public HTTPS callback.
3. Add the owner as an app administrator/developer while the Meta App is in
   Development mode.
4. Open **قنوات Meta** and connect Facebook Messenger first.
5. Sign in only inside Meta's authorization page and select the owned Page.
6. Connect the Instagram professional account linked to that Page.
7. Send one real inbound message from a separate customer/test account and
   confirm inbound, automatic reply, delivery state, and Chatwoot handoff.
8. Keep ManyChat connected until the new path passes. Then configure Meta
   conversation routing or pause ManyChat automation so only one app replies.

An account having worked in ManyChat proves the asset is eligible, but it does
not transfer ManyChat's Meta App permissions or access tokens to My AI Desk.
My AI Desk must be authorized as its own Meta App.

## Production safety gate

Before a real client asset is connected:

- Replace all development fallback secrets.
- Use a public HTTPS domain and restrict infrastructure/admin access.
- Confirm webhook signatures, cross-tenant tests, token revocation, and reconnect flow.
- Run a single test company through inbound, reply, delivery/read receipt, and handoff.
- Confirm backups, monitoring, rate limits, and dead-letter alerts.
- Do not enable broadcasts or comment-to-DM merely because an API call succeeds;
  enable them only for an approved use case with consent and policy tests.
