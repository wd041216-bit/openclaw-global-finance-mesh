import type { AuditIntegrityStatus } from "./audit-ledger.ts";
import type {
  DecisionRunResult,
  EventPayload,
  LoadedPack,
  PackValidationResult,
  ReplayRunResult,
  ValidationFinding,
} from "./types.ts";

export type AgentAdapterSupportLevel = "native_ready" | "shared_mcp_beta";

export interface AgentAdapterArtifact {
  kind: "config" | "docs" | "command" | "verify";
  label: string;
  value: string;
  description: string;
}

export interface PackValidationToolResult {
  ok: boolean;
  summary: string;
  packCount: number;
  errorCount: number;
  warningCount: number;
  packs: Array<{
    path: string;
    packId: string;
    displayName: string;
    version: string;
    status: string;
  }>;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
}

export interface DecisionToolResult {
  ok: boolean;
  summary: string;
  mode: string;
  eventId: string;
  eventType: string;
  packCount: number;
  applicablePackCount: number;
  riskRating: string;
  confidence: number;
  suggestedActions: string[];
  missingEvidence: string[];
  matchedRuleCount: number;
  conflictCount: number;
  applicablePacks: Array<{
    packId: string;
    version: string;
    type: string;
  }>;
  matchedRules: Array<{
    packId: string;
    ruleId: string;
    blockingMatches: number;
    warningMatches: number;
  }>;
  evidenceGraph: {
    graphRef: string;
    nodeCount: number;
    edgeCount: number;
  };
  decisionPacket: Record<string, unknown>;
  conflicts: string[];
  validation?: PackValidationToolResult;
}

export interface ReplayToolResult {
  ok: boolean;
  summary: string;
  mode: string;
  comparedEvents: number;
  changedEvents: number;
  higherRiskEvents: number;
  lowerConfidenceEvents: number;
  topDiffs: Array<{
    eventId: string;
    changedFields: string[];
    baselineRisk: string;
    candidateRisk: string;
    candidateSummary: string;
  }>;
  diffs: ReplayRunResult["diffs"];
  validation?: PackValidationToolResult;
}

export interface LegalSearchToolResult {
  ok: boolean;
  summary: string;
  query: string;
  topK: number;
  matchCount: number;
  matches: Array<{
    id: string;
    title: string;
    jurisdiction: string;
    status: string;
    sourceRef?: string;
    score: number;
    excerpt: string;
  }>;
}

export interface AuditIntegrityToolResult {
  ok: boolean;
  summary: string;
  status: AuditIntegrityStatus["status"];
  latestSequence: number;
  verifiedThroughSequence: number;
  mismatchCount: number;
  lastVerifiedAt?: string;
  isStale: boolean;
  environment: string;
  teamScope: string;
  latestExportId?: string;
  latestExportCreatedAt?: string;
}

export function buildPackValidationToolResult(
  validation: PackValidationResult,
  loadedPacks: LoadedPack[],
): PackValidationToolResult {
  const errorCount = validation.errors.length;
  const warningCount = validation.warnings.length;
  const summary = validation.ok
    ? `共检查 ${loadedPacks.length} 个 Pack，当前没有阻断错误${warningCount > 0 ? `，但有 ${warningCount} 条提醒` : ""}。`
    : `共检查 ${loadedPacks.length} 个 Pack，发现 ${errorCount} 条错误和 ${warningCount} 条提醒。`;

  return {
    ok: validation.ok,
    summary,
    packCount: loadedPacks.length,
    errorCount,
    warningCount,
    packs: loadedPacks.map((item) => ({
      path: item.path,
      packId: item.pack.pack_id,
      displayName: item.pack.display_name,
      version: item.pack.version,
      status: item.pack.status,
    })),
    errors: validation.errors,
    warnings: validation.warnings,
  };
}

export function buildDecisionToolResult(input: {
  result: DecisionRunResult;
  event: EventPayload;
  loadedPacks: LoadedPack[];
  mode: string;
}): DecisionToolResult {
  const confidence = Number(input.result.decisionPacket.confidence ?? 0);
  return {
    ok: true,
    summary: input.result.decisionPacket.summary,
    mode: input.mode,
    eventId: String(input.event.event_id ?? "unknown"),
    eventType: String(input.event.event_type ?? "unknown"),
    packCount: input.loadedPacks.length,
    applicablePackCount: input.result.decisionPacket.applicable_packs.length,
    riskRating: input.result.decisionPacket.risk_rating,
    confidence,
    suggestedActions: input.result.decisionPacket.action_plan,
    missingEvidence: input.result.missingEvidence,
    matchedRuleCount: input.result.matchedRules.length,
    conflictCount: input.result.conflicts.length,
    applicablePacks: input.result.decisionPacket.applicable_packs.map((pack) => ({
      packId: pack.pack_id,
      version: pack.version,
      type: pack.type,
    })),
    matchedRules: input.result.matchedRules.map((item) => ({
      packId: item.pack.pack_id,
      ruleId: item.rule.rule_id,
      blockingMatches: item.blockingMatches.length,
      warningMatches: item.warningMatches.length,
    })),
    evidenceGraph: {
      graphRef: input.result.evidenceGraph.graph_ref,
      nodeCount: input.result.evidenceGraph.nodes.length,
      edgeCount: input.result.evidenceGraph.edges.length,
    },
    decisionPacket: input.result.decisionPacket,
    conflicts: input.result.conflicts,
  };
}

