import crypto from "node:crypto";

import { AuditLedgerStore } from "./audit-ledger.ts";

import type { AuthenticatedActor } from "./access-control.ts";
import type { BrainProbeResult } from "./brain.ts";
import type { LedgerMetadata } from "./audit-ledger.ts";
import type { BrainMode, BrainRuntimeConfig } from "./runtime-config.ts";
import type { DecisionRunResult, EventPayload, Mode, ReplayRunResult, RiskLevel } from "./types.ts";

export type AuditRunType = "decision" | "replay" | "probe";
export type AuditRunMode = Mode | BrainMode;

export interface AuditRunSummary extends LedgerMetadata {
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

interface AuditRunStoreOptions {
  ledger?: AuditLedgerStore;
  ledgerPath?: string;
  legacyRunsPath?: string;
  legacyActivityPath?: string;
  exportDir?: string;
  environment?: string;
  teamScope?: string;
  verifyWarnHours?: number;
}

export class AuditRunStore {
  private readonly ledger: AuditLedgerStore;

  constructor(options?: AuditRunStoreOptions) {
    this.ledger =
      options?.ledger ??
      new AuditLedgerStore({
        ledgerPath: options?.ledgerPath,
        legacyRunsPath: options?.legacyRunsPath,
        legacyActivityPath: options?.legacyActivityPath,
        exportDir: options?.exportDir,
        environment: options?.environment,
        teamScope: options?.teamScope,
        verifyWarnHours: options?.verifyWarnHours,
      });
  }

  async list(limit = 12, options?: { types?: AuditRunType[] }): Promise<AuditRunSummary[]> {
    const entries = await this.ledger.listEntries<AuditRunRecord>({
      kinds: (options?.types?.length ? options.types : ["decision", "replay", "probe"]).map(toLedgerKind),
      limit,
    });
    return entries.map((entry) => this.toSummary(entry.payload, entry));
  }

  async get(id: string): Promise<AuditRunRecord | null> {
    const entry = await this.ledger.getEntry<AuditRunRecord>(id, {
      kinds: ["decision_run", "replay_run", "probe_run"],
    });
    if (!entry) {
      return null;
    }
    return this.toRecord(entry.payload, entry);
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
      sequence: 0,
      entryHash: "",
      prevHash: "",
      environment: "",
      teamScope: "",
      chainStatus: "pending",
      detail: {
        actor: input.actor,
        event: input.event,
        decisionPacket: input.result.decisionPacket,
        missingEvidence: input.result.missingEvidence,
        conflicts: input.result.conflicts,
        evidenceGraph: input.result.evidenceGraph,
      },
    };

    const entry = await this.ledger.appendEntry({
      entryId: record.id,
      kind: "decision_run",
      createdAt,
      actor: input.actor,
      subject: input.event.event_id,
      relatedRunId: record.id,
      payload: record,
    });
    return this.toSummary(entry.payload, entry);
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
      sequence: 0,
      entryHash: "",
      prevHash: "",
      environment: "",
      teamScope: "",
      chainStatus: "pending",
      detail: {
        actor: input.actor,
        baselinePackPaths: input.baselinePackPaths,
        candidatePackPaths: input.candidatePackPaths,
        replay: input.replay,
      },
    };

    const entry = await this.ledger.appendEntry({
      entryId: record.id,
      kind: "replay_run",
      createdAt,
      actor: input.actor,
      subject: `${input.events.length} events`,
      relatedRunId: record.id,
      payload: record,
    });
    return this.toSummary(entry.payload, entry);
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
      sequence: 0,
      entryHash: "",
      prevHash: "",
      environment: "",
      teamScope: "",
      chainStatus: "pending",
      detail: {
        actor: input.actor,
        config: input.config,
        probe: input.probe,
      },
    };

    const entry = await this.ledger.appendEntry({
      entryId: record.id,
      kind: "probe_run",
      createdAt,
      actor: input.actor,
      subject: input.config.model,
      relatedRunId: record.id,
      payload: record,
    });
    return this.toSummary(entry.payload, entry);
  }

  private toSummary(
    payload: AuditRunRecord,
    metadata: Pick<
      AuditRunRecord,
      "sequence" | "entryHash" | "prevHash" | "environment" | "teamScope" | "chainStatus" | "chainVerifiedAt"
    >,
  ): AuditRunSummary {
    const { detail: _detail, ...summary } = payload;
    return {
      ...summary,
      sequence: metadata.sequence,
      entryHash: metadata.entryHash,
      prevHash: metadata.prevHash,
      environment: metadata.environment,
      teamScope: metadata.teamScope,
      chainStatus: metadata.chainStatus,
      chainVerifiedAt: metadata.chainVerifiedAt,
    };
  }

  private toRecord(payload: AuditRunRecord, metadata: AuditRunRecord): AuditRunRecord {
    return {
      ...payload,
      sequence: metadata.sequence,
      entryHash: metadata.entryHash,
      prevHash: metadata.prevHash,
      environment: metadata.environment,
      teamScope: metadata.teamScope,
      chainStatus: metadata.chainStatus,
      chainVerifiedAt: metadata.chainVerifiedAt,
    };
  }
}

function toLedgerKind(type: AuditRunType): "decision_run" | "replay_run" | "probe_run" {
  if (type === "replay") {
    return "replay_run";
  }
  if (type === "probe") {
    return "probe_run";
  }
  return "decision_run";
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
