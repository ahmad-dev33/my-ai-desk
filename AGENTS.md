# AI Agents Workspace Guide

Welcome to the **My AI Desk** repository. This file provides guidelines and context for AI agents working in this codebase.

## Session Initialization & Memory Recovery

At the start of every session, the AI agent MUST follow this sequence before making any changes or proposing code:

1. **Recover Context**: Read the central compact context file at `.cursor/context-tool/compact-context.md`, then read the canonical product and access definition at `docs/PRODUCT_DEFINITION.md`. These files define the current product boundary, architecture, DB schema, API routes, and roadmap. Only if details are missing should you check `docs/ROADMAP.md` or the relevant source files.
2. **Understand the Architecture**:
   - **Control Plane**: Source of truth for CRM, tenants, operators, memberships, products, and knowledge documents.
   - **Access Model**: My AI Desk is an internal tool for the platform administrator and employees. Client companies do not receive accounts. The administrator sees everything; employees see only explicitly assigned companies. Employee-to-company membership is many-to-many.
   - **Chatwoot**: The only human inbox.
   - **Typebot**: Conversation graph execution.
   - **Control-plane bridge**: Event translation, Redis session state, idempotency, and asynchronous processing live inside the Control Plane.
   - **Engine Integration Strategy**: Keep third-party open-source engines (Chatwoot, Typebot) as untouched upstream containers/services to allow seamless security updates and upstream syncing. Never translate or rewrite their code into each other. All custom logic, CRM state, and orchestration belong strictly in the `control-plane`.
3. **Re-use Existing Decisions**: Under no circumstances should you re-implement or duplicate tenant or CRM logic in Typebot or Chatwoot.
4. **Follow the Roadmap**: Check the "قيد التنفيذ" and "التالي" sections in `docs/ROADMAP.md` to align with the current implementation phase.
5. **Resolve Documentation Priority**: `docs/PRODUCT_DEFINITION.md` is canonical for product scope and access. Current architecture and roadmap documents come next. Files under `memory/` are historical snapshots and must not override current canonical documents.

*Do not ask the user for context that is already documented in `.cursor/context-tool/compact-context.md` or `docs/`. Always read files first.*

## Skill Routing

When the user's request matches an available skill, invoke it via the Skill tool. When in doubt, invoke the skill.

Key routing rules:
- Product ideas/brainstorming → invoke /office-hours
- Strategy/scope → invoke /plan-ceo-review
- Architecture → invoke /plan-eng-review
- Design system/plan review → invoke /design-consultation or /plan-design-review
- Full review pipeline → invoke /autoplan
- Bugs/errors → invoke /investigate
- QA/testing site behavior → invoke /qa or /qa-only
- Code review/diff check → invoke /review
- Visual polish → invoke /design-review
- Ship/deploy/PR → invoke /ship or /land-and-deploy
- Save progress → invoke /context-save
- Resume context → invoke /context-restore
- Author a backlog-ready spec/issue → invoke /spec
