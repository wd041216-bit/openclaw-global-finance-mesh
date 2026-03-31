# OpenClaw Plugin Adapter

OpenClaw should load Zhouheng through the native plugin path at `integrations/openclaw/`.

## What OpenClaw gets

- Finance Pack validation before rules are trusted
- Decision Packet execution with auditable summaries
- Replay analysis before rule changes are published
- Optional prompt guidance injection for stricter finance workflows

## Minimal local setup

1. Clone this repository to your machine.
2. Confirm `examples/packs/` and `examples/events/` exist under the repo root.
3. In your OpenClaw config, add `integrations/openclaw` to `plugins.load.paths`.
4. Add `zhouheng-global-finance-mesh` to `plugins.entries`.
5. Restart the host and confirm three native tools are registered.

## Start command

OpenClaw loads this adapter directly. You do not need to start a separate MCP server for this route.

## Example config

See `integrations/openclaw/openclaw-config.example.json`.

## Verification

1. Run `npm run smoke:openclaw`.
2. Confirm the host lists `finance_mesh_validate_packs`, `finance_mesh_run_decision`, and `finance_mesh_replay`.
3. Execute one decision run and confirm it returns a decision summary.
4. Confirm prompt guidance is still injected when `prependSystemGuidance` is enabled.

## Minimum acceptance

- The plugin loads from `integrations/openclaw/`
- The host sees all three native tools
- One decision call succeeds
- Prompt guidance remains stable

## Common failures

- If OpenClaw cannot find the plugin, make sure `plugins.load.paths` points at `integrations/openclaw`, not the repo root.
- If the plugin loads but tools are missing, confirm `plugins.entries` includes `zhouheng-global-finance-mesh`.
- If guidance is missing, check whether `prependSystemGuidance` was disabled in plugin config.

## Verified scope vs beta scope

- Verified now: local plugin loading, three native tools, prompt guidance injection, config example, fixture smoke
- Still beta: remote hosted distribution, host-managed auth, and any OpenClaw cloud workflow outside local-first loading
