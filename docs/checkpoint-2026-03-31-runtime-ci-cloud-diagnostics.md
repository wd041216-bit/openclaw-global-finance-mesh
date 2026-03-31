# Checkpoint: Runtime CI Compatibility And Cloud Diagnostics

Date: 2026-03-31

## What shipped

- fixed the GitHub CI regression caused by `DatabaseSync.enableDefensive()` being unavailable on Node 22
- added a shared SQLite compatibility helper and wired it into the audit ledger and auth session store
- split CI into:
  - a lightweight Node 22 / Node 25 compatibility job
  - the existing heavier validation stack for kind, Docker, restore smoke, and browser smoke
- upgraded the cloud runtime from a single hard-coded Ollama-native path to a protocol-aware runtime with:
  - `auto`
  - `ollama_native`
  - `openai_compatible`
- extended runtime probe diagnostics so the product can now distinguish:
  - catalog success
  - inference success
  - inference unauthorized
  - endpoint mismatch
  - missing API key
  - model-not-found
- updated dashboard and system-page summaries so operators now see:
  - current cloud protocol
  - whether catalog access works
  - whether inference works
  - whether the problem is authorization or protocol mismatch
  - a concrete next action instead of a generic failure banner

## Why it matters

This checkpoint closes the most visible CI credibility gap and also makes cloud runtime failures diagnosable instead of opaque.

Before this change:

- local Node 25 passed
- GitHub Node 22 failed at startup
- cloud runtime could list models but still looked like a generic failure when inference was blocked

After this change:

- Node 22 and Node 25 both initialize SQLite-backed stores safely
- CI can prove the declared `node >=22` support instead of assuming it
- cloud runtime can show when a key has catalog access but not inference entitlement
- operators can tell whether they should switch protocol, change model name, or ask for account-side access

## Verification

- `npm test`
- `npm run verify:server`
- `npx -y node@22.22.1 --test tests/*.test.ts`
- `npm run smoke:restore`
- `npm run smoke:ui`
- `npm run doctor:hosts`

## Remaining honest boundary

This checkpoint makes cloud runtime diagnosis much better, but it does not magically grant cloud inference entitlement. If a real provider key still returns `401 unauthorized` on inference while catalog reads succeed, the product should now clearly prove that the remaining blocker is account permission rather than code-path ambiguity.
