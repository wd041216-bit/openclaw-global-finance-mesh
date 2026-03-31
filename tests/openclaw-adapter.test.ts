import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import plugin from "../integrations/openclaw/index.ts";
import { getAgentAdapterOrThrow } from "../src/agent-adapters.ts";
import {
  buildOpenClawAgentDescriptor,
  buildOpenClawBundledSkillMarkdown,
  buildOpenClawPluginManifest,
  buildOpenClawRootSkillMarkdown,
  buildOpenClawSkillManifest,
  OPENCLAW_PLUGIN_ID,
  OPENCLAW_TOOL_NAMES,
} from "../src/openclaw-adapter-contract.ts";
import { FINANCE_MESH_PROMPT_GUIDANCE } from "../src/prompt-guidance.ts";

const TEST_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(TEST_DIR, "..");

test("openclaw artifacts stay aligned with the shared contract", async () => {
  const packageJson = JSON.parse(await fs.readFile(path.join(REPO_ROOT, "package.json"), "utf8"));
  const version = packageJson.version;
  const pluginManifest = JSON.parse(
    await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "openclaw.plugin.json"), "utf8"),
  );
  const skillManifest = JSON.parse(
    await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "skill.json"), "utf8"),
  );
  const agentDescriptor = YAML.parse(
    await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "agents", "openai.yaml"), "utf8"),
  );
  const rootSkill = await fs.readFile(path.join(REPO_ROOT, "integrations", "openclaw", "SKILL.md"), "utf8");
  const bundledSkill = await fs.readFile(
    path.join(REPO_ROOT, "integrations", "openclaw", "skills", OPENCLAW_PLUGIN_ID, "SKILL.md"),
    "utf8",
  );

  assert.deepEqual(pluginManifest, buildOpenClawPluginManifest(version));
  assert.deepEqual(skillManifest, buildOpenClawSkillManifest(version));
  assert.deepEqual(agentDescriptor, buildOpenClawAgentDescriptor());
  assert.equal(rootSkill.trim(), buildOpenClawRootSkillMarkdown().trim());
  assert.equal(bundledSkill.trim(), buildOpenClawBundledSkillMarkdown().trim());

  const adapter = getAgentAdapterOrThrow("openclaw");
  const toolNames = adapter.capabilities.flatMap((item) => item.toolNames);
  assert.deepEqual(toolNames, OPENCLAW_TOOL_NAMES);
  assert.equal(adapter.docsPath, "integrations/openclaw/README.md");
  assert.equal(adapter.smokeCommand, "npm run smoke:openclaw");
});

test("openclaw plugin registers three native tools and stable prompt guidance", async () => {
  const tools: Array<{ name: string }> = [];
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  plugin.register({
    pluginConfig: {},
    registerTool(tool) {
      tools.push(tool as { name: string });
    },
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
  });

  assert.equal(plugin.id, OPENCLAW_PLUGIN_ID);
  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...OPENCLAW_TOOL_NAMES].sort());
  assert.equal(typeof handlers.get("before_prompt_build"), "function");

  const prependResult = await handlers.get("before_prompt_build")?.();
  assert.deepEqual(prependResult, {
    prependSystemContext: FINANCE_MESH_PROMPT_GUIDANCE,
  });

  const disabledHandlers = new Map<string, (...args: unknown[]) => unknown>();
  plugin.register({
    pluginConfig: {
      prependSystemGuidance: false,
    },
    registerTool() {
      // no-op
    },
    on(eventName, handler) {
      disabledHandlers.set(eventName, handler);
    },
  });

  const disabledResult = await disabledHandlers.get("before_prompt_build")?.();
  assert.equal(disabledResult, undefined);
});
