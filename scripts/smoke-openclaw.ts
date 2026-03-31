import assert from "node:assert/strict";

import plugin from "../integrations/openclaw/index.ts";
import { OPENCLAW_TOOL_NAMES } from "../src/openclaw-adapter-contract.ts";
import { FINANCE_MESH_PROMPT_GUIDANCE } from "../src/prompt-guidance.ts";

async function main() {
  const tools: Array<{ name: string; execute?: (...args: unknown[]) => Promise<unknown> }> = [];
  const handlers = new Map<string, (...args: unknown[]) => unknown>();

  plugin.register({
    pluginConfig: {},
    registerTool(tool) {
      tools.push(tool as { name: string; execute?: (...args: unknown[]) => Promise<unknown> });
    },
    on(eventName, handler) {
      handlers.set(eventName, handler);
    },
  });

  assert.deepEqual(tools.map((tool) => tool.name).sort(), [...OPENCLAW_TOOL_NAMES].sort());

  const prependResult = await handlers.get("before_prompt_build")?.();
  assert.deepEqual(prependResult, {
    prependSystemContext: FINANCE_MESH_PROMPT_GUIDANCE,
  });

  const validateTool = tools.find((tool) => tool.name === "finance_mesh_validate_packs");
  const decisionTool = tools.find((tool) => tool.name === "finance_mesh_run_decision");

  assert.ok(validateTool?.execute);
  assert.ok(decisionTool?.execute);

  const validationResult = await validateTool.execute?.("smoke-openclaw-validate", {});
  const decisionResult = await decisionTool.execute?.("smoke-openclaw-decision", {
    eventPath: "examples/events/saas-annual-prepayment.json",
  });

  assert.equal(
    Array.isArray((validationResult as { details?: { errors?: unknown[] } }).details?.errors),
    true,
  );
  assert.equal(typeof (decisionResult as { details?: { summary?: unknown } }).details?.summary, "string");

  console.log("OpenClaw smoke completed successfully.");
}

await main();
