# External Pilot Runbook

## Target shape

- online trial environment: one cloud VM + Docker
- self-host baseline: single-instance Docker or one-replica Kubernetes
- data path: mount `/app/data` to durable storage
- cookie posture: HTTPS required, `FINANCE_MESH_COOKIE_SECURE=true`

## Minimum pilot setup order

1. Copy `.env.pilot.example` to a local `.env` or inject the same values through your host platform.
2. Build and start the container:

   ```bash
   docker build -t zhouheng-global-finance-mesh:pilot .
   docker run --env-file .env \
     -p 3030:3030 \
     -v "$(pwd)/data:/app/data" \
     zhouheng-global-finance-mesh:pilot
   ```

3. Open `/system.html` and verify:
   - first admin bootstrap is complete
   - runtime mode and model are correct
   - backup target is configured
   - recovery center is visible
4. Run one example decision from `/workbench.html`.
5. Run one restore drill from `/recovery.html`.
6. Confirm `/api/operations/health` and `/api/metrics` are reachable.

## Pilot acceptance gate

The pilot environment should not be handed to external users until:

- `npm run review:pilot` returns no required failures
- the system page no longer shows `not_verified`, `local_attention`, `cloud_unauthorized`, or `protocol_mismatch`
- at least one backup has completed
- at least one restore drill has succeeded or degraded with an understood explanation

## Real cloud-provider verification

Run the provider check after injecting a real key:

```bash
FINANCE_MESH_CLOUD_API_FLAVOR=auto \
OLLAMA_MODE=cloud \
OLLAMA_CLOUD_BASE_URL=https://ollama.com \
OLLAMA_MODEL=qwen3:8b \
OLLAMA_API_KEY=replace_me \
npm run verify:cloud-provider -- --out output/cloud-ollama.json
```

For an OpenAI-compatible gateway:

```bash
FINANCE_MESH_CLOUD_API_FLAVOR=openai_compatible \
OLLAMA_MODE=cloud \
OLLAMA_CLOUD_BASE_URL=https://gateway.example.com \
OLLAMA_MODEL=gpt-finance \
OLLAMA_API_KEY=replace_me \
npm run verify:cloud-provider -- --out output/cloud-openai-compatible.json
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

The first real record is now archived here:

- [docs/cloud-verification-2026-03-31-ollama-cloud.md](./cloud-verification-2026-03-31-ollama-cloud.md)

That verification proved a real `catalog_only_entitlement_blocked` case on `Ollama Cloud`, so the current system-page wording and provider escalation path are no longer hypothetical.

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

## Honest boundary

This runbook is for external pilot readiness, not enterprise finalization. It does not claim:

- HA or replica failover
- multi-tenant isolation
- SCIM or full IdP lifecycle automation
- immutable off-box audit durability
