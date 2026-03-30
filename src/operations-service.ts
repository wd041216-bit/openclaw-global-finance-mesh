import { BackupReplicationStore, type BackupConfigurationStatus, type BackupJobSummary } from "./backup-store.ts";
import { AuditLedgerStore, type AuditIntegrityStatus } from "./audit-ledger.ts";
import { AuditRunStore, type AuditRunSummary } from "./audit-store.ts";
import { AccessControlStore, type AccessSessionState, type AuthenticatedActor } from "./access-control.ts";
import { LegalLibraryStore } from "./legal-library.ts";
import { RuntimeConfigStore } from "./runtime-config.ts";

export type DashboardWorkspace = "workbench" | "library" | "governance" | "system";
export type OperationsCheckStatus = "healthy" | "degraded" | "down" | "not_configured";

export interface DashboardOverview {
  generatedAt: string;
  identity: {
    authenticated: boolean;
    actor: AuthenticatedActor | null;
    authMethod?: string;
    sessionExpiresAt?: string;
    csrfProtected: boolean;
    bootstrapRequired: boolean;
    authEnabled: boolean;
    oidcConfigured: boolean;
    allowLocalTokens: boolean;
    summary: string;
  };
  runtime: {
    mode: string;
    model: string;
    hasApiKey: boolean;
    lastProbe: RunHealthSummary | null;
  };
  decisioning: {
    counts24h: {
      decision: number;
      replay: number;
    };
    lastDecision: RunSummaryCard | null;
    lastReplay: RunSummaryCard | null;
  };
  governance: {
    integrity: {
      status: AuditIntegrityStatus["status"];
      lastVerifiedAt?: string;
      mismatchCount: number;
      isStale: boolean;
      summary: string;
    };
    legalLibrary: {
      totalDocuments: number;
      draftCount: number;
      reviewedCount: number;
      approvedCount: number;
      latestUpdatedAt?: string;
    };
    sessions: {
      activeCount: number;
    };
    backups: {
      configuredTargetCount: number;
      summary: string;
      lastBackup: BackupSummaryCard | null;
    };
  };
  actions: DashboardQuickAction[];
}

export interface DashboardQuickAction {
  id: string;
  title: string;
  description: string;
  workspace: DashboardWorkspace;
  intent:
    | "run_example_decision"
    | "run_example_replay"
    | "search_legal_library"
    | "open_system_health"
    | "verify_audit_chain"
    | "configure_backups"
    | "review_draft_documents"
    | "open_login";
  tone: "primary" | "secondary" | "warning";
}

export interface OperationsHealthStatus {
  service: string;
  version: string;
  uptimeSeconds: number;
  metricsAvailable: boolean;
  environment: string;
  teamScope: string;
  checks: {
    runtime: OperationsCheck;
    ledger: OperationsCheck;
    legalLibrary: OperationsCheck;
    backupTargets: OperationsCheck;
  };
  recent: {
    probe: RunHealthSummary | null;
    backup: BackupSummaryCard | null;
  };
}

export interface OperationsCheck {
  status: OperationsCheckStatus;
  summary: string;
  checkedAt: string;
  detail?: Record<string, unknown>;
}

interface RunHealthSummary {
  id: string;
  createdAt: string;
  status: OperationsCheckStatus;
  summary: string;
  mode: string;
  model?: string;
}

interface RunSummaryCard {
  id: string;
  createdAt: string;
  label: string;
  summary: string;
  riskRating?: string;
  confidence?: number;
  changedEvents?: number;
}

interface BackupSummaryCard {
  backupId: string;
  createdAt: string;
  completedAt?: string;
  status: string;
  summary: string;
  configuredTargetCount: number;
  successfulTargetCount: number;
}

interface OperationsServiceOptions {
  version: string;
  startedAt?: number;
  accessControl: AccessControlStore;
  runtimeStore: RuntimeConfigStore;
  legalLibrary: LegalLibraryStore;
  auditLedger: AuditLedgerStore;
  auditRuns: AuditRunStore;
  backups: BackupReplicationStore;
}

