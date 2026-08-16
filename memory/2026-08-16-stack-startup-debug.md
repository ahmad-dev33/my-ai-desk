# Stack startup debugging — 2026-08-16

## Symptoms and reproduction

`docker compose up -d --build` did not produce a usable stack. The failures were reproduced with:

```powershell
docker compose --progress plain build control-plane dashboard bridge
docker compose up -d
docker compose ps -a
docker compose logs --tail 120
```

The local routing regression test is `scripts/test-local-routes.ps1`.

## Root causes

1. `dashboard/package-lock.json` contained a malformed nested optional package without a version, causing `npm ci` to fail with `Invalid Version:`.
2. Windows HTTP.sys/SQL Server Reporting Services owned port 80 (`HTTP://+:80/REPORTSERVER/` and `/REPORTS/`).
3. The Redis health check quoted the password so the shell did not expand it.
4. Typebot 3.17.2 requires a 32-character encryption secret and rejects present-but-empty SMTP credentials.
5. The control-plane health check used `localhost`, resolved to IPv6, while Node listened on IPv4.
6. Traefik 3.5 used an obsolete Docker API with Docker Engine 29, so its Docker provider returned 400 and registered no routes.
7. Multi-network containers needed Traefik pinned to the proxy network; Typebot also needed `HOSTNAME=0.0.0.0` to listen on both networks.
8. The webhook bridge cannot run before real Chatwoot and published Typebot tokens exist.

## Fixes

- Removed the malformed lockfile entry and verified `npm ci` in `node:22-alpine`.
- Made Traefik host ports configurable; local `.env` uses 8080/8443 while production defaults remain 80/443.
- Corrected Redis authentication in its health check.
- Corrected Typebot secrets/SMTP fallbacks and bootstrap secret generation.
- Changed the control-plane probe to `127.0.0.1`.
- Upgraded Traefik to v3.7 and selected `unified-ai-desk_proxy` as its Docker network.
- Bound Typebot to `0.0.0.0`.
- Put `bridge` behind the `automation` profile until its tokens are configured.

## Verification

The local route smoke test passes for Dashboard, API, Chatwoot, Typebot Builder, Typebot Viewer, and Keycloak. PostgreSQL, Redis, MinIO, and the control-plane health checks are healthy. Chatwoot migration/branding and the other init jobs exit with code 0 as expected.
