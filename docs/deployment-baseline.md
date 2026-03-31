# Deployment Baseline

## What ships now

- `Dockerfile`: single-container production baseline with `npm ci --omit=dev`, port `3030`, and `/api/health` healthcheck.
- `docker-compose.yml`: local single-instance stack with a bind-mounted `./data` volume.
- `deploy/kubernetes/`: raw single-instance manifests for ConfigMap, Secret example, Deployment, Service, PVC, and Ingress example.
- `/api/operations/health`: detailed health endpoint for runtime, ledger, legal library, and backup targets.
- `/api/operations/restores/*`: admin-only restore drill APIs for isolated recovery validation.
- `/api/metrics`: Prometheus text metrics for HTTP traffic, runs, backups, restore drills, integrity verification, active sessions, and configured backup targets.
- `FINANCE_MESH_LOG_FORMAT`: structured logging switch between `pretty` and `json`.
- `.github/workflows/ci.yml` and `.github/workflows/release.yml`: validation and release automation baseline.

## Docker

```bash
docker build -t zhouheng-global-finance-mesh:local .
docker compose up --build
```

Recommended production posture for the single-instance baseline:

1. Mount `/app/data` to durable storage.
2. Set `FINANCE_MESH_COOKIE_SECURE=true` behind HTTPS.
3. Provide OIDC and backup secrets through environment injection, not through image baking.
4. Point `FINANCE_MESH_BACKUP_LOCAL_DIR` or the `FINANCE_MESH_BACKUP_S3_*` variables at an off-box target.
5. Set `FINANCE_MESH_RESTORE_DRILL_RETENTION_DAYS` and `FINANCE_MESH_RESTORE_DRILL_WARN_HOURS` if your ops policy differs from the default weekly drill posture.

## Kubernetes

The manifests under `deploy/kubernetes/` intentionally stay simple:

- one replica only
- one PVC mounted at `/app/data`
- ConfigMap for non-secret env vars
- Secret example for OIDC, bootstrap, and S3-compatible backup credentials
- readiness probe on `/api/operations/health`
- liveness probe on `/api/health`
- Prometheus scrape annotations for `/api/metrics`
- restore readiness surfaced through `checks.recoveryDrill` in `/api/operations/health`

Typical flow:

```bash
kubectl apply -f deploy/kubernetes/persistentvolumeclaim.yaml
kubectl apply -f deploy/kubernetes/configmap.yaml
kubectl apply -f deploy/kubernetes/secret.example.yaml
kubectl apply -f deploy/kubernetes/deployment.yaml
kubectl apply -f deploy/kubernetes/service.yaml
```

## Observability expectations

- Use `/api/health` for lightweight container liveness.
- Use `/api/operations/health` for operator-facing health and readiness checks.
- Scrape `/api/metrics` from Prometheus-compatible tooling.
- Prefer `FINANCE_MESH_LOG_FORMAT=json` in containerized environments so request and backup events keep `requestId`, actor identity, workspace, and run/backup references.
- Recovery drills also stamp `restoreId` into request logs so restore-center actions remain traceable across app and CI flows.

## CI and release automation

- `ci.yml` validates the repo on pull requests and `main` with unit tests, syntax checks, Kubernetes dry runs, Docker build, restore smoke, and browser smoke.
- The workflow provisions a disposable kind cluster before `npm run verify:manifests` so `kubectl` dry-run has API discovery available.
- `release.yml` is intentionally tag-gated. Use `workflow_dispatch` or push a semver tag such as `v0.3.0` after `npm run release:check -- --tag v0.3.0` passes locally.
- Required repository secrets are:
  - `NPM_TOKEN` for npm publish
  - `GITHUB_TOKEN` is used automatically for GHCR publish
- The release flow publishes:
  - `ghcr.io/wd041216-bit/zhouheng-global-finance-mesh:<version>`
  - `ghcr.io/wd041216-bit/zhouheng-global-finance-mesh:latest`
  - the public npm package declared in `package.json`

## What this does not claim

This is still a single-instance beta baseline. It does not yet provide:

- HA or leader election
- shared session failover across replicas
- multi-tenant isolation
- Helm, ArgoCD, or operator packaging
- immutable off-box audit durability
