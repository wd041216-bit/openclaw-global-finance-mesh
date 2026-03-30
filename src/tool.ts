import { loadEventsFromPaths, loadFinancePacksFromPaths } from "./fs.ts";
import { runDecision } from "./engine.ts";
import { runReplay } from "./replay.ts";
import { validatePackCollection } from "./validation.ts";

import type { FinanceMeshConfig } from "./config.ts";
import type { DecisionRunInput, EventPayload } from "./types.ts";

export function createPackValidationTool(params: { config: FinanceMeshConfig }) {
  return {
    name: "finance_mesh_validate_packs",
    label: "Validate Finance Packs",
    description: "Validate finance Pack files for metadata completeness, rollback readiness, and rule hygiene.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        packPaths: {
          type: "array",
          items: {
            type: "string",
          },
          description: "Pack file paths or directories. Defaults to configured packRoots.",
        },
      },
    },
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const packPaths = normalizePathList(rawParams.packPaths, params.config.packRoots);
      const loadedPacks = await loadFinancePacksFromPaths(packPaths);
      const validation = validatePackCollection(loadedPacks);
      const details = {
        ...validation,
        pack_count: loadedPacks.length,
        packs: loadedPacks.map((item) => ({
          path: item.path,
          pack_id: item.pack.pack_id,
          version: item.pack.version,
        })),
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
        details,
      };
    },
  };
}

export function createDecisionRunTool(params: { config: FinanceMeshConfig }) {
  return {
    name: "finance_mesh_run_decision",
    label: "Run Finance Decision",
    description: "Generate a Decision Packet and evidence graph snapshot from Pack files and an event payload.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        packPaths: {
          type: "array",
          items: {
            type: "string",
          },
        },
        eventPath: {
          type: "string",
          description: "Optional JSON path to an event payload.",
        },
        eventPayload: {
          type: "object",
          description: "Inline event payload when eventPath is not provided.",
          additionalProperties: true,
        },
        mode: {
          type: "string",
          enum: ["L0", "L1", "L2", "L3"],
        },
        availableEvidence: {
          type: "array",
          items: {
            type: "string",
          },
        },
      },
    },
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const packPaths = normalizePathList(rawParams.packPaths, params.config.packRoots);
      const loadedPacks = await loadFinancePacksFromPaths(packPaths);
      const validation = validatePackCollection(loadedPacks);

      if (!validation.ok) {
        const details = {
          ok: false,
          reason: "Pack validation failed.",
          validation,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
          details,
        };
      }

      const eventPayload = await resolveEventPayload(rawParams);
      const result = runDecision({
        request: {
          mode: normalizeMode(rawParams.mode, params.config.defaultMode),
          event_payload: eventPayload,
          available_evidence: normalizePathList(rawParams.availableEvidence, []),
        },
        packs: loadedPacks.map((item) => item.pack),
      });

      const details = {
        ok: true,
        decisionPacket: result.decisionPacket,
        evidenceGraph: result.evidenceGraph,
        matchedRules: result.matchedRules.map((item) => ({
          pack_id: item.pack.pack_id,
          rule_id: item.rule.rule_id,
          blocking_matches: item.blockingMatches.length,
          warning_matches: item.warningMatches.length,
        })),
        missingEvidence: result.missingEvidence,
        conflicts: result.conflicts,
      };

      return {
        content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
        details,
      };
    },
  };
}

export function createReplayTool(params: { config: FinanceMeshConfig }) {
  return {
    name: "finance_mesh_replay",
    label: "Replay Finance Packs",
    description: "Replay historical events against baseline and candidate Pack sets before release.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        baselinePackPaths: {
          type: "array",
          items: {
            type: "string",
          },
        },
        candidatePackPaths: {
          type: "array",
          items: {
            type: "string",
          },
        },
        eventPaths: {
          type: "array",
          items: {
            type: "string",
          },
        },
        events: {
          type: "array",
          description: "Inline event payloads when eventPaths are not provided.",
          items: {
            type: "object",
            additionalProperties: true,
          },
        },
        mode: {
          type: "string",
          enum: ["L0", "L1", "L2", "L3"],
        },
      },
    },
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const baselinePackPaths = normalizePathList(rawParams.baselinePackPaths, params.config.packRoots);
      const candidatePackPaths = normalizePathList(rawParams.candidatePackPaths, params.config.packRoots);
      const baseline = await loadFinancePacksFromPaths(baselinePackPaths);
      const candidate = await loadFinancePacksFromPaths(candidatePackPaths);
      const validation = validatePackCollection([...baseline, ...candidate]);

      if (!validation.ok) {
        const details = {
          ok: false,
          reason: "Pack validation failed.",
          validation,
        };
        return {
          content: [{ type: "text" as const, text: JSON.stringify(details, null, 2) }],
          details,
        };
      }

      const events = await resolveEvents(rawParams);
      const replay = runReplay({
        mode: normalizeMode(rawParams.mode, params.config.defaultMode),
        events,
        baselinePacks: baseline.map((item) => item.pack),
        candidatePacks: candidate.map((item) => item.pack),
      });

      return {
        content: [{ type: "text" as const, text: JSON.stringify(replay, null, 2) }],
        details: replay,
      };
    },
  };
}

async function resolveEventPayload(rawParams: Record<string, unknown>): Promise<EventPayload> {
  if (typeof rawParams.eventPath === "string" && rawParams.eventPath.trim()) {
    const [event] = await loadEventsFromPaths([rawParams.eventPath]);
    if (!event) {
      throw new Error(`No event found at ${rawParams.eventPath}`);
    }
    return event;
  }

  if (rawParams.eventPayload && typeof rawParams.eventPayload === "object") {
    return rawParams.eventPayload as EventPayload;
  }

  throw new Error("Provide eventPath or eventPayload.");
}

async function resolveEvents(rawParams: Record<string, unknown>): Promise<EventPayload[]> {
  if (Array.isArray(rawParams.eventPaths) && rawParams.eventPaths.length > 0) {
    return loadEventsFromPaths(rawParams.eventPaths.filter((item): item is string => typeof item === "string"));
  }

  if (Array.isArray(rawParams.events)) {
    return rawParams.events as EventPayload[];
  }

  throw new Error("Provide eventPaths or inline events.");
}

function normalizePathList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback;
  }

  const entries = value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
  return entries.length > 0 ? entries : fallback;
}

function normalizeMode(value: unknown, fallback: FinanceMeshConfig["defaultMode"]): DecisionRunInput["mode"] {
  return value === "L0" || value === "L2" || value === "L3" ? value : fallback;
}

