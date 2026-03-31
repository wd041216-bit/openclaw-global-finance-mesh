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

## Example config

See `integrations/manus/manus.mcp.config.example.json`.

## Verification

1. Run `npm run smoke:mcp`.
2. Start the connector from Manus.
3. Confirm tool discovery includes all five `finance_mesh_*` tools.
4. Run one read action and one execution action to verify end-to-end wiring.

## Common failures

- If Manus cannot spawn the connector, verify the configured `command` and `args` match the example JSON exactly.
- If tool discovery works but execution fails, make sure `examples/events/` and `data/legal-library/library.json` exist under the configured repo root.
- If Manus only reads plain text, restart the MCP server so the latest structured contracts are loaded.
