import test from "node:test";
import assert from "node:assert/strict";

import { getAgentAdapter, listAgentAdapters } from "../src/agent-adapters.ts";

test("agent adapter registry lists openclaw, claude, and manus with stable compatibility metadata", () => {
  const adapters = listAgentAdapters();
  const ids = adapters.map((item) => item.id).sort();

  assert.deepEqual(ids, ["claude", "manus", "openclaw"]);

  const openclaw = getAgentAdapter("openclaw");
  const claude = getAgentAdapter("claude");
  const manus = getAgentAdapter("manus");

  assert.ok(openclaw);
  assert.ok(claude);
  assert.ok(manus);

  assert.equal(openclaw.kind, "openclaw_plugin");
  assert.equal(claude.kind, "mcp_connector");
  assert.equal(manus.kind, "mcp_connector");

  assert.equal(claude.entrypoint, "integrations/mcp/server.ts");
  assert.equal(manus.entrypoint, "integrations/mcp/server.ts");
  assert.equal(openclaw.capabilities.length, 3);
  assert.equal(claude.capabilities.length, 5);
  assert.equal(manus.capabilities.length, 5);
});
