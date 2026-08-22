# My AI Desk Design & Integration System

**Status:** Active source of truth  
**Direction:** Calm control room — an Arabic-first, high-trust operations workspace

## 1. Product experience

My AI Desk is an internal operations product for one administrator and assigned employees managing many isolated client companies. It should feel like one coherent application even when specialist upstream engines are embedded inside it.

The memorable quality is **calm operational confidence**: the operator always knows which company is active, which capability they are using, and whether the system is ready, without repeated login screens or disruptive reloads.

## 2. Responsibility boundaries

| Capability | Owner | Dashboard responsibility |
| --- | --- | --- |
| Identity and employee access | Keycloak + Control Plane | One entry login, profile, logout, role-aware navigation |
| Company selection and isolation | Control Plane | Persistent visible company context; never trust client-side hiding for authorization |
| Human conversations, assignment and SLA | Chatwoot | Embed/deep-link only; do not rebuild its inbox |
| Conversation graph editing/execution | Typebot | Embed/deep-link only; do not rebuild its editor |
| Products, knowledge, CRM, channels and policy | Control Plane | Native focused management screens |
| Engine provisioning and sessions | Control Plane | Request short-lived sessions without exposing service credentials |

## 3. Single sign-on contract

- The administrator or employee signs in once through Keycloak.
- Typebot uses the existing Keycloak browser session through OIDC. A redirect may occur internally, but no second credentials form should appear.
- Chatwoot Community is bridged by the Control Plane: it provisions the authorized agent and creates a short-lived one-time session URL for the selected company account. This is session translation, not a second login.
- Logout ends the downstream engine sessions before ending Keycloak.
- My AI Desk never asks for or stores an employee's Chatwoot or Typebot password.

## 4. Embedded engine lifecycle

- Typebot is a singleton frame per dashboard browser session and remains mounted after first opening.
- Chatwoot has one active frame scoped to the selected company. It remains mounted while navigating elsewhere, but is intentionally refreshed when the company changes so account context cannot leak.
- Returning to the same engine and company must not request a new session or recreate the frame.
- Loading feedback is bounded and must never leave a permanent interaction-blocking layer. Errors expose a retry and an option to open the upstream engine separately.
- Do not keep one Chatwoot frame for every company; that would consume excessive memory at scale.

## 5. Visual language

### Color

- Canvas: `#F5F7FA`
- Surface: `#FFFFFF`
- Sidebar: `#0B1220`
- Primary ink: `#172033`
- Secondary ink: `#667085`
- Divider: `#E4E8EF`
- Accent: configurable brand primary, default `#635BFF`
- Success: `#087443`; warning: `#9A6700`; danger: `#B42318`

Use the accent for current location and primary actions, not as large decorative fields. Status colors must always include text or an icon.

### Typography

Use an Arabic UI stack: `Tajawal`, then `Noto Sans Arabic`, then the system sans-serif. Titles are compact and semibold; operational copy is short and direct. Numerals and IDs remain easy to scan.

### Shape and depth

- Controls: 8–10px radius.
- Cards and workspaces: 12–14px radius.
- Borders carry most separation; shadows remain subtle and reserved for floating layers.
- Use line icons from one visual family. Avoid emoji as navigation icons.

### Density

Navigation is compact and grouped by job. Embedded workspaces receive the largest possible viewport. Company context belongs in the top bar rather than consuming a separate permanent row.

## 6. Interaction rules

- Every navigation action changes the URL query so refresh/deep-linking returns to the same capability.
- Company selection is visible on all tenant-scoped capabilities.
- Native pages may use skeletons or local spinners; they must not freeze global navigation.
- Embedded-engine loading overlays are non-blocking and time-bounded.
- Important destructive actions require explicit labels and scoped confirmation.
- RTL is the primary layout; tables and technical identifiers may use LTR locally when helpful.

## 7. Integration sequence and quality gates

1. **Shell and engine lifecycle:** persistent frames, unified top bar, bounded loading. Gate: unit tests + production dashboard build.
2. **Native page consistency:** shared page header, forms, tables, empty/error states. Gate: each CRUD flow tested against an assigned and unassigned company.
3. **Company workflow:** workspace health, channel readiness, Chatwoot binding, Typebot flow references. Gate: tenant-switch tests with no data leakage.
4. **AI operations:** product/knowledge readiness, answer policy, handoff and audit trail. Gate: grounded-answer fixtures per company.
5. **Meta live onboarding:** real OAuth, webhook health and delivery receipts. Gate: text/media/manual/AI reply matrix on a test professional account.

No phase advances while its gate has a known critical failure. Fix or explicitly record lower-severity debt before continuing.

## 8. Reference patterns

- Intercom: inbox as a focused, fast operational workspace and role-oriented navigation.
- Linear: restrained surfaces, compact hierarchy and low-friction navigation.
- Stripe: clear status language, predictable tables and configuration hierarchy.
- HubSpot: persistent workspace context across related operational tools.

These are interaction references, not visual copies. My AI Desk remains Arabic-first and optimized for managed multi-company operations.
