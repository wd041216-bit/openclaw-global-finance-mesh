const STORAGE_KEYS = {
  workspace: "financeMesh.currentWorkspace",
  advancedMode: "financeMesh.advancedMode",
  lastAction: "financeMesh.lastAction",
};

const WORKSPACE_LABELS = {
  workbench: "工作台",
  library: "依据库",
  governance: "治理中心",
  system: "系统设置",
};

const state = {
  prefs: {
    currentWorkspace: loadStoredWorkspace(),
    advancedMode: loadStoredAdvancedMode(),
    lastAction: window.localStorage.getItem(STORAGE_KEYS.lastAction) || "",
  },
  access: null,
  overview: null,
  operationsHealth: null,
  runtimeConfig: null,
  metricsPreview: "",
  models: [],
  integrity: null,
  auditRuns: [],
  selectedAuditId: null,
  selectedAuditDetail: null,
  probeRuns: [],
  selectedProbeId: null,
  selectedProbeDetail: null,
  activityEvents: [],
  selectedActivityId: null,
  selectedActivityDetail: null,
  exportBatches: [],
  selectedExportId: null,
  selectedExportDetail: null,
  restoreDrills: [],
  selectedRestoreId: null,
  selectedRestoreDetail: null,
  backupJobs: [],
  backupConfig: null,
  selectedBackupId: null,
  selectedBackupDetail: null,
  libraryDocuments: [],
  libraryResults: [],
  selectedLibraryDocumentId: null,
  config: null,
  csrfToken: "",
  authFlash: null,
  decisionResult: null,
  replayResult: null,
  chatResult: null,
  probeResult: null,
  accessSessions: [],
};

const elements = {
  body: document.body,
  flashBanner: byId("flash-banner"),
  identityPill: byId("identity-pill"),
  refreshOverviewButton: byId("refresh-overview"),
  toggleAdvancedButton: byId("toggle-advanced"),
  workspaceTabs: Array.from(document.querySelectorAll("[data-workspace]")),
  workspacePanels: Array.from(document.querySelectorAll("[data-workspace-panel]")),
  heroIdentity: byId("hero-identity"),
  heroRuntime: byId("hero-runtime"),
  heroGovernance: byId("hero-governance"),
  heroLastAction: byId("hero-last-action"),
  quickActions: byId("quick-actions"),
  workbenchSummary: byId("workbench-summary"),
  workbenchHealth: byId("workbench-health"),
  decisionForm: byId("decision-form"),
  replayForm: byId("replay-form"),
  decisionSummary: byId("decision-summary"),
  replaySummary: byId("replay-summary"),
  financeOutput: byId("finance-output"),
  chatForm: byId("chat-form"),
  assistantSummary: byId("assistant-summary"),
  assistantCitations: byId("assistant-citations"),
  chatOutput: byId("chat-output"),
  searchForm: byId("search-form"),
  searchIncludeDrafts: byId("search-include-drafts"),
  refreshLibraryButton: byId("refresh-library"),
  librarySummary: byId("library-summary"),
  libraryResults: byId("library-results"),
  libraryDetail: byId("library-detail"),
  reviewTools: byId("review-tools"),
  reviewForm: byId("review-form"),
  createDocumentPanel: byId("create-document-panel"),
  createDocumentForm: byId("create-document-form"),
  ingestPanel: byId("ingest-panel"),
  ingestForm: byId("ingest-form"),
  refreshIntegrityButton: byId("refresh-integrity"),
  verifyIntegrityButton: byId("run-integrity-verify"),
  integritySummary: byId("integrity-summary"),
  integrityStatus: byId("integrity-status"),
  migrationStatus: byId("migration-status"),
  exportForm: byId("export-form"),
  exportList: byId("export-list"),
  exportDetail: byId("export-detail"),
  refreshRestoresButton: byId("refresh-restores"),
  runRestoreDrillButton: byId("run-restore-drill"),
  restoreList: byId("restore-list"),
  restoreDetail: byId("restore-detail"),
  restoresSummary: byId("restores-summary"),
  refreshBackupsButton: byId("refresh-backups"),
  runBackupButton: byId("run-backup"),
  backupsSummary: byId("backups-summary"),
  backupList: byId("backup-list"),
  backupDetail: byId("backup-detail"),
  refreshAuditButton: byId("refresh-audit"),
  auditList: byId("audit-list"),
  auditDetail: byId("audit-detail"),
  refreshProbesButton: byId("refresh-probes"),
  probeList: byId("probe-history-list"),
  probeDetail: byId("probe-history-detail"),
  refreshActivityButton: byId("refresh-activity"),
  activityList: byId("activity-list"),
  activityDetail: byId("activity-detail"),
  refreshAccessButton: byId("refresh-access"),
  accessSummary: byId("access-summary"),
  currentSession: byId("current-session"),
  accessStatus: byId("access-status"),
  sessionForm: byId("session-form"),
  startOidcLoginButton: byId("start-oidc-login"),
  clearSessionButton: byId("clear-session"),
  bootstrapPanel: byId("bootstrap-panel"),
  bootstrapForm: byId("bootstrap-form"),
  bootstrapHint: byId("bootstrap-hint"),
  accessConfigForm: byId("access-config-form"),
  operatorForm: byId("operator-form"),
  operatorList: byId("operator-list"),
  bindingForm: byId("binding-form"),
  bindingList: byId("binding-list"),
  accessSessionList: byId("active-session-list"),
  runtimeSummary: byId("runtime-summary"),
  runtimeConfigForm: byId("config-form"),
  probeRuntimeButton: byId("probe-runtime"),
  loadModelsButton: byId("load-models"),
  probeOutput: byId("probe-output"),
  modelsOutput: byId("models-output"),
  operationsSummary: byId("operations-summary"),
  restoreGuidance: byId("restore-guidance"),
  runRestoreDrillSystemButton: byId("run-restore-drill-system"),
  metricsOutput: byId("metrics-output"),
};

bindEvents();
boot();

async function boot() {
  consumeAuthFlash();
  applyPreferences();
  await refreshAll();
}

function bindEvents() {
  window.addEventListener("hashchange", () => {
    const workspace = readWorkspaceFromHash();
    if (workspace) {
      setWorkspace(workspace, { persist: true, replaceHash: false });
    }
  });

  elements.refreshOverviewButton.addEventListener("click", async () => {
    await Promise.allSettled([
      refreshDashboardOverview(),
      refreshOperationsHealth(),
      refreshMetricsPreview(),
      refreshBackups(),
    ]);
  });
  elements.toggleAdvancedButton.addEventListener("click", () => {
    state.prefs.advancedMode = !state.prefs.advancedMode;
    window.localStorage.setItem(STORAGE_KEYS.advancedMode, String(state.prefs.advancedMode));
    applyPreferences();
  });

  for (const button of elements.workspaceTabs) {
    button.addEventListener("click", () => {
      setWorkspace(button.getAttribute("data-workspace"));
    });
  }

  elements.quickActions.addEventListener("click", (event) => {
    const target = event.target.closest("[data-intent]");
    if (!target) {
      return;
    }
    void handleQuickAction({
      intent: target.getAttribute("data-intent"),
      workspace: target.getAttribute("data-workspace"),
    });
  });

  elements.decisionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runDecision();
  });
  elements.replayForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runReplay();
  });
  elements.chatForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await runAssistant();
  });
  elements.searchForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await searchLibrary();
  });
  elements.refreshLibraryButton.addEventListener("click", async () => {
    await refreshLibrary();
  });
  elements.reviewForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateLibraryStatus();
  });
  elements.createDocumentForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createLibraryDocument();
  });
  elements.ingestForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await ingestLibrarySource();
  });

  elements.refreshIntegrityButton.addEventListener("click", async () => {
    await Promise.allSettled([refreshAuditIntegrity(), refreshAuditExports()]);
  });
  elements.verifyIntegrityButton.addEventListener("click", async () => {
    await verifyAuditIntegrity();
  });
  elements.exportForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createAuditExport();
  });
  elements.refreshRestoresButton.addEventListener("click", async () => {
    await refreshRestores();
  });
  elements.runRestoreDrillButton.addEventListener("click", async () => {
    await runRestoreDrill();
  });

  elements.refreshBackupsButton.addEventListener("click", async () => {
    await refreshBackups();
  });
  elements.runBackupButton.addEventListener("click", async () => {
    await runBackup();
  });

  elements.refreshAuditButton.addEventListener("click", async () => {
    await refreshAuditHistory();
  });
  elements.refreshProbesButton.addEventListener("click", async () => {
    await refreshProbeHistory();
  });
  elements.refreshActivityButton.addEventListener("click", async () => {
    await refreshOperatorActivity();
  });

  elements.refreshAccessButton.addEventListener("click", async () => {
    await refreshAccessControl();
  });
  elements.sessionForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await loginWithLocalToken();
  });
  elements.startOidcLoginButton.addEventListener("click", startOidcLogin);
  elements.clearSessionButton.addEventListener("click", async () => {
    await logoutCurrentSession();
  });
  elements.bootstrapForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await bootstrapAdmin();
  });
  elements.accessConfigForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateAccessConfig();
  });
  elements.operatorForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createOperator();
  });
  elements.bindingForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await createBinding();
  });

  elements.probeRuntimeButton.addEventListener("click", async () => {
    await probeRuntime();
  });
  elements.loadModelsButton.addEventListener("click", async () => {
    await loadModels();
  });
  elements.runtimeConfigForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateRuntimeConfig();
  });

  elements.libraryResults.addEventListener("click", (event) => {
    const target = event.target.closest("[data-document-id]");
    if (!target) {
      return;
    }
    state.selectedLibraryDocumentId = target.getAttribute("data-document-id");
    renderLibraryDetail();
    renderLibraryResults();
  });

  elements.exportList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-export-id]");
    if (!target) {
      return;
    }
    void openAuditExport(target.getAttribute("data-export-id"));
  });

  elements.backupList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-backup-id]");
    if (!target) {
      return;
    }
    void openBackupJob(target.getAttribute("data-backup-id"));
  });

  elements.auditList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-run-id]");
    if (!target) {
      return;
    }
    void openAuditRun(target.getAttribute("data-run-id"));
  });

  elements.probeList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-probe-id]");
    if (!target) {
      return;
    }
    void openProbeRun(target.getAttribute("data-probe-id"));
  });

  elements.activityList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-activity-id]");
    if (!target) {
      return;
    }
    void openOperatorActivity(target.getAttribute("data-activity-id"));
  });
  elements.restoreList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-restore-id]");
    if (!target) {
      return;
    }
    void openRestoreDrill(target.getAttribute("data-restore-id"));
  });

  elements.bindingList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-binding-id]");
    if (!target) {
      return;
    }
    void deactivateBinding(target.getAttribute("data-binding-id"));
  });

  elements.accessSessionList.addEventListener("click", (event) => {
    const target = event.target.closest("[data-session-id]");
    if (!target) {
      return;
    }
    void revokeAccessSession(target.getAttribute("data-session-id"));
  });
  elements.runRestoreDrillSystemButton.addEventListener("click", async () => {
    await runRestoreDrill();
  });
}

async function refreshAll() {
  await refreshAccessControl();
  await Promise.allSettled([
    refreshDashboardOverview(),
    refreshRuntimeConfig(),
    refreshOperationsHealth(),
    refreshMetricsPreview(),
    refreshLibrary(),
    refreshAuditIntegrity(),
    refreshAuditExports(),
    refreshRestores(),
    refreshAuditHistory(),
    refreshProbeHistory(),
    refreshOperatorActivity(),
    refreshBackups(),
  ]);
  renderAll();
}

async function refreshDashboardOverview() {
  try {
    const result = await api("/api/dashboard/overview");
    state.overview = result.overview;
  } catch (error) {
    state.overview = null;
    rememberAction(`总览读取失败：${String(error.message || error)}`);
  }
  renderFrame();
  renderWorkbenchSummary();
}

async function refreshAccessControl() {
  try {
    const result = await api("/api/access-control");
    state.access = result;
    adoptSessionState(result.session);
    if (canManageIdentitySessions()) {
      await refreshAccessSessions();
    } else {
      state.accessSessions = [];
    }
  } catch (error) {
    state.access = null;
    state.accessSessions = [];
    rememberAction(`身份状态读取失败：${String(error.message || error)}`);
  }
  renderFrame();
  renderAccessControl();
}

async function refreshAccessSessions() {
  try {
    const result = await api("/api/access-control/sessions?limit=25");
    state.accessSessions = result.sessions || [];
  } catch (_error) {
    state.accessSessions = [];
  }
}

async function refreshRuntimeConfig() {
  if (!canViewSystemWorkspace()) {
    state.config = null;
    renderRuntimeConfig();
    return;
  }
  try {
    const result = await api("/api/runtime/config");
    state.config = result.config;
    fillForm(elements.runtimeConfigForm, result.config);
    elements.probeOutput.textContent = "";
  } catch (error) {
    state.config = null;
    elements.probeOutput.textContent = String(error.message || error);
  }
  renderRuntimeConfig();
}

