# Repository and release workflow

## Product repository

This workspace is one independent monorepo containing the dashboard, control plane, bridge, deployment files, infrastructure, and documentation.

- `main`: last version verified end to end and safe to deploy.
- `develop`: integrated candidate for the next version.
- `feature/*`: isolated product changes merged into `develop`.
- `release/*`: final stabilization before merging to `main`.
- Tags such as `v0.1.0`: immutable known-good releases.

Never develop directly on `main`. Production deploys only a commit tagged from `main`.

## Chatwoot and Typebot forks

Keep both forks as separate repositories under the ignored `upstreams/` directory. Do not merge their Git histories into the product repository.

Each fork uses:

- `upstream`: the original open-source repository.
- `origin`: our GitHub fork.
- `main` or `develop`: synchronized base.
- `product/*`: our isolated upstream customization branches.

Build every candidate as a new immutable image tag. Test that image from the product repository, then change the pinned image version on `develop`. Merge to `main` only after the complete stack passes testing. Rolling back means restoring the previous image tag or product release tag; it never requires copying folders.

## Promotion sequence

1. Modify a `feature/*` branch in this product or a `product/*` branch in an upstream fork.
2. Build candidate images with a unique commit-based tag.
3. Pin the candidate tag on the product `develop` branch.
4. Test login, inbox, flow builder, viewer, webhook bridge, and tenant isolation.
5. Merge the tested state into `main` and create a release tag.
6. Deploy only the release tag; keep the preceding tag available for rollback.