export class OperationsService {
  private readonly version: string;
  private readonly startedAt: number;
  private readonly accessControl: AccessControlStore;
  private readonly runtimeStore: RuntimeConfigStore;
  private readonly legalLibrary: LegalLibraryStore;
  private readonly auditLedger: AuditLedgerStore;
  private readonly auditRuns: AuditRunStore;
  private readonly backups: BackupReplicationStore;

  constructor(options: OperationsServiceOptions) {
    this.version = options.version;
    this.startedAt = options.startedAt ?? Date.now();
    this.accessControl = options.accessControl;
    this.runtimeStore = options.runtimeStore;
    this.legalLibrary = options.legalLibrary;
    this.auditLedger = options.auditLedger;
    this.auditRuns = options.auditRuns;
    this.backups = options.backups;
  }

  async getDashboardOverview(session: AccessSessionState): Promise<DashboardOverview> {
    const generatedAt = new Date().toISOString();
    const accessConfig = await this.accessControl.getPublicConfig(session.actor);
    const runtimeConfig = await this.runtimeStore.getPublic();
    const [legalStats, integrity, latestProbe, latestDecision, latestReplay, lastBackup, activeSessions, decisionCount24h, replayCount24h] =
      await Promise.all([
        this.legalLibrary.getStats(),
        this.auditLedger.getIntegrityStatus(),
        this.getLatestRun("probe"),
        this.getLatestRun("decision"),
        this.getLatestRun("replay"),
        this.backups.getLatest(),
        this.accessControl.countActiveSessions(),
        this.auditRuns.countSince(hoursAgo(24), { types: ["decision"] }),
        this.auditRuns.countSince(hoursAgo(24), { types: ["replay"] }),
      ]);

    const overview: DashboardOverview = {
      generatedAt,
      identity: {
        authenticated: session.authenticated,
        actor: session.actor,
        authMethod: session.authMethod,
        sessionExpiresAt: session.currentSession?.expiresAt,
        csrfProtected: Boolean(session.currentSession),
        bootstrapRequired: accessConfig.bootstrapRequired,
        authEnabled: accessConfig.enabled,
        oidcConfigured: accessConfig.oidcConfigured,
        allowLocalTokens: accessConfig.allowLocalTokens,
        summary: summarizeIdentity(session, accessConfig),
      },
      runtime: {
        mode: runtimeConfig.mode,
        model: runtimeConfig.model,
        hasApiKey: runtimeConfig.hasApiKey,
        lastProbe: latestProbe ? summarizeProbe(latestProbe) : null,
      },
      decisioning: {
        counts24h: {
          decision: decisionCount24h,
          replay: replayCount24h,
        },
        lastDecision: latestDecision ? summarizeRun(latestDecision) : null,
        lastReplay: latestReplay ? summarizeRun(latestReplay) : null,
      },
      governance: {
        integrity: {
          status: integrity.status,
          lastVerifiedAt: integrity.lastVerifiedAt,
          mismatchCount: integrity.mismatchCount,
          isStale: integrity.isStale,
          summary: summarizeIntegrity(integrity),
        },
        legalLibrary: {
          totalDocuments: legalStats.totalDocuments,
          draftCount: legalStats.byStatus.draft,
          reviewedCount: legalStats.byStatus.reviewed,
          approvedCount: legalStats.byStatus.approved,
          latestUpdatedAt: legalStats.latestUpdatedAt,
        },
        sessions: {
          activeCount: activeSessions,
        },
        backups: {
          configuredTargetCount: this.backups.getConfigurationStatus().configuredTargetCount,
          summary: summarizeBackupStatus(this.backups.getConfigurationStatus(), lastBackup),
          lastBackup: lastBackup ? summarizeBackup(lastBackup) : null,
        },
      },
      actions: buildActions({
        session,
        accessConfig,
        draftCount: legalStats.byStatus.draft,
        integrity,
        backupConfigured: this.backups.getConfigurationStatus().anyConfigured,
      }),
    };

    return overview;
  }

