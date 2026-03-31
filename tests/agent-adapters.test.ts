import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { getAgentAdapterOrThrow, listAgentAdapters } from "../src/agent-adapters.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");

test("agent adapter registry exposes unified metadata and artifacts", async () => {
  const adapters = listAgentAdapters();
  assert.deepEqual(adapters.map((item) => item.id).sort(), ["cherry", "claude", "cline", "cursor", "manus", "openclaw"]);

  for (const adapter of adapters) {
    assert.ok(adapter.supportLevel);
    assert.ok(adapter.smokeCommand);
    assert.ok(Array.isArray(adapter.hosts));
    assert.ok(adapter.hosts.length >= 1);
    assert.ok(Array.isArray(adapter.platforms));
    assert.ok(adapter.platforms.length >= 1);
    assert.ok(Array.isArray(adapter.testedHosts));
    assert.ok(adapter.testedHosts.length >= 1);
    assert.ok(Array.isArray(adapter.troubleshooting));
    assert.ok(adapter.troubleshooting.length >= 2);
    assert.ok(Array.isArray(adapter.artifacts));
    assert.equal(adapter.artifacts.some((artifact) => artifact.kind === "config"), true);
    assert.equal(adapter.artifacts.some((artifact) => artifact.kind === "docs"), true);
    assert.equal(adapter.artifacts.some((artifact) => artifact.kind === "command"), true);
    assert.equal(adapter.artifacts.some((artifact) => artifact.kind === "verify"), true);
  }

  const claude = getAgentAdapterOrThrow("claude");
  const manus = getAgentAdapterOrThrow("manus");
  const cursor = getAgentAdapterOrThrow("cursor");
  const cline = getAgentAdapterOrThrow("cline");
  const cherry = getAgentAdapterOrThrow("cherry");
  assert.equal(claude.entrypoint, "integrations/mcp/server.ts");
  assert.equal(manus.entrypoint, "integrations/mcp/server.ts");
  assert.equal(cursor.entrypoint, "integrations/mcp/server.ts");
  assert.equal(cline.entrypoint, "integrations/mcp/server.ts");
  assert.equal(cherry.entrypoint, "integrations/mcp/server.ts");
  assert.equal(claude.smokeCommand, "npm run smoke:mcp");
  assert.equal(manus.smokeCommand, "npm run smoke:mcp");
  assert.equal(cursor.smokeCommand, "npm run smoke:mcp");
  assert.equal(cline.smokeCommand, "npm run smoke:mcp");
  assert.equal(cherry.smokeCommand, "npm run smoke:mcp");

  for (const adapterId of ["claude", "manus", "cursor", "cline", "cherry"] as const) {
    const adapter = getAgentAdapterOrThrow(adapterId);
    const configPath = path.join(REPO_ROOT, adapter.configTemplatePath);
    const docsPath = path.join(REPO_ROOT, adapter.docsPath);
    const [configRaw, docsRaw] = await Promise.all([
      fs.readFile(configPath, "utf8"),
      fs.readFile(docsPath, "utf8"),
    ]);
    assert.match(configRaw, /integrations\/mcp\/server\.ts/);
    assert.match(configRaw, /FINANCE_MESH_REPO_ROOT/);
    assert.match(configRaw, /FINANCE_MESH_MCP_PACK_ROOTS/);
    assert.match(docsRaw, /## Local setup/);
    assert.match(docsRaw, /## Verification/);
    assert.match(docsRaw, /## Common failures/);
  }
});

test("openclaw config example stays aligned with the registry contract", async () => {
  const openclaw = getAgentAdapterOrThrow("openclaw");
  const configPath = path.join(REPO_ROOT, openclaw.configTemplatePath);
  const pluginPath = path.join(REPO_ROOT, "integrations", "openclaw", "openclaw.plugin.json");
  const skillPath = path.join(REPO_ROOT, "integrations", "openclaw", "skill.json");

  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const plugin = JSON.parse(await fs.readFile(pluginPath, "utf8"));
  const skill = JSON.parse(await fs.readFile(skillPath, "utf8"));

  assert.equal(openclaw.docsPath, "integrations/openclaw/README.md");
  assert.equal(openclaw.smokeCommand, "npm run smoke:openclaw");
  assert.deepEqual(config.plugins.entries, ["zhouheng-global-finance-mesh"]);
  assert.match(config.plugins.load.paths[0], /integrations\/openclaw$/);
  assert.equal(plugin.id, "zhouheng-global-finance-mesh");
  assert.equal(skill.name, "zhouheng-global-finance-mesh");
  assert.match(plugin.description, /unified finance pack validation/i);
  assert.match(skill.description, /unified finance pack validation/i);
});
