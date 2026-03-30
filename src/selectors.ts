import type { Condition, RuleScope } from "./types.ts";

export function buildFacts(input: Record<string, unknown>): Record<string, unknown> {
  return input;
}

export function getValueByPath(source: Record<string, unknown>, field: string): unknown {
  if (field in source) {
    return source[field];
  }

  return field.split(".").reduce<unknown>((current, part) => {
    if (current && typeof current === "object" && part in (current as Record<string, unknown>)) {
      return (current as Record<string, unknown>)[part];
    }
    return undefined;
  }, source);
}

export function evaluateCondition(condition: Condition, facts: Record<string, unknown>): boolean {
  const actual = getValueByPath(facts, condition.field);
  const expected = condition.value;

  switch (condition.op) {
    case "eq":
      return isEqual(actual, expected);
    case "neq":
      return !isEqual(actual, expected);
    case "gt":
      return compareValues(actual, expected) > 0;
    case "gte":
      return compareValues(actual, expected) >= 0;
    case "lt":
      return compareValues(actual, expected) < 0;
    case "lte":
      return compareValues(actual, expected) <= 0;
    case "in":
      return normalizeArray(expected).some((item) => isEqual(actual, item));
    case "not_in":
      return normalizeArray(expected).every((item) => !isEqual(actual, item));
    case "contains":
      return containsValue(actual, expected);
    case "not_contains":
      return !containsValue(actual, expected);
    case "exists":
      return !isMissingValue(actual);
    case "missing":
      return isMissingValue(actual);
    case "regex":
      return typeof actual === "string" && typeof expected === "string"
        ? new RegExp(expected).test(actual)
        : false;
    case "between": {
      const [min, max] = normalizeArray(expected);
      return compareValues(actual, min) >= 0 && compareValues(actual, max) <= 0;
    }
    default:
      return false;
  }
}

export function evaluateScope(scope: RuleScope, facts: Record<string, unknown>): boolean {
  const allConditions = scope.all ?? [];
  const anyConditions = scope.any ?? [];
  const notConditions = scope.not ?? [];

  const allPassed = allConditions.every((condition) => evaluateCondition(condition, facts));
  const anyPassed = anyConditions.length === 0 || anyConditions.some((condition) => evaluateCondition(condition, facts));
  const notPassed = notConditions.every((condition) => !evaluateCondition(condition, facts));

  return allPassed && anyPassed && notPassed;
}

export function matchedConditions(
  conditions: Condition[] | undefined,
  facts: Record<string, unknown>,
): Condition[] {
  return (conditions ?? []).filter((condition) => evaluateCondition(condition, facts));
}

function normalizeArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function isEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function compareValues(left: unknown, right: unknown): number {
  const leftNumber = toComparableNumber(left);
  const rightNumber = toComparableNumber(right);

  if (leftNumber != null && rightNumber != null) {
    return leftNumber - rightNumber;
  }

  const leftText = String(left ?? "");
  const rightText = String(right ?? "");
  return leftText.localeCompare(rightText);
}

function toComparableNumber(value: unknown): number | null {
  if (typeof value === "number") {
    return value;
  }

  if (typeof value === "string" && value.trim().length > 0) {
    const numeric = Number(value);
    if (!Number.isNaN(numeric)) {
      return numeric;
    }

    const timestamp = Date.parse(value);
    if (!Number.isNaN(timestamp)) {
      return timestamp;
    }
  }

  return null;
}

function containsValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) {
    return actual.some((item) => isEqual(item, expected));
  }

  if (typeof actual === "string" && typeof expected === "string") {
    return actual.includes(expected);
  }

  return false;
}

function isMissingValue(value: unknown): boolean {
  return value == null || value === false || value === "";
}

