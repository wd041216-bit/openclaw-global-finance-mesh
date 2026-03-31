export const OPENCLAW_PLUGIN_ID = "zhouheng-global-finance-mesh";
export const OPENCLAW_DISPLAY_NAME = "Zhouheng Global Finance Mesh";
export const OPENCLAW_PLUGIN_DESCRIPTION =
  "OpenClaw plugin adapter for Zhouheng Global Finance Mesh with unified finance pack validation, decision packets, and replay analysis.";
export const OPENCLAW_SKILL_DESCRIPTION =
  "OpenClaw skill bundle for Zhouheng Global Finance Mesh with unified finance pack validation, decision packets, and replay analysis.";
export const OPENCLAW_BUNDLED_SKILL_DESCRIPTION =
  "Zhouheng finance mesh runtime skill for the optional OpenClaw adapter with unified finance pack validation, decision packets, and replay analysis.";
export const OPENCLAW_OPENAI_SHORT_DESCRIPTION =
  "Validate packs, generate finance decision packets, and replay rule changes through the local OpenClaw adapter.";
export const OPENCLAW_OPENAI_DEFAULT_PROMPT =
  "Use this skill when finance work should be rule-driven, auditable, replayable, and Pack-based instead of free-form.";
export const OPENCLAW_TOOL_NAMES = [
  "finance_mesh_validate_packs",
  "finance_mesh_run_decision",
  "finance_mesh_replay",
];

export function buildOpenClawPluginManifest(version: string) {
  return {
    id: OPENCLAW_PLUGIN_ID,
    name: OPENCLAW_DISPLAY_NAME,
    version,
    description: OPENCLAW_PLUGIN_DESCRIPTION,
    skills: ["./skills"],
    configSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        enabled: {
          type: "boolean",
          default: true,
        },
        prependSystemGuidance: {
          type: "boolean",
          default: true,
        },
        defaultMode: {
          type: "string",
          enum: ["L0", "L1", "L2", "L3"],
          default: "L1",
        },
        maxAutoExecuteRisk: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          default: "low",
        },
        packRoots: {
          type: "array",
          items: {
            type: "string",
          },
          default: ["./examples/packs"],
        },
      },
    },
  };
}

export function buildOpenClawSkillManifest(version: string) {
  return {
    name: OPENCLAW_PLUGIN_ID,
    version,
    description: OPENCLAW_SKILL_DESCRIPTION,
    author: "Dawei",
    homepage: "https://github.com/wd041216-bit/zhouheng-global-finance-mesh",
    metadata: {
      tags: ["openclaw-adapter", "finance", "audit", "decision-packet", "rules"],
      categories: ["Finance", "Automation"],
    },
  };
}

export function buildOpenClawAgentDescriptor() {
  return {
    version: 1,
    display_name: OPENCLAW_DISPLAY_NAME,
    short_description: OPENCLAW_OPENAI_SHORT_DESCRIPTION,
    default_prompt: OPENCLAW_OPENAI_DEFAULT_PROMPT,
  };
}

export function buildOpenClawRootSkillMarkdown() {
  return `---
name: ${OPENCLAW_PLUGIN_ID}
homepage: https://github.com/wd041216-bit/zhouheng-global-finance-mesh
description: >
  Use the optional OpenClaw adapter to validate finance packs, generate
  decision packets, and replay rule changes through the same Zhouheng control
  plane used by the standalone console.
---

# ${OPENCLAW_DISPLAY_NAME}

Use this skill when the user is operating Zhouheng Global Finance Mesh through OpenClaw instead of using the standalone console directly.

## Mission

Turn economic events into:

- decision packets
- evidence requirements
- approval routes
- replayable rule outcomes
- audit trace snapshots

## Default Workflow

1. Validate the selected packs before trusting them.
2. Merge the event payload with entity and jurisdiction context.
3. Match country, industry, entity, control, and output rules by precedence.
4. Generate one decision packet instead of scattered answers.
5. Escalate when confidence is low, evidence is missing, rules conflict, or risk is high.
6. Replay candidate rule changes before publishing them.

## Guardrails

- Do not claim statutory coverage without official sources and local signoff.
- Do not auto-execute high-risk finance actions without a rollback path.
- Keep every rule decision explainable with pack version, rule id, and evidence reference.
- Treat new exceptions as candidate rules, not silent one-off overrides.
`;
}

export function buildOpenClawBundledSkillMarkdown() {
  return `---
name: ${OPENCLAW_PLUGIN_ID}
homepage: https://github.com/wd041216-bit/zhouheng-global-finance-mesh
description: ${OPENCLAW_BUNDLED_SKILL_DESCRIPTION}
---

# ${OPENCLAW_DISPLAY_NAME}

Prefer this skill when:

- finance events need deterministic treatment
- the user asks for auditability or rollbackability
- packs should be validated before they are trusted
- rule changes should be replayed before release

## Runtime pattern

1. Validate pack quality first.
2. Run a single decision packet for the current event.
3. Surface confidence, risk, evidence gaps, and approval route.
4. If rules are changing, replay historical events before publish.
`;
}