async function refreshOperationsHealth() {
  try {
    const result = await api("/api/operations/health");
    state.operationsHealth = result.health;
  } catch (error) {
    state.operationsHealth = {
      service: "zhouheng-global-finance-mesh",
      version: "unknown",
      uptimeSeconds: 0,
      metricsAvailable: false,
      environment: "unknown",
      teamScope: "unknown",
      checks: {
        runtime: { status: "down", summary: String(error.message || error), checkedAt: new Date().toISOString() },
        ledger: { status: "down", summary: String(error.message || error), checkedAt: new Date().toISOString() },
        legalLibrary: { status: "down", summary: String(error.message || error), checkedAt: new Date().toISOString() },
        backupTargets: { status: "down", summary: String(error.message || error), checkedAt: new Date().toISOString() },
        recoveryDrill: { status: "down", summary: String(error.message || error), checkedAt: new Date().toISOString() },
      },
      recent: {
        probe: null,
        backup: null,
        restoreDrill: null,
      },
    };
  }
  renderFrame();
  renderWorkbenchHealth();
  renderOperationsSummary();
}

async function refreshMetricsPreview() {
  if (!canViewSystemWorkspace()) {
    state.metricsPreview = "系统设置对当前角色不可见。";
    renderOperationsSummary();
    return;
  }
  try {
    state.metricsPreview = await fetchText("/api/metrics");
  } catch (error) {
    state.metricsPreview = String(error.message || error);
  }
  renderOperationsSummary();
}

async function refreshLibrary() {
  if (!canViewLibrary()) {
    state.libraryDocuments = [];
    state.libraryResults = [];
    state.selectedLibraryDocumentId = null;
    renderLibrary();
    return;
  }
  try {
    const result = await api("/api/legal-library/documents");
    state.libraryDocuments = result.documents || [];
    if (!state.libraryResults.length) {
      state.libraryResults = state.libraryDocuments.map((document) => ({
        document,
        excerpt: document.summary,
        score: 0,
      }));
    }
    ensureSelectedLibraryDocument();
  } catch (error) {
    state.libraryDocuments = [];
    state.libraryResults = [];
    state.selectedLibraryDocumentId = null;
    rememberAction(`依据库读取失败：${String(error.message || error)}`);
  }
  renderLibrary();
}

async function refreshAuditIntegrity() {
  if (!canViewGovernanceWorkspace()) {
    state.integrity = null;
    renderGovernance();
    return;
  }
  try {
    const result = await api("/api/audit/integrity");
    state.integrity = result.integrity;
  } catch (error) {
    state.integrity = {
      status: "pending",
      mismatchCount: 0,
      isStale: true,
      latestSequence: 0,
      verifiedThroughSequence: 0,
      verifyWarnHours: 0,
      environment: "unknown",
      teamScope: "unknown",
      sourceOfTruth: "sqlite",
      lastExport: null,
      migration: null,
      summary: String(error.message || error),
    };
  }
  renderGovernance();
}

async function refreshAuditExports(preferredId) {
  if (!canViewGovernanceWorkspace()) {
    state.exportBatches = [];
    state.selectedExportId = null;
    state.selectedExportDetail = null;
    renderAuditExports();
    return;
  }
  try {
    const result = await api("/api/audit/exports?limit=12");
    state.exportBatches = result.exports || [];
    selectPreferred("selectedExportId", state.exportBatches, preferredId);
    if (state.selectedExportId) {
      await openAuditExport(state.selectedExportId);
    } else {
      state.selectedExportDetail = null;
    }
  } catch (error) {
    state.exportBatches = [];
    state.selectedExportId = null;
    state.selectedExportDetail = {
      error: String(error.message || error),
    };
  }
  renderAuditExports();
}

async function refreshRestores(preferredId) {
  if (!canManageRestoreDrills()) {
    state.restoreDrills = [];
    state.selectedRestoreId = null;
    state.selectedRestoreDetail = null;
    renderRestores();
    return;
  }
  try {
    const result = await api("/api/operations/restores?limit=12");
    state.restoreDrills = result.restores || [];
    selectPreferred("selectedRestoreId", state.restoreDrills, preferredId, "drillId");
    if (state.selectedRestoreId) {
      await openRestoreDrill(state.selectedRestoreId);
    } else {
      state.selectedRestoreDetail = null;
    }
  } catch (error) {
    state.restoreDrills = [];
    state.selectedRestoreId = null;
    state.selectedRestoreDetail = {
      error: String(error.message || error),
    };
  }
  renderRestores();
  renderOperationsSummary();
}

async function refreshAuditHistory(preferredId) {
  if (!canViewGovernanceWorkspace()) {
    state.auditRuns = [];
    state.selectedAuditId = null;
    state.selectedAuditDetail = null;
    renderAuditHistory();
    return;
  }
  try {
    const result = await api("/api/audit/runs?limit=12");
    state.auditRuns = result.runs || [];
    selectPreferred("selectedAuditId", state.auditRuns, preferredId);
    if (state.selectedAuditId) {
      await openAuditRun(state.selectedAuditId);
    } else {
      state.selectedAuditDetail = null;
    }
  } catch (error) {
    state.auditRuns = [];
    state.selectedAuditId = null;
    state.selectedAuditDetail = {
      error: String(error.message || error),
    };
  }
  renderAuditHistory();
}

async function refreshProbeHistory(preferredId) {
  if (!canViewGovernanceWorkspace()) {
    state.probeRuns = [];
    state.selectedProbeId = null;
    state.selectedProbeDetail = null;
    renderProbeHistory();
    return;
  }
  try {
    const result = await api("/api/runtime/probes?limit=12");
    state.probeRuns = result.runs || [];
    selectPreferred("selectedProbeId", state.probeRuns, preferredId);
    if (state.selectedProbeId) {
      await openProbeRun(state.selectedProbeId);
    } else {
      state.selectedProbeDetail = null;
    }
  } catch (error) {
    state.probeRuns = [];
    state.selectedProbeId = null;
    state.selectedProbeDetail = {
      error: String(error.message || error),
    };
  }
  renderProbeHistory();
}

async function refreshOperatorActivity(preferredId) {
  if (!canViewOperatorActivity()) {
    state.activityEvents = [];
    state.selectedActivityId = null;
    state.selectedActivityDetail = null;
    renderOperatorActivity();
    return;
  }
  try {
    const result = await api("/api/access-control/activity?limit=20");
    state.activityEvents = result.events || [];
    selectPreferred("selectedActivityId", state.activityEvents, preferredId);
    if (state.selectedActivityId) {
      await openOperatorActivity(state.selectedActivityId);
    } else {
      state.selectedActivityDetail = null;
    }
  } catch (error) {
    state.activityEvents = [];
    state.selectedActivityId = null;
    state.selectedActivityDetail = {
      error: String(error.message || error),
    };
  }
  renderOperatorActivity();
}

async function refreshBackups(preferredId) {
  if (!canViewGovernanceWorkspace()) {
    state.backupJobs = [];
    state.backupConfig = null;
    state.selectedBackupId = null;
    state.selectedBackupDetail = null;
    renderBackups();
    return;
  }
  try {
    const result = await api("/api/operations/backups?limit=12");
    state.backupConfig = result.config || null;
    state.backupJobs = result.backups || [];
    selectPreferred("selectedBackupId", state.backupJobs, preferredId, "backupId");
    if (state.selectedBackupId) {
      await openBackupJob(state.selectedBackupId);
    } else {
      state.selectedBackupDetail = null;
    }
  } catch (error) {
    state.backupJobs = [];
    state.backupConfig = null;
    state.selectedBackupId = null;
    state.selectedBackupDetail = {
      error: String(error.message || error),
    };
  }
  renderBackups();
  renderOperationsSummary();
}

async function runRestoreDrill() {
  if (!canManageRestoreDrills()) {
    renderMessageCard(elements.restoresSummary, "只有管理员可以执行恢复演练。");
    return;
  }
  renderMessageCard(elements.restoresSummary, "正在从最近可用备份源执行隔离恢复演练…");
  try {
    const result = await api("/api/operations/restores/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已执行恢复演练");
    await Promise.allSettled([
      refreshDashboardOverview(),
      refreshOperationsHealth(),
      refreshRestores(result.restore?.drillId),
      refreshOperatorActivity(),
      refreshMetricsPreview(),
    ]);
  } catch (error) {
    rememberAction(`恢复演练失败：${String(error.message || error)}`);
    renderMessageCard(elements.restoreDetail, String(error.message || error));
  }
}

async function runDecision() {
  if (!canOperateWorkbench()) {
    renderMessageCard(elements.decisionSummary, "需要 operator 以上角色才能运行决策。");
    return;
  }
  elements.financeOutput.textContent = "正在运行示例决策…";
  renderMessageCard(elements.decisionSummary, "正在生成决策结果…");
  try {
    const payload = formToObject(elements.decisionForm);
    const result = await api("/api/decision/run", {
      method: "POST",
      body: JSON.stringify({
        mode: payload.mode,
        packPaths: splitPaths(payload.packPaths),
      }),
    });
    state.decisionResult = result;
    elements.financeOutput.textContent = JSON.stringify(result, null, 2);
    rememberAction("已运行示例决策");
    await Promise.allSettled([
      refreshDashboardOverview(),
      refreshAuditHistory(result.auditRun?.id),
      refreshAuditIntegrity(),
      refreshOperatorActivity(),
      refreshOperationsHealth(),
    ]);
  } catch (error) {
    state.decisionResult = {
      error: String(error.message || error),
    };
    elements.financeOutput.textContent = String(error.message || error);
    rememberAction(`决策运行失败：${String(error.message || error)}`);
  }
  renderDecisionSummary();
}

async function runReplay() {
  if (!canOperateWorkbench()) {
    renderMessageCard(elements.replaySummary, "需要 operator 以上角色才能运行回放。");
    return;
  }
  renderMessageCard(elements.replaySummary, "正在比较基线与候选规则…");
  try {
    const payload = formToObject(elements.replayForm);
    const result = await api("/api/replay/run", {
      method: "POST",
      body: JSON.stringify({
        mode: payload.mode,
        baselinePackPaths: splitPaths(payload.baselinePackPaths),
        candidatePackPaths: splitPaths(payload.candidatePackPaths),
      }),
    });
    state.replayResult = result;
    rememberAction("已运行示例回放");
    await Promise.allSettled([
      refreshDashboardOverview(),
      refreshAuditHistory(result.auditRun?.id),
      refreshAuditIntegrity(),
      refreshOperatorActivity(),
      refreshOperationsHealth(),
    ]);
  } catch (error) {
    state.replayResult = {
      error: String(error.message || error),
    };
    rememberAction(`回放失败：${String(error.message || error)}`);
  }
  renderReplaySummary();
}

async function runAssistant() {
  if (!canOperateWorkbench()) {
    renderMessageCard(elements.assistantSummary, "需要 operator 以上角色才能运行带依据问答。");
    return;
  }
  elements.chatOutput.textContent = "正在生成说明…";
  renderMessageCard(elements.assistantSummary, "正在检索依据库并生成业务说明…");
  elements.assistantCitations.innerHTML = "";
  try {
    const payload = formToObject(elements.chatForm);
    const result = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify({
        prompt: payload.prompt,
        useLegalLibrary: Boolean(payload.useLegalLibrary),
      }),
    });
    state.chatResult = result;
    elements.chatOutput.textContent = JSON.stringify(result, null, 2);
    rememberAction("已生成带依据的业务说明");
  } catch (error) {
    state.chatResult = {
      error: String(error.message || error),
    };
    elements.chatOutput.textContent = String(error.message || error);
    rememberAction(`法规问答失败：${String(error.message || error)}`);
  }
  renderAssistantSummary();
}

async function searchLibrary() {
  if (!canViewLibrary()) {
    renderMessageCard(elements.libraryResults, "登录后才能查看依据库。");
    return;
  }
  const payload = formToObject(elements.searchForm);
  try {
    const includeDrafts =
      canReviewLibrary() && Boolean(payload.includeDrafts) && state.prefs.advancedMode;
    const result = await api(
      `/api/legal-library/search?q=${encodeURIComponent(String(payload.query || ""))}${includeDrafts ? "&includeDrafts=true" : ""}`,
    );
    state.libraryResults = result.results || [];
    ensureSelectedLibraryDocument();
    rememberAction(`已搜索依据库：${String(payload.query || "全部资料")}`);
  } catch (error) {
    state.libraryResults = [];
    state.selectedLibraryDocumentId = null;
    rememberAction(`依据库搜索失败：${String(error.message || error)}`);
  }
  renderLibrary();
}

async function updateLibraryStatus() {
  if (!canReviewLibrary()) {
    return;
  }
  const payload = formToObject(elements.reviewForm);
  try {
    await api(`/api/legal-library/documents/${encodeURIComponent(String(payload.documentId || ""))}/status`, {
      method: "POST",
      body: JSON.stringify({
        status: payload.status,
      }),
    });
    elements.reviewForm.reset();
    rememberAction(`已更新资料状态：${String(payload.documentId || "")}`);
    await Promise.allSettled([
      refreshLibrary(),
      refreshDashboardOverview(),
      refreshOperatorActivity(),
      refreshAuditIntegrity(),
    ]);
  } catch (error) {
    rememberAction(`资料状态更新失败：${String(error.message || error)}`);
    renderMessageCard(elements.libraryDetail, String(error.message || error));
  }
}

