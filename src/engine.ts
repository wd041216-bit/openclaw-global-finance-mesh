import { buildEvidenceGraphSnapshot, hashContent } from "./evidence.ts";
import { compareMatchedRules, specificityScore } from "./precedence.ts";
import { buildFacts, evaluateCondition, evaluateScope, matchedConditions } from "./selectors.ts";

import type {
  ControlResult,
  DecisionPacket,
  DecisionRunInput,
  DecisionRunResult,
  FinancePack,
  MatchedRule,
  Mode,
  RiskLevel,
} from "./types.ts";

const RISK_WEIGHT: Record<RiskLevel, number> = {
  low: 1,
  medium: 2,
  high: 3,
  critical: 4,
};

export function runDecision(input: { request: DecisionRunInput; packs: FinancePack[] }): DecisionRunResult {
  const mode = input.request.mode ?? "L1";
  const facts = buildDecisionFacts(input.request);
  const packs = input.packs.filter((pack) => packIsEffective(pack, facts.event_time));
  const matchedRules: MatchedRule[] = [];

  for (const pack of packs) {
    for (const rule of pack.rules ?? []) {
      if (!evaluateScope(rule.scope, facts)) {
        continue;
      }

      const preconditions = rule.conditions?.preconditions ?? [];
      if (!preconditions.every((condition) => evaluateCondition(condition, facts))) {
        continue;
      }

      matchedRules.push({
        pack,
        rule,
        blockingMatches: matchedConditions(rule.conditions?.blocking_conditions, facts),
        warningMatches: matchedConditions(rule.conditions?.warning_conditions, facts),
        specificity: specificityScore(rule),
      });
    }
  }

  matchedRules.sort(compareMatchedRules);

  const merged = mergeActions(matchedRules);
  const requiredEvidence = uniqueStrings(merged.evidenceRequirements);
  const missingEvidence = requiredEvidence.filter((item) => !hasEvidence(item, facts, input.request.available_evidence));
  const materialityBand = determineMaterialityBand(packs, facts);
  const controlResults = buildControlResults(matchedRules);
  const conflicts = merged.conflicts;
  const riskRating = determineRisk(matchedRules, controlResults, missingEvidence, conflicts, facts);
  const confidence = determineConfidence(matchedRules, controlResults, missingEvidence, conflicts);
  const approvalRoute = buildApprovalRoute(merged.approvalRoute, materialityBand, confidence, riskRating);
  const accountingTreatment = buildAccountingTreatment(merged.accountMapping, facts);
  const taxTreatment = buildTaxTreatment(merged.taxTreatment, facts);
  const actionPlan = buildActionPlan({
    accountingTreatment,
    outputTemplates: merged.outputTemplates,
    approvalRoute,
    missingEvidence,
  });
  const rollbackSteps = uniqueStrings(matchedRules.flatMap((match) => match.rule.rollback.rollback_steps ?? []));
  const decisionPacketId = buildDecisionPacketId(facts);
  const evidenceGraph = buildEvidenceGraphSnapshot({
    decisionPacketId,
    event: facts,
    matchedRules,
    controlResults,
  });
  const decisionPacket: DecisionPacket = {
    decision_packet_id: decisionPacketId,
    generated_at: new Date().toISOString(),
    mode,
    summary: buildSummary(accountingTreatment, missingEvidence, approvalRoute, facts),
    event_classification: buildEventClassification(facts),
    applicable_packs: uniqueApplicablePacks(matchedRules),
    rule_versions: uniqueStrings(matchedRules.map((match) => `${match.rule.rule_id}@${match.pack.version}`)),
    accounting_treatment: accountingTreatment,
    tax_treatment: taxTreatment,
    control_results: controlResults,
    required_evidence: requiredEvidence,
    approval_route: approvalRoute,
    action_plan: actionPlan,
    risk_rating: riskRating,
    confidence,
    exceptions: buildExceptions(missingEvidence, conflicts),
    rollback_plan: {
      supported: rollbackSteps.length > 0,
      steps: rollbackSteps,
    },
    audit_trace_ref: {
      graph_ref: evidenceGraph.graph_ref,
      source_event_hash: hashContent(facts),
      control_log_refs: controlResults.map((result) => `${decisionPacketId}:${result.control_id}`),
      approval_log_refs: approvalActors(approvalRoute).map((actor, index) => `${decisionPacketId}:approval:${index + 1}:${actor}`),
    },
  };

  if (mode === "L2" || mode === "L3") {
    const autoExecuteEligible =
      riskRating === "low" && confidence >= 0.92 && missingEvidence.length === 0 && !controlResults.some((item) => item.status === "block");
    decisionPacket.approval_route = {
      ...decisionPacket.approval_route,
      auto_execute_eligible: autoExecuteEligible,
    };
  } else {
    decisionPacket.approval_route = {
      ...decisionPacket.approval_route,
      auto_execute_eligible: false,
    };
  }

  return {
    decisionPacket,
    evidenceGraph,
    matchedRules,
    missingEvidence,
    conflicts,
  };
}

