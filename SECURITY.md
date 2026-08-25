# Security Policy

## Supported branch

Security fixes are applied to the latest `main` branch. Deployment operators
should keep the pinned Chatwoot, Typebot, Keycloak, PostgreSQL, Redis, MinIO,
Node.js, and reverse-proxy images current through reviewed updates.

## Reporting a vulnerability

Do not open a public issue for vulnerabilities, exposed credentials, tenant
isolation problems, authentication bypasses, or customer-data exposure. Use the
repository's **Security** tab and submit a private security advisory to
`ahmad-dev33`.

Include the affected component, reproduction steps, impact, and any suggested
mitigation. Never include live access tokens, passwords, customer messages, or
production database exports in a report.

## Secrets and customer data

The repository must never contain `.env`, access tokens, private keys, backups,
Docker volumes, provider payload exports, or real customer data. Use
`.env.example` for variable names and placeholders only.