async function createLibraryDocument() {
  if (!canReviewLibrary()) {
    return;
  }
  const payload = formToObject(elements.createDocumentForm);
  try {
    await api("/api/legal-library/documents", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        jurisdiction: payload.jurisdiction,
        domain: payload.domain,
        sourceType: payload.sourceType,
        sourceRef: payload.sourceRef,
        tags: splitTags(payload.tags),
        summary: payload.summary,
        body: payload.body,
      }),
    });
    elements.createDocumentForm.reset();
    rememberAction(`已新建依据资料：${String(payload.title || "")}`);
    await Promise.allSettled([
      refreshLibrary(),
      refreshDashboardOverview(),
      refreshOperatorActivity(),
    ]);
  } catch (error) {
    rememberAction(`新建资料失败：${String(error.message || error)}`);
    renderMessageCard(elements.libraryDetail, String(error.message || error));
  }
}

async function ingestLibrarySource() {
  if (!canReviewLibrary()) {
    return;
  }
  const payload = formToObject(elements.ingestForm);
  try {
    await api("/api/legal-library/ingest", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        jurisdiction: payload.jurisdiction,
        domain: payload.domain,
        url: payload.url,
        filePath: payload.filePath,
        tags: splitTags(payload.tags),
        body: payload.body,
      }),
    });
    elements.ingestForm.reset();
    rememberAction("已从外部来源补录依据");
    await Promise.allSettled([
      refreshLibrary(),
      refreshDashboardOverview(),
      refreshOperatorActivity(),
    ]);
  } catch (error) {
    rememberAction(`资料采集失败：${String(error.message || error)}`);
    renderMessageCard(elements.libraryDetail, String(error.message || error));
  }
}

async function verifyAuditIntegrity() {
  if (!canManageAuditIntegrity()) {
    renderMessageCard(elements.integritySummary, "只有管理员可以执行完整审计链校验。");
    return;
  }
  renderMessageCard(elements.integritySummary, "正在执行完整校验…");
  try {
    const result = await api("/api/audit/integrity/verify", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.integrity = result.integrity;
    elements.integrityStatus.textContent = JSON.stringify(result, null, 2);
    rememberAction("已执行审计链完整校验");
    await Promise.allSettled([
      refreshDashboardOverview(),
      refreshAuditExports(),
      refreshOperatorActivity(),
      refreshOperationsHealth(),
    ]);
  } catch (error) {
    rememberAction(`审计链校验失败：${String(error.message || error)}`);
    elements.integrityStatus.textContent = String(error.message || error);
  }
  renderGovernance();
}

async function createAuditExport() {
  if (!canManageAuditIntegrity()) {
    renderMessageCard(elements.exportDetail, "只有管理员可以创建导出切片。");
    return;
  }
  renderMessageCard(elements.exportDetail, "正在创建导出文件…");
  try {
    const payload = formToObject(elements.exportForm);
    const result = await api("/api/audit/exports", {
      method: "POST",
      body: JSON.stringify({
        sequenceFrom: payload.sequenceFrom ? Number(payload.sequenceFrom) : undefined,
        sequenceTo: payload.sequenceTo ? Number(payload.sequenceTo) : undefined,
        createdFrom: toIsoIfPresent(payload.createdFrom),
        createdTo: toIsoIfPresent(payload.createdTo),
      }),
    });
    elements.exportForm.reset();
    state.integrity = result.integrity;
    rememberAction("已创建审计切片导出");
    await Promise.allSettled([
      refreshDashboardOverview(),
      refreshAuditExports(result.exportBatch?.id),
      refreshAuditIntegrity(),
    ]);
  } catch (error) {
    rememberAction(`导出失败：${String(error.message || error)}`);
    renderMessageCard(elements.exportDetail, String(error.message || error));
  }
}

async function runBackup() {
  if (!canManageIdentitySessions()) {
    renderMessageCard(elements.backupsSummary, "只有管理员可以手动触发备份。");
    return;
  }
  renderMessageCard(elements.backupsSummary, "正在生成快照并复制到已配置目标…");
  try {
    const result = await api("/api/operations/backups/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已手动触发异地备份");
    await Promise.allSettled([
      refreshBackups(result.backup?.backupId),
      refreshDashboardOverview(),
      refreshAuditIntegrity(),
      refreshOperationsHealth(),
    ]);
  } catch (error) {
    rememberAction(`备份失败：${String(error.message || error)}`);
    renderMessageCard(elements.backupDetail, String(error.message || error));
  }
}

async function openAuditRun(runId) {
  if (!runId) {
    return;
  }
  state.selectedAuditId = runId;
  renderAuditHistory();
  try {
    const result = await api(`/api/audit/runs/${encodeURIComponent(runId)}`);
    state.selectedAuditDetail = result.run;
  } catch (error) {
    state.selectedAuditDetail = {
      error: String(error.message || error),
    };
  }
  renderAuditHistory();
}

async function openProbeRun(runId) {
  if (!runId) {
    return;
  }
  state.selectedProbeId = runId;
  renderProbeHistory();
  try {
    const result = await api(`/api/runtime/probes/${encodeURIComponent(runId)}`);
    state.selectedProbeDetail = result.run;
  } catch (error) {
    state.selectedProbeDetail = {
      error: String(error.message || error),
    };
  }
  renderProbeHistory();
}

async function openOperatorActivity(eventId) {
  if (!eventId) {
    return;
  }
  state.selectedActivityId = eventId;
  renderOperatorActivity();
  try {
    const result = await api(`/api/access-control/activity/${encodeURIComponent(eventId)}`);
    state.selectedActivityDetail = result.event;
  } catch (error) {
    state.selectedActivityDetail = {
      error: String(error.message || error),
    };
  }
  renderOperatorActivity();
}

async function openAuditExport(exportId) {
  if (!exportId) {
    return;
  }
  state.selectedExportId = exportId;
  renderAuditExports();
  try {
    const result = await api(`/api/audit/exports/${encodeURIComponent(exportId)}`);
    state.selectedExportDetail = result.exportBatch;
  } catch (error) {
    state.selectedExportDetail = {
      error: String(error.message || error),
    };
  }
  renderAuditExports();
}

async function openBackupJob(backupId) {
  if (!backupId) {
    return;
  }
  state.selectedBackupId = backupId;
  renderBackups();
  try {
    const result = await api(`/api/operations/backups/${encodeURIComponent(backupId)}`);
    state.selectedBackupDetail = result.backup;
  } catch (error) {
    state.selectedBackupDetail = {
      error: String(error.message || error),
    };
  }
  renderBackups();
}

async function openRestoreDrill(drillId) {
  if (!drillId) {
    return;
  }
  state.selectedRestoreId = drillId;
  try {
    const result = await api(`/api/operations/restores/${encodeURIComponent(drillId)}`);
    state.selectedRestoreDetail = result.restore;
  } catch (error) {
    state.selectedRestoreDetail = {
      error: String(error.message || error),
    };
  }
  renderRestores();
}

async function loginWithLocalToken() {
  renderMessageCard(elements.accessSummary, "正在建立本地应急会话…");
  try {
    const payload = formToObject(elements.sessionForm);
    const result = await api("/api/access-control/login/token", {
      method: "POST",
      body: JSON.stringify({
        token: payload.sessionToken,
      }),
    });
    elements.sessionForm.reset();
    state.access = result;
    adoptSessionState(result.session);
    rememberAction("已通过本地应急令牌登录");
    await refreshAll();
  } catch (error) {
    rememberAction(`本地登录失败：${String(error.message || error)}`);
    renderMessageCard(elements.accessSummary, String(error.message || error));
  }
}

async function logoutCurrentSession() {
  try {
    await api("/api/access-control/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
  } catch (_error) {
    // Session may already be gone.
  }
  state.csrfToken = "";
  state.accessSessions = [];
  rememberAction("已退出当前会话");
  await refreshAll();
}

async function bootstrapAdmin() {
  try {
    const payload = formToObject(elements.bootstrapForm);
    const result = await api("/api/access-control/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        token: payload.token,
        enableAuth: Boolean(payload.enableAuth),
      }),
    });
    elements.bootstrapForm.reset();
    state.access = result;
    adoptSessionState(result.session);
    rememberAction("已创建首个管理员");
    await refreshAll();
  } catch (error) {
    rememberAction(`管理员初始化失败：${String(error.message || error)}`);
    renderMessageCard(elements.bootstrapHint, String(error.message || error));
  }
}

async function updateAccessConfig() {
  try {
    const payload = formToObject(elements.accessConfigForm);
    await api("/api/access-control/config", {
      method: "POST",
      body: JSON.stringify({
        enabled: Boolean(payload.enabled),
      }),
    });
    rememberAction("已更新访问策略");
    await refreshAll();
  } catch (error) {
    rememberAction(`访问策略更新失败：${String(error.message || error)}`);
  }
}

async function createOperator() {
  try {
    const payload = formToObject(elements.operatorForm);
    await api("/api/access-control/operators", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        role: payload.role,
        token: payload.token,
        active: Boolean(payload.active),
      }),
    });
    elements.operatorForm.reset();
    rememberAction(`已新增本地操作员：${String(payload.name || "")}`);
    await Promise.allSettled([refreshAccessControl(), refreshDashboardOverview(), refreshOperatorActivity()]);
  } catch (error) {
    rememberAction(`新增操作员失败：${String(error.message || error)}`);
  }
}

async function createBinding() {
  try {
    const payload = formToObject(elements.bindingForm);
    await api("/api/access-control/bindings", {
      method: "POST",
      body: JSON.stringify({
        label: payload.label,
        matchType: payload.matchType,
        role: payload.role,
        issuer: payload.issuer,
        subject: payload.subject,
        email: payload.email,
      }),
    });
    elements.bindingForm.reset();
    rememberAction(`已创建身份绑定：${String(payload.label || "")}`);
    await Promise.allSettled([refreshAccessControl(), refreshOperatorActivity()]);
  } catch (error) {
    rememberAction(`身份绑定创建失败：${String(error.message || error)}`);
  }
}

