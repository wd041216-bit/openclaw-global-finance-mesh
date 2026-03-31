import {
  buildAuditIntegrityToolResult,
  buildDecisionToolResult,
  buildDecisionValidationToolResult,
  buildLegalSearchToolResult,
  buildPackValidationToolResult,
  buildReplayToolResult,
  buildReplayValidationToolResult,
} from "./agent-tool-results.ts";
import { loadEventsFromPaths, loadFinancePacksFromPaths } from "./fs.ts";
import { runDecision } from "./engine.ts";
import { AuditLedgerStore } from "./audit-ledger.ts";
import { LegalLibraryStore } from "./legal-library.ts";
import { runReplay } from "./replay.ts";
import { validatePackCollection } from "./validation.ts";

import type { FinanceMeshConfig } from "./config.ts";
import type { DecisionRunInput, EventPayload } from "./types.ts";

const auditLedger = new AuditLedgerStore();
const legalLibrary = new LegalLibraryStore();

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
      const details = buildPackValidationToolResult(validation, loadedPacks);

      return {
        content: [{ type: "text" as const, text: details.summary }],
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
        const details = buildDecisionValidationToolResult({
          validation,
          loadedPacks,
          mode: normalizeMode(rawParams.mode, params.config.defaultMode),
        });
        return {
          content: [{ type: "text" as const, text: details.summary }],
          details,
        };
      }

      const eventPayload = await resolveEventPayload(rawParams);
      const mode = normalizeMode(rawParams.mode, params.config.defaultMode);
      const result = runDecision({
        request: {
          mode,
          event_payload: eventPayload,
          available_evidence: normalizePathList(rawParams.availableEvidence, []),
        },
        packs: loadedPacks.map((item) => item.pack),
      });
      const details = buildDecisionToolResult({
        result,
        event: eventPayload,
        loadedPacks,
        mode,
      });

      return {
        content: [{ type: "text" as const, text: details.summary }],
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
        const details = buildReplayValidationToolResult({
          validation,
          loadedPacks: [...baseline, ...candidate],
          mode: normalizeMode(rawParams.mode, params.config.defaultMode),
        });
        return {
          content: [{ type: "text" as const, text: details.summary }],
          details,
        };
      }

      const events = await resolveEvents(rawParams);
      const mode = normalizeMode(rawParams.mode, params.config.defaultMode);
      const replay = runReplay({
        mode,
        events,
        baselinePacks: baseline.map((item) => item.pack),
        candidatePacks: candidate.map((item) => item.pack),
      });
      const details = buildReplayToolResult({
        replay,
        mode,
      });

      return {
        content: [{ type: "text" as const, text: details.summary }],
        details,
      };
    },
  };
}

export function createLegalLibrarySearchTool() {
  return {
    name: "finance_mesh_search_legal_library",
    label: "Search Legal Library",
    description: "Search governed legal and control-library documents for grounding and review.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: {
          type: "string",
          description: "Keyword or business question to search.",
        },
        topK: {
          type: "number",
          minimum: 1,
          maximum: 20,
        },
        statuses: {
          type: "array",
          items: {
            type: "string",
            enum: ["draft", "reviewed", "approved", "retired"],
          },
        },
      },
      required: ["query"],
    },
    async execute(_toolCallId: string, rawParams: Record<string, unknown>) {
      const query = typeof rawParams.query === "string" ? rawParams.query.trim() : "";
      if (!query) {
        throw new Error("query is required");
      }
      const topK = Number.isFinite(Number(rawParams.topK)) ? Number(rawParams.topK) : 5;
      const statuses = Array.isArray(rawParams.statuses)
        ? rawParams.statuses.filter((item): item is "draft" | "reviewed" | "approved" | "retired" =>
          item === "draft" || item === "reviewed" || item === "approved" || item === "retired")
        : ["reviewed", "approved"];
      const matches = await legalLibrary.search(query, topK, {
        statuses: statuses.length > 0 ? statuses : ["reviewed", "approved"],
      });
      const details = buildLegalSearchToolResult({
        query,
        topK,
        matches,
      });
      return {
        content: [{ type: "text" as const, text: details.summary }],
        details,
      };
    },
  };
}

export function createAuditIntegrityReadTool() {
  return {
    name: "finance_mesh_read_audit_integrity",
    label: "Read Audit Integrity",
    description: "Read the current audit-ledger integrity state, latest verification, and export summary.",
    parameters: {
      type: "object",
      additionalProperties: false,
      properties: {},
    },
    async execute() {
      const status = await auditLedger.getIntegrityStatus();
      const details = buildAuditIntegrityToolResult(status);
      return {
        content: [{ type: "text" as const, text: details.summary }],
        details,
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