function buildDecisionFacts(request: DecisionRunInput): Record<string, unknown> {
  const eventPayload = request.event_payload ?? {};
  return {
    ...request.policy_context,
    ...request.industry_context,
    ...request.entity_context,
    ...request.jurisdiction_context,
    ...eventPayload,
    available_evidence: uniqueStrings([
      ...(request.available_evidence ?? []),
      ...((eventPayload.evidence_refs as string[] | undefined) ?? []),
      ...(((eventPayload.document_types as string[] | undefined) ?? [])),
    ]),
  };
}

function packIsEffective(pack: FinancePack, eventTime: unknown): boolean {
  if (typeof eventTime !== "string") {
    return true;
  }

  const target = Date.parse(eventTime);
  const effectiveFrom = Date.parse(pack.effective_from);
  const effectiveTo = pack.effective_to ? Date.parse(pack.effective_to) : Number.POSITIVE_INFINITY;

  if (Number.isNaN(target) || Number.isNaN(effectiveFrom)) {
    return true;
  }

  return target >= effectiveFrom && target <= effectiveTo;
}

function mergeActions(matchedRules: MatchedRule[]) {
  const accountMapping: Record<string, unknown> = {};
  const taxTreatment: Record<string, unknown> = {};
  const approvalRoute: Record<string, unknown> = {};
  const evidenceRequirements: string[] = [];
  const outputTemplates: string[] = [];
  const conflicts: string[] = [];

  for (const matched of matchedRules) {
    const actions = matched.rule.actions ?? {};
    mergeObject(accountMapping, actions.account_mapping, `${matched.rule.rule_id}.actions.account_mapping`, conflicts);
    mergeObject(taxTreatment, actions.tax_treatment, `${matched.rule.rule_id}.actions.tax_treatment`, conflicts);
    mergeObject(approvalRoute, actions.approval_route, `${matched.rule.rule_id}.actions.approval_route`, conflicts);
    evidenceRequirements.push(...(actions.evidence_requirements ?? []));
    outputTemplates.push(...(actions.output_templates ?? []));
  }

  return {
    accountMapping,
    taxTreatment,
    approvalRoute,
    evidenceRequirements,
    outputTemplates: uniqueStrings(outputTemplates),
    conflicts,
  };
}

function mergeObject(
  target: Record<string, unknown>,
  source: Record<string, unknown> | undefined,
  path: string,
  conflicts: string[],
): void {
  if (!source) {
    return;
  }

  for (const [key, value] of Object.entries(source)) {
    if (!(key in target)) {
      target[key] = cloneValue(value);
      continue;
    }

    const existing = target[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      mergeObject(existing, value, `${path}.${key}`, conflicts);
      continue;
    }

    if (Array.isArray(existing) && Array.isArray(value)) {
      target[key] = uniqueStrings([...existing.map(String), ...value.map(String)]);
      continue;
    }

    if (JSON.stringify(existing) !== JSON.stringify(value)) {
      conflicts.push(`Conflict at ${path}.${key}: kept higher-precedence value.`);
    }
  }
}