async function deactivateBinding(bindingId) {
  if (!bindingId) {
    return;
  }
  try {
    await api(`/api/access-control/bindings/${encodeURIComponent(bindingId)}/deactivate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已停用身份绑定");
    await Promise.allSettled([refreshAccessControl(), refreshOperatorActivity()]);
  } catch (error) {
    rememberAction(`停用身份绑定失败：${String(error.message || error)}`);
  }
}

async function revokeAccessSession(sessionId) {
  if (!sessionId) {
    return;
  }
  try {
    const result = await api(`/api/access-control/sessions/${encodeURIComponent(sessionId)}/revoke`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    if (result.currentSessionId && result.currentSessionId === sessionId) {
      state.csrfToken = "";
    }
    rememberAction("已撤销活跃会话");
    await Promise.allSettled([refreshAccessControl(), refreshDashboardOverview(), refreshOperatorActivity()]);
  } catch (error) {
    rememberAction(`撤销会话失败：${String(error.message || error)}`);
  }
}

function startOidcLogin() {
  window.location.href = "/api/access-control/login?next=%2F";
}

async function updateRuntimeConfig() {
  try {
    const payload = formToObject(elements.runtimeConfigForm);
    const result = await api("/api/runtime/config", {
      method: "POST",
      body: JSON.stringify({
        mode: payload.mode,
        model: payload.model,
        localBaseUrl: payload.localBaseUrl,
        cloudBaseUrl: payload.cloudBaseUrl,
        apiKey: payload.apiKey,
        temperature: Number(payload.temperature),
        systemPrompt: payload.systemPrompt,
        persistSecret: Boolean(payload.persistSecret),
      }),
    });
    state.config = result.config;
    fillForm(elements.runtimeConfigForm, result.config);
    rememberAction("已保存运行时配置");
    elements.probeOutput.textContent = "运行时配置已保存。";
    await Promise.allSettled([refreshDashboardOverview(), refreshOperationsHealth(), refreshRuntimeConfig(), refreshOperatorActivity()]);
  } catch (error) {
    elements.probeOutput.textContent = String(error.message || error);
    rememberAction(`运行时配置保存失败：${String(error.message || error)}`);
  }
}

async function probeRuntime() {
  elements.probeOutput.textContent = "正在探测运行时…";
  try {
    const result = await api("/api/runtime/probe", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.probeResult = result;
    elements.probeOutput.textContent = JSON.stringify(result, null, 2);
    rememberAction("已执行运行时探测");
    await Promise.allSettled([
      refreshDashboardOverview(),
      refreshOperationsHealth(),
      refreshProbeHistory(result.auditRun?.id),
      refreshOperatorActivity(),
    ]);
  } catch (error) {
    state.probeResult = {
      error: String(error.message || error),
    };
    elements.probeOutput.textContent = String(error.message || error);
    rememberAction(`运行时探测失败：${String(error.message || error)}`);
  }
  renderRuntimeConfig();
}

async function loadModels() {
  elements.modelsOutput.textContent = "正在读取模型列表…";
  try {
    const result = await api("/api/runtime/models");
    state.models = result.models || [];
    elements.modelsOutput.textContent = JSON.stringify(result.models, null, 2);
    rememberAction("已刷新模型列表");
  } catch (error) {
    state.models = [];
    elements.modelsOutput.textContent = String(error.message || error);
    rememberAction(`模型列表读取失败：${String(error.message || error)}`);
  }
  renderRuntimeConfig();
}

async function handleQuickAction(input) {
  const workspace = input.workspace || "workbench";
  if (workspace === "system" && !canViewSystemWorkspace()) {
    setWorkspace("workbench");
  } else if (workspace === "governance" && !canViewGovernanceWorkspace()) {
    setWorkspace("workbench");
  } else {
    setWorkspace(workspace);
  }

  switch (input.intent) {
    case "run_example_decision":
      await runDecision();
      break;
    case "run_example_replay":
      await runReplay();
      break;
    case "search_legal_library":
      setWorkspace("library");
      elements.searchForm.querySelector('[name="query"]').focus();
      break;
    case "open_system_health":
      if (canViewSystemWorkspace()) {
        setWorkspace("system");
      }
      break;
    case "verify_audit_chain":
      setWorkspace(canViewGovernanceWorkspace() ? "governance" : "workbench");
      break;
    case "run_restore_drill":
      setWorkspace(canViewGovernanceWorkspace() ? "governance" : "workbench");
      if (canManageRestoreDrills()) {
        await runRestoreDrill();
      }
      break;
    case "configure_backups":
      setWorkspace(canViewSystemWorkspace() ? "system" : "workbench");
      break;
    case "review_draft_documents":
      setWorkspace("library");
      break;
    case "open_login":
      setWorkspace("system");
      break;
    default:
      break;
  }
}

function renderAll() {
  renderFrame();
  renderWorkbenchSummary();
  renderDecisionSummary();
  renderReplaySummary();
  renderAssistantSummary();
  renderLibrary();
  renderGovernance();
  renderRestores();
  renderAccessControl();
  renderRuntimeConfig();
  renderOperationsSummary();
}

function renderFrame() {
  applyPreferences();
  const visibleWorkspaces = getVisibleWorkspaces();
  if (!visibleWorkspaces.includes(state.prefs.currentWorkspace)) {
    setWorkspace("workbench", { persist: true, replaceHash: true });
  }

  for (const button of elements.workspaceTabs) {
    const workspace = button.getAttribute("data-workspace");
    button.hidden = !visibleWorkspaces.includes(workspace);
    button.classList.toggle("active", workspace === state.prefs.currentWorkspace);
  }
  for (const panel of elements.workspacePanels) {
    panel.classList.toggle("active", panel.getAttribute("data-workspace-panel") === state.prefs.currentWorkspace);
  }

  elements.identityPill.innerHTML = buildIdentityPill();
  elements.flashBanner.hidden = !state.authFlash;
  elements.flashBanner.textContent = state.authFlash ? formatAuthFlash(state.authFlash) : "";

  elements.heroIdentity.innerHTML = renderHeroCard({
    kicker: "身份状态",
    title: state.overview?.identity?.authenticated
      ? `${state.overview.identity.actor?.name || "当前用户"}`
      : state.overview?.identity?.authEnabled
        ? "等待登录"
        : "开放模式",
    pill: statusPill(
      state.overview?.identity?.authenticated
        ? "good"
        : state.overview?.identity?.authEnabled
          ? "warn"
          : "info",
      state.overview?.identity?.authenticated
        ? formatRole(state.overview.identity.actor?.role)
        : state.overview?.identity?.authEnabled
          ? "未登录"
          : "开放模式",
    ),
    note: state.overview?.identity?.summary || "正在读取控制台身份状态。",
    meta: [
      state.overview?.identity?.authMethod ? `登录方式：${formatAuthMethod(state.overview.identity.authMethod)}` : null,
      state.overview?.identity?.sessionExpiresAt ? `到期：${formatDateTime(state.overview.identity.sessionExpiresAt)}` : null,
    ].filter(Boolean),
  });

  elements.heroRuntime.innerHTML = renderHeroCard({
    kicker: "运行时",
    title: state.overview?.runtime?.model || "未配置模型",
    pill: statusPill(statusToneFromRun(state.overview?.runtime?.lastProbe?.status), state.overview?.runtime?.mode || "unknown"),
    note: state.overview?.runtime?.lastProbe?.summary || "尚未获取运行时摘要。",
    meta: [
      state.overview?.runtime?.hasApiKey ? "已配置云端凭据" : "未配置云端凭据",
      state.operationsHealth ? `Uptime：${humanizeSeconds(state.operationsHealth.uptimeSeconds)}` : null,
    ].filter(Boolean),
  });

  elements.heroGovernance.innerHTML = renderHeroCard({
    kicker: "治理状态",
    title: state.overview?.governance?.integrity?.summary || "正在读取治理摘要",
    pill: statusPill(statusToneFromIntegrity(state.overview?.governance?.integrity), integrityLabel(state.overview?.governance?.integrity)),
    note: state.overview?.governance?.recovery?.summary || state.overview?.governance?.backups?.summary || "尚未读取治理状态。",
    meta: [
      state.overview?.governance?.legalLibrary ? `待审核资料：${state.overview.governance.legalLibrary.draftCount}` : null,
      state.overview?.governance?.sessions ? `活跃会话：${state.overview.governance.sessions.activeCount}` : null,
    ].filter(Boolean),
  });

  elements.heroLastAction.innerHTML = renderHeroCard({
    kicker: "最近动作",
    title: state.prefs.lastAction || "还没有执行新的操作",
    pill: statusPill("neutral", WORKSPACE_LABELS[state.prefs.currentWorkspace]),
    note: state.operationsHealth
      ? `${state.operationsHealth.environment} / ${state.operationsHealth.teamScope} · ${state.operationsHealth.version}`
      : "将控制台视图、最近动作和高级模式一并保存在本地偏好里。",
    meta: [
      state.overview?.generatedAt ? `总览生成于 ${formatDateTime(state.overview.generatedAt)}` : null,
      state.prefs.advancedMode ? "高级详情已开启" : "高级详情已隐藏",
    ].filter(Boolean),
  });

  renderQuickActions();
}

function renderQuickActions() {
  const actions = state.overview?.actions || [];
  if (!actions.length) {
    elements.quickActions.innerHTML = emptyState("当前没有推荐动作，可以直接进入工作台浏览摘要。");
    return;
  }
  elements.quickActions.innerHTML = actions
    .map(
      (action) => `
        <button
          type="button"
          class="action-card"
          data-intent="${escapeHtml(action.intent)}"
          data-workspace="${escapeHtml(action.workspace)}"
        >
          <div class="record-head">
            <strong>${escapeHtml(action.title)}</strong>
            ${statusPill(action.tone === "warning" ? "warn" : action.tone === "primary" ? "good" : "neutral", WORKSPACE_LABELS[action.workspace])}
          </div>
          <p class="summary-note">${escapeHtml(action.description)}</p>
        </button>
      `,
    )
    .join("");
}

function renderWorkbenchSummary() {
  const overview = state.overview;
  if (!overview) {
    elements.workbenchSummary.innerHTML = emptyState("正在读取工作台摘要。");
    return;
  }

  elements.workbenchSummary.innerHTML = [
    renderSummaryCard({
      kicker: "最近决策",
      title: overview.decisioning.lastDecision?.summary || "还没有运行过决策",
      pill: statusPill("good", overview.decisioning.lastDecision?.riskRating ? `${formatRisk(overview.decisioning.lastDecision.riskRating)}风险` : "等待运行"),
      note: overview.decisioning.lastDecision
        ? `最近一次结果：${overview.decisioning.lastDecision.label}`
        : "点击“运行示例决策”即可快速生成第一份可审计结果。",
      meta: [
        `24h 决策数：${overview.decisioning.counts24h.decision}`,
        overview.decisioning.lastDecision?.confidence != null
          ? `置信度：${Number(overview.decisioning.lastDecision.confidence).toFixed(2)}`
          : null,
      ].filter(Boolean),
    }),
    renderSummaryCard({
      kicker: "最近回放",
      title: overview.decisioning.lastReplay?.summary || "还没有运行过回放",
      pill: statusPill("info", overview.decisioning.lastReplay ? `${overview.decisioning.lastReplay.changedEvents || 0} 条变化` : "等待运行"),
      note: overview.decisioning.lastReplay
        ? `最近一次回放：${overview.decisioning.lastReplay.label}`
        : "回放会告诉你候选规则相对基线产生了多少变化。",
      meta: [`24h 回放数：${overview.decisioning.counts24h.replay}`],
    }),
    renderSummaryCard({
      kicker: "依据库",
      title: `${overview.governance.legalLibrary.totalDocuments} 份资料`,
      pill: statusPill(overview.governance.legalLibrary.draftCount > 0 ? "warn" : "good", `${overview.governance.legalLibrary.draftCount} 份待审`),
      note: overview.governance.integrity.summary,
      meta: [
        `Reviewed：${overview.governance.legalLibrary.reviewedCount}`,
        `Approved：${overview.governance.legalLibrary.approvedCount}`,
      ],
    }),
    renderSummaryCard({
      kicker: "恢复就绪度",
      title: overview.governance.recovery.summary,
      pill: statusPill(statusToneFromRecovery(overview.governance.recovery), recoveryLabel(overview.governance.recovery)),
      note: overview.governance.recovery.recommendedAction,
      meta: [
        overview.governance.recovery.lastSuccessAt ? `最近成功：${formatDateTime(overview.governance.recovery.lastSuccessAt)}` : null,
      ].filter(Boolean),
    }),
  ].join("");
}

function renderWorkbenchHealth() {
  const health = state.operationsHealth;
  if (!health) {
    elements.workbenchHealth.innerHTML = emptyState("系统快照正在读取。");
    return;
  }
  elements.workbenchHealth.innerHTML = [
    renderSummaryCard({
      kicker: "运行时检查",
      title: health.checks.runtime.summary,
      pill: statusPill(statusToneFromStatus(health.checks.runtime.status), translateStatus(health.checks.runtime.status)),
      note: `最新探测：${health.recent.probe ? formatDateTime(health.recent.probe.createdAt) : "暂无记录"}`,
      meta: [
        `环境：${health.environment}`,
        `团队：${health.teamScope}`,
      ],
    }),
    renderSummaryCard({
      kicker: "审计链",
      title: health.checks.ledger.summary,
      pill: statusPill(statusToneFromStatus(health.checks.ledger.status), translateStatus(health.checks.ledger.status)),
      note: state.overview?.governance?.integrity?.lastVerifiedAt
        ? `最近校验：${formatDateTime(state.overview.governance.integrity.lastVerifiedAt)}`
        : "还没有完整校验记录。",
      meta: [
        state.overview?.governance?.integrity?.mismatchCount != null
          ? `异常数：${state.overview.governance.integrity.mismatchCount}`
          : null,
      ].filter(Boolean),
    }),
    renderSummaryCard({
      kicker: "异地备份",
      title: health.checks.backupTargets.summary,
      pill: statusPill(statusToneFromStatus(health.checks.backupTargets.status), translateStatus(health.checks.backupTargets.status)),
      note: health.recent.backup
        ? `最近备份：${formatDateTime(health.recent.backup.createdAt)}`
        : "还没有备份记录。",
      meta: [
        state.overview?.governance?.backups?.configuredTargetCount != null
          ? `已配置目标：${state.overview.governance.backups.configuredTargetCount}`
          : null,
      ].filter(Boolean),
    }),
    renderSummaryCard({
      kicker: "恢复演练",
      title: health.checks.recoveryDrill.summary,
      pill: statusPill(statusToneFromStatus(health.checks.recoveryDrill.status), translateStatus(health.checks.recoveryDrill.status)),
      note: health.recent.restoreDrill
        ? `最近演练：${formatDateTime(health.recent.restoreDrill.createdAt)}`
        : "还没有恢复演练记录。",
      meta: [
        state.overview?.governance?.recovery?.lastSuccessAt
          ? `最近成功：${formatDateTime(state.overview.governance.recovery.lastSuccessAt)}`
          : null,
      ].filter(Boolean),
    }),
  ].join("");
}

function renderDecisionSummary() {
  if (!state.decisionResult) {
    renderMessageCard(elements.decisionSummary, "运行一次示例决策后，这里会告诉你风险等级、置信度和审计编号。");
    return;
  }
  if (state.decisionResult.error) {
    renderMessageCard(elements.decisionSummary, state.decisionResult.error);
    return;
  }
  const packet = state.decisionResult.decision?.decisionPacket;
  const auditRun = state.decisionResult.auditRun;
  elements.decisionSummary.innerHTML = [
    renderSummaryCard({
      kicker: "决策结论",
      title: `当前事件被判定为 ${formatRisk(packet?.risk_rating)} 风险`,
      pill: statusPill(packet?.risk_rating === "high" ? "bad" : packet?.risk_rating === "medium" ? "warn" : "good", packet?.risk_rating || "unknown"),
      note: packet?.rationale || "决策包已生成。",
      meta: [
        packet?.confidence != null ? `置信度：${Number(packet.confidence).toFixed(2)}` : null,
        auditRun ? `审计序号：#${auditRun.sequence}` : null,
      ].filter(Boolean),
    }),
    renderSummaryCard({
      kicker: "审计归档",
      title: auditRun ? auditRun.label : "审计记录未生成",
      pill: statusPill(statusToneFromStatus(auditRun?.chainStatus), auditRun?.chainStatus || "pending"),
      note: auditRun
        ? `${auditRun.environment} / ${auditRun.teamScope} · ${formatDateTime(auditRun.createdAt)}`
        : "当前结果没有持久化审计记录。",
      meta: [
        auditRun?.decisionPacketId ? `Decision packet：${auditRun.decisionPacketId}` : null,
      ].filter(Boolean),
    }),
  ].join("");
}

