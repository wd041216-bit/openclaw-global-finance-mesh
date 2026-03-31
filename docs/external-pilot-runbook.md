# External Pilot Runbook

## Target shape

- online trial environment: one cloud VM + Docker
- self-host baseline: single-instance Docker or one-replica Kubernetes
- data path: mount `/app/data` to durable storage
- cookie posture: HTTPS required, `FINANCE_MESH_COOKIE_SECURE=true`

## Minimum pilot setup order

1. Copy `.env.pilot.example` to `.env`.
2. Fill in a real `OLLAMA_API_KEY` and keep:
   - `OLLAMA_MODE=cloud`
   - `OLLAMA_CLOUD_BASE_URL=https://ollama.com`
   - `OLLAMA_MODEL=kimi-k2.5`
   - `FINANCE_MESH_CLOUD_API_FLAVOR=auto`
3. Build and start the container:

   ```bash
   docker build -t zhouheng-global-finance-mesh:pilot .
   docker run --env-file .env \
     -p 3030:3030 \
     -v "$(pwd)/data:/app/data" \
     zhouheng-global-finance-mesh:pilot
   ```

4. Open `/system.html` and verify:
   - first admin bootstrap is complete
   - runtime mode is `cloud`
   - the model is `kimi-k2.5`
   - backup target is configured
   - recovery center is visible
5. Run `npm run verify:cloud-provider -- --out output/cloud-ollama-kimi.json`.
6. Confirm the system page shows `可正式试点`.
7. Run one example decision from `/workbench.html`.
8. Run one restore drill from `/recovery.html`.
9. Confirm `/api/operations/health` and `/api/metrics` are reachable.

## Pilot acceptance gate

The pilot environment should not be handed to external users until:

- `npm run review:pilot` returns no required failures
- the system page shows `可正式试点`
- `verificationStatus=fully_usable`
- `goLiveReady=true`
- `verifiedModel=kimi-k2.5`
- at least one backup has completed
- at least one restore drill has succeeded or degraded with an understood explanation

## Real cloud-provider verification

Run the provider check after injecting a real key:

```bash
FINANCE_MESH_CLOUD_API_FLAVOR=auto \
OLLAMA_MODE=cloud \
OLLAMA_CLOUD_BASE_URL=https://ollama.com \
OLLAMA_MODEL=kimi-k2.5 \
OLLAMA_API_KEY=replace_me \
npm run verify:cloud-provider -- --out output/cloud-ollama.json
```

Each run should produce:

- provider identity
- verification status
- catalog access result
- inference access result
- visible models
- recommended action
- manual verification commands
- escalation template

The current reference records are:

- [docs/cloud-verification-2026-03-31-ollama-cloud.md](./cloud-verification-2026-03-31-ollama-cloud.md)
- [docs/cloud-verification-2026-03-31-ollama-cloud-kimi-k2-5.md](./cloud-verification-2026-03-31-ollama-cloud-kimi-k2-5.md)

- The `ministral-3:8b` record is the blocked entitlement example.
- The `kimi-k2.5` record is the current formal pilot default and shows a `fully_usable` path.

## How to read cloud outcomes

- `fully_usable`: catalog and inference are both working; safe to keep current protocol.
- `catalog_only_entitlement_blocked`: code path is live, but provider still blocks inference entitlement.
- `cloud_unauthorized`: missing key or account does not have cloud access.
- `protocol_mismatch`: provider root is reachable, but the selected protocol surface is wrong.
- `model_visibility_gap`: model name is not present in the visible directory.
- `network_or_tls_failure`: fix network, DNS, TLS, or proxy posture first.

## What the operator should do next

- if the system page says `仅目录可用`, do not keep rewriting endpoints; send the escalation template to the provider.
- if the system page says `模型不可用`, update the runtime model to one of the visible names first.
- if the system page says `本地模式待处理`, fix local Ollama or swap to a visible local model before inviting pilot users.
- if the system page says `当前还不能正式试点`, do not open the environment to pilot users yet.

## Honest boundary

This runbook is for external pilot readiness, not enterprise finalization. It does not claim:

- HA or replica failover
- multi-tenant isolation
- SCIM or full IdP lifecycle automation
- immutable off-box audit durability