function buildControlResults(matchedRules: MatchedRule[]): ControlResult[] {
  const results = new Map<string, ControlResult>();

  for (const matched of matchedRules) {
    const hooks = matched.rule.actions?.control_hooks ?? [matched.rule.rule_id];
    const status = matched.blockingMatches.length > 0 ? "block" : matched.warningMatches.length > 0 ? "warn" : "pass";
    const detail = matched.blockingMatches.length > 0
      ? `Blocking conditions met for ${matched.rule.rule_id}.`
      : matched.warningMatches.length > 0
        ? `Warning conditions met for ${matched.rule.rule_id}.`
        : `Control passed through ${matched.rule.rule_id}.`;

    for (const hook of hooks) {
      const existing = results.get(hook);
      if (!existing || severityRank(status) > severityRank(existing.status)) {
        results.set(hook, {
          control_id: hook,
          status,
          detail,
        });
      }
    }
  }

  return Array.from(results.values());
}

function determineMaterialityBand(packs: FinancePack[], facts: Record<string, unknown>): "low" | "medium" | "high" {
  const amountValue = Number((facts.amount as { value?: number } | undefined)?.value ?? 0);
  const thresholds = packs
    .filter((pack) => pack.pack_type === "entity")
    .map((pack) => (pack.entity_profile as { materiality_thresholds?: Record<string, number> } | undefined)?.materiality_thresholds)
    .find(Boolean) ?? { medium: 100000, high: 500000 };

  if (amountValue >= Number(thresholds.high ?? 500000)) {
    return "high";
  }

  if (amountValue >= Number(thresholds.medium ?? 100000)) {
    return "medium";
  }

  return "low";
}

function buildApprovalRoute(
  route: Record<string, unknown>,
  materialityBand: "low" | "medium" | "high",
  confidence: number,
  riskRating: RiskLevel,
): Record<string, unknown> {
  const defaults = uniqueStrings(((route.default as string[] | undefined) ?? []).map(String));
  const additional = uniqueStrings(((route.additional_review as string[] | undefined) ?? []).map(String));
  const materialityOverrides = isPlainObject(route.materiality_overrides)
    ? (route.materiality_overrides as Record<string, string[]>)
    : {};

  const escalations = uniqueStrings([
    ...defaults,
    ...additional,
    ...((materialityOverrides[materialityBand] ?? []).map(String)),
    ...(confidence < 0.92 ? ["human_finance_review"] : []),
    ...(riskRating === "high" || riskRating === "critical" ? ["tax_or_control_signoff"] : []),
  ]);

  return {
    default: uniqueStrings(defaults),
    additional_review: uniqueStrings(escalations.filter((actor) => !defaults.includes(actor))),
  };
}

function buildAccountingTreatment(
  accountMapping: Record<string, unknown>,
  facts: Record<string, unknown>,
): Record<string, unknown> {
  const amountValue = Number((facts.amount as { value?: number } | undefined)?.value ?? 0);
  const servicePeriod = facts.service_period as { start?: string; end?: string } | undefined;
  const recognitionMethod = String(accountMapping.recognition_method ?? "");
  const periods = servicePeriod?.start && servicePeriod.end ? monthSpan(servicePeriod.start, servicePeriod.end) : undefined;
  const monthlyAmount = periods && periods > 0 ? Number((amountValue / periods).toFixed(2)) : undefined;

  const journalEntries = isPlainObject(accountMapping.initial_receipt)
    ? [
        {
          journal_type: "initial_receipt",
          lines: [
            {
              account: String((accountMapping.initial_receipt as Record<string, unknown>).debit ?? "bank"),
              debit: amountValue,
              credit: 0,
            },
            {
              account: String((accountMapping.initial_receipt as Record<string, unknown>).credit ?? "contract_liability"),
              debit: 0,
              credit: amountValue,
            },
          ],
        },
      ]
    : [];

  return {
    ...accountMapping,
    journal_entries: journalEntries,
    recognition_schedule:
      recognitionMethod === "ratable_monthly" && periods && monthlyAmount != null
        ? {
            method: "ratable_monthly",
            periods,
            monthly_amount: monthlyAmount,
            first_recognition_date: endOfMonth(servicePeriod?.start ?? ""),
          }
        : undefined,
  };
}

