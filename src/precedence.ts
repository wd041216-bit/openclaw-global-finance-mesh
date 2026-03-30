import type { FinancePack, FinanceRule, SourceType } from "./types.ts";

const PACK_TYPE_WEIGHT: Record<string, number> = {
  control: 100,
  entity: 90,
  industry: 80,
  local: 70,
  country: 60,
  regional: 50,
  output: 40,
  connector: 30,
};

const SOURCE_WEIGHT: Record<SourceType, number> = {
  official_law: 5,
  tax_authority: 5,
  group_policy: 4,
  audit_policy: 4,
  contractual: 3,
  operational: 2,
};

export function specificityScore(rule: FinanceRule): number {
  return (rule.scope.all?.length ?? 0) + (rule.scope.any?.length ?? 0) + (rule.scope.not?.length ?? 0);
}

export function compareMatchedRules(
  left: { pack: FinancePack; rule: FinanceRule; specificity: number },
  right: { pack: FinancePack; rule: FinanceRule; specificity: number },
): number {
  return (
    compareNumbers(right.specificity, left.specificity) ||
    compareNumbers(packTypeWeight(right.pack.pack_type), packTypeWeight(left.pack.pack_type)) ||
    compareNumbers(right.pack.priority_weight ?? 0, left.pack.priority_weight ?? 0) ||
    compareNumbers(effectiveScore(right.pack.effective_from), effectiveScore(left.pack.effective_from)) ||
    compareNumbers(sourceWeight(right.pack), sourceWeight(left.pack)) ||
    compareNumbers(semverScore(right.pack.version), semverScore(left.pack.version)) ||
    right.rule.rule_id.localeCompare(left.rule.rule_id)
  );
}

export function packTypeWeight(packType: string): number {
  return PACK_TYPE_WEIGHT[packType] ?? 10;
}

function sourceWeight(pack: FinancePack): number {
  return (pack.source_of_truth ?? []).reduce((best, source) => {
    return Math.max(best, SOURCE_WEIGHT[source.source_type] ?? 0);
  }, 0);
}

function effectiveScore(value: string): number {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function semverScore(version: string): number {
  const [major, minor, patch] = version.split(".").map((part) => Number(part) || 0);
  return major * 1_000_000 + minor * 1_000 + patch;
}

function compareNumbers(left: number, right: number): number {
  return left - right;
}

