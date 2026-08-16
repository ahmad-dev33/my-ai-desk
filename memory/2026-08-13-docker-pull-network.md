# Debug report: Docker pulls stalled

- **Symptom:** even `docker pull redis:7.4-alpine` stayed at `Pulling from` without downloading layers.
- **Root cause:** the Docker daemon configured three registry mirrors. `docker.iranrepo.ir` timed out and `daocloud.io/v2/` returned a non-registry 404 page. Docker Hub's official registry was reachable directly.
- **Fix:** removed only the invalid `registry-mirrors` array from `C:\Users\abd\.docker\daemon.json`, preserved other daemon settings, and restarted Docker Desktop.
- **Evidence:** `docker info` reports `Mirrors=[]`; a fresh direct pull of `redis:7.4-alpine` completed with digest `sha256:e7723ff73d963f5cc6d9c4643ea3d989527a402a319239054e9472a7fb9219a2`.
- **Operational follow-up:** external images are being pulled sequentially because bandwidth is about 1.7 Mbps and Typebot Builder is roughly 1.32 GB. A continuation process will run `docker compose up -d --build` after all pulls complete.
- **Status:** DONE_WITH_CONCERNS until the long-running downloads and stack health checks finish.
