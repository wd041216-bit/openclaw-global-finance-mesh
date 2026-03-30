import type { FinancePack, FinanceRule, LoadedPack, PackValidationResult, ValidationFinding } from "./types.ts";

const PACK_TYPES = new Set([
  "country",
  "industry",
  "entity",
  "control",
  "output",
  "connector",
  "local",
  "regional",
]);

export function validateFinancePack(pack: FinancePack, sourcePath?: string): PackValidationResult {
  const errors: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];

  requireString(pack.pack_id, "pack_id", errors);
  requireString(pack.display_name, "display_name", errors);
  requireString(pack.version, "version", errors);
  requireString(pack.status, "status", errors);
  requireString(pack.owner, "owner", errors);
  requireString(pack.effective_from, "effective_from", errors);

  if (!PACK_TYPES.has(pack.pack_type)) {
    errors.push(finding("error", "invalid_pack_type", `Unsupported pack_type: ${String(pack.pack_type)}`, "pack_type"));
  }

  if (!isSemver(pack.version)) {
    errors.push(finding("error", "invalid_semver", `Pack version must be semver: ${pack.version}`, "version"));
  }

  if (!Array.isArray(pack.source_of_truth) || pack.source_of_truth.length === 0) {
    errors.push(finding("error", "missing_source", "source_of_truth must include at least one source entry.", "source_of_truth"));
  }

  if (!pack.approval || !Array.isArray(pack.approval.required_roles) || pack.approval.required_roles.length === 0) {
    errors.push(finding("error", "missing_approval_roles", "approval.required_roles is required.", "approval.required_roles"));
  }

  if (!pack.test_requirements) {
    errors.push(finding("error", "missing_test_requirements", "test_requirements is required.", "test_requirements"));
  }

  if (!Array.isArray(pack.rules) || pack.rules.length === 0) {
    errors.push(finding("error", "missing_rules", "Pack must contain at least one rule.", "rules"));
  }

  const seenRuleIds = new Set<string>();
  for (const rule of pack.rules ?? []) {
    validateRule(rule, errors, warnings);
    if (seenRuleIds.has(rule.rule_id)) {
      errors.push(finding("error", "duplicate_rule_id", `Duplicate rule_id: ${rule.rule_id}`, `rules.${rule.rule_id}`));
    }
    seenRuleIds.add(rule.rule_id);
  }

  if (sourcePath && pack.status === "active" && sourcePath.endsWith(".json")) {
    warnings.push(
      finding("warning", "active_json_pack", "Active packs are usually easier to review in YAML than JSON.", sourcePath),
    );
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

export function validatePackCollection(loadedPacks: LoadedPack[]): PackValidationResult {
  const errors: ValidationFinding[] = [];
  const warnings: ValidationFinding[] = [];

  for (const loadedPack of loadedPacks) {
    const result = validateFinancePack(loadedPack.pack, loadedPack.path);
    errors.push(...result.errors);
    warnings.push(...result.warnings);
  }

  return {
    ok: errors.length === 0,
    errors,
    warnings,
  };
}

function validateRule(
  rule: FinanceRule,
  errors: ValidationFinding[],
  warnings: ValidationFinding[],
): void {
  requireString(rule.rule_id, "rule.rule_id", errors);
  requireString(rule.title, "rule.title", errors);
  requireString(rule.intent, "rule.intent", errors);

  if (!rule.scope || typeof rule.scope !== "object") {
    errors.push(finding("error", "missing_scope", "Rule scope is required.", `rules.${rule.rule_id}.scope`));
  }

  if (!rule.actions || typeof rule.actions !== "object") {
    warnings.push(finding("warning", "missing_actions", "Rule has no actions block.", `rules.${rule.rule_id}.actions`));
  }

  if (!rule.risk_model || typeof rule.risk_model !== "object") {
    errors.push(finding("error", "missing_risk_model", "Rule risk_model is required.", `rules.${rule.rule_id}.risk_model`));
  }

  if (!rule.rollback || typeof rule.rollback !== "object") {
    errors.push(finding("error", "missing_rollback", "Rule rollback block is required.", `rules.${rule.rule_id}.rollback`));
    return;
  }

  if (rule.rollback.supported && (rule.rollback.rollback_steps?.length ?? 0) === 0) {
    errors.push(
      finding(
        "error",
        "missing_rollback_steps",
        "Rules with rollback.supported=true must define rollback_steps.",
        `rules.${rule.rule_id}.rollback.rollback_steps`,
      ),
    );
  }
}

function requireString(value: unknown, field: string, findings: ValidationFinding[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    findings.push(finding("error", "missing_string", `${field} must be a non-empty string.`, field));
  }
}

function finding(
  severity: "error" | "warning",
  code: string,
  message: string,
  path?: string,
): ValidationFinding {
  return { severity, code, message, path };
}

function isSemver(value: string): boolean {
  return /^\d+\.\d+\.\d+$/.test(value);
}