function renderReplaySummary() {
  if (!state.replayResult) {
    renderMessageCard(elements.replaySummary, "运行回放后，这里会用业务语言总结变更影响。");
    return;
  }
  if (state.replayResult.error) {
    renderMessageCard(elements.replaySummary, state.replayResult.error);
    return;
  }
  const replay = state.replayResult.replay;
  const auditRun = state.replayResult.auditRun;
  elements.replaySummary.innerHTML = [
    renderSummaryCard({
      kicker: "回放结论",
      title: `共发现 ${replay.changed_events} 条结果变化`,
      pill: statusPill(replay.changed_events > 0 ? "warn" : "good", `${replay.changed_events}/${replay.compared_events}`),
      note:
        replay.changed_events > 0
          ? `其中 ${replay.higher_risk_events} 条变得更高风险，${replay.lower_confidence_events} 条置信度下降。`
          : "候选规则与基线结果一致，没有发现业务输出变化。",
      meta: [
        auditRun ? `审计序号：#${auditRun.sequence}` : null,
        auditRun ? `环境：${auditRun.environment}` : null,
      ].filter(Boolean),
    }),
  ].join("");
}

function renderAssistantSummary() {
  if (!state.chatResult) {
    renderMessageCard(elements.assistantSummary, "在上方输入业务问题，这里会先给一句能直接转述给业务方的说明。");
    return;
  }
  if (state.chatResult.error) {
    renderMessageCard(elements.assistantSummary, state.chatResult.error);
    return;
  }
  elements.assistantSummary.innerHTML = [
    renderSummaryCard({
      kicker: "说明结果",
      title: state.chatResult.reply || "未生成回复",
      pill: statusPill("info", state.chatResult.model || "chat"),
      note: state.chatResult.citations?.length
        ? `本次引用了 ${state.chatResult.citations.length} 条依据库资料。`
        : "本次没有找到可引用的依据库资料，请留意资料是否缺失。",
      meta: [
        state.chatResult.provider ? `Provider：${state.chatResult.provider}` : null,
      ].filter(Boolean),
    }),
  ].join("");

  elements.assistantCitations.innerHTML = (state.chatResult.citations || [])
    .map(
      (item) => `
        <article class="citation-card">
          <div class="record-head">
            <strong>${escapeHtml(item.title)}</strong>
            ${statusPill("neutral", item.status || "citation")}
          </div>
          <p class="summary-note">${escapeHtml(item.excerpt || "暂无摘要")}</p>
          <div class="record-meta">
            <span>${escapeHtml(item.jurisdiction || "GLOBAL")}</span>
            <span>${escapeHtml(item.sourceRef || "")}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderLibrary() {
  renderLibrarySummary();
  renderLibraryResults();
  renderLibraryDetail();
  const canReview = canReviewLibrary();
  elements.reviewTools.classList.toggle("hidden", !canReview);
  elements.createDocumentPanel.classList.toggle("hidden", !canReview);
  elements.ingestPanel.classList.toggle("hidden", !canReview);
}

function renderLibrarySummary() {
  if (!canViewLibrary()) {
    elements.librarySummary.innerHTML = emptyState("登录后才能浏览依据库。");
    return;
  }
  const total = state.libraryDocuments.length;
  const draftCount = state.libraryDocuments.filter((item) => item.status === "draft").length;
  const approvedCount = state.libraryDocuments.filter((item) => item.status === "approved").length;
  const resultCount = state.libraryResults.length;
  elements.librarySummary.innerHTML = [
    renderSummaryCard({
      kicker: "资料总量",
      title: `${total} 份资料`,
      pill: statusPill(draftCount > 0 ? "warn" : "good", `${draftCount} 份待审`),
      note: resultCount > 0 ? `当前结果集共有 ${resultCount} 条可查看条目。` : "当前还没有搜索结果，可直接浏览全量资料。",
      meta: [`Approved：${approvedCount}`],
    }),
  ].join("");
}

function renderLibraryResults() {
  if (!canViewLibrary()) {
    elements.libraryResults.innerHTML = emptyState("登录后才能查看依据库搜索结果。");
    return;
  }
  if (!state.libraryResults.length) {
    elements.libraryResults.innerHTML = emptyState("没有匹配结果。可以换关键词，或点击“刷新依据库”查看全部资料。");
    return;
  }

  elements.libraryResults.innerHTML = state.libraryResults
    .map(({ document, excerpt, score }) => {
      const selected = document.id === state.selectedLibraryDocumentId;
      return `
        <button
          type="button"
          class="record-item ${selected ? "active" : ""}"
          data-document-id="${escapeHtml(document.id)}"
        >
          <div class="record-head">
            <strong>${escapeHtml(document.title)}</strong>
            ${statusPill(document.status === "approved" ? "good" : document.status === "reviewed" ? "info" : document.status === "draft" ? "warn" : "neutral", document.status)}
          </div>
          <p class="record-copy">${escapeHtml(excerpt || document.summary || "")}</p>
          <div class="record-meta">
            <span>${escapeHtml(document.jurisdiction)}</span>
            <span>${escapeHtml(document.domain)}</span>
            ${score ? `<span>score ${escapeHtml(score)}</span>` : ""}
          </div>
        </button>
      `;
    })
    .join("");
}

function renderLibraryDetail() {
  if (!canViewLibrary()) {
    renderMessageCard(elements.libraryDetail, "登录后才能查看资料详情。");
    return;
  }
  const document = getSelectedLibraryDocument();
  if (!document) {
    renderMessageCard(elements.libraryDetail, "从左侧选择一份资料，查看它是否已通过审核、可以直接引用。");
    return;
  }
  elements.libraryDetail.innerHTML = `
    <div class="record-head">
      <strong>${escapeHtml(document.title)}</strong>
      ${statusPill(document.status === "approved" ? "good" : document.status === "reviewed" ? "info" : document.status === "draft" ? "warn" : "neutral", document.status)}
    </div>
    <p class="summary-note">${escapeHtml(document.summary || "暂无摘要")}</p>
    <div class="metric-list">
      ${metricRow("Jurisdiction", document.jurisdiction)}
      ${metricRow("Domain", document.domain)}
      ${metricRow("Source", document.sourceRef || "manual")}
      ${metricRow("版本", `v${document.version}`)}
      ${metricRow("更新时间", formatDateTime(document.updatedAt))}
      ${metricRow("Document ID", document.id)}
    </div>
    <details class="technical-details advanced-only">
      <summary>查看原始正文</summary>
      <pre class="output">${escapeHtml(document.body || "")}</pre>
    </details>
  `;
}

function renderGovernance() {
  renderIntegritySummary();
  renderAuditExports();
  renderRestores();
  renderAuditHistory();
  renderProbeHistory();
  renderOperatorActivity();
  renderBackups();

  elements.verifyIntegrityButton.hidden = !canManageAuditIntegrity();
  elements.runRestoreDrillButton.hidden = !canManageRestoreDrills();
  elements.runBackupButton.hidden = !canManageIdentitySessions();
  elements.exportForm.classList.toggle("hidden", !canManageAuditIntegrity());
}

function renderIntegritySummary() {
  if (!canViewGovernanceWorkspace()) {
    renderMessageCard(elements.integritySummary, "Reviewer 或 Admin 登录后才能查看治理中心。");
    elements.integrityStatus.textContent = "";
    elements.migrationStatus.innerHTML = emptyState("治理详情对当前角色不可见。");
    return;
  }
  const integrity = state.integrity;
  if (!integrity) {
    renderMessageCard(elements.integritySummary, "正在读取审计链状态。");
    elements.integrityStatus.textContent = "";
    elements.migrationStatus.innerHTML = emptyState("正在读取 SQLite ledger 迁移信息。");
    return;
  }

  elements.integritySummary.innerHTML = [
    renderSummaryCard({
      kicker: "链路健康",
      title: integritySummaryTitle(integrity),
      pill: statusPill(statusToneFromIntegrity(integrity), integrityLabel(integrity)),
      note: integrity.lastVerifiedAt
        ? `最近完整校验：${formatDateTime(integrity.lastVerifiedAt)}`
        : "还没有执行过完整校验。",
      meta: [
        `最新序号：#${integrity.latestSequence || 0}`,
        `Mismatch：${integrity.mismatchCount || 0}`,
        `环境：${integrity.environment}/${integrity.teamScope}`,
      ],
    }),
    renderSummaryCard({
      kicker: "最近导出",
      title: integrity.lastExport ? `${integrity.lastExport.entryCount} 条记录` : "还没有导出记录",
      pill: statusPill(integrity.lastExport ? "info" : "neutral", integrity.lastExport ? "可追溯" : "未导出"),
      note: integrity.lastExport
        ? `${integrity.lastExport.dataFile}`
        : "导出切片会生成 NDJSON 数据文件和 manifest。",
      meta: integrity.lastExport
        ? [
            `范围：${integrity.lastExport.sequenceFrom || 0} - ${integrity.lastExport.sequenceTo || 0}`,
            `时间：${formatDateTime(integrity.lastExport.createdAt)}`,
          ]
        : [],
    }),
  ].join("");

  elements.integrityStatus.textContent = JSON.stringify(integrity, null, 2);
  elements.migrationStatus.innerHTML = integrity.migration
    ? renderSummaryCard({
        kicker: "迁移状态",
        title: `已从旧 JSON 导入 ${integrity.migration.importedEntries} 条历史记录`,
        pill: statusPill("good", "SQLite 接管"),
        note: "旧的 runs.json / activity.json 现在只保留为历史备份来源，不再作为主存储。",
        meta: [
          integrity.migration.legacyPaths.runs,
          integrity.migration.legacyPaths.activity,
        ],
      })
    : renderSummaryCard({
        kicker: "主存储",
        title: "SQLite ledger 已作为唯一 source of truth",
        pill: statusPill("good", "source of truth"),
        note: "当前没有需要展示的 legacy JSON 迁移元数据。",
        meta: [],
      });
}

function renderAuditExports() {
  if (!canViewGovernanceWorkspace()) {
    elements.exportList.innerHTML = emptyState("当前角色不可查看导出历史。");
    renderMessageCard(elements.exportDetail, "导出详情对当前角色不可见。");
    return;
  }
  if (!state.exportBatches.length) {
    elements.exportList.innerHTML = emptyState("还没有导出记录。");
  } else {
    elements.exportList.innerHTML = state.exportBatches
      .map(
        (item) => `
          <button
            type="button"
            class="record-item ${item.id === state.selectedExportId ? "active" : ""}"
            data-export-id="${escapeHtml(item.id)}"
          >
            <div class="record-head">
              <strong>导出 #${escapeHtml(item.sequence)}</strong>
              ${statusPill(statusToneFromStatus(item.chainStatus), item.chainStatus)}
            </div>
            <p class="record-copy">${escapeHtml(`${item.entryCount} 条记录 · ${pathLeaf(item.dataFile)}`)}</p>
            <div class="record-meta">
              <span>${escapeHtml(`${item.sequenceFrom || 0} - ${item.sequenceTo || 0}`)}</span>
              <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
            </div>
          </button>
        `,
      )
      .join("");
  }
  renderDetailCard(elements.exportDetail, state.selectedExportDetail, "导出详情", renderExportDetailCard);
}

function renderRestores() {
  if (!canManageRestoreDrills()) {
    renderMessageCard(elements.restoresSummary, "只有管理员可以查看恢复演练历史和执行入口。");
    elements.restoreList.innerHTML = emptyState("恢复演练历史仅对管理员可见。");
    renderMessageCard(elements.restoreDetail, "恢复演练详情仅对管理员可见。");
    return;
  }

  const recovery = state.overview?.governance?.recovery || null;
  const latest = state.restoreDrills[0] || null;
  const latestFailure = state.restoreDrills.find((item) => item.status === "failure") || null;

  elements.restoresSummary.innerHTML = [
    renderSummaryCard({
      kicker: "恢复就绪度",
      title: recovery?.summary || "正在读取恢复状态。",
      pill: statusPill(statusToneFromRecovery(recovery), recoveryLabel(recovery)),
      note: recovery?.recommendedAction || "建议优先验证 S3 或挂载目录的恢复路径。",
      meta: [
        recovery?.lastSuccessAt ? `最近成功：${formatDateTime(recovery.lastSuccessAt)}` : null,
        recovery?.lastDrillAt ? `最近演练：${formatDateTime(recovery.lastDrillAt)}` : null,
      ].filter(Boolean),
    }),
    latest
      ? renderSummaryCard({
          kicker: "最近演练",
          title: translateRestoreStatus(latest.status),
          pill: statusPill(statusToneFromRestore(latest.status), `#${latest.sequence}`),
          note: latest.error || latest.checks?.[0]?.summary || "恢复演练已写入审计链。",
          meta: [
            `来源：${translateRestoreSource(latest.sourceType)}`,
            latest.backupId ? `Backup：${latest.backupId.slice(0, 8)}` : null,
          ].filter(Boolean),
        })
      : emptyState("还没有恢复演练记录。"),
    latestFailure
      ? renderSummaryCard({
          kicker: "最近失败点",
          title: latestFailure.error || "恢复演练失败",
          pill: statusPill("bad", translateRestoreStatus(latestFailure.status)),
          note: `失败发生于 ${formatDateTime(latestFailure.createdAt)}，建议先查看右侧详情中的首个失败检查项。`,
          meta: [
            `来源：${translateRestoreSource(latestFailure.sourceType)}`,
          ],
        })
      : renderSummaryCard({
          kicker: "最近失败点",
          title: "当前没有新的恢复失败",
          pill: statusPill("good", "稳定"),
          note: "一旦演练失败，这里会直接显示第一条需要处理的错误。",
          meta: [],
        }),
  ].join("");

  if (!state.restoreDrills.length) {
    elements.restoreList.innerHTML = emptyState("执行一次恢复演练后，这里会保留最近历史。");
  } else {
    elements.restoreList.innerHTML = state.restoreDrills
      .map(
        (item) => `
          <button
            type="button"
            class="record-item ${item.drillId === state.selectedRestoreId ? "active" : ""}"
            data-restore-id="${escapeHtml(item.drillId)}"
          >
            <div class="record-head">
              <strong>${escapeHtml(translateRestoreStatus(item.status))}</strong>
              ${statusPill(statusToneFromRestore(item.status), translateRestoreSource(item.sourceType))}
            </div>
            <p class="record-copy">${escapeHtml(item.error || item.checks?.[0]?.summary || "恢复演练已完成")}</p>
            <div class="record-meta">
              <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
              <span>${escapeHtml(item.backupId ? item.backupId.slice(0, 8) : "adhoc")}</span>
            </div>
          </button>
        `,
      )
      .join("");
  }
  renderDetailCard(elements.restoreDetail, state.selectedRestoreDetail, "恢复演练详情", renderRestoreDetailCard);
}

