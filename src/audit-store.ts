import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AuthenticatedActor } from "./access-control.ts";
import type { BrainProbeResult } from "./brain.ts";
import type { BrainMode, BrainRuntimeConfig } from "./runtime-config.ts";
import type { DecisionRunResult, EventPayload, Mode, ReplayRunResult, RiskLevel } from "./types.ts";

export type AuditRunType = "decision" | "replay" | "probe";
export type AuditRunMode = Mode | BrainMode;

export interface AuditRunSummary {
  id: string;
  type: AuditRunType;
  createdAt: string;
  mode: AuditRunMode;
  label: string;
  packPaths: string[];
  eventIds: string[];
  riskRating?: RiskLevel;
  confidence?: number;
  decisionPacketId?: string;
  changedEvents?: number;
  higherRiskEvents?: number;
  lowerConfidenceEvents?: number;
  actorId?: string;
  actorName?: string;
  actorRole?: string;
  probeOk?: boolean;
  listModelsOk?: boolean;
  inferenceOk?: boolean;
  availableModelCount?: number;
  model?: string;
}

export interface AuditRunRecord extends AuditRunSummary {
  detail: Record<string, unknown>;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const AUDIT_PATH = path.join(REPO_ROOT, "data", "audit", "runs.json");

export class AuditRunStore {
  private readonly auditPath: string;

  constructor(auditPath = AUDIT_PATH) {
    this.auditPath = auditPath;
  }

  async list(limit = 12, options?: { types?: AuditRunType[] }): Promise<AuditRunSummary[]> {
    const payload = await this.load();
    const typeSet = options?.types?.length ? new Set(options.types) : null;
    return payload.runs
      .filter((item) => !typeSet || typeSet.has(item.type))
      .sort((left, right) => right.createdAt.localeCompare(left.createdAt))
      .slice(0, Math.max(1, limit))
      .map(({ detail: _detail, ...summary }) => summary);
  }

  async get(id: string): Promise<AuditRunRecord | null> {
    const payload = await this.load();
    return payload.runs.find((item) => item.id === id) ?? null;
  }

  async recordDecision(input: {
    mode: Mode;
    packPaths: string[];
    event: EventPayload;
    result: DecisionRunResult;
    actor: AuthenticatedActor | null;
  }): Promise<AuditRunSummary> {
    const createdAt = new Date().toISOString();
    const record: AuditRunRecord = {
      id: crypto.randomUUID(),
      type: "decision",
      createdAt,
      mode: input.mode,
      label: buildDecisionLabel(input.event, input.result),
      packPaths: input.packPaths,
      eventIds: [input.event.event_id],
      riskRating: input.result.decisionPacket.risk_rating,
      confidence: input.result.decisionPacket.confidence,
      decisionPacketId: input.result.decisionPacket.decision_packet_id,
      actorId: input.actor?.id,
      actorName: input.actor?.name,
      actorRole: input.actor?.role,
      detail: {
        actor: input.actor,
        event: input.event,
        decisionPacket: input.result.decisionPacket,
        missingEvidence: input.result.missingEvidence,
        conflicts: input.result.conflicts,
        evidenceGraph: input.result.evidenceGraph,
      },
    };

    await this.append(record);
    return toSummary(record);
  }

  async recordReplay(input: {
    mode: Mode;
    baselinePackPaths: string[];
    candidatePackPaths: string[];
    events: EventPayload[];
    replay: ReplayRunResult;
    actor: AuthenticatedActor | null;
  }): Promise<AuditRunSummary> {
    const createdAt = new Date().toISOString();
    const record: AuditRunRecord = {
      id: crypto.randomUUID(),
      type: "replay",
      createdAt,
      mode: input.mode,
      label: buildReplayLabel(input.replay),
      packPaths: uniqueStrings([...input.baselinePackPaths, ...input.candidatePackPaths]),
      eventIds: input.events.map((item) => item.event_id),
      changedEvents: input.replay.changed_events,
      higherRiskEvents: input.replay.higher_risk_events,
      lowerConfidenceEvents: input.replay.lower_confidence_events,
      actorId: input.actor?.id,
      actorName: input.actor?.name,
      actorRole: input.actor?.role,
      detail: {
        actor: input.actor,
        baselinePackPaths: input.baselinePackPaths,
        candidatePackPaths: input.candidatePackPaths,
        replay: input.replay,
      },
    };

    await this.append(record);
    return toSummary(record);
  }

  async recordProbe(input: {
    config: Pick<BrainRuntimeConfig, "mode" | "model" | "localBaseUrl" | "cloudBaseUrl"> & { hasApiKey: boolean };
    probe: BrainProbeResult;
    actor: AuthenticatedActor | null;
  }): Promise<AuditRunSummary> {
    const createdAt = new Date().toISOString();
    const record: AuditRunRecord = {
      id: crypto.randomUUID(),
      type: "probe",
      createdAt,
      mode: input.probe.mode,
      label: buildProbeLabel(input.probe, input.config.model),
      packPaths: [],
      eventIds: [],
      actorId: input.actor?.id,
      actorName: input.actor?.name,
      actorRole: input.actor?.role,
      probeOk: input.probe.ok,
      listModelsOk: input.probe.listModelsOk,
      inferenceOk: input.probe.inferenceOk,
      availableModelCount: input.probe.availableModels.length,
      model: input.config.model,
      detail: {
        actor: input.actor,
        config: input.config,
        probe: input.probe,
      },
    };

    await this.append(record);
    return toSummary(record);
  }

  private async append(record: AuditRunRecord): Promise<void> {
    const payload = await this.load();
    payload.runs.push(record);
    await this.save(payload);
  }

  private async load(): Promise<{ runs: AuditRunRecord[] }> {
    try {
      const content = await fs.readFile(this.auditPath, "utf8");
      const payload = JSON.parse(content) as { runs?: AuditRunRecord[] };
      return {
        runs: Array.isArray(payload.runs) ? payload.runs : [],
      };
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        const seed = { runs: [] as AuditRunRecord[] };
        await this.save(seed);
        return seed;
      }
      throw error;
    }
  }

  private async save(payload: { runs: AuditRunRecord[] }): Promise<void> {
    await fs.mkdir(path.dirname(this.auditPath), { recursive: true });
    await fs.writeFile(this.auditPath, JSON.stringify(payload, null, 2), "utf8");
  }
}

function toSummary(record: AuditRunRecord): AuditRunSummary {
  const { detail: _detail, ...summary } = record;
  return summary;
}

function buildDecisionLabel(event: EventPayload, result: DecisionRunResult): string {
  const amount = typeof event.amount?.value === "number" ? ` ${event.amount.value}` : "";
  return `${event.event_type}${amount} -> ${result.decisionPacket.risk_rating} risk`;
}

function buildReplayLabel(replay: ReplayRunResult): string {
  return `${replay.changed_events}/${replay.compared_events} events changed`;
}

function buildProbeLabel(probe: BrainProbeResult, model: string): string {
  const health = probe.ok ? "healthy" : "degraded";
  return `${probe.mode} ${model} probe ${health}`;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((item) => item.trim().length > 0)));
}
