import { BackupReplicationStore, type BackupConfigurationStatus, type BackupJobSummary } from "./backup-store.ts";
import { AuditLedgerStore, type AuditIntegrityStatus } from "./audit-ledger.ts";
import { AuditRunStore, type AuditRunSummary } from "./audit-store.ts";
import { AccessControlStore, type AccessSessionState, type AuthenticatedActor } from "./access-control.ts";
import type { BrainAuthStatus, BrainErrorKind } from "./brain.ts";
import { LegalLibraryStore } from "./legal-library.ts";
import { RestoreDrillStore, type RestoreDrillSummary } from "./restore-drill-store.ts";
import { RuntimeConfigStore } from "./runtime-config.ts";
import { buildRuntimeDiagnosis, type RuntimeDiagnosis } from "./runtime-diagnostics.ts";
import { buildRuntimeDoctorReport, type RuntimeDoctorReport } from "./runtime-doctor.ts";

export type DashboardWorkspace = "workbench" | "library" | "governance" | "system";
export type OperationsCheckStatus = "healthy" | "degraded" | "down" | "not_configured";
export type ConsoleMode = "business" | "admin";

export interface GuideStep {
  id: string;
  title: string;
  description: string;
  status: "verified" | "healthy" | "ready" | "pending" | "degraded" | "down" | "not_configured";
  href: string;
  ctaLabel: string;
  blockingReason?: string;
}

export interface OnboardingOverview {
  defaultMode: ConsoleMode;
  businessStartHref: string;
  adminStartHref: string;
  desktopFirstLaunchHref: string;
  businessSteps: GuideStep[];
  adminSteps: GuideStep[];
}

export interface DesktopEntryState {
  entry: "web" | "desktop";
  mode: ConsoleMode;
  href: string;
  summary: string;
}

export interface AdapterHostTarget {
  id: string;
  title: string;
  href: string;
  reason: string;
}

export interface ExperienceOverview {
  preferredMode: ConsoleMode;
  recommendedLanding: string;
  businessGuide: GuideStep[];
  adminGuide: GuideStep[];
  businessStatusLabel: string;
  adminStatusLabel: string;
  globalBlockers: string[];
  onboarding: OnboardingOverview;
  desktopEntry: DesktopEntryState;
  desktopBlockers: string[];
  nextRecommendedInstall: AdapterHostTarget;
}