export function buildDecisionValidationToolResult(input: {
  validation: PackValidationResult;
  loadedPacks: LoadedPack[];
  mode: string;
}): DecisionToolResult {
  return {
    ok: false,
    summary: "Pack 校验未通过，当前没有生成新的 Decision Packet。",
    mode: input.mode,
    eventId: "validation-blocked",
    eventType: "validation-blocked",
    packCount: input.loadedPacks.length,
    applicablePackCount: 0,
    riskRating: "unknown",
    confidence: 0,
    suggestedActions: [],
    missingEvidence: [],
    matchedRuleCount: 0,
    conflictCount: 0,
    applicablePacks: [],
    matchedRules: [],
    evidenceGraph: {
      graphRef: "",
      nodeCount: 0,
      edgeCount: 0,
    },
    decisionPacket: {},
    conflicts: [],
    validation: buildPackValidationToolResult(input.validation, input.loadedPacks),
  };
}

export function buildReplayToolResult(input: {
  replay: ReplayRunResult;
  mode: string;
}): ReplayToolResult {
  return {
    ok: input.replay.ok,
    summary: input.replay.changed_events > 0
      ? `共比较 ${input.replay.compared_events} 个事件，发现 ${input.replay.changed_events} 个结果变化，其中 ${input.replay.higher_risk_events} 个风险上升。`
      : `共比较 ${input.replay.compared_events} 个事件，当前没有发现结果变化。`,
    mode: input.mode,
    comparedEvents: input.replay.compared_events,
    changedEvents: input.replay.changed_events,
    higherRiskEvents: input.replay.higher_risk_events,
    lowerConfidenceEvents: input.replay.lower_confidence_events,
    topDiffs: input.replay.diffs.slice(0, 3).map((item) => ({
      eventId: String((item as Record<string, unknown>).event_id ?? "unknown"),
      changedFields: Array.isArray((item as Record<string, unknown>).changed_fields)
        ? ((item as Record<string, unknown>).changed_fields as unknown[]).map(String)
        : [],
      baselineRisk: String((item as Record<string, unknown>).baseline_risk ?? "unknown"),
      candidateRisk: String((item as Record<string, unknown>).candidate_risk ?? "unknown"),
      candidateSummary: String((item as Record<string, unknown>).candidate_summary ?? ""),
    })),
    diffs: input.replay.diffs,
  };
}

export function buildReplayValidationToolResult(input: {
  validation: PackValidationResult;
  loadedPacks: LoadedPack[];
  mode: string;
}): ReplayToolResult {
  return {
    ok: false,
    summary: "Pack 校验未通过，当前没有生成新的回放摘要。",
    mode: input.mode,
    comparedEvents: 0,
    changedEvents: 0,
    higherRiskEvents: 0,
    lowerConfidenceEvents: 0,
    topDiffs: [],
    diffs: [],
    validation: buildPackValidationToolResult(input.validation, input.loadedPacks),
  };
}

export function buildLegalSearchToolResult(input: {
  query: string;
  topK: number;
  matches: Array<{
    document: {
      id: string;
      title: string;
      jurisdiction: string;
      status: string;
      sourceRef?: string;
    };
    score: number;
    excerpt: string;
  }>;
}): LegalSearchToolResult {
  return {
    ok: true,
    summary: input.matches.length > 0
      ? `已找到 ${input.matches.length} 条与“${input.query}”最相关的依据资料。`
      : `没有找到与“${input.query}”直接匹配的依据资料。`,
    query: input.query,
    topK: input.topK,
    matchCount: input.matches.length,
    matches: input.matches.map((item) => ({
      id: item.document.id,
      title: item.document.title,
      jurisdiction: item.document.jurisdiction,
      status: item.document.status,
      sourceRef: item.document.sourceRef,
      score: item.score,
      excerpt: item.excerpt,
    })),
  };
}

export function buildAuditIntegrityToolResult(status: AuditIntegrityStatus): AuditIntegrityToolResult {
  return {
    ok: true,
    summary: status.mismatchCount > 0
      ? `当前审计链发现 ${status.mismatchCount} 处异常，建议尽快复核。`
      : status.lastVerifiedAt
        ? `审计链最近一次完整校验通过，最新序号 #${status.latestSequence}。`
        : `审计链尚未执行完整校验，当前最新序号 #${status.latestSequence}。`,
    status: status.status,
    latestSequence: status.latestSequence,
    verifiedThroughSequence: status.verifiedThroughSequence,
    mismatchCount: status.mismatchCount,
    lastVerifiedAt: status.lastVerifiedAt,
    isStale: status.isStale,
    environment: status.environment,
    teamScope: status.teamScope,
    latestExportId: status.lastExport?.id,
    latestExportCreatedAt: status.lastExport?.createdAt,
  };
}
