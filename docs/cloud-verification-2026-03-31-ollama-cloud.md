# Ollama Cloud Verification Record

## Scope

- provider: `Ollama Cloud`
- verification date: `2026-03-31`
- verification window: `2026-03-31 13:38-13:40 UTC+8`
- base URL: `https://ollama.com`
- model used for inference check: `ministral-3:8b`
- key handling: injected through a temporary shell environment only; not persisted into repo config or local secrets

## Raw results

### Catalog endpoints

- `GET /api/tags` -> `200 OK`
- `GET /v1/models` -> `200 OK`

Observed outcome:

- both Ollama-native and OpenAI-compatible catalog surfaces are reachable
- the account can read the cloud model directory
- the visible directory includes `ministral-3:8b`, so this is not a model-name mismatch

### Inference endpoints

- `POST /api/chat` -> `401 unauthorized`
- `POST /v1/chat/completions` -> `401 unauthorized`

Observed outcome:

- both inference surfaces fail with the same authorization result
- this is not a one-protocol-only failure
- the code path is already reaching the provider; the remaining blocker is provider-side inference entitlement or account authorization

## Standardized classification

- provider guess: `Ollama Cloud`
- business status: `仅模型目录可用`
- verification status: `catalog_only_entitlement_blocked`
- recommended action: `先补 inference entitlement，不要继续改 endpoint`

## Practical operator conclusion

This provider/key pair is currently in a `catalog_only` state:

1. Directory access is working.
2. Inference access is blocked.
3. Endpoint rewriting is not the next best action.
4. Provider-side entitlement confirmation is required before pilot users can rely on cloud inference.

## Operator evidence to keep

- directory worked on both `/api/tags` and `/v1/models`
- inference failed on both `/api/chat` and `/v1/chat/completions`
- the tested model existed in the visible model directory
- the same result appeared on raw `curl` checks and on the repo's diagnosis logic

## Suggested provider escalation text

```text
We verified this Ollama Cloud API key against both catalog and inference surfaces on March 31, 2026.

- GET /api/tags: 200 OK
- GET /v1/models: 200 OK
- POST /api/chat: 401 unauthorized
- POST /v1/chat/completions: 401 unauthorized

The tested model was ministral-3:8b, and it was present in the visible model directory. This suggests the integration path is live, but the account or API key still lacks inference entitlement. Please confirm whether this key is allowed to perform cloud inference, or whether an additional entitlement step is required.
```

## How to use this record now

This document is no longer the pilot default. Keep it as the canonical blocked example for:

- `catalog_only_entitlement_blocked`
- provider escalation wording
- explaining why “catalog 可读” does not mean “推理可用”

The current formal pilot default is archived separately in:

- [docs/cloud-verification-2026-03-31-ollama-cloud-kimi-k2-5.md](./cloud-verification-2026-03-31-ollama-cloud-kimi-k2-5.md)
