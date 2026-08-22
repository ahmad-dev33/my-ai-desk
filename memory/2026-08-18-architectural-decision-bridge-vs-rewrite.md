# Architectural Decision Record — Bridge & Control Plane Strategy

> This record remains canonical for engine integration. Product users, company access, and employee assignment rules are canonical in `docs/PRODUCT_DEFINITION.md`.

**Date:** 2026-08-18  
**Status:** Approved / Canonical  

---

## 1. Context & Problem Statement

When integrating third-party open-source applications (such as **Chatwoot** for live chat inboxes and **Typebot** for conversational chatbots), two integration paths are often considered:
1. **Direct Code Rewrite / Merging:** Translating one application's codebase into the other or merging both into a single custom monolith.
2. **Bridge + Control Plane (Loose Coupling):** Keeping both upstream open-source applications untouched as independent microservices and orchestrating communication, identity, and CRM state via a 3rd program (Control Plane & Event Bridge).

---

## 2. Decision

We strictly adopt the **Bridge + Control Plane (Loose Coupling)** approach.

- **Chatwoot** remains the untouched upstream engine for human inbox management, SLAs, and operator messaging.
- **Typebot** remains the untouched upstream engine for conversational flow logic and chatbot execution.
- **Control Plane** (the 3rd program) acts as the single source of truth for Tenants, CRM Contacts, Products, Knowledge (RAG), and Channel Connections.
- **Event Bridge** translates webhooks, manages session states via Redis, and routes execution between Chatwoot and Typebot seamlessly.

---

## 3. Rationale & Trade-offs

| Criteria | Direct Rewrite / Translation | Bridge + Control Plane (Selected) |
| --- | --- | --- |
| **Upstream Upgrades** | ❌ Impossible. Fork becomes unmaintainable over time. | ✅ Seamless. Upstream Docker images can be updated without touching bridge logic. |
| **Security Patches** | ❌ Manual re-implementation of security fixes. | ✅ Inherited directly from official release channels. |
| **Time to Market** | ❌ Months/years rebuilding complex engine capabilities. | ✅ Immediate utilization of mature open-source engines. |
| **Separation of Concerns**| ❌ Monolithic coupling of inbox, builder, and CRM state. | ✅ Clean boundaries: Control plane owns business state; engines own execution. |

---

## 4. Non-Negotiable Guidelines for Future AI Agents & Developers

1. **Do NOT rewrite or translate engine code.** Never convert Chatwoot Rails/Vue code into Typebot Next.js code or vice-versa.
2. **Do NOT duplicate CRM or tenant state in engines.** Chatwoot and Typebot store operational copies or session variables, but Control Plane is the canonical source of truth.
3. **Keep engine Docker containers upstream.** Utilize standard release tags (e.g. `baptistearno/typebot-builder`, `quay.io/keycloak/keycloak`) and customize via environment configuration, database overrides, or Traefik routing rather than code forks whenever possible.
