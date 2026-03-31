# Cloud Runtime Operations

## Goal

Make cloud runtime failures diagnosable without guessing whether the problem is:

- missing API key
- account authorization
- protocol mismatch
- model-name mismatch
- network reachability

## Supported cloud protocol modes

- `auto`
  - probe both `ollama_native` and `openai_compatible`
  - prefer the first working catalog and inference path
- `ollama_native`
  - force `/api/tags`
  - force `/api/chat`
- `openai_compatible`
  - force `/v1/models`
  - force `/v1/chat/completions`

## Minimum environment

```bash
export OLLAMA_MODE=cloud
export OLLAMA_MODEL=qwen3:8b
export OLLAMA_CLOUD_BASE_URL=https://ollama.com
export OLLAMA_API_KEY=replace_me
export FINANCE_MESH_CLOUD_API_FLAVOR=auto
```

## Fast verification

Run:

```bash
npm run smoke:cloud
npm run doctor:cloud
npm run verify:cloud-provider -- --out output/cloud-verification.json
```

You will get:

- the public runtime config snapshot
- the raw cloud probe result
- the normalized diagnosis object
- a cloud doctor report with provider guess, suggested protocol, manual `curl` checks, and escalation text
- a standardized verification record you can archive for pilot signoff

## How to read the result

### Case 1: cloud is truly usable

- `probe.listModelsOk = true`
- `probe.inferenceOk = true`
- diagnosis status: `云端可用`

Action:

- keep the current `cloudApiFlavor`
- record the validated model and endpoint pair

### Case 2: catalog works, inference does not

- `probe.listModelsOk = true`
- `probe.inferenceOk = false`
- diagnosis status: `仅模型目录可用`

This means:

- the code path can already reach the provider
- the remaining blocker is usually inference entitlement or provider-side authorization

Action:

1. keep the working catalog protocol
2. confirm whether the key is allowed to perform inference
3. do not keep rewriting endpoints unless `errorKind` also says protocol mismatch

### Case 3: unauthorized

- `errorKind = unauthorized`

Interpretation:

- if catalog also fails, the account is not authorized for cloud access at all
- if catalog succeeds but inference fails, the account can list models but still lacks inference permission

### Case 4: endpoint mismatch

- `errorKind = endpoint_not_supported`

Action:

1. switch `FINANCE_MESH_CLOUD_API_FLAVOR`
2. rerun the probe
3. only consider code changes if all protocol modes still fail

### Case 5: model not found

- `errorKind = model_not_found`

Action:

1. read the current model list
2. replace the configured model with a visible model name
3. rerun the probe

### Case 6: network error

- `errorKind = network_error`

Action:

1. verify `OLLAMA_CLOUD_BASE_URL`
2. verify egress, DNS, TLS, or proxy behavior
3. rerun the probe after connectivity is fixed

## UI interpretation

The system page now separates:

- catalog status
- inference status
- selected endpoint
- recommended next action
- provider guess and confidence
- model visibility and suggested replacement names
- copy-ready verification commands
- escalation text for provider-side entitlement issues

The workbench shows a business-readable runtime conclusion instead of a generic failure string.

## Honest boundary

These diagnostics can prove whether the remaining blocker is likely on the provider account side, but they do not grant entitlements by themselves. If a real key still returns `401 unauthorized` on inference while catalog access succeeds, the repo should be considered correctly implemented but still blocked by provider-side permission.

## Verified provider record

The first real provider verification record now lives here:

- [docs/cloud-verification-2026-03-31-ollama-cloud.md](./cloud-verification-2026-03-31-ollama-cloud.md)

That run confirmed a real `catalog_only_entitlement_blocked` case on `Ollama Cloud`:

- `GET /api/tags` -> `200`
- `GET /v1/models` -> `200`
- `POST /api/chat` -> `401 unauthorized`
- `POST /v1/chat/completions` -> `401 unauthorized`

This is the reference example for “目录可读，但推理 entitlement 仍被 provider 挡住”.

## Pilot artifact rule

For external-pilot signoff, keep one verification artifact per provider class:

- one for `Ollama Cloud`
- one for an `OpenAI-compatible gateway`

Each artifact should include:

- verification status
- provider identity
- current / validated protocol
- catalog and inference outcomes
- visible models
- recommended action
- escalation template
