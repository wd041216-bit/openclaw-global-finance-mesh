# Manus MCP Connector

Manus should connect to Zhouheng through the same shared MCP server used by Claude: `integrations/mcp/server.ts`.

## What Manus gets

- Finance Pack validation
- Decision Packet generation with summary text plus structured content
- Replay impact analysis
- Legal library search
- Audit integrity visibility

## Local setup

1. Clone this repository locally.
2. Confirm `npm run mcp:serve` works.
3. Register a local stdio connector in Manus.
4. Reuse the shared MCP entrypoint instead of creating a Manus-specific tool server.

## Start command

```bash
npm run mcp:serve
```

## Example config

See `integrations/manus/manus.mcp.config.example.json`.

## Verification

1. Run `npm run smoke:mcp`.
2. Start the connector from Manus.
3. Confirm tool discovery includes all five `finance_mesh_*` tools.
4. Run one read action and one execution action to verify end-to-end wiring.

## Minimum acceptance

- Manus can spawn the shared MCP entrypoint
- `tools/list` returns all five `finance_mesh_*` tools
- One decision call returns structured content
- One governance read call returns structured content
- `npm run doctor:hosts` completes without failures

## Common failures

- If Manus cannot spawn the connector, verify the configured `command` and `args` match the example JSON exactly.
- If tool discovery works but execution fails, make sure `examples/events/` and `data/legal-library/library.json` exist under the configured repo root.
- If Pack loading fails, confirm `FINANCE_MESH_REPO_ROOT` points at the real repository root instead of the `integrations/mcp/` directory.
- If Manus only reads plain text, restart the MCP server so the latest structured contracts are loaded.

## Verified scope vs beta scope

- Verified now: local stdio setup, shared MCP contract, tool discovery, structured decision output, structured audit read, unified host doctor
- Still beta: remote connector hosting, host-managed auth, and any Manus-specific workflow outside the shared MCP transport