  async getHealthStatus(): Promise<OperationsHealthStatus> {
    const checkedAt = new Date().toISOString();
    const [runtimeConfig, legalStats, integrity, latestProbe, latestBackup] = await Promise.all([
      this.runtimeStore.getPublic(),
      this.legalLibrary.getStats(),
      this.auditLedger.getIntegrityStatus(),
      this.getLatestRun("probe"),
      this.backups.getLatest(),
    ]);
    const backupConfig = this.backups.getConfigurationStatus();

    return {
      service: "zhouheng-global-finance-mesh",
      version: this.version,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      metricsAvailable: true,
      environment: integrity.environment,
      teamScope: integrity.teamScope,
      checks: {
        runtime: buildRuntimeCheck(checkedAt, runtimeConfig.model, latestProbe),
        ledger: buildLedgerCheck(checkedAt, integrity),
        legalLibrary: buildLegalLibraryCheck(checkedAt, legalStats),
        backupTargets: buildBackupCheck(checkedAt, backupConfig, latestBackup),
      },
      recent: {
        probe: latestProbe ? summarizeProbe(latestProbe) : null,
        backup: latestBackup ? summarizeBackup(latestBackup) : null,
      },
    };
  }

  private async getLatestRun(type: "decision" | "replay" | "probe"): Promise<AuditRunSummary | null> {
    const [latest] = await this.auditRuns.list(1, {
      types: [type],
    });
    return latest ?? null;
  }
}

function summarizeIdentity(
  session: AccessSessionState,
  config: Awaited<ReturnType<AccessControlStore["getPublicConfig"]>>,
): string {
  if (!config.enabled) {
    return "当前控制台处于开放模式，可直接浏览工作台。";
  }
  if (config.bootstrapRequired) {
    return "需要先创建首个管理员，之后才能启用完整治理流程。";
  }
  if (!session.authenticated) {
    if (config.oidcConfigured) {
      return "尚未登录，可使用企业身份或本地应急令牌进入控制台。";
    }
    return "尚未登录，请使用本地应急令牌进入控制台。";
  }
  return `${session.actor?.name || "当前用户"} 已通过 ${translateAuthMethod(session.authMethod)} 登录。`;
}

function summarizeIntegrity(integrity: AuditIntegrityStatus): string {
  if (integrity.status === "mismatch") {
    return `审计链存在 ${integrity.mismatchCount} 处异常，需要立即复核。`;
  }
  if (integrity.isStale) {
    return "审计链最近一次验证已过期，建议重新执行完整校验。";
  }
  if (integrity.lastVerifiedAt) {
    return "审计链已通过最近一次完整校验。";
  }
  return "审计链尚未执行过完整验证。";
}

function summarizeBackupStatus(
  config: BackupConfigurationStatus,
  latestBackup: BackupJobSummary | null,
): string {
  if (!config.anyConfigured) {
    return "尚未配置异地备份目标。";
  }
  if (!latestBackup) {
    return "已配置异地备份目标，但尚未执行首次备份。";
  }
  return summarizeBackup(latestBackup).summary;
}

function summarizeProbe(run: AuditRunSummary): RunHealthSummary {
  if (run.probeOk) {
    return {
      id: run.id,
      createdAt: run.createdAt,
      status: "healthy",
      summary: `${run.mode} 模式的 ${run.model || "runtime"} 最近一次探测正常。`,
      mode: run.mode,
      model: run.model,
    };
  }
  if (run.listModelsOk && !run.inferenceOk) {
    return {
      id: run.id,
      createdAt: run.createdAt,
      status: "degraded",
      summary: `${run.mode} 模式可以读取模型列表，但推理失败。`,
      mode: run.mode,
      model: run.model,
    };
  }
  return {
    id: run.id,
    createdAt: run.createdAt,
    status: "down",
    summary: `${run.mode} 模式最近一次探测失败。`,
    mode: run.mode,
    model: run.model,
  };
}

function summarizeRun(run: AuditRunSummary): RunSummaryCard {
  if (run.type === "decision") {
    return {
      id: run.id,
      createdAt: run.createdAt,
      label: run.label,
      summary: `最近一次决策给出了 ${translateRisk(run.riskRating)} 风险判断。`,
      riskRating: run.riskRating,
      confidence: run.confidence,
    };
  }
  return {
    id: run.id,
    createdAt: run.createdAt,
    label: run.label,
    summary: `最近一次回放发现 ${run.changedEvents ?? 0} 条结果变化。`,
    changedEvents: run.changedEvents,
  };
}

