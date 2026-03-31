# Ollama Cloud Verification Record — `kimi-k2.5`

## Scope

- provider: `Ollama Cloud`
- verification date: `2026-03-31`
- verification window: `2026-03-31 14:40:50-14:41:29 UTC+8`
- base URL: `https://ollama.com`
- model used for inference check: `kimi-k2.5`
- key handling: injected through a temporary shell environment only; not persisted into repo config or local secrets

## Raw results

### Catalog endpoints

- `GET /api/tags` -> `200 OK`
- `GET /v1/models` -> `200 OK`

Observed outcome:

- both Ollama-native and OpenAI-compatible catalog surfaces are reachable
- the account can read the cloud model directory
- the visible directory includes `kimi-k2.5`

### Inference endpoints

- `POST /api/chat` -> `200 OK`
- `POST /v1/chat/completions` -> `200 OK`

Observed outcome:

- both inference surfaces succeeded with the same real key
- `auto` mode stabilized on the Ollama-native path for the current pilot default
- forced `ollama_native` and forced `openai_compatible` probes also both succeeded
- the returned minimal inference content was the expected readiness response

## Standardized classification

- provider guess: `Ollama Cloud`
- business status: `云端可用`
- verification status: `fully_usable`
- validated flavor: `ollama_native`
- verified model: `kimi-k2.5`
- go-live ready: `true`
- recommended action: `可以进入正式试点，继续完成备份与恢复演练后再开放给外部用户`

## Practical operator conclusion

This provider/key/model pair is now suitable for the current formal pilot path:

1. Catalog access is working.
2. Inference access is working.
3. `auto` mode can already select a stable runtime path.
4. `kimi-k2.5` is the current default model for hosted and customer self-deployed pilots.

## Operator evidence to keep

- directory worked on both `/api/tags` and `/v1/models`
- inference succeeded on both `/api/chat` and `/v1/chat/completions`
- dedicated follow-up probes also succeeded when the protocol was forced to `ollama_native` and `openai_compatible`
- the tested model existed in the visible model directory
- the repo's runtime doctor classified the result as `fully_usable`
- the repo's runtime doctor marked `goLiveReady=true`

## Suggested rollout note

```text
The current Zhouheng external-pilot default is Ollama Cloud with model kimi-k2.5.

This combination has been verified on March 31, 2026 against both catalog and inference surfaces:

- GET /api/tags: 200 OK
- GET /v1/models: 200 OK
- POST /api/chat: 200 OK
- POST /v1/chat/completions: 200 OK

The repo's runtime doctor classified this configuration as fully_usable and marked it goLiveReady=true. This is now the recommended baseline for the hosted pilot environment and for customer self-deployed single-instance pilots.
```
