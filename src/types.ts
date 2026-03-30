export type Mode = "L0" | "L1" | "L2" | "L3";

export type RiskLevel = "low" | "medium" | "high" | "critical";

export type PackType =
  | "country"
  | "industry"
  | "entity"
  | "control"
  | "output"
  | "connector"
  | "local"
  | "regional";

export type SourceType =
  | "official_law"
  | "tax_authority"
  | "group_policy"
  | "audit_policy"
  | "contractual"
  | "operational";

export type ConditionOperator =
  | "eq"
  | "neq"
  | "gt"
  | "gte"
  | "lt"
  | "lte"
  | "in"
  | "not_in"
  | "contains"
  | "not_contains"
  | "exists"
  | "missing"
  | "regex"
  | "between";

export interface Condition {
  field: string;
  op: ConditionOperator;
  value?: unknown;
}

export interface RuleScope {
  all?: Condition[];
  any?: Condition[];
  not?: Condition[];
}

export interface RuleConditions {
  preconditions?: Condition[];
  blocking_conditions?: Condition[];
  warning_conditions?: Condition[];
}

export interface RuleActions {
  account_mapping?: Record<string, unknown>;
  tax_treatment?: Record<string, unknown>;
  evidence_requirements?: string[];
  control_hooks?: string[];
  approval_route?: Record<string, unknown>;
  execution_policy?: Record<string, unknown>;
  output_templates?: string[];
  notifications?: string[];
}

export interface RiskModel {
  risk_level: RiskLevel;
  risk_reasons?: string[];
  confidence_formula_ref?: string;
}

export interface RollbackPlan {
  supported: boolean;
  rollback_steps?: string[];
  data_compensation_actions?: string[];
}

export interface FinanceRule {
  rule_id: string;
  title: string;
  intent: string;
  scope: RuleScope;
  conditions?: RuleConditions;
  actions?: RuleActions;
  risk_model: RiskModel;
  explanation_template?: string;
  rollback: RollbackPlan;
}

export interface SourceOfTruth {
  source_id: string;
  source_type: SourceType;
  title: string;
  uri_or_registry_ref: string;
  retrieved_at: string;
}

export interface ApprovalConfig {
  required_roles: string[];
  approved_by?: string[];
  approved_at?: string | null;
  rollback_version?: string | null;
}

export interface TestRequirements {
  min_pass_rate: number;
  required_scenarios: string[];
}

export interface FinancePack {
  pack_id: string;
  pack_type: PackType;
  display_name: string;
  version: string;
  status: string;
  owner: string;
  jurisdictions?: string[];
  industries?: string[];
  effective_from: string;
  effective_to?: string | null;
  priority_weight?: number;
  source_of_truth: SourceOfTruth[];
  approval?: ApprovalConfig;
  test_requirements?: TestRequirements;
  rules: FinanceRule[];
  [key: string]: unknown;
}

export interface EventPayload extends Record<string, unknown> {
  event_id: string;
  event_type: string;
  entity_id: string;
  source_system: string;
  event_time: string;
  amount?: {
    value?: number;
    currency?: string;
  };
  evidence_refs?: string[];
}

export interface DecisionRunInput {
  mode?: Mode;
  event_payload: EventPayload;
  entity_context?: Record<string, unknown>;
  jurisdiction_context?: Record<string, unknown>;
  industry_context?: Record<string, unknown>;
  policy_context?: Record<string, unknown>;
  available_evidence?: string[];
}

export interface ValidationFinding {
  severity: "error" | "warning";
  code: string;
  message: string;
  path?: string;
}

export interface PackValidationResult {
  ok: boolean;
  errors: ValidationFinding[];
  warnings: ValidationFinding[];
}

export interface LoadedPack {
  path: string;
  pack: FinancePack;
}

export interface MatchedRule {
  pack: FinancePack;
  rule: FinanceRule;
  blockingMatches: Condition[];
  warningMatches: Condition[];
  specificity: number;
}

export interface ControlResult {
  control_id: string;
  status: "pass" | "warn" | "block";
  detail: string;
}

export interface DecisionPacket {
  decision_packet_id: string;
  generated_at: string;
  mode: Mode;
  summary: string;
  event_classification: Record<string, unknown>;
  applicable_packs: Array<{
    pack_id: string;
    type: PackType;
    version: string;
  }>;
  rule_versions: string[];
  accounting_treatment: Record<string, unknown>;
  tax_treatment: Record<string, unknown>;
  control_results: ControlResult[];
  required_evidence: string[];
  approval_route: Record<string, unknown>;
  action_plan: string[];
  risk_rating: RiskLevel;
  confidence: number;
  exceptions: string[];
  rollback_plan: {
    supported: boolean;
    steps: string[];
  };
  audit_trace_ref: {
    graph_ref: string;
    source_event_hash: string;
    control_log_refs: string[];
    approval_log_refs: string[];
  };
}

export interface EvidenceGraphSnapshot {
  graph_ref: string;
  nodes: Array<Record<string, unknown>>;
  edges: Array<Record<string, unknown>>;
}

export interface DecisionRunResult {
  decisionPacket: DecisionPacket;
  evidenceGraph: EvidenceGraphSnapshot;
  matchedRules: MatchedRule[];
  missingEvidence: string[];
  conflicts: string[];
}

export interface ReplayRunResult {
  ok: boolean;
  compared_events: number;
  changed_events: number;
  higher_risk_events: number;
  lower_confidence_events: number;
  diffs: Array<Record<string, unknown>>;
}

