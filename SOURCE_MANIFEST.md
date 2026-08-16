# Source manifest

| Project | Runtime image | Optional fork clone |
| --- | --- | --- |
| Chatwoot | `chatwoot/chatwoot:v4.16.2-ce` | `upstreams/chatwoot/` |
| Typebot | `baptistearno/typebot-*:3.17.2` | `upstreams/typebot/` |

Normal operation uses pinned Docker images and does not require local upstream source. The optional source build reads real Git clones from `upstreams/`, which is ignored by the product repository so each fork keeps its own history.

Clone your forks by passing their URLs:

```powershell
.\scripts\sync-sources.ps1 `
  -ChatwootUrl https://github.com/YOUR_ACCOUNT/chatwoot.git `
  -TypebotUrl https://github.com/YOUR_ACCOUNT/typebot.io.git
```

Build and run fork candidates only when needed:

```powershell
docker compose -f docker-compose.yml -f docker-compose.source-build.yml up -d --build
```