function renderBackups() {
  if (!canViewGovernanceWorkspace()) {
    renderMessageCard(elements.backupsSummary, "当前角色不可查看备份状态。");
    elements.backupList.innerHTML = emptyState("备份记录对当前角色不可见。");
    renderMessageCard(elements.backupDetail, "备份详情对当前角色不可见。");
    return;
  }
  const latest = state.backupJobs[0] || null;
  elements.backupsSummary.innerHTML = [
    renderSummaryCard({
      kicker: "备份配置",
      title: state.backupConfig?.anyConfigured
        ? `已配置 ${state.backupConfig.configuredTargetCount} 个目标`
        : "尚未配置异地备份目标",
      pill: statusPill(
        state.backupConfig?.anyConfigured ? "info" : "warn",
        state.backupConfig?.anyConfigured ? "已配置" : "未配置",
      ),
      note: latest
        ? `最近一次备份：${formatDateTime(latest.createdAt)} · ${translateBackupStatus(latest.status)}`
        : "备份会包含 ledger.sqlite、auth-sessions.sqlite、访问控制状态和审计导出文件。",
      meta: [
        state.backupConfig?.localDir ? `目录目标：${state.backupConfig.localDir}` : null,
        state.backupConfig?.s3?.configured ? `S3：${state.backupConfig.s3.bucket}` : null,
      ].filter(Boolean),
    }),
    latest
      ? renderSummaryCard({
          kicker: "最近结果",
          title: latest.error || latest.summary || translateBackupStatus(latest.status),
          pill: statusPill(statusToneFromBackup(latest.status), translateBackupStatus(latest.status)),
          note: `快照路径：${latest.snapshotPath}`,
          meta: [
            `文件数：${latest.includedFiles.length}`,
            `大小：${formatBytes(latest.totalBytes)}`,
          ],
        })
      : emptyState("还没有备份记录。"),
  ].join("");

  if (!state.backupJobs.length) {
    elements.backupList.innerHTML = emptyState("执行一次备份后，这里会出现历史记录。");
  } else {
    elements.backupList.innerHTML = state.backupJobs
      .map(
        (item) => `
          <button
            type="button"
            class="record-item ${item.backupId === state.selectedBackupId ? "active" : ""}"
            data-backup-id="${escapeHtml(item.backupId)}"
          >
            <div class="record-head">
              <strong>${escapeHtml(translateBackupStatus(item.status))}</strong>
              ${statusPill(statusToneFromBackup(item.status), item.trigger)}
            </div>
            <p class="record-copy">${escapeHtml(item.error || pathLeaf(item.snapshotPath))}</p>
            <div class="record-meta">
              <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
              <span>${escapeHtml(formatBytes(item.totalBytes))}</span>
            </div>
          </button>
        `,
      )
      .join("");
  }
  renderDetailCard(elements.backupDetail, state.selectedBackupDetail, "备份详情", renderBackupDetailCard);
}

