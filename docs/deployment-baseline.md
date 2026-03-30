# Deployment Baseline

## What ships now

- `Dockerfile`: single-container production baseline with `npm ci --omit=dev`, port `3030`, and `/api/health` healthcheck.
- `docker-compose.yml`: local single-instance stack with a bind-mounted `./data` volume.
- `deploy/kubernetes/`: raw single-instance manifests for ConfigMap, Secret example, Deployment, Service, PVC, and Ingress example.
- `/api/operations/health`: detailed health endpoint for runtime, ledger, legal library, and backup targets.
- `/api/metrics`: Prometheus text metrics for HTTP traffic, runs, backups, integrity verification, active sessions, and configured backup targets.
- `FINANCE_MESH_LOG_FORMAT`: structured logging switch between `pretty` and `json`.

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

## Kubernetes

The manifests under `deploy/kubernetes/` intentionally stay simple:

- one replica only
- one PVC mounted at `/app/data`
- ConfigMap for non-secret env vars
- Secret example for OIDC, bootstrap, and S3-compatible backup credentials
- readiness probe on `/api/operations/health`
- liveness probe on `/api/health`
- Prometheus scrape annotations for `/api/metrics`

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

## What this does not claim

This is still a single-instance beta baseline. It does not yet provide:

- HA or leader election
- shared session failover across replicas
- multi-tenant isolation
- Helm, ArgoCD, or operator packaging
- immutable off-box audit durability
