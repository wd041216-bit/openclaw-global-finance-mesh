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
  assert.deepEqual(adapters.map((item) => item.id).sort(), ["claude", "manus", "openclaw"]);

  for (const adapter of adapters) {
    assert.ok(adapter.supportLevel);
    assert.ok(adapter.smokeCommand);
    assert.ok(Array.isArray(adapter.testedHosts));
    assert.ok(adapter.testedHosts.length >= 1);
    assert.ok(Array.isArray(adapter.artifacts));
    assert.equal(adapter.artifacts.some((artifact) => artifact.kind === "config"), true);
    assert.equal(adapter.artifacts.some((artifact) => artifact.kind === "docs"), true);
    assert.equal(adapter.artifacts.some((artifact) => artifact.kind === "command"), true);
    assert.equal(adapter.artifacts.some((artifact) => artifact.kind === "verify"), true);
  }

  const claude = getAgentAdapterOrThrow("claude");
  const manus = getAgentAdapterOrThrow("manus");
  assert.equal(claude.entrypoint, "integrations/mcp/server.ts");
  assert.equal(manus.entrypoint, "integrations/mcp/server.ts");
  assert.equal(claude.smokeCommand, "npm run smoke:mcp");
  assert.equal(manus.smokeCommand, "npm run smoke:mcp");
});

test("openclaw config example stays aligned with the registry contract", async () => {
  const openclaw = getAgentAdapterOrThrow("openclaw");
  const configPath = path.join(REPO_ROOT, openclaw.configTemplatePath);
  const pluginPath = path.join(REPO_ROOT, "integrations", "openclaw", "openclaw.plugin.json");
  const skillPath = path.join(REPO_ROOT, "integrations", "openclaw", "skill.json");

  const config = JSON.parse(await fs.readFile(configPath, "utf8"));
  const plugin = JSON.parse(await fs.readFile(pluginPath, "utf8"));
  const skill = JSON.parse(await fs.readFile(skillPath, "utf8"));

  assert.deepEqual(config.plugins.entries, ["zhouheng-global-finance-mesh"]);
  assert.match(config.plugins.load.paths[0], /integrations\/openclaw$/);
  assert.equal(plugin.id, "zhouheng-global-finance-mesh");
  assert.equal(skill.name, "zhouheng-global-finance-mesh");
  assert.match(plugin.description, /unified agent adapter registry/i);
  assert.match(skill.description, /unified agent-registry metadata/i);
});