function renderAuditHistory() {
  if (!canViewGovernanceWorkspace()) {
    elements.auditList.innerHTML = emptyState("当前角色不可查看审计历史。");
    renderMessageCard(elements.auditDetail, "审计详情对当前角色不可见。");
    return;
  }
  if (!state.auditRuns.length) {
    elements.auditList.innerHTML = emptyState("运行一次决策或回放后，这里会出现审计记录。");
  } else {
    elements.auditList.innerHTML = state.auditRuns
      .map(
        (item) => `
          <button
            type="button"
            class="record-item ${item.id === state.selectedAuditId ? "active" : ""}"
            data-run-id="${escapeHtml(item.id)}"
          >
            <div class="record-head">
              <strong>${escapeHtml(item.type === "decision" ? "决策记录" : "回放记录")}</strong>
              ${statusPill(item.type === "decision" ? "good" : "info", `#${item.sequence}`)}
            </div>
            <p class="record-copy">${escapeHtml(item.label)}</p>
            <div class="record-meta">
              <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
              <span>${escapeHtml(item.actorName || "anonymous")}</span>
            </div>
          </button>
        `,
      )
      .join("");
  }
  renderDetailCard(elements.auditDetail, state.selectedAuditDetail, "审计详情", renderAuditDetailCard);
}

function renderProbeHistory() {
  if (!canViewGovernanceWorkspace()) {
    elements.probeList.innerHTML = emptyState("当前角色不可查看探测历史。");
    renderMessageCard(elements.probeDetail, "探测详情对当前角色不可见。");
    return;
  }
  if (!state.probeRuns.length) {
    elements.probeList.innerHTML = emptyState("执行一次运行时探测后，这里会保留历史。");
  } else {
    elements.probeList.innerHTML = state.probeRuns
      .map(
        (item) => `
          <button
            type="button"
            class="record-item ${item.id === state.selectedProbeId ? "active" : ""}"
            data-probe-id="${escapeHtml(item.id)}"
          >
            <div class="record-head">
              <strong>${escapeHtml(item.probeOk ? "探测正常" : "探测异常")}</strong>
              ${statusPill(item.probeOk ? "good" : "warn", item.mode)}
            </div>
            <p class="record-copy">${escapeHtml(item.label)}</p>
            <div class="record-meta">
              <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
              <span>${escapeHtml(item.model || "unknown")}</span>
            </div>
          </button>
        `,
      )
      .join("");
  }
  renderDetailCard(elements.probeDetail, state.selectedProbeDetail, "探测详情", renderProbeDetailCard);
}

function renderOperatorActivity() {
  if (!canViewOperatorActivity()) {
    elements.activityList.innerHTML = emptyState("当前角色不可查看操作时间线。");
    renderMessageCard(elements.activityDetail, "操作时间线对当前角色不可见。");
    return;
  }
  if (!state.activityEvents.length) {
    elements.activityList.innerHTML = emptyState("治理动作发生后，这里会出现操作时间线。");
  } else {
    elements.activityList.innerHTML = state.activityEvents
      .map(
        (item) => `
          <button
            type="button"
            class="record-item ${item.id === state.selectedActivityId ? "active" : ""}"
            data-activity-id="${escapeHtml(item.id)}"
          >
            <div class="record-head">
              <strong>${escapeHtml(item.message)}</strong>
              ${statusPill(item.outcome === "failure" ? "bad" : "info", item.action)}
            </div>
            <p class="record-copy">${escapeHtml(item.subject || "system")}</p>
            <div class="record-meta">
              <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
              <span>${escapeHtml(item.actorName || "anonymous")}</span>
            </div>
          </button>
        `,
      )
      .join("");
  }
  renderDetailCard(elements.activityDetail, state.selectedActivityDetail, "操作详情", renderActivityDetailCard);
}

function renderAccessControl() {
  const access = state.access;
  const config = access?.config || {
    enabled: false,
    bootstrapRequired: true,
    operators: [],
    bindings: [],
    allowLocalTokens: true,
    oidcConfigured: false,
    identityMode: "local_tokens",
  };
  fillCheckbox(elements.accessConfigForm, "enabled", Boolean(config.enabled));

  elements.bootstrapForm.hidden = !config.bootstrapRequired;
  elements.bootstrapPanel.classList.toggle("hidden", !config.bootstrapRequired && !state.prefs.advancedMode);
  elements.accessConfigForm.classList.toggle("hidden", !canManageIdentitySessions());
  elements.operatorForm.classList.toggle("hidden", !canManageIdentitySessions());
  elements.bindingForm.classList.toggle("hidden", !canManageIdentitySessions());
  elements.startOidcLoginButton.hidden = !config.oidcConfigured;
  elements.startOidcLoginButton.disabled = !config.oidcConfigured;

  elements.accessSummary.innerHTML = [
    renderSummaryCard({
      kicker: "当前会话",
      title: access?.session?.authenticated
        ? `${access.session.actor?.name || "当前用户"} · ${formatRole(access.session.actor?.role)}`
        : config.enabled
          ? "等待登录"
          : "开放模式",
      pill: statusPill(
        access?.session?.authenticated
          ? "good"
          : config.enabled
            ? "warn"
            : "info",
        access?.session?.authenticated
          ? formatAuthMethod(access.session.authMethod)
          : config.enabled
            ? "未登录"
            : "无需登录",
      ),
      note: state.overview?.identity?.summary || "当前身份摘要会显示在这里。",
      meta: [
        access?.session?.currentSession?.expiresAt
          ? `到期：${formatDateTime(access.session.currentSession.expiresAt)}`
          : null,
        access?.session?.currentSession ? "受 CSRF 保护" : "无 CSRF 会话",
      ].filter(Boolean),
    }),
    renderSummaryCard({
      kicker: "身份联邦",
      title: config.oidcConfigured
        ? `已接入 ${config.oidcDisplayName || config.issuer || "OIDC"}`
        : "尚未配置 OIDC Provider",
      pill: statusPill(config.oidcConfigured ? "good" : "neutral", config.identityMode),
      note: config.allowLocalTokens
        ? "本地 token 仍保留为 break-glass 入口。"
        : "当前仅允许企业身份登录。",
      meta: [
        `活跃会话：${state.overview?.governance?.sessions?.activeCount ?? state.accessSessions.length}`,
        `本地 operator：${config.operators?.length || 0}`,
      ],
    }),
  ].join("");

  elements.currentSession.textContent = JSON.stringify(access?.session || null, null, 2);
  elements.accessStatus.textContent = JSON.stringify(access?.config || null, null, 2);
  elements.bootstrapHint.innerHTML = config.bootstrapRequired
    ? renderSummaryCard({
        kicker: "提示",
        title: "还没有管理员",
        pill: statusPill("warn", "需要初始化"),
        note: "创建首个管理员后，才能完整启用身份治理、会话撤销和绑定管理。",
        meta: [],
      })
    : renderSummaryCard({
        kicker: "提示",
        title: "管理员初始化已完成",
        pill: statusPill("good", "ready"),
        note: "如果只是日常使用，可以直接通过企业身份或本地应急令牌登录。",
        meta: [],
      });

  renderOperatorList(config.operators || []);
  renderBindings(config.bindings || []);
  renderAccessSessions();
}

function renderOperatorList(operators) {
  if (!operators.length) {
    elements.operatorList.innerHTML = emptyState("还没有新增本地操作员。");
    return;
  }
  elements.operatorList.innerHTML = operators
    .map(
      (item) => `
        <article class="record-item">
          <div class="record-head">
            <strong>${escapeHtml(item.name)}</strong>
            ${statusPill(item.active ? "good" : "neutral", formatRole(item.role))}
          </div>
          <p class="record-copy">${escapeHtml(item.active ? "当前可用" : "当前已停用")}</p>
          <div class="record-meta">
            <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
            <span>${escapeHtml(item.credentialType)}</span>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderBindings(bindings) {
  if (!canManageIdentitySessions()) {
    elements.bindingList.innerHTML = emptyState("管理员登录后可查看和管理身份绑定。");
    return;
  }
  if (!bindings.length) {
    elements.bindingList.innerHTML = emptyState("还没有创建 OIDC 身份绑定。");
    return;
  }
  elements.bindingList.innerHTML = bindings
    .map(
      (item) => `
        <article class="record-item">
          <div class="record-head">
            <strong>${escapeHtml(item.label)}</strong>
            ${statusPill(item.active ? "good" : "neutral", formatRole(item.role))}
          </div>
          <p class="record-copy">
            ${escapeHtml(item.matchType === "subject" ? `${item.issuer || ""} · ${item.subject || ""}` : item.email || "email binding")}
          </p>
          <div class="record-meta">
            <span>${escapeHtml(formatDateTime(item.createdAt))}</span>
            <span>${escapeHtml(item.matchType)}</span>
          </div>
          ${item.active ? `<div class="actions"><button type="button" class="ghost" data-binding-id="${escapeHtml(item.id)}">停用绑定</button></div>` : ""}
        </article>
      `,
    )
    .join("");
}

function renderAccessSessions() {
  if (!canManageIdentitySessions()) {
    elements.accessSessionList.innerHTML = emptyState("管理员登录后可查看活跃会话。");
    return;
  }
  if (!state.accessSessions.length) {
    elements.accessSessionList.innerHTML = emptyState("当前没有活跃会话。");
    return;
  }
  const currentSessionId = state.access?.session?.currentSession?.sessionId || null;
  elements.accessSessionList.innerHTML = state.accessSessions
    .map(
      (item) => `
        <article class="record-item">
          <div class="record-head">
            <strong>${escapeHtml(item.actor?.name || item.actorName || "Session")}</strong>
            ${statusPill(item.sessionId === currentSessionId ? "info" : "neutral", item.authMethod)}
          </div>
          <p class="record-copy">${escapeHtml(`${item.actor?.role || item.actorRole || "unknown"} · ${item.email || item.subject || "local session"}`)}</p>
          <div class="record-meta">
            <span>${escapeHtml(`最后活跃：${formatDateTime(item.lastSeenAt)}`)}</span>
            <span>${escapeHtml(`到期：${formatDateTime(item.expiresAt)}`)}</span>
          </div>
          <div class="actions">
            <button type="button" class="ghost" data-session-id="${escapeHtml(item.sessionId)}">撤销会话</button>
          </div>
        </article>
      `,
    )
    .join("");
}

function renderRuntimeConfig() {
  if (!canViewSystemWorkspace()) {
    renderMessageCard(elements.runtimeSummary, "系统设置对当前角色不可见。");
    return;
  }
  if (!state.config) {
    renderMessageCard(elements.runtimeSummary, "还没有读取到运行时配置。");
    return;
  }
  elements.runtimeSummary.innerHTML = [
    renderSummaryCard({
      kicker: "当前配置",
      title: `${state.config.mode} / ${state.config.model}`,
      pill: statusPill(state.config.hasApiKey ? "good" : "neutral", state.config.hasApiKey ? "API key 已配置" : "无 API key"),
      note: state.operationsHealth?.checks.runtime.summary || "运行时健康状态会显示在这里。",
      meta: [
        state.config.localBaseUrl,
        state.config.cloudBaseUrl,
      ],
    }),
    renderSummaryCard({
      kicker: "最近探测",
      title: state.operationsHealth?.recent?.probe?.summary || "暂无运行时探测记录",
      pill: statusPill(statusToneFromRun(state.operationsHealth?.recent?.probe?.status), translateStatus(state.operationsHealth?.recent?.probe?.status || "not_configured")),
      note: state.probeResult?.probe ? "最新探测结果已刷新到治理中心。" : "点击上方按钮可以立即执行一次健康探测。",
      meta: [
        state.models.length ? `模型列表：${state.models.length} 个` : null,
      ].filter(Boolean),
    }),
  ].join("");
}

function renderOperationsSummary() {
  if (!canViewSystemWorkspace()) {
    renderMessageCard(elements.operationsSummary, "系统设置对当前角色不可见。");
    elements.restoreGuidance.innerHTML = emptyState("恢复说明对当前角色不可见。");
    elements.metricsOutput.textContent = state.metricsPreview || "";
    return;
  }
  const health = state.operationsHealth;
  if (!health) {
    renderMessageCard(elements.operationsSummary, "正在读取部署与观测基线。");
    elements.restoreGuidance.innerHTML = emptyState("恢复说明正在读取。");
    return;
  }
  elements.operationsSummary.innerHTML = [
    renderSummaryCard({
      kicker: "部署健康",
      title: `${health.service} · ${health.version}`,
      pill: statusPill("info", `${health.environment}/${health.teamScope}`),
      note: `已运行 ${humanizeSeconds(health.uptimeSeconds)}，metrics ${health.metricsAvailable ? "可用" : "不可用"}。`,
      meta: [
        `Runtime：${translateStatus(health.checks.runtime.status)}`,
        `Ledger：${translateStatus(health.checks.ledger.status)}`,
        `Backup：${translateStatus(health.checks.backupTargets.status)}`,
      ],
    }),
    renderSummaryCard({
      kicker: "最近备份",
      title: health.recent.backup ? translateBackupStatus(health.recent.backup.status) : "暂无备份记录",
      pill: statusPill(statusToneFromBackup(health.recent.backup?.status), health.recent.backup ? `#${health.recent.backup.backupId.slice(0, 8)}` : "未执行"),
      note: state.backupConfig?.anyConfigured
        ? `已配置 ${state.backupConfig.configuredTargetCount} 个目标。`
        : "当前未配置本地目录或 S3 兼容目标。",
      meta: [
        state.backupConfig?.localDir ? `Local dir：${state.backupConfig.localDir}` : null,
        state.backupConfig?.s3?.bucket ? `S3：${state.backupConfig.s3.bucket}` : null,
      ].filter(Boolean),
    }),
    renderSummaryCard({
      kicker: "恢复演练",
      title: health.checks.recoveryDrill.summary,
      pill: statusPill(statusToneFromStatus(health.checks.recoveryDrill.status), translateStatus(health.checks.recoveryDrill.status)),
      note: state.overview?.governance?.recovery?.recommendedAction || "建议保持定期恢复演练。",
      meta: [
        health.recent.restoreDrill ? `最近演练：${formatDateTime(health.recent.restoreDrill.createdAt)}` : null,
        state.overview?.governance?.recovery?.lastSuccessAt ? `最近成功：${formatDateTime(state.overview.governance.recovery.lastSuccessAt)}` : null,
      ].filter(Boolean),
    }),
  ].join("");
  elements.restoreGuidance.innerHTML = [
    renderSummaryCard({
      kicker: "恢复说明",
      title: "恢复演练始终在隔离目录中执行",
      pill: statusPill(canManageRestoreDrills() ? "info" : "neutral", canManageRestoreDrills() ? "可执行" : "只读"),
      note: canManageRestoreDrills()
        ? "系统页的按钮会直接复用治理中心同一条恢复逻辑，不会覆盖当前运行中的 data 目录。"
        : "需要管理员身份才能从控制台触发恢复演练。",
      meta: [
        state.overview?.governance?.recovery?.isStale ? "最近成功演练已过期" : null,
      ].filter(Boolean),
    }),
  ].join("");
  elements.metricsOutput.textContent = state.metricsPreview || "暂无 Prometheus 指标预览。";
}

function renderExportDetailCard(detail) {
  if (!detail) {
    return emptyState("从左侧选择一个导出批次，查看 manifest 和文件路径。");
  }
  if (detail.error) {
    return emptyState(detail.error);
  }
  return `
    <div class="record-head">
      <strong>${escapeHtml(pathLeaf(detail.dataFile || "export.ndjson"))}</strong>
      ${statusPill("info", `#${detail.sequence}`)}
    </div>
    <p class="summary-note">本次导出包含 ${escapeHtml(detail.entryCount)} 条 ledger 记录。</p>
    <div class="metric-list">
      ${metricRow("序号范围", `${detail.sequenceFrom || 0} - ${detail.sequenceTo || 0}`)}
      ${metricRow("Data SHA", shortHash(detail.dataSha256))}
      ${metricRow("Manifest SHA", shortHash(detail.manifestSha256))}
      ${metricRow("创建时间", formatDateTime(detail.createdAt))}
      ${metricRow("Data File", detail.dataFile)}
      ${metricRow("Manifest File", detail.manifestFile)}
    </div>
    ${rawDetails(detail)}
  `;
}

function renderBackupDetailCard(detail) {
  if (!detail) {
    return emptyState("从左侧选择一个备份任务，查看包含文件、目标状态和 manifest。");
  }
  if (detail.error && !detail.targets) {
    return emptyState(detail.error);
  }
  return `
    <div class="record-head">
      <strong>${escapeHtml(translateBackupStatus(detail.status))}</strong>
      ${statusPill(statusToneFromBackup(detail.status), detail.trigger || "backup")}
    </div>
    <p class="summary-note">${escapeHtml(detail.error || "快照已生成，详情见下方目标结果。")}</p>
    <div class="metric-list">
      ${metricRow("Backup ID", detail.backupId)}
      ${metricRow("Snapshot", detail.snapshotPath)}
      ${metricRow("大小", formatBytes(detail.totalBytes))}
      ${metricRow("Archive SHA", shortHash(detail.archiveSha256))}
      ${metricRow("包含文件", String(detail.includedFiles?.length || 0))}
    </div>
    ${detail.targets?.length ? `
      <div class="summary-stack">
        ${detail.targets.map((target) => renderSummaryCard({
          kicker: target.type,
          title: translateTargetStatus(target.status),
          pill: statusPill(target.status === "success" ? "good" : target.status === "failure" ? "bad" : "neutral", target.configured ? "configured" : "not configured"),
          note: target.location || target.error || "未配置目标",
          meta: [
            target.transferredFiles != null ? `文件数：${target.transferredFiles}` : null,
            target.totalBytes != null ? `大小：${formatBytes(target.totalBytes)}` : null,
          ].filter(Boolean),
        })).join("")}
      </div>
    ` : ""}
    ${rawDetails(detail)}
  `;
}

function renderRestoreDetailCard(detail) {
  if (!detail) {
    return emptyState("从左侧选择一次恢复演练，查看 manifest 校验、账本复算与身份状态检查。");
  }
  if (detail.error && !detail.checks) {
    return emptyState(detail.error);
  }
  return `
    <div class="record-head">
      <strong>${escapeHtml(translateRestoreStatus(detail.status))}</strong>
      ${statusPill(statusToneFromRestore(detail.status), translateRestoreSource(detail.sourceType || "local_snapshot"))}
    </div>
    <p class="summary-note">${escapeHtml(detail.error || "恢复演练已完成，检查项见下方摘要。")}</p>
    <div class="metric-list">
      ${metricRow("Restore ID", detail.drillId)}
      ${metricRow("Backup ID", detail.backupId || "adhoc")}
      ${metricRow("来源", translateRestoreSource(detail.sourceType || "local_snapshot"))}
      ${metricRow("恢复目录", detail.restorePath)}
      ${metricRow("保留到", detail.detail?.cleanupCutoffAt ? formatDateTime(detail.detail.cleanupCutoffAt) : "unknown")}
    </div>
    ${detail.checks?.length ? `
      <div class="summary-stack">
        ${detail.checks.map((check) => renderSummaryCard({
          kicker: check.label,
          title: check.summary,
          pill: statusPill(
            check.status === "success" ? "good" : check.status === "warning" ? "warn" : "bad",
            translateRestoreCheckStatus(check.status),
          ),
          note: check.detail?.sourceLocation || check.detail?.manifestPath || check.detail?.configPath || "检查详情已记录。",
          meta: [
            check.detail?.backupId ? `Backup：${check.detail.backupId}` : null,
            check.detail?.latestSequence != null ? `Ledger：#${check.detail.latestSequence}` : null,
            check.detail?.fileCount != null ? `文件数：${check.detail.fileCount}` : null,
          ].filter(Boolean),
        })).join("")}
      </div>
    ` : ""}
    ${rawDetails(detail)}
  `;
}