export interface DashboardOverview {
  generatedAt: string;
  experience: ExperienceOverview;
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
    cloudApiFlavor: string;
    businessStatus: string;
    summary: string;
    diagnosis: RuntimeDiagnosis;
    doctorReport: RuntimeDoctorReport;
    verification: RuntimeDoctorReport;
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
    recovery: {
      status: RestoreDrillStatusCard["status"];
      lastDrillAt?: string;
      lastSuccessAt?: string;
      isStale: boolean;
      summary: string;
      recommendedAction: string;
      latestDrill: RestoreDrillStatusCard | null;
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
    | "run_restore_drill"
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
    recoveryDrill: OperationsCheck;
  };
  recent: {
    probe: RunHealthSummary | null;
    backup: BackupSummaryCard | null;
    restoreDrill: RestoreDrillStatusCard | null;
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
  businessStatus: string;
  summary: string;
  diagnosis: RuntimeDiagnosis;
  mode: string;
  model?: string;
  listModelsOk?: boolean;
  inferenceOk?: boolean;
  cloudApiFlavor?: string;
  errorKind?: BrainErrorKind;
  authStatus?: BrainAuthStatus;
  selectedCatalogEndpoint?: string;
  selectedInferenceEndpoint?: string;
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

interface RestoreDrillStatusCard {
  drillId: string;
  backupId?: string;
  createdAt: string;
  completedAt?: string;
  sourceType: string;
  status: "success" | "degraded" | "failure";
  summary: string;
  warningCount: number;
  failureCount: number;
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
  restores: RestoreDrillStore;
}

export interface RuntimeOverview {
  mode: string;
  model: string;
  hasApiKey: boolean;
  cloudApiFlavor: string;
  businessStatus: string;
  summary: string;
  diagnosis: RuntimeDiagnosis;
  doctorReport: RuntimeDoctorReport;
  verification: RuntimeDoctorReport;
  lastProbe: RunHealthSummary | null;
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
  private readonly restores: RestoreDrillStore;

  constructor(options: OperationsServiceOptions) {
    this.version = options.version;
    this.startedAt = options.startedAt ?? Date.now();
    this.accessControl = options.accessControl;
    this.runtimeStore = options.runtimeStore;
    this.legalLibrary = options.legalLibrary;
    this.auditLedger = options.auditLedger;
    this.auditRuns = options.auditRuns;
    this.backups = options.backups;
    this.restores = options.restores;
  }

  async getDashboardOverview(session: AccessSessionState): Promise<DashboardOverview> {
    const generatedAt = new Date().toISOString();
    const accessConfig = await this.accessControl.getPublicConfig(session.actor);
    const runtimeConfig = await this.runtimeStore.getPublic();
    const [legalStats, integrity, latestProbe, latestDecision, latestReplay, lastBackup, latestRestore, lastSuccessfulRestore, activeSessions, decisionCount24h, replayCount24h] =
      await Promise.all([
        this.legalLibrary.getStats(),
        this.auditLedger.getIntegrityStatus(),
        this.getLatestRun("probe"),
        this.getLatestRun("decision"),
        this.getLatestRun("replay"),
        this.backups.getLatest(),
        this.restores.getLatest(),
        this.restores.getLatestSuccessful(),
        this.accessControl.countActiveSessions(),
        this.auditRuns.countSince(hoursAgo(24), { types: ["decision"] }),
        this.auditRuns.countSince(hoursAgo(24), { types: ["replay"] }),
      ]);
    const recovery = summarizeRecovery(latestRestore, lastSuccessfulRestore, this.restores.getWarnHours());
    const runtimeSummary = summarizeRuntimeState(runtimeConfig, latestProbe);
    const backupConfig = this.backups.getConfigurationStatus();
    const experience = buildExperienceOverview({
      session,
      accessConfig,
      runtimeConfig,
      runtimeSummary,
      integrity,
      recovery,
      backupConfigured: backupConfig.anyConfigured,
      draftCount: legalStats.byStatus.draft,
      latestDecision,
      latestReplay,
    });

    const overview: DashboardOverview = {
      generatedAt,
      experience,
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
        cloudApiFlavor: runtimeConfig.cloudApiFlavor,
        businessStatus: runtimeSummary.businessStatus,
        summary: runtimeSummary.summary,
        diagnosis: runtimeSummary.diagnosis,
        doctorReport: runtimeSummary.doctorReport,
        verification: runtimeSummary.doctorReport,
        lastProbe: runtimeSummary.lastProbe,
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
        recovery: {
          status: recovery.status,
          lastDrillAt: recovery.lastDrillAt,
          lastSuccessAt: recovery.lastSuccessAt,
          isStale: recovery.isStale,
          summary: recovery.summary,
          recommendedAction: recovery.recommendedAction,
          latestDrill: recovery.latestDrill,
        },
        backups: {
          configuredTargetCount: backupConfig.configuredTargetCount,
          summary: summarizeBackupStatus(backupConfig, lastBackup),
          lastBackup: lastBackup ? summarizeBackup(lastBackup) : null,
        },
      },
      actions: buildActions({
        session,
        accessConfig,
        runtime: runtimeSummary,
        draftCount: legalStats.byStatus.draft,
        integrity,
        backupConfigured: this.backups.getConfigurationStatus().anyConfigured,
        recovery,
      }),
    };

    return overview;
  }

  async getHealthStatus(): Promise<OperationsHealthStatus> {
    const checkedAt = new Date().toISOString();
    const [runtimeConfig, legalStats, integrity, latestProbe, latestBackup, latestRestore, lastSuccessfulRestore] = await Promise.all([
      this.runtimeStore.getPublic(),
      this.legalLibrary.getStats(),
      this.auditLedger.getIntegrityStatus(),
      this.getLatestRun("probe"),
      this.backups.getLatest(),
      this.restores.getLatest(),
      this.restores.getLatestSuccessful(),
    ]);
    const backupConfig = this.backups.getConfigurationStatus();
    const recovery = summarizeRecovery(latestRestore, lastSuccessfulRestore, this.restores.getWarnHours());

    return {
      service: "zhouheng-global-finance-mesh",
      version: this.version,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      metricsAvailable: true,
      environment: integrity.environment,
      teamScope: integrity.teamScope,
      checks: {
        runtime: buildRuntimeCheck(checkedAt, runtimeConfig, latestProbe),
        ledger: buildLedgerCheck(checkedAt, integrity),
        legalLibrary: buildLegalLibraryCheck(checkedAt, legalStats),
        backupTargets: buildBackupCheck(checkedAt, backupConfig, latestBackup),
        recoveryDrill: buildRecoveryCheck(checkedAt, recovery),
      },
      recent: {
        probe: latestProbe ? summarizeProbe(latestProbe) : null,
        backup: latestBackup ? summarizeBackup(latestBackup) : null,
        restoreDrill: recovery.latestDrill,
      },
    };
  }

  async getRuntimeOverview(): Promise<RuntimeOverview> {
    const [runtimeConfig, latestProbe] = await Promise.all([
      this.runtimeStore.getPublic(),
      this.getLatestRun("probe"),
    ]);
    const runtimeSummary = summarizeRuntimeState(runtimeConfig, latestProbe);
    return {
      mode: runtimeConfig.mode,
      model: runtimeConfig.model,
      hasApiKey: runtimeConfig.hasApiKey,
      cloudApiFlavor: runtimeConfig.cloudApiFlavor,
      businessStatus: runtimeSummary.businessStatus,
      summary: runtimeSummary.summary,
      diagnosis: runtimeSummary.diagnosis,
      doctorReport: runtimeSummary.doctorReport,
      verification: runtimeSummary.doctorReport,
      lastProbe: runtimeSummary.lastProbe,
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

function buildExperienceOverview(input: {
  session: AccessSessionState;
  accessConfig: Awaited<ReturnType<AccessControlStore["getPublicConfig"]>>;
  runtimeConfig: Awaited<ReturnType<RuntimeConfigStore["getPublic"]>>;
  runtimeSummary: {
    businessStatus: string;
    summary: string;
    diagnosis: RuntimeDiagnosis;
    doctorReport: RuntimeDoctorReport;
    lastProbe: RunHealthSummary | null;
  };
  integrity: AuditIntegrityStatus;
  recovery: {
    status: RestoreDrillStatusCard["status"];
    lastDrillAt?: string;
    lastSuccessAt?: string;
    isStale: boolean;
    summary: string;
    recommendedAction: string;
    latestDrill: RestoreDrillStatusCard | null;
  };
  backupConfigured: boolean;
  draftCount: number;
  latestDecision: AuditRunSummary | null;
  latestReplay: AuditRunSummary | null;
}): ExperienceOverview {
  const {
    session,
    accessConfig,
    runtimeSummary,
    integrity,
    recovery,
    backupConfigured,
    draftCount,
    latestDecision,
    latestReplay,
  } = input;
  const runtimeReady = runtimeSummary.doctorReport.goLiveReady;
  const preferredMode: ConsoleMode = session.actor && ["admin", "reviewer"].includes(session.actor.role)
    ? "admin"
    : "business";
  const globalBlockers = buildGlobalBlockers({
    session,
    accessConfig,
    runtimeSummary,
    integrity,
    recovery,
    backupConfigured,
  });

  const businessGuide: GuideStep[] = [
    {
      id: "business-login",
      title: accessConfig.bootstrapRequired ? "先创建首个管理员" : "登录并确认权限",
      description: accessConfig.bootstrapRequired
        ? "先完成 bootstrap，业务用户才能进入受保护控制台。"
        : session.authenticated
          ? "当前浏览器会话已就绪，可以继续进入业务链路。"
          : accessConfig.enabled
            ? "先登录控制台，再运行真实业务决策与回放。"
            : "当前控制台处于开放模式，可直接进入业务页面。",
      status: accessConfig.bootstrapRequired ? "down" : session.authenticated || !accessConfig.enabled ? "verified" : "pending",
      href: "/system-identity.html",
      ctaLabel: accessConfig.bootstrapRequired ? "初始化管理员" : session.authenticated || !accessConfig.enabled ? "查看身份状态" : "去登录",
      blockingReason: accessConfig.bootstrapRequired
        ? "还没有首位管理员。"
        : accessConfig.enabled && !session.authenticated
          ? "未登录时无法执行受保护操作。"
          : undefined,
    },
    {
      id: "business-runtime",
      title: "验证运行时",
      description: runtimeReady
        ? "Ollama Cloud 已完成真实验证，可以直接跑业务示例。"
        : runtimeSummary.doctorReport.goLiveBlockers?.[0] || runtimeSummary.summary,
      status: runtimeReady ? "verified" : runtimeSummary.doctorReport.requiresProviderAction ? "down" : "degraded",
      href: "/system-runtime.html",
      ctaLabel: runtimeReady ? "查看运行时状态" : "去验证运行时",
      blockingReason: runtimeReady ? undefined : runtimeSummary.doctorReport.blockedReason || runtimeSummary.doctorReport.goLiveBlockers?.[0],
    },
    {
      id: "business-decision",
      title: "运行示例决策",
      description: latestDecision
        ? "最近已经有可参考的决策记录，可以继续换成真实业务事件。"
        : "先用示例事件熟悉结论、风险和建议动作的阅读方式。",
      status: latestDecision ? "verified" : runtimeReady ? "pending" : "not_configured",
      href: "/decisions.html#example",
      ctaLabel: latestDecision ? "继续运行决策" : "开始决策",
      blockingReason: runtimeReady ? undefined : "运行时还没有通过正式试点验证。",
    },
    {
      id: "business-replay",
      title: "运行示例回放",
      description: latestReplay
        ? "最近已经有回放记录，可以继续比较真实基线与候选规则。"
        : "先体验 changed events 和风险漂移摘要，再上真实规则变更。",
      status: latestReplay ? "verified" : runtimeReady ? "pending" : "not_configured",
      href: "/replays.html#example",
      ctaLabel: latestReplay ? "继续运行回放" : "开始回放",
      blockingReason: runtimeReady ? undefined : "运行时还没有通过正式试点验证。",
    },
    {
      id: "business-library",
      title: "查询法规依据",
      description: draftCount > 0
        ? `依据库当前有 ${draftCount} 条待审资料，默认阅读 reviewed / approved 内容。`
        : "从依据库搜索法规、政策和治理文档，再按需要展开高级详情。",
      status: "healthy",
      href: "/library.html",
      ctaLabel: "打开依据库",
    },
    {
      id: "business-governance",
      title: "查看治理摘要",
      description: integrity.status === "mismatch"
        ? "审计链存在异常，建议先通知管理员处理。"
        : recovery.summary,
      status: integrity.status === "mismatch" ? "degraded" : "healthy",
      href: "/governance.html",
      ctaLabel: "查看治理摘要",
      blockingReason: integrity.status === "mismatch" ? "审计链存在 mismatch。" : undefined,
    },
  ];

  const adminGuide: GuideStep[] = [
    {
      id: "admin-bootstrap",
      title: accessConfig.bootstrapRequired ? "创建首个管理员" : "登录管理员控制台",
      description: accessConfig.bootstrapRequired
        ? "先完成 bootstrap，之后浏览器会自动签发管理员 session。"
        : session.authenticated
          ? "当前管理员会话已经就绪。"
          : "先登录管理员控制台，再配置 runtime、备份和恢复。",
      status: accessConfig.bootstrapRequired ? "down" : session.authenticated ? "verified" : "pending",
      href: "/system-identity.html",
      ctaLabel: accessConfig.bootstrapRequired ? "初始化管理员" : session.authenticated ? "查看管理员状态" : "去登录",
      blockingReason: accessConfig.bootstrapRequired
        ? "还没有首位管理员。"
        : session.authenticated
          ? undefined
          : "管理员还没有登录。",
    },
    {
      id: "admin-runtime",
      title: "验证 Ollama Cloud 运行时",
      description: runtimeReady
        ? `当前已验证模型为 ${runtimeSummary.doctorReport.verifiedModel || "目标模型"}。`
        : runtimeSummary.doctorReport.goLiveBlockers?.[0] || runtimeSummary.summary,
      status: runtimeReady ? "verified" : runtimeSummary.doctorReport.requiresProviderAction ? "down" : "degraded",
      href: "/system-runtime.html",
      ctaLabel: runtimeReady ? "查看运行时" : "执行验证",
      blockingReason: runtimeReady ? undefined : runtimeSummary.doctorReport.blockedReason || runtimeSummary.doctorReport.goLiveBlockers?.[0],
    },
    {
      id: "admin-backups",
      title: "配置备份目标",
      description: backupConfigured
        ? "异地备份目标已经就绪，可以进入恢复演练。"
        : "正式试点前必须至少配置一个备份目标。",
      status: backupConfigured ? "verified" : "not_configured",
      href: "/recovery-backups.html",
      ctaLabel: backupConfigured ? "查看备份" : "配置备份",
      blockingReason: backupConfigured ? undefined : "还没有异地备份目标。",
    },
    {
      id: "admin-restore",
      title: "执行恢复演练",
      description: recovery.latestDrill
        ? recovery.summary
        : "正式试点前至少跑一次非破坏性恢复演练。",
      status: recovery.latestDrill
        ? recovery.latestDrill.status === "failure"
          ? "down"
          : recovery.latestDrill.status === "degraded"
            ? "degraded"
            : "verified"
        : "not_configured",
      href: "/recovery-restores.html",
      ctaLabel: recovery.latestDrill ? "查看恢复演练" : "执行演练",
      blockingReason: recovery.latestDrill
        ? recovery.latestDrill.status === "failure"
          ? recovery.summary
          : undefined
        : "还没有恢复演练记录。",
    },
    {
      id: "admin-integrity",
      title: "检查审计链",
      description: summarizeIntegrity(integrity),
      status: integrity.status === "mismatch" ? "down" : integrity.isStale ? "degraded" : integrity.lastVerifiedAt ? "verified" : "pending",
      href: "/governance-exports.html",
      ctaLabel: integrity.lastVerifiedAt ? "查看审计链" : "执行完整校验",
      blockingReason: integrity.status === "mismatch" ? "审计链存在 mismatch。" : undefined,
    },
    {
      id: "admin-golive",
      title: "准备对外试点",
      description: runtimeReady && backupConfigured && integrity.status !== "mismatch"
        ? "基础放行条件已经接近齐备，最后再确认恢复与审计摘要。"
        : "先处理运行时、备份、恢复和审计的阻断项，再对外开放试点。",
      status: runtimeReady && backupConfigured && integrity.status !== "mismatch" && recovery.latestDrill?.status === "success"
        ? "verified"
        : globalBlockers.length
          ? "down"
          : "pending",
      href: "/system.html",
      ctaLabel: runtimeReady && backupConfigured ? "查看放行状态" : "返回管理总览",
      blockingReason: globalBlockers[0],
    },
  ];

  const desktopBlockers = dedupeStrings(globalBlockers.slice(0, 3));
  const desktopFirstLaunchHref = "/getting-started.html?mode=admin&entry=desktop";
  const businessStartHref = "/getting-started.html?mode=business";
  const adminStartHref = "/getting-started.html?mode=admin";
  const nextRecommendedInstall = pickNextRecommendedInstall(runtimeReady);

  return {
    preferredMode,
    recommendedLanding: preferredMode === "admin" ? adminStartHref : businessStartHref,
    businessGuide,
    adminGuide,
    businessStatusLabel: buildModeStatusLabel("business", businessGuide),
    adminStatusLabel: buildModeStatusLabel("admin", adminGuide),
    globalBlockers,
    onboarding: {
      defaultMode: preferredMode,
      businessStartHref,
      adminStartHref,
      desktopFirstLaunchHref,
      businessSteps: businessGuide,
      adminSteps: adminGuide,
    },
    desktopEntry: {
      entry: "desktop",
      mode: "admin",
      href: desktopFirstLaunchHref,
      summary: desktopBlockers.length
        ? `桌面首次向导还有 ${desktopBlockers.length} 项待处理：${desktopBlockers[0]}`
        : "桌面首次向导已完成关键步骤，可直接进入业务工作台。",
    },
    desktopBlockers,
    nextRecommendedInstall,
  };
}

function pickNextRecommendedInstall(runtimeReady: boolean): AdapterHostTarget {
  if (runtimeReady) {
    return {
      id: "claude",
      title: "优先接入 Claude MCP",
      href: "/agents.html#adapter-claude",
      reason: "运行时已放行，适合先把共享 MCP 能力交给业务协作场景试用。",
    };
  }
  return {
    id: "openclaw",
    title: "先接入 OpenClaw 本地插件",
    href: "/agents.html#adapter-openclaw",
    reason: "在运行时放行前，先用本地插件和示例链路做最小闭环验证。",
  };
}

function buildGlobalBlockers(input: {
  session: AccessSessionState;
  accessConfig: Awaited<ReturnType<AccessControlStore["getPublicConfig"]>>;
  runtimeSummary: {
    doctorReport: RuntimeDoctorReport;
  };
  integrity: AuditIntegrityStatus;
  recovery: {
    latestDrill: RestoreDrillStatusCard | null;
  };
  backupConfigured: boolean;
}): string[] {
  const blockers = [];
  if (input.accessConfig.bootstrapRequired) {
    blockers.push("还没有首位管理员。");
  } else if (input.accessConfig.enabled && !input.session.authenticated) {
    blockers.push("管理员还没有登录。");
  }
  if (!input.runtimeSummary.doctorReport.goLiveReady) {
    blockers.push(input.runtimeSummary.doctorReport.goLiveBlockers?.[0] || input.runtimeSummary.doctorReport.blockedReason || "运行时还没有通过正式试点验证。");
  }
  if (!input.backupConfigured) {
    blockers.push("尚未配置异地备份目标。");
  }
  if (!input.recovery.latestDrill) {
    blockers.push("尚未执行恢复演练。");
  } else if (input.recovery.latestDrill.status === "failure") {
    blockers.push("最近一次恢复演练失败。");
  }
  if (input.integrity.status === "mismatch") {
    blockers.push("审计链存在 mismatch。");
  }
  return dedupeStrings(blockers);
}

function buildModeStatusLabel(mode: ConsoleMode, steps: GuideStep[]): string {
  const firstBlocking = steps.find((step) => step.status === "down" || step.status === "not_configured");
  if (firstBlocking) {
    return mode === "admin"
      ? `先处理：${firstBlocking.title}`
      : `先完成：${firstBlocking.title}`;
  }
  const firstWarning = steps.find((step) => step.status === "degraded" || step.status === "pending");
  if (firstWarning) {
    return mode === "admin"
      ? `下一步：${firstWarning.title}`
      : `建议先去：${firstWarning.title}`;
  }
  return mode === "admin" ? "管理链路已就绪" : "可以直接开始业务判断";
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
  const diagnosis = buildRuntimeDiagnosis(
    {
      mode: run.mode,
      model: run.model || "runtime",
      hasApiKey: run.mode === "cloud" ? run.probeAuthStatus !== "missing_api_key" : false,
      cloudApiFlavor: run.cloudApiFlavor || "auto",
    },
    {
      ok: Boolean(run.probeOk),
      mode: run.mode,
      model: run.model || "runtime",
      cloudApiFlavor: run.cloudApiFlavor || "auto",
      listModelsOk: Boolean(run.listModelsOk),
      inferenceOk: Boolean(run.inferenceOk),
      availableModels: run.availableModels || [],
      inferencePreview: run.inferencePreview,
      error: run.probeError,
      errorKind: run.probeErrorKind,
      authStatus: run.probeAuthStatus || (run.mode === "cloud" ? "unknown" : "not_required"),
      selectedCatalogEndpoint: run.selectedCatalogEndpoint,
      selectedInferenceEndpoint: run.selectedInferenceEndpoint,
      catalogChecks: run.catalogChecks || [],
      inferenceChecks: run.inferenceChecks || [],
      latencyMs: run.latencyMs,
    },
  );
  const status: OperationsCheckStatus = run.probeOk
    ? "healthy"
    : run.listModelsOk
      ? "degraded"
      : "down";
  if (run.probeOk) {
    return {
      id: run.id,
      createdAt: run.createdAt,
      status,
      businessStatus: diagnosis.businessStatus,
      summary: diagnosis.summary,
      diagnosis,
      mode: run.mode,
      model: run.model,
      listModelsOk: run.listModelsOk,
      inferenceOk: run.inferenceOk,
      cloudApiFlavor: run.cloudApiFlavor,
      errorKind: run.probeErrorKind,
      authStatus: run.probeAuthStatus,
      selectedCatalogEndpoint: run.selectedCatalogEndpoint,
      selectedInferenceEndpoint: run.selectedInferenceEndpoint,
    };
  }
  return {
    id: run.id,
    createdAt: run.createdAt,
    status,
    businessStatus: diagnosis.businessStatus,
    summary: diagnosis.summary,
    diagnosis,
    mode: run.mode,
    model: run.model,
    listModelsOk: run.listModelsOk,
    inferenceOk: run.inferenceOk,
    cloudApiFlavor: run.cloudApiFlavor,
    errorKind: run.probeErrorKind,
    authStatus: run.probeAuthStatus,
    selectedCatalogEndpoint: run.selectedCatalogEndpoint,
    selectedInferenceEndpoint: run.selectedInferenceEndpoint,
  };
}

function summarizeRuntimeState(
  runtimeConfig: Awaited<ReturnType<RuntimeConfigStore["getPublic"]>>,
  latestProbe: AuditRunSummary | null,
): {
  businessStatus: string;
  summary: string;
  diagnosis: RuntimeDiagnosis;
  doctorReport: RuntimeDoctorReport;
  lastProbe: RunHealthSummary | null;
} {
  const probeSnapshot = latestProbe
    ? {
        ok: Boolean(latestProbe.probeOk),
        mode: latestProbe.mode,
        model: latestProbe.model || runtimeConfig.model,
        cloudApiFlavor: latestProbe.cloudApiFlavor || runtimeConfig.cloudApiFlavor,
        listModelsOk: Boolean(latestProbe.listModelsOk),
        inferenceOk: Boolean(latestProbe.inferenceOk),
        availableModels: latestProbe.availableModels || [],
        inferencePreview: latestProbe.inferencePreview,
        error: latestProbe.probeError,
        errorKind: latestProbe.probeErrorKind,
        authStatus:
          latestProbe.probeAuthStatus || (runtimeConfig.mode === "cloud" ? "unknown" : "not_required"),
        selectedCatalogEndpoint: latestProbe.selectedCatalogEndpoint,
        selectedInferenceEndpoint: latestProbe.selectedInferenceEndpoint,
        catalogChecks: latestProbe.catalogChecks || [],
        inferenceChecks: latestProbe.inferenceChecks || [],
        latencyMs: latestProbe.latencyMs,
      }
    : null;
  const diagnosis = buildRuntimeDiagnosis(
    {
      mode: runtimeConfig.mode,
      model: runtimeConfig.model,
      hasApiKey: runtimeConfig.hasApiKey,
      cloudApiFlavor: runtimeConfig.cloudApiFlavor,
    },
    probeSnapshot,
  );
  const doctorReport = buildRuntimeDoctorReport(
    {
      mode: runtimeConfig.mode,
      model: runtimeConfig.model,
      hasApiKey: runtimeConfig.hasApiKey,
      localBaseUrl: runtimeConfig.localBaseUrl,
      cloudBaseUrl: runtimeConfig.cloudBaseUrl,
      cloudApiFlavor: runtimeConfig.cloudApiFlavor,
    },
    probeSnapshot,
    diagnosis,
    {
      lastVerifiedAt: latestProbe?.createdAt,
    },
  );
  if (!latestProbe) {
    return {
      businessStatus: diagnosis.businessStatus,
      summary: diagnosis.summary,
      diagnosis,
      doctorReport,
      lastProbe: null,
    };
  }

  const summary = summarizeProbe(latestProbe);
  return {
    businessStatus: summary.businessStatus,
    summary: summary.summary,
    diagnosis: summary.diagnosis,
    doctorReport,
    lastProbe: summary,
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

function summarizeRestoreDrill(restore: RestoreDrillSummary): RestoreDrillStatusCard {
  const warningCount = restore.checks.filter((item) => item.status === "warning").length;
  const failureCount = restore.checks.filter((item) => item.status === "failure").length;
  const summary =
    restore.status === "success"
      ? "最近一次恢复演练已完成，off-box 备份可以被验证性恢复。"
      : restore.status === "degraded"
        ? "最近一次恢复演练可用，但仍有恢复风险需要处理。"
        : "最近一次恢复演练失败，需要先修复恢复链路。";

  return {
    drillId: restore.drillId,
    backupId: restore.backupId,
    createdAt: restore.createdAt,
    completedAt: restore.completedAt,
    sourceType: restore.sourceType,
    status: restore.status,
    summary,
    warningCount,
    failureCount,
  };
}

function summarizeRecovery(
  latestRestore: RestoreDrillSummary | null,
  lastSuccessfulRestore: RestoreDrillSummary | null,
  warnHours: number,
): {
  status: RestoreDrillStatusCard["status"] | "pending";
  summary: string;
  recommendedAction: string;
  isStale: boolean;
  lastDrillAt?: string;
  lastSuccessAt?: string;
  latestDrill: RestoreDrillStatusCard | null;
} {
  if (!latestRestore) {
    return {
      status: "pending",
      summary: "还没有执行过恢复演练，当前只能证明能备份，不能证明能恢复。",
      recommendedAction: "建议管理员立即执行一次恢复演练，优先验证 S3 或挂载目录恢复链路。",
      isStale: true,
      latestDrill: null,
    };
  }

  const latestDrill = summarizeRestoreDrill(latestRestore);
  const lastSuccessAt = lastSuccessfulRestore?.createdAt;
  const isStale = isOlderThan(lastSuccessAt ?? latestRestore.createdAt, warnHours);

  if (latestRestore.status === "failure") {
    return {
      status: "failure",
      summary: latestDrill.summary,
      recommendedAction: "先修复失败检查项，再重新运行恢复演练。",
      isStale: true,
      lastDrillAt: latestRestore.createdAt,
      lastSuccessAt,
      latestDrill,
    };
  }

  if (latestRestore.status === "degraded" || isStale) {
    return {
      status: "degraded",
      summary: latestRestore.status === "degraded"
        ? latestDrill.summary
        : "最近一次成功恢复演练已经过期，建议重新验证恢复路径。",
      recommendedAction: latestRestore.status === "degraded"
        ? "优先把恢复源切换到 off-box 目标，并清理 warning 后重新演练。"
        : "建议重新运行恢复演练，确认最近备份仍可恢复。",
      isStale,
      lastDrillAt: latestRestore.createdAt,
      lastSuccessAt,
      latestDrill,
    };
  }

  return {
    status: "success",
    summary: latestDrill.summary,
    recommendedAction: "当前恢复链路健康，继续保持按周期演练即可。",
    isStale: false,
    lastDrillAt: latestRestore.createdAt,
    lastSuccessAt,
    latestDrill,
  };
}

function buildActions(input: {
  session: AccessSessionState;
  accessConfig: Awaited<ReturnType<AccessControlStore["getPublicConfig"]>>;
  runtime: ReturnType<typeof summarizeRuntimeState>;
  draftCount: number;
  integrity: AuditIntegrityStatus;
  backupConfigured: boolean;
  recovery: ReturnType<typeof summarizeRecovery>;
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

  if (
    !input.runtime.doctorReport.goLiveReady
  ) {
    actions.push({
      id: "open-system-health-priority",
      title: input.runtime.mode === "cloud" ? "先完成 Ollama Cloud 放行" : "先切回 Ollama Cloud 试点路径",
      description: input.runtime.doctorReport.goLiveBlockers[0] || input.runtime.doctorReport.recommendedAction,
      workspace: "system",
      intent: "open_system_health",
      tone: "warning",
    });
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

  if ((input.recovery.status === "failure" || input.recovery.status === "degraded" || input.recovery.status === "pending") && hasRole(input.session.actor, "admin")) {
    actions.push({
      id: "run-restore-drill",
      title: "执行恢复演练",
      description: input.recovery.recommendedAction,
      workspace: "governance",
      intent: "run_restore_drill",
      tone: "warning",
    });
  }

  return actions.slice(0, 6);
}

function buildRuntimeCheck(
  checkedAt: string,
  runtimeConfig: Awaited<ReturnType<RuntimeConfigStore["getPublic"]>>,
  latestProbe: AuditRunSummary | null,
): OperationsCheck {
  const summary = summarizeRuntimeState(runtimeConfig, latestProbe);
  if (!summary.lastProbe) {
    return {
      status: runtimeConfig.mode === "local" ? "degraded" : runtimeConfig.hasApiKey ? "degraded" : "down",
      summary: summary.doctorReport.goLiveBlockers[0] || summary.summary,
      checkedAt,
      detail: {
        mode: runtimeConfig.mode,
        model: runtimeConfig.model,
        cloudApiFlavor: runtimeConfig.cloudApiFlavor,
        hasApiKey: runtimeConfig.hasApiKey,
        businessStatus: summary.businessStatus,
        verificationStatus: summary.doctorReport.verificationStatus,
        verificationLabel: summary.doctorReport.verificationLabel,
        provider: summary.doctorReport.provider,
        verifiedModel: summary.doctorReport.verifiedModel,
        validatedFlavor: summary.doctorReport.validatedFlavor,
        goLiveReady: summary.doctorReport.goLiveReady,
        goLiveBlockers: summary.doctorReport.goLiveBlockers,
        requiresProviderAction: summary.doctorReport.requiresProviderAction,
        lastVerifiedAt: summary.doctorReport.lastVerifiedAt,
        nextActionTitle: summary.diagnosis.nextActionTitle,
        recommendedActions: summary.diagnosis.recommendedActions,
      },
    };
  }
  const latest = summary.lastProbe;
  const status = summary.doctorReport.goLiveReady
    ? latest.status
    : latest.status === "down"
      ? "down"
      : "degraded";
  return {
    status,
    summary: summary.doctorReport.goLiveBlockers[0] || latest.summary,
    checkedAt,
    detail: {
      runId: latest.id,
      createdAt: latest.createdAt,
      model: latest.model,
      mode: latest.mode,
      businessStatus: latest.businessStatus,
      cloudApiFlavor: latest.cloudApiFlavor,
      verificationStatus: summary.doctorReport.verificationStatus,
      verificationLabel: summary.doctorReport.verificationLabel,
      provider: summary.doctorReport.provider,
      lastVerifiedAt: summary.doctorReport.lastVerifiedAt,
      verifiedModel: summary.doctorReport.verifiedModel,
      validatedFlavor: summary.doctorReport.validatedFlavor,
      goLiveReady: summary.doctorReport.goLiveReady,
      goLiveBlockers: summary.doctorReport.goLiveBlockers,
      requiresProviderAction: summary.doctorReport.requiresProviderAction,
      selectedCatalogEndpoint: latest.selectedCatalogEndpoint,
      selectedInferenceEndpoint: latest.selectedInferenceEndpoint,
      nextActionTitle: latest.diagnosis.nextActionTitle,
      recommendedActions: latest.diagnosis.recommendedActions,
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

function buildRecoveryCheck(
  checkedAt: string,
  recovery: ReturnType<typeof summarizeRecovery>,
): OperationsCheck {
  if (recovery.status === "pending") {
    return {
      status: "degraded",
      summary: recovery.summary,
      checkedAt,
      detail: {
        recommendation: recovery.recommendedAction,
      },
    };
  }
  if (recovery.status === "failure") {
    return {
      status: "down",
      summary: recovery.summary,
      checkedAt,
      detail: {
        lastDrillAt: recovery.lastDrillAt,
        recommendation: recovery.recommendedAction,
      },
    };
  }
  if (recovery.status === "degraded") {
    return {
      status: "degraded",
      summary: recovery.summary,
      checkedAt,
      detail: {
        lastDrillAt: recovery.lastDrillAt,
        lastSuccessAt: recovery.lastSuccessAt,
        recommendation: recovery.recommendedAction,
      },
    };
  }
  return {
    status: "healthy",
    summary: recovery.summary,
    checkedAt,
    detail: {
      lastDrillAt: recovery.lastDrillAt,
      lastSuccessAt: recovery.lastSuccessAt,
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

function dedupeStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
}

function isOlderThan(value: string | undefined, warnHours: number): boolean {
  if (!value) {
    return true;
  }
  const timestamp = Date.parse(value);
  if (Number.isNaN(timestamp)) {
    return true;
  }
  return Date.now() - timestamp > warnHours * 60 * 60 * 1000;
}
