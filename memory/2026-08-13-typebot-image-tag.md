# Debug report: Typebot image tag

- **Symptom:** `docker compose up -d --build` failed resolving `baptistearno/typebot-viewer:v3.17.2`.
- **Root cause:** Typebot Git releases use a `v` prefix, while its Docker Hub images publish semantic-version tags without that prefix. `TYPEBOT_VERSION` incorrectly reused the Git release format.
- **Fix:** Set `TYPEBOT_VERSION=3.17.2` in `.env` and `.env.example`.
- **Regression test:** `scripts/test-compose-versions.ps1` asserts the fully rendered Typebot and Chatwoot image names.
- **Evidence:** Docker Hub tag API lists `3.17.2` for both `typebot-builder` and `typebot-viewer`; Compose renders both corrected image references.
- **Status:** DONE.