function renderAuditDetailCard(detail) {
  if (!detail) {
    return emptyState("选择一条决策或回放记录，查看摘要和底层审计字段。");
  }
  if (detail.error) {
    return emptyState(detail.error);
  }
  return `
    <div class="record-head">
      <strong>${escapeHtml(detail.label)}</strong>
      ${statusPill(detail.type === "decision" ? "good" : "info", `#${detail.sequence}`)}
    </div>
    <p class="summary-note">
      ${escapeHtml(detail.type === "decision"
        ? `风险等级 ${formatRisk(detail.riskRating)}，置信度 ${Number(detail.confidence || 0).toFixed(2)}。`
        : `共发现 ${detail.changedEvents || 0} 条变化，${detail.higherRiskEvents || 0} 条更高风险。`)}
    </p>
    <div class="metric-list">
      ${metricRow("创建时间", formatDateTime(detail.createdAt))}
      ${metricRow("执行人", detail.actorName || "anonymous")}
      ${metricRow("环境", `${detail.environment}/${detail.teamScope}`)}
      ${metricRow("链路状态", detail.chainStatus)}
      ${metricRow("Event IDs", (detail.eventIds || []).join(", "))}
    </div>
    ${rawDetails(detail)}
  `;
}

function renderProbeDetailCard(detail) {
  if (!detail) {
    return emptyState("选择一次探测记录，查看运行时与链路元数据。");
  }
  if (detail.error) {
    return emptyState(detail.error);
  }
  return `
    <div class="record-head">
      <strong>${escapeHtml(detail.label)}</strong>
      ${statusPill(detail.probeOk ? "good" : "warn", `#${detail.sequence}`)}
    </div>
    <p class="summary-note">${escapeHtml(detail.probeOk ? "最近一次探测返回正常。" : "最近一次探测存在失败或降级。")}</p>
    <div class="metric-list">
      ${metricRow("模型", detail.model || "unknown")}
      ${metricRow("可用模型数", String(detail.availableModelCount || 0))}
      ${metricRow("List Models", detail.listModelsOk ? "ok" : "failed")}
      ${metricRow("Inference", detail.inferenceOk ? "ok" : "failed")}
      ${metricRow("创建时间", formatDateTime(detail.createdAt))}
    </div>
    ${rawDetails(detail)}
  `;
}

function renderActivityDetailCard(detail) {
  if (!detail) {
    return emptyState("选择一条操作记录，查看 actor、subject 和关联 run。");
  }
  if (detail.error) {
    return emptyState(detail.error);
  }
  return `
    <div class="record-head">
      <strong>${escapeHtml(detail.message)}</strong>
      ${statusPill(detail.outcome === "failure" ? "bad" : "info", detail.action)}
    </div>
    <p class="summary-note">${escapeHtml(detail.subject || "system")}</p>
    <div class="metric-list">
      ${metricRow("执行人", detail.actorName || "anonymous")}
      ${metricRow("角色", detail.actorRole || "unknown")}
      ${metricRow("相关 Run", detail.relatedRunId || "none")}
      ${metricRow("创建时间", formatDateTime(detail.createdAt))}
      ${metricRow("链路状态", detail.chainStatus)}
    </div>
    ${rawDetails(detail)}
  `;
}

function renderDetailCard(container, detail, title, renderer) {
  if (!detail) {
    renderMessageCard(container, `从左侧选择一条${title}。`);
    return;
  }
  container.innerHTML = renderer(detail);
}

function renderHeroCard({ kicker, title, note, pill, meta }) {
  return `
    <p class="section-kicker">${escapeHtml(kicker)}</p>
    <div class="record-head">
      <h3>${escapeHtml(title)}</h3>
      ${pill || ""}
    </div>
    <p class="summary-note">${escapeHtml(note || "")}</p>
    ${meta?.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
  `;
}

function renderSummaryCard({ kicker, title, note, pill, meta }) {
  return `
    <article class="summary-card">
      <p class="section-kicker">${escapeHtml(kicker)}</p>
      <div class="record-head">
        <strong>${escapeHtml(title)}</strong>
        ${pill || ""}
      </div>
      <p class="summary-note">${escapeHtml(note || "")}</p>
      ${meta?.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    </article>
  `;
}

function renderMessageCard(container, message) {
  container.innerHTML = emptyState(message);
}

function emptyState(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function rawDetails(detail) {
  return `
    <details class="technical-details advanced-only">
      <summary>查看技术详情</summary>
      <pre class="output">${escapeHtml(JSON.stringify(detail, null, 2))}</pre>
    </details>
  `;
}

function metricRow(label, value) {
  return `
    <div class="metric-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

function ensureSelectedLibraryDocument() {
  const existing = getSelectedLibraryDocument();
  if (existing) {
    return;
  }
  const firstResult = state.libraryResults[0]?.document?.id;
  const firstDocument = state.libraryDocuments[0]?.id;
  state.selectedLibraryDocumentId = firstResult || firstDocument || null;
}

function getSelectedLibraryDocument() {
  if (!state.selectedLibraryDocumentId) {
    return null;
  }
  const inResults = state.libraryResults.find((item) => item.document.id === state.selectedLibraryDocumentId)?.document;
  if (inResults) {
    return inResults;
  }
  return state.libraryDocuments.find((item) => item.id === state.selectedLibraryDocumentId) || null;
}

function applyPreferences() {
  elements.body.classList.toggle("advanced-mode", state.prefs.advancedMode);
  elements.toggleAdvancedButton.textContent = state.prefs.advancedMode ? "隐藏高级详情" : "显示高级详情";
  syncWorkspaceHash();
}

function getVisibleWorkspaces() {
  const workspaces = ["workbench", "library"];
  if (canViewGovernanceWorkspace()) {
    workspaces.push("governance");
  }
  if (canViewSystemWorkspace()) {
    workspaces.push("system");
  }
  return workspaces;
}

function setWorkspace(workspace, options = {}) {
  if (!workspace || !Object.prototype.hasOwnProperty.call(WORKSPACE_LABELS, workspace)) {
    return;
  }
  state.prefs.currentWorkspace = workspace;
  if (options.persist !== false) {
    window.localStorage.setItem(STORAGE_KEYS.workspace, workspace);
  }
  if (options.replaceHash !== false) {
    syncWorkspaceHash();
  }
  renderFrame();
}

function syncWorkspaceHash() {
  const nextHash = `#${state.prefs.currentWorkspace}`;
  if (window.location.hash !== nextHash) {
    window.history.replaceState({}, "", `${window.location.pathname}${window.location.search}${nextHash}`);
  }
}

function readWorkspaceFromHash() {
  const hash = window.location.hash.replace(/^#/, "");
  return Object.prototype.hasOwnProperty.call(WORKSPACE_LABELS, hash) ? hash : null;
}

function loadStoredWorkspace() {
  return readWorkspaceFromHash() || window.localStorage.getItem(STORAGE_KEYS.workspace) || "workbench";
}

function loadStoredAdvancedMode() {
  return window.localStorage.getItem(STORAGE_KEYS.advancedMode) === "true";
}

function rememberAction(message) {
  state.prefs.lastAction = message;
  window.localStorage.setItem(STORAGE_KEYS.lastAction, message);
  renderFrame();
}

function buildIdentityPill() {
  const environment = state.operationsHealth?.environment || state.overview?.governance?.integrity?.environment || "unknown";
  const teamScope = state.operationsHealth?.teamScope || state.overview?.governance?.integrity?.teamScope || "unknown";
  if (state.overview?.identity?.authenticated) {
    return `${escapeHtml(state.overview.identity.actor?.name || "当前用户")} · ${escapeHtml(formatRole(state.overview.identity.actor?.role))} · ${escapeHtml(environment)}/${escapeHtml(teamScope)}`;
  }
  if (state.overview?.identity?.authEnabled) {
    return `未登录 · ${escapeHtml(environment)}/${escapeHtml(teamScope)} · 可以先用企业身份或应急令牌进入控制台`;
  }
  return `开放模式 · ${escapeHtml(environment)}/${escapeHtml(teamScope)} · 非技术用户可直接浏览工作台摘要`;
}

function formatAuthFlash(flash) {
  if (flash.authError) {
    return `登录失败：${flash.authError}`;
  }
  if (flash.auth === "success") {
    return "企业身份登录成功，当前 session 已生效。";
  }
  return "";
}

function consumeAuthFlash() {
  const url = new URL(window.location.href);
  const auth = url.searchParams.get("auth");
  const authError = url.searchParams.get("authError");
  if (!auth && !authError) {
    return;
  }
  state.authFlash = { auth, authError };
  url.searchParams.delete("auth");
  url.searchParams.delete("authError");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

function adoptSessionState(sessionState) {
  if (sessionState && typeof sessionState === "object") {
    state.csrfToken = sessionState.csrfToken || state.csrfToken || "";
    if (sessionState.authenticated === false) {
      state.csrfToken = "";
    }
  }
}

function formToObject(form) {
  const data = new FormData(form);
  const payload = {};
  for (const [key, value] of data.entries()) {
    const field = form.elements.namedItem(key);
    payload[key] = field?.type === "checkbox" ? true : value;
  }
  for (const element of form.querySelectorAll('input[type="checkbox"]')) {
    if (!(element.name in payload)) {
      payload[element.name] = false;
    }
  }
  return payload;
}

function fillForm(form, values) {
  if (!form || !values) {
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements.namedItem(key);
    if (!field) {
      continue;
    }
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value == null ? "" : String(value);
    }
  }
}

function fillCheckbox(form, name, value) {
  const field = form.elements.namedItem(name);
  if (field) {
    field.checked = Boolean(value);
  }
}

async function api(url, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(!["GET", "HEAD", "OPTIONS"].includes(method) && state.csrfToken
      ? { "x-finance-mesh-csrf": state.csrfToken }
      : {}),
    ...(init.headers || {}),
  };
  const response = await fetch(url, {
    credentials: "same-origin",
    headers,
    ...init,
  });
  const payload = await response.json();
  adoptSessionState(payload.session);
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

async function fetchText(url) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "text/plain",
    },
  });
  const content = await response.text();
  if (!response.ok) {
    throw new Error(content || "Request failed");
  }
  return content;
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function splitPaths(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function toIsoIfPresent(value) {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

function selectPreferred(key, items, preferredId, idKey = "id") {
  const ids = items.map((item) => item?.[idKey]).filter(Boolean);
  if (preferredId && ids.includes(preferredId)) {
    state[key] = preferredId;
    return;
  }
  if (state[key] && ids.includes(state[key])) {
    return;
  }
  state[key] = ids[0] || null;
}

function canViewLibrary() {
  return isOpenMode() || Boolean(state.access?.session?.authenticated);
}

function canOperateWorkbench() {
  return isOpenMode() || hasRole("operator");
}

function canReviewLibrary() {
  return isOpenMode() || hasRole("reviewer");
}

function canViewGovernanceWorkspace() {
  return isOpenMode() || hasRole("reviewer");
}

function canManageAuditIntegrity() {
  return isOpenMode() || hasRole("admin");
}

function canViewOperatorActivity() {
  return isOpenMode() || hasRole("admin");
}

function canManageIdentitySessions() {
  return isOpenMode() || hasRole("admin");
}

function canManageRestoreDrills() {
  return isOpenMode() || hasRole("admin");
}

function canViewSystemWorkspace() {
  return isOpenMode() || Boolean(state.access?.config?.enabled) || Boolean(state.access?.config?.bootstrapRequired);
}

function isOpenMode() {
  return !state.access?.config?.enabled;
}

function hasRole(requiredRole) {
  const actor = state.access?.session?.actor;
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

function statusPill(tone, label) {
  return `<span class="status-pill ${escapeHtml(tone)}">${escapeHtml(label || "")}</span>`;
}

function statusToneFromStatus(status) {
  if (status === "healthy" || status === "verified" || status === "success") {
    return "good";
  }
  if (status === "degraded" || status === "pending" || status === "not_configured" || status === "partial_failure") {
    return "warn";
  }
  if (status === "down" || status === "mismatch" || status === "failure") {
    return "bad";
  }
  return "neutral";
}

function statusToneFromRun(status) {
  return status ? statusToneFromStatus(status) : "neutral";
}

function statusToneFromIntegrity(integrity) {
  if (!integrity) {
    return "neutral";
  }
  if (integrity.status === "mismatch") {
    return "bad";
  }
  if (integrity.isStale || integrity.status === "pending") {
    return "warn";
  }
  return "good";
}

function statusToneFromBackup(status) {
  return statusToneFromStatus(status || "not_configured");
}

function statusToneFromRestore(status) {
  return statusToneFromStatus(status || "pending");
}

function statusToneFromRecovery(recovery) {
  return recovery ? statusToneFromStatus(recovery.status) : "neutral";
}

function integrityLabel(integrity) {
  if (!integrity) {
    return "未知";
  }
  if (integrity.status === "mismatch") {
    return "异常";
  }
  if (integrity.isStale || integrity.status === "pending") {
    return "待复核";
  }
  return "已验证";
}

function integritySummaryTitle(integrity) {
  if (integrity.status === "mismatch") {
    return `发现 ${integrity.mismatchCount} 处链路异常`;
  }
  if (integrity.isStale) {
    return "最近一次完整校验已过期";
  }
  if (integrity.lastVerifiedAt) {
    return "审计链已通过最近一次完整校验";
  }
  return "审计链尚未做过完整校验";
}

function recoveryLabel(recovery) {
  if (!recovery) {
    return "未知";
  }
  if (recovery.status === "failure") {
    return "恢复失败";
  }
  if (recovery.status === "degraded") {
    return "需复核";
  }
  if (recovery.status === "pending") {
    return "未演练";
  }
  return "已验证";
}

function translateStatus(status) {
  if (status === "healthy") {
    return "正常";
  }
  if (status === "verified") {
    return "已验证";
  }
  if (status === "degraded") {
    return "降级";
  }
  if (status === "pending") {
    return "待处理";
  }
  if (status === "down") {
    return "异常";
  }
  if (status === "not_configured") {
    return "未配置";
  }
  if (status === "mismatch") {
    return "不匹配";
  }
  return status || "未知";
}

function translateBackupStatus(status) {
  if (status === "success") {
    return "备份成功";
  }
  if (status === "partial_failure") {
    return "部分成功";
  }
  if (status === "failure") {
    return "备份失败";
  }
  return "未配置目标";
}

function translateRestoreStatus(status) {
  if (status === "success") {
    return "恢复演练成功";
  }
  if (status === "degraded") {
    return "恢复演练有告警";
  }
  if (status === "failure") {
    return "恢复演练失败";
  }
  return "恢复状态未知";
}

function translateRestoreSource(sourceType) {
  if (sourceType === "s3") {
    return "S3 对象存储";
  }
  if (sourceType === "mounted_dir") {
    return "挂载目录";
  }
  return "本地快照";
}

function translateRestoreCheckStatus(status) {
  if (status === "success") {
    return "通过";
  }
  if (status === "warning") {
    return "告警";
  }
  return "失败";
}

function translateTargetStatus(status) {
  if (status === "success") {
    return "同步成功";
  }
  if (status === "failure") {
    return "同步失败";
  }
  return "未配置";
}

function formatAuthMethod(value) {
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

function formatRole(role) {
  const map = {
    viewer: "Viewer",
    operator: "Operator",
    reviewer: "Reviewer",
    admin: "Admin",
  };
  return map[role] || role || "Unknown";
}

function formatRisk(risk) {
  if (risk === "high") {
    return "高";
  }
  if (risk === "medium") {
    return "中";
  }
  if (risk === "low") {
    return "低";
  }
  return risk || "未标注";
}

function formatDateTime(value) {
  if (!value) {
    return "unknown";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN");
}

function humanizeSeconds(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0 秒";
  }
  if (seconds >= 3600) {
    return `${(seconds / 3600).toFixed(1)} 小时`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} 分钟`;
  }
  return `${Math.round(seconds)} 秒`;
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

function shortHash(value) {
  return value ? `${String(value).slice(0, 12)}…` : "n/a";
}

function pathLeaf(value) {
  if (!value) {
    return "";
  }
  return String(value).split(/[\\/]/).at(-1) || String(value);
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function byId(id) {
  return document.getElementById(id);
}