function buildTaxTreatment(
  taxTreatment: Record<string, unknown>,
  facts: Record<string, unknown>,
): Record<string, unknown> {
  return {
    tax_review_required: Boolean(taxTreatment.tax_review_required ?? facts.cross_border === true),
    filing_flag: Boolean(taxTreatment.filing_flag ?? false),
    reason: taxTreatment.reason ?? "Follow matched tax rules and local review requirements.",
    output_tags: uniqueStrings(((taxTreatment.output_tags as string[] | undefined) ?? []).map(String)),
  };
}

function buildActionPlan(input: {
  accountingTreatment: Record<string, unknown>;
  outputTemplates: string[];
  approvalRoute: Record<string, unknown>;
  missingEvidence: string[];
}): string[] {
  const actions: string[] = [];

  if ((input.accountingTreatment.journal_entries as unknown[] | undefined)?.length) {
    actions.push("Generate initial receipt journal draft.");
  }

  if (isPlainObject(input.accountingTreatment.recognition_schedule)) {
    actions.push("Generate monthly revenue recognition schedule.");
  }

  if (input.missingEvidence.length > 0) {
    actions.push(`Request missing evidence: ${input.missingEvidence.join(", ")}.`);
  }

  for (const actor of approvalActors(input.approvalRoute)) {
    actions.push(`Route review to ${actor}.`);
  }

  for (const template of input.outputTemplates) {
    actions.push(`Prepare output artifact: ${template}.`);
  }

  return uniqueStrings(actions);
}

function buildSummary(
  accountingTreatment: Record<string, unknown>,
  missingEvidence: string[],
  approvalRoute: Record<string, unknown>,
  facts: Record<string, unknown>,
): string {
  const debitAccount = String(
    ((accountingTreatment.initial_receipt as Record<string, unknown> | undefined)?.debit ?? "bank"),
  );
  const creditAccount = String(
    ((accountingTreatment.initial_receipt as Record<string, unknown> | undefined)?.credit ?? "contract_liability"),
  );
  const eventType = String(facts.sub_event_type ?? facts.event_type ?? "finance event");
  const approvals = approvalActors(approvalRoute);

  let sentence =
    `Treat ${eventType} as ${creditAccount} after posting the receipt to ${debitAccount}.`;

  if (isPlainObject(accountingTreatment.recognition_schedule)) {
    sentence += " Recognize revenue monthly through the service period.";
  }

  if (approvals.length > 0) {
    sentence += ` Route review to ${approvals.join(", ")}.`;
  }

  if (missingEvidence.length > 0) {
    sentence += ` Missing evidence blocks full automation: ${missingEvidence.join(", ")}.`;
  }

  return sentence;
}

function buildEventClassification(facts: Record<string, unknown>): Record<string, unknown> {
  return {
    event_id: facts.event_id,
    event_type: facts.event_type,
    sub_event_type: facts.sub_event_type,
    entity_id: facts.entity_id,
    industry_code: facts.industry_code,
    jurisdiction_context: {
      legal_country: facts.legal_country,
      tax_country: facts.tax_country,
      service_delivery_country: facts.service_delivery_country,
      counterparty_country: facts.counterparty_country,
      cross_border: facts.cross_border,
    },
    amount: facts.amount,
    service_period: facts.service_period,
  };
}

function buildExceptions(missingEvidence: string[], conflicts: string[]): string[] {
  return uniqueStrings([
    ...missingEvidence.map((item) => `missing_evidence:${item}`),
    ...conflicts,
  ]);
}

