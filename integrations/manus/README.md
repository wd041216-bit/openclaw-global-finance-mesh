# Manus MCP Connector

Manus should connect to Zhouheng through the same shared MCP server used by Claude: `integrations/mcp/server.ts`.

## What Manus gets

- Finance Pack validation
- Decision Packet generation
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

1. Start the connector from Manus.
2. Confirm tool discovery includes all five `finance_mesh_*` tools.
3. Run one read action and one execution action to verify end-to-end wiring.
