import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { getAgentAdapterOrThrow, listAgentAdapters, resolveRepoPath } from "../src/agent-adapters.ts";
import {
  buildOpenClawAgentDescriptor,
  buildOpenClawBundledSkillMarkdown,
  buildOpenClawPluginManifest,
  buildOpenClawRootSkillMarkdown,
  buildOpenClawSkillManifest,
  OPENCLAW_PLUGIN_ID,
} from "../src/openclaw-adapter-contract.ts";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const adapters = listAgentAdapters();
  assert.equal(adapters.length, 3);

  for (const adapter of adapters) {
    await assertFileExists(resolveRepoPath(adapter.docsPath), `${adapter.id} docs`);
    await assertFileExists(resolveRepoPath(adapter.configTemplatePath), `${adapter.id} config template`);
    assert.ok(adapter.installGuide.steps.length >= 3, `${adapter.id} should expose install steps`);
    assert.ok(adapter.installGuide.verification.length >= 2, `${adapter.id} should expose verification steps`);
    assert.ok(adapter.troubleshooting.length >= 2, `${adapter.id} should expose troubleshooting guidance`);
  }

  await verifySharedMcpTemplates();
  await verifyOpenClawArtifacts();

  await runScript("scripts/smoke-mcp.ts");
  await runScript("scripts/smoke-openclaw.ts");

  console.log("Host doctor completed successfully.");
}

async function verifySharedMcpTemplates() {
  const claude = getAgentAdapterOrThrow("claude");
  const manus = getAgentAdapterOrThrow("manus");
  const claudeConfig = JSON.parse(await fs.readFile(resolveRepoPath(claude.configTemplatePath), "utf8"));
  const manusConfig = JSON.parse(await fs.readFile(resolveRepoPath(manus.configTemplatePath), "utf8"));

  assert.equal(claude.entrypoint, "integrations/mcp/server.ts");
  assert.equal(manus.entrypoint, "integrations/mcp/server.ts");
  assert.equal(claudeConfig.mcpServers["zhouheng-global-finance-mesh"].args[0], manusConfig.args[0]);
  assert.match(String(claudeConfig.mcpServers["zhouheng-global-finance-mesh"].args[0]), /integrations\/mcp\/server\.ts$/);
  assert.equal(
    claudeConfig.mcpServers["zhouheng-global-finance-mesh"].env.FINANCE_MESH_MCP_PACK_ROOTS,
    manusConfig.env.FINANCE_MESH_MCP_PACK_ROOTS,
  );

  const claudeDoc = await fs.readFile(resolveRepoPath(claude.docsPath), "utf8");
  const manusDoc = await fs.readFile(resolveRepoPath(manus.docsPath), "utf8");
  for (const marker of ["## Local setup", "## Verification", "## Common failures"]) {
    assert.match(claudeDoc, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.match(manusDoc, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
}

async function verifyOpenClawArtifacts() {
  const packageJson = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8"));
  const pluginManifest = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "openclaw.plugin.json"), "utf8"));
  const skillManifest = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "skill.json"), "utf8"));
  const agentDescriptor = YAML.parse(
    await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "agents", "openai.yaml"), "utf8"),
  );
  const installDoc = await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "README.md"), "utf8");
  const rootSkill = await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "SKILL.md"), "utf8");
  const bundledSkill = await fs.readFile(
    path.join(REPO_ROOT, "integrations", "openclaw", "skills", OPENCLAW_PLUGIN_ID, "SKILL.md"),
    "utf8",
  );

  assert.deepEqual(pluginManifest, buildOpenClawPluginManifest(packageJson.version));
  assert.deepEqual(skillManifest, buildOpenClawSkillManifest(packageJson.version));
  assert.deepEqual(agentDescriptor, buildOpenClawAgentDescriptor());
  assert.equal(rootSkill.trim(), buildOpenClawRootSkillMarkdown().trim());
  assert.equal(bundledSkill.trim(), buildOpenClawBundledSkillMarkdown().trim());
  assert.match(installDoc, /## Minimal local setup/);
  assert.match(installDoc, /## Verification/);
  assert.match(installDoc, /## Common failures/);
}

async function assertFileExists(filePath: string, label: string) {
  await fs.access(filePath);
  assert.ok(true, `${label} exists`);
}

async function runScript(relativePath: string) {
  const child = spawn(process.execPath, [relativePath], {
    cwd: REPO_ROOT,
    stdio: "inherit",
    env: process.env,
  });
  const [code] = await once(child, "exit");
  assert.equal(code, 0, `${relativePath} should exit cleanly`);
}

await main();