function determineRisk(
  matchedRules: MatchedRule[],
  controlResults: ControlResult[],
  missingEvidence: string[],
  conflicts: string[],
  facts: Record<string, unknown>,
): RiskLevel {
  let maxRisk = matchedRules.reduce<RiskLevel>((current, matched) => {
    if (
      matched.pack.pack_type === "control" &&
      matched.blockingMatches.length === 0 &&
      matched.warningMatches.length === 0
    ) {
      return current;
    }
    return riskFromWeight(Math.max(RISK_WEIGHT[current], RISK_WEIGHT[matched.rule.risk_model.risk_level]));
  }, "low");

  if (controlResults.some((result) => result.status === "block") || missingEvidence.length > 0 || conflicts.length > 0) {
    maxRisk = riskFromWeight(Math.max(RISK_WEIGHT[maxRisk], RISK_WEIGHT.high));
  }

  if (facts.cross_border === true || facts.related_party === true) {
    maxRisk = riskFromWeight(Math.max(RISK_WEIGHT[maxRisk], RISK_WEIGHT.high));
  }

  return maxRisk;
}

function determineConfidence(
  matchedRules: MatchedRule[],
  controlResults: ControlResult[],
  missingEvidence: string[],
  conflicts: string[],
): number {
  const warningCount = controlResults.filter((result) => result.status === "warn").length;
  const blockingCount = controlResults.filter((result) => result.status === "block").length;
  const rulePenalty = Math.max(matchedRules.length - 1, 0) * 0.005;
  const confidence = 0.98 - warningCount * 0.03 - blockingCount * 0.12 - missingEvidence.length * 0.04 - conflicts.length * 0.05 - rulePenalty;
  return Number(Math.max(0.4, Math.min(0.99, confidence)).toFixed(2));
}

function buildDecisionPacketId(facts: Record<string, unknown>): string {
  const digest = hashContent({
    event_id: facts.event_id,
    event_time: facts.event_time,
    entity_id: facts.entity_id,
  }).slice(-10);
  return `DP-${String(facts.event_id ?? "unknown").replace(/[^A-Za-z0-9]/g, "")}-${digest}`;
}

function uniqueApplicablePacks(matchedRules: MatchedRule[]) {
  const seen = new Set<string>();
  const applicable: Array<{ pack_id: string; type: FinancePack["pack_type"]; version: string }> = [];

  for (const matched of matchedRules) {
    if (seen.has(matched.pack.pack_id)) {
      continue;
    }
    seen.add(matched.pack.pack_id);
    applicable.push({
      pack_id: matched.pack.pack_id,
      type: matched.pack.pack_type,
      version: matched.pack.version,
    });
  }

  return applicable;
}

function hasEvidence(name: string, facts: Record<string, unknown>, availableEvidence?: string[]): boolean {
  if (facts[name] === true) {
    return true;
  }

  const knownEvidence = uniqueStrings([
    ...(availableEvidence ?? []),
    ...(((facts.available_evidence as string[] | undefined) ?? [])),
  ]);

  return knownEvidence.some((item) => item.includes(name));
}

function approvalActors(route: Record<string, unknown>): string[] {
  return uniqueStrings([
    ...(((route.default as string[] | undefined) ?? []).map(String)),
    ...(((route.additional_review as string[] | undefined) ?? []).map(String)),
  ]);
}

function severityRank(value: ControlResult["status"]): number {
  if (value === "block") {
    return 3;
  }
  if (value === "warn") {
    return 2;
  }
  return 1;
}

function riskFromWeight(weight: number): RiskLevel {
  if (weight >= 4) {
    return "critical";
  }
  if (weight >= 3) {
    return "high";
  }
  if (weight >= 2) {
    return "medium";
  }
  return "low";
}

function monthSpan(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);

  return (endDate.getUTCFullYear() - startDate.getUTCFullYear()) * 12 + (endDate.getUTCMonth() - startDate.getUTCMonth()) + 1;
}

function endOfMonth(value: string): string | undefined {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }
  const endDate = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  return endDate.toISOString().slice(0, 10);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function cloneValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter((value) => value && value.trim().length > 0)));
}
