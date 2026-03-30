import { runDecision } from "./engine.ts";

import type { DecisionRunInput, FinancePack, ReplayRunResult } from "./types.ts";

export function runReplay(input: {
  mode?: DecisionRunInput["mode"];
  events: DecisionRunInput["event_payload"][];
  baselinePacks: FinancePack[];
  candidatePacks: FinancePack[];
}): ReplayRunResult {
  const diffs: Array<Record<string, unknown>> = [];
  let changedEvents = 0;
  let higherRiskEvents = 0;
  let lowerConfidenceEvents = 0;

  for (const event of input.events) {
    const baseline = runDecision({
      request: {
        mode: input.mode,
        event_payload: event,
      },
      packs: input.baselinePacks,
    });
    const candidate = runDecision({
      request: {
        mode: input.mode,
        event_payload: event,
      },
      packs: input.candidatePacks,
    });

    const changedFields = compareDecisionPackets(baseline.decisionPacket, candidate.decisionPacket);
    if (changedFields.length > 0) {
      changedEvents += 1;
    }

    if (riskWeight(candidate.decisionPacket.risk_rating) > riskWeight(baseline.decisionPacket.risk_rating)) {
      higherRiskEvents += 1;
    }

    if (candidate.decisionPacket.confidence < baseline.decisionPacket.confidence) {
      lowerConfidenceEvents += 1;
    }

    diffs.push({
      event_id: event.event_id,
      changed_fields: changedFields,
      baseline_risk: baseline.decisionPacket.risk_rating,
      candidate_risk: candidate.decisionPacket.risk_rating,
      baseline_confidence: baseline.decisionPacket.confidence,
      candidate_confidence: candidate.decisionPacket.confidence,
      candidate_summary: candidate.decisionPacket.summary,
    });
  }

  return {
    ok: true,
    compared_events: input.events.length,
    changed_events: changedEvents,
    higher_risk_events: higherRiskEvents,
    lower_confidence_events: lowerConfidenceEvents,
    diffs,
  };
}

function compareDecisionPackets(
  baseline: Record<string, unknown>,
  candidate: Record<string, unknown>,
): string[] {
  const watchedFields = [
    "summary",
    "risk_rating",
    "confidence",
    "approval_route",
    "accounting_treatment",
    "tax_treatment",
    "control_results",
    "required_evidence",
  ];

  return watchedFields.filter((field) => JSON.stringify(baseline[field]) !== JSON.stringify(candidate[field]));
}

function riskWeight(value: unknown): number {
  if (value === "critical") {
    return 4;
  }
  if (value === "high") {
    return 3;
  }
  if (value === "medium") {
    return 2;
  }
  return 1;
}

