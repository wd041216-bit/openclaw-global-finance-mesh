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
  assert.equal(adapters.length, 6);

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
  const mcpAdapterIds = ["claude", "manus", "cursor", "cline", "cherry"] as const;
  let sharedEntrypoint: string | null = null;

  for (const adapterId of mcpAdapterIds) {
    const adapter = getAgentAdapterOrThrow(adapterId);
    const config = JSON.parse(await fs.readFile(resolveRepoPath(adapter.configTemplatePath), "utf8"));
    const templateInfo = readMcpTemplateInfo(adapterId, config);

    assert.equal(adapter.entrypoint, "integrations/mcp/server.ts");
    assert.match(templateInfo.serverArg, /integrations\/mcp\/server\.ts$/);
    assert.equal(templateInfo.packRoots, "examples/packs");
    assert.match(templateInfo.repoRoot, /zhouheng-global-finance-mesh$/);
    if (sharedEntrypoint == null) {
      sharedEntrypoint = templateInfo.serverArg;
    } else {
      assert.equal(templateInfo.serverArg, sharedEntrypoint);
    }

    const doc = await fs.readFile(resolveRepoPath(adapter.docsPath), "utf8");
    for (const marker of ["## Local setup", "## Verification", "## Common failures"]) {
      assert.match(doc, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    }
  }
}

function readMcpTemplateInfo(adapterId: string, config: Record<string, unknown>): {
  serverArg: string;
  repoRoot: string;
  packRoots: string;
} {
  if (adapterId === "manus") {
    return readServerShape(config);
  }
  if (adapterId === "claude" || adapterId === "cursor") {
    const server = (
      config as {
        mcpServers?: Record<string, unknown>;
      }
    ).mcpServers?.["zhouheng-global-finance-mesh"];
    return readServerShape(server);
  }
  if (adapterId === "cline") {
    const server = (
      config as {
        "mcp.servers"?: Record<string, unknown>;
      }
    )["mcp.servers"]?.["zhouheng-global-finance-mesh"];
    return readServerShape(server);
  }
  if (adapterId === "cherry") {
    const server = (
      config as {
        mcp?: {
          servers?: Record<string, unknown>;
        };
      }
    ).mcp?.servers?.["zhouheng-global-finance-mesh"];
    return readServerShape(server);
  }
  throw new Error(`Unsupported MCP adapter template parser: ${adapterId}`);
}

function readServerShape(server: unknown): {
  serverArg: string;
  repoRoot: string;
  packRoots: string;
} {
  const entry = server as {
    args?: unknown[];
    env?: Record<string, unknown>;
  };
  const arg0 = String(entry?.args?.[0] ?? "");
  const repoRoot = String(entry?.env?.FINANCE_MESH_REPO_ROOT ?? "");
  const packRoots = String(entry?.env?.FINANCE_MESH_MCP_PACK_ROOTS ?? "");
  assert.ok(arg0.length > 0, "mcp template should include args[0]");
  assert.ok(repoRoot.length > 0, "mcp template should include FINANCE_MESH_REPO_ROOT");
  assert.ok(packRoots.length > 0, "mcp template should include FINANCE_MESH_MCP_PACK_ROOTS");
  return {
    serverArg: arg0,
    repoRoot,
    packRoots,
  };
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