function summarizeBackup(backup: BackupJobSummary): BackupSummaryCard {
  const configuredTargetCount = backup.targets.filter((item) => item.configured).length;
  const successfulTargetCount = backup.targets.filter((item) => item.status === "success").length;
  const summary =
    backup.status === "success"
      ? "最近一次备份已成功同步到所有已配置目标。"
      : backup.status === "partial_failure"
        ? "最近一次备份只部分成功，请检查失败目标。"
        : backup.status === "not_configured"
          ? "最近一次仅生成了本地快照，尚未配置异地目标。"
          : "最近一次备份失败，请尽快检查目标状态。";

  return {
    backupId: backup.backupId,
    createdAt: backup.createdAt,
    completedAt: backup.completedAt,
    status: backup.status,
    summary,
    configuredTargetCount,
    successfulTargetCount,
  };
}

function buildActions(input: {
  session: AccessSessionState;
  accessConfig: Awaited<ReturnType<AccessControlStore["getPublicConfig"]>>;
  draftCount: number;
  integrity: AuditIntegrityStatus;
  backupConfigured: boolean;
}): DashboardQuickAction[] {
  const actions: DashboardQuickAction[] = [];

  if (!input.session.authenticated && input.accessConfig.enabled) {
    actions.push({
      id: "open-login",
      title: input.accessConfig.bootstrapRequired ? "创建首个管理员" : "登录控制台",
      description: input.accessConfig.bootstrapRequired
        ? "先创建管理员，再开启身份治理和审计流程。"
        : "进入控制台后可运行决策、查看治理状态和系统设置。",
      workspace: "system",
      intent: "open_login",
      tone: "primary",
    });
    return actions;
  }

  actions.push({
    id: "run-example-decision",
    title: "运行示例决策",
    description: "快速生成一份可审计的业务决策结果。",
    workspace: "workbench",
    intent: "run_example_decision",
    tone: "primary",
  });
  actions.push({
    id: "run-example-replay",
    title: "回放变更影响",
    description: "比较基线与候选规则的差异影响。",
    workspace: "workbench",
    intent: "run_example_replay",
    tone: "secondary",
  });
  actions.push({
    id: "search-legal-library",
    title: "查询法规依据",
    description: "从依据库检索可引用的法规和政策材料。",
    workspace: "library",
    intent: "search_legal_library",
    tone: "secondary",
  });
  actions.push({
    id: "open-system-health",
    title: "检查系统状态",
    description: "查看运行时、审计链和备份健康情况。",
    workspace: "system",
    intent: "open_system_health",
    tone: "secondary",
  });

  if (input.draftCount > 0 && hasRole(input.session.actor, "reviewer")) {
    actions.push({
      id: "review-drafts",
      title: `审核待审资料 (${input.draftCount})`,
      description: "把草稿资料推进到 reviewed 或 approved 状态。",
      workspace: "library",
      intent: "review_draft_documents",
      tone: "warning",
    });
  }

  if ((input.integrity.status === "mismatch" || input.integrity.isStale) && hasRole(input.session.actor, "reviewer")) {
    actions.push({
      id: "verify-audit-chain",
      title: "复核审计链",
      description: "执行完整校验并确认当前链路没有篡改异常。",
      workspace: "governance",
      intent: "verify_audit_chain",
      tone: "warning",
    });
  }

  if (!input.backupConfigured && hasRole(input.session.actor, "admin")) {
    actions.push({
      id: "configure-backups",
      title: "配置异地备份",
      description: "为审计账本和会话状态启用目录或 S3 兼容备份。",
      workspace: "system",
      intent: "configure_backups",
      tone: "warning",
    });
  }

  return actions.slice(0, 6);
}

function buildRuntimeCheck(
  checkedAt: string,
  model: string,
  latestProbe: AuditRunSummary | null,
): OperationsCheck {
  if (!latestProbe) {
    return {
      status: "degraded",
      summary: `尚未对 ${model} 执行运行时探测。`,
      checkedAt,
    };
  }
  const summary = summarizeProbe(latestProbe);
  return {
    status: summary.status,
    summary: summary.summary,
    checkedAt,
    detail: {
      runId: latestProbe.id,
      createdAt: latestProbe.createdAt,
      model: latestProbe.model,
      mode: latestProbe.mode,
    },
  };
}

function buildLedgerCheck(checkedAt: string, integrity: AuditIntegrityStatus): OperationsCheck {
  if (integrity.status === "mismatch") {
    return {
      status: "down",
      summary: `审计链发现 ${integrity.mismatchCount} 处异常。`,
      checkedAt,
      detail: {
        mismatchCount: integrity.mismatchCount,
        lastVerifiedAt: integrity.lastVerifiedAt,
      },
    };
  }
  if (integrity.status === "pending" || integrity.isStale) {
    return {
      status: "degraded",
      summary: integrity.lastVerifiedAt ? "审计链需要重新验证。" : "审计链尚未执行过完整验证。",
      checkedAt,
      detail: {
        lastVerifiedAt: integrity.lastVerifiedAt,
      },
    };
  }
  return {
    status: "healthy",
    summary: "审计链完整且最近一次校验通过。",
    checkedAt,
    detail: {
      lastVerifiedAt: integrity.lastVerifiedAt,
      latestSequence: integrity.latestSequence,
    },
  };
}

function buildLegalLibraryCheck(
  checkedAt: string,
  stats: Awaited<ReturnType<LegalLibraryStore["getStats"]>>,
): OperationsCheck {
  if (stats.totalDocuments === 0) {
    return {
      status: "degraded",
      summary: "依据库中还没有可用资料。",
      checkedAt,
    };
  }
  if (stats.byStatus.draft > 0) {
    return {
      status: "degraded",
      summary: `依据库中有 ${stats.byStatus.draft} 份待审核资料。`,
      checkedAt,
      detail: stats,
    };
  }
  return {
    status: "healthy",
    summary: `依据库共有 ${stats.totalDocuments} 份资料，当前无待审核草稿。`,
    checkedAt,
    detail: stats,
  };
}

function buildBackupCheck(
  checkedAt: string,
  config: BackupConfigurationStatus,
  latestBackup: BackupJobSummary | null,
): OperationsCheck {
  if (!config.anyConfigured) {
    return {
      status: "not_configured",
      summary: "尚未配置异地备份目标。",
      checkedAt,
    };
  }
  if (!latestBackup) {
    return {
      status: "degraded",
      summary: "备份目标已配置，但尚未执行首次备份。",
      checkedAt,
    };
  }

  const summary = summarizeBackup(latestBackup);
  return {
    status:
      latestBackup.status === "success"
        ? "healthy"
        : latestBackup.status === "partial_failure"
          ? "degraded"
          : latestBackup.status === "not_configured"
            ? "not_configured"
            : "down",
    summary: summary.summary,
    checkedAt,
    detail: {
      backupId: latestBackup.backupId,
      createdAt: latestBackup.createdAt,
      completedAt: latestBackup.completedAt,
      configuredTargetCount: summary.configuredTargetCount,
      successfulTargetCount: summary.successfulTargetCount,
    },
  };
}

function translateAuthMethod(value: string | undefined): string {
  if (value === "oidc") {
    return "企业身份";
  }
  if (value === "token") {
    return "本地应急令牌";
  }
  if (value === "bearer") {
    return "Bearer 令牌";
  }
  return "未知方式";
}

function translateRisk(value: string | undefined): string {
  if (!value) {
    return "未标注";
  }
  if (value === "high") {
    return "高";
  }
  if (value === "medium") {
    return "中";
  }
  if (value === "low") {
    return "低";
  }
  return value;
}

function hasRole(actor: AuthenticatedActor | null, requiredRole: "reviewer" | "admin"): boolean {
  if (!actor) {
    return false;
  }
  const rank = {
    viewer: 1,
    operator: 2,
    reviewer: 3,
    admin: 4,
  };
  return rank[actor.role] >= rank[requiredRole];
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}
