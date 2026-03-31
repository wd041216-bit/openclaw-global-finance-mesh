import {
  api,
  canManageAdmin,
  canViewSystem,
  rememberAction,
} from "../core/api.js";
import {
  bulletList,
  calloutCard,
  detailRows,
  emptyState,
  jsonDetails,
  pill,
  recordButton,
  summaryCard,
} from "../core/components.js";
import {
  formatBytes,
  formatDateTime,
  translateBackupStatus,
  translateRestoreCheckStatus,
  translateRestoreSource,
  translateRestoreStatus,
} from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "recovery",
  sectionLabel: "恢复中心",
  title: "先看恢复链路是否健康，再决定是否马上备份或演练",
  intro: "恢复页首屏只保留恢复就绪度、目标配置和最新风险。快照明细与恢复检查结果继续放在下方详情区。",
  heroActions: `
    <a class="button" href="/governance.html">返回治理中心</a>
    <a class="button ghost" href="/system.html">打开系统设置</a>
  `,
});

const state = {
  backups: [],
  selectedBackupId: null,
  selectedBackupDetail: null,
  backupConfig: null,
  restores: [],
  selectedRestoreId: null,
  selectedRestoreDetail: null,
};

renderFrame();
await refreshAll();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid three-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">恢复就绪度</p>
            <h3>最近演练与推荐动作</h3>
          </div>
          <div class="section-actions">
            <button id="run-backup" type="button" class="ghost">立即执行备份</button>
            <button id="run-restore" type="button">立即执行演练</button>
          </div>
        </div>
        <div id="recovery-summary" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">目标配置</p>
            <h3>当前复制链路</h3>
          </div>
        </div>
        <div id="backup-config" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">当前风险</p>
            <h3>失败点与恢复建议</h3>
          </div>
        </div>
        <div id="recovery-guidance" class="section-stack"></div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">备份历史</p>
          <h3>最近快照与复制结果</h3>
        </div>
        <button id="refresh-backups" type="button" class="ghost">刷新备份</button>
      </div>
      <div class="page-columns">
        <div id="backup-list" class="record-list"></div>
        <div id="backup-detail" class="detail-card detail-panel"></div>
      </div>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">恢复演练</p>
          <h3>最近恢复验证</h3>
        </div>
        <button id="refresh-restores" type="button" class="ghost">刷新演练</button>
      </div>
      <div class="page-columns">
        <div id="restore-list" class="record-list"></div>
        <div id="restore-detail" class="detail-card detail-panel"></div>
      </div>
    </section>
  `;

  shell.pageContent.querySelector("#run-backup")?.addEventListener("click", () => void runBackup());
  shell.pageContent.querySelector("#run-restore")?.addEventListener("click", () => void runRestore());
  shell.pageContent.querySelector("#refresh-backups")?.addEventListener("click", () => void refreshBackups());
  shell.pageContent.querySelector("#backup-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-backup-id]");
    if (target) {
      void openBackup(target.getAttribute("data-backup-id"));
    }
  });
  shell.pageContent.querySelector("#refresh-restores")?.addEventListener("click", () => void refreshRestores());
  shell.pageContent.querySelector("#restore-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-restore-id]");
    if (target) {
      void openRestore(target.getAttribute("data-restore-id"));
    }
  });

  renderSummary();
  renderBackups();
  renderRestores();
}

async function refreshAll() {
  await Promise.all([refreshBackups(), refreshRestores()]);
}

async function refreshBackups(preferredId) {
  const globalData = shell.getGlobal();
  if (!canViewSystem(globalData)) {
    state.backups = [];
    state.backupConfig = null;
    state.selectedBackupId = null;
    state.selectedBackupDetail = null;
    renderSummary();
    renderBackups();
    return;
  }
  try {
    const result = await api("/api/operations/backups?limit=12");
    state.backupConfig = result.config || null;
    state.backups = result.backups || [];
    state.selectedBackupId = preferredId || state.selectedBackupId || state.backups[0]?.backupId || null;
    if (state.selectedBackupId) {
      await openBackup(state.selectedBackupId);
      return;
    }
  } catch (error) {
    state.backups = [];
    state.selectedBackupDetail = { error: String(error.message || error) };
  }
  renderSummary();
  renderBackups();
}

async function refreshRestores(preferredId) {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    state.restores = [];
    state.selectedRestoreId = null;
    state.selectedRestoreDetail = null;
    renderSummary();
    renderRestores();
    return;
  }
  try {
    const result = await api("/api/operations/restores?limit=12");
    state.restores = result.restores || [];
    state.selectedRestoreId = preferredId || state.selectedRestoreId || state.restores[0]?.drillId || null;
    if (state.selectedRestoreId) {
      await openRestore(state.selectedRestoreId);
      return;
    }
  } catch (error) {
    state.restores = [];
    state.selectedRestoreDetail = { error: String(error.message || error) };
  }
  renderSummary();
  renderRestores();
}

async function runBackup() {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    renderSectionMessage("#recovery-summary", "只有管理员可以手动触发备份。");
    return;
  }
  renderSectionMessage("#recovery-summary", "正在生成快照并复制到已配置目标…");
  try {
    const result = await api("/api/operations/backups/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已手动触发异地备份");
    await shell.refreshChrome();
    await refreshBackups(result.backup?.backupId);
  } catch (error) {
    renderSectionMessage("#recovery-summary", String(error.message || error));
  }
}

async function runRestore() {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    renderSectionMessage("#recovery-summary", "只有管理员可以执行恢复演练。");
    return;
  }
  renderSectionMessage("#recovery-summary", "正在从最近可用备份源执行恢复演练…");
  try {
    const result = await api("/api/operations/restores/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已执行恢复演练");
    await shell.refreshChrome();
    await refreshRestores(result.restore?.drillId);
  } catch (error) {
    renderSectionMessage("#recovery-summary", String(error.message || error));
  }
}

async function openBackup(backupId) {
  if (!backupId) {
    return;
  }
  state.selectedBackupId = backupId;
  renderBackups();
  try {
    const result = await api(`/api/operations/backups/${encodeURIComponent(backupId)}`);
    state.selectedBackupDetail = result.backup;
  } catch (error) {
    state.selectedBackupDetail = { error: String(error.message || error) };
  }
  renderSummary();
  renderBackups();
}

async function openRestore(drillId) {
  if (!drillId) {
    return;
  }
  state.selectedRestoreId = drillId;
  renderRestores();
  try {
    const result = await api(`/api/operations/restores/${encodeURIComponent(drillId)}`);
    state.selectedRestoreDetail = result.restore;
  } catch (error) {
    state.selectedRestoreDetail = { error: String(error.message || error) };
  }
  renderSummary();
  renderRestores();
}

function renderSummary() {
  const summary = shell.pageContent.querySelector("#recovery-summary");
  const config = shell.pageContent.querySelector("#backup-config");
  const guidance = shell.pageContent.querySelector("#recovery-guidance");
  const globalData = shell.getGlobal();
  const recovery = globalData.overview?.governance?.recovery;
  const backupSummary = globalData.overview?.governance?.backups;
  const latestBackup = state.backups[0] || backupSummary?.lastBackup || null;
  const latestRestore = state.restores[0] || null;
  const health = globalData.operationsHealth?.checks?.recoveryDrill;

  if (summary) {
    summary.innerHTML = `
      ${summaryCard({
        kicker: "恢复建议",
        title: recovery?.summary || "等待恢复就绪度",
        note: recovery?.recommendedAction || "当备份和演练就绪后，这里会告诉管理员下一步动作。",
        pillHtml: pill(recovery?.status === "failure" ? "bad" : recovery?.status === "degraded" ? "warn" : "good", recovery?.status || "pending"),
        meta: [
          recovery?.lastDrillAt ? `最近演练 ${formatDateTime(recovery.lastDrillAt)}` : "尚未演练",
          latestBackup?.createdAt ? `最近备份 ${formatDateTime(latestBackup.createdAt)}` : "尚未备份",
        ],
      })}
      ${calloutCard({
        kicker: "管理员下一步",
        title: canManageAdmin(globalData)
          ? recovery?.recommendedAction || "先确认恢复链路是否需要补演练"
          : "当前角色可以先阅读恢复摘要",
        note: canManageAdmin(globalData)
          ? "如果最近没有成功演练，优先执行一次恢复验证。"
          : "恢复动作仍然需要管理员权限。",
        tone: recovery?.status === "failure" ? "critical" : recovery?.status === "degraded" ? "warning" : "good",
      })}
    `;
  }

  if (config) {
    config.innerHTML = state.backupConfig
      ? `
        ${summaryCard({
          kicker: "复制链路",
          title: state.backupConfig.anyConfigured ? `已配置 ${state.backupConfig.configuredTargetCount} 个目标` : "未配置异地备份目标",
          note: state.backupConfig.localDir
            ? `挂载目录：${state.backupConfig.localDir}`
            : state.backupConfig.s3?.configured
              ? `S3 bucket：${state.backupConfig.s3.bucket || "configured"}`
              : "建议至少配置挂载目录或 S3 目标之一。",
          pillHtml: pill(state.backupConfig.anyConfigured ? "good" : "warn", state.backupConfig.anyConfigured ? "ready" : "pending"),
          meta: [
            `Snapshot root ${state.backupConfig.backupRoot}`,
            state.backupConfig.s3?.configured ? `S3 ${state.backupConfig.s3.bucket}` : "S3 未配置",
          ],
        })}
        ${calloutCard({
          kicker: "当前建议",
          title: state.backupConfig.anyConfigured ? "链路已具备异地复制能力" : "先补一个 off-box 目标",
          note: state.backupConfig.anyConfigured
            ? "现在更值得关注的是最近一次复制结果和恢复演练是否通过。"
            : "没有 off-box 目标时，只能回退到本地 snapshot，恢复就绪度会保持 degraded。",
          tone: state.backupConfig.anyConfigured ? "good" : "warning",
        })}
      `
      : emptyState("正在读取备份目标配置。");
  }

  if (guidance) {
    const latestFailure = latestRestore?.status === "failure"
      ? latestRestore.error || latestRestore.summary
      : latestBackup?.status === "failure" || latestBackup?.status === "partial_failure"
        ? latestBackup.error || "最近备份至少有一个目标失败。"
        : "";

    guidance.innerHTML = `
      ${summaryCard({
        kicker: "当前链路",
        title: health?.summary || "等待恢复健康摘要",
        note: latestFailure || "当前没有新的恢复阻塞。",
        pillHtml: pill(health?.status === "healthy" ? "good" : health?.status === "degraded" ? "warn" : "neutral", health?.status || "pending"),
        meta: [
          latestRestore?.createdAt ? `最近演练 ${formatDateTime(latestRestore.createdAt)}` : "暂无演练记录",
          latestBackup?.createdAt ? `最近备份 ${formatDateTime(latestBackup.createdAt)}` : "暂无备份记录",
        ],
      })}
      ${calloutCard({
        kicker: "推荐动作",
        title: latestFailure ? "先定位最近一次失败点" : "保持定期演练节奏",
        note: latestFailure
          ? latestFailure
          : "如果今天刚变更过备份目标或身份文件，建议再补一次恢复演练确认可读。",
        tone: latestFailure ? "warning" : "info",
        content: bulletList([
          latestFailure ? "先打开下方详情区确认失败发生在复制、manifest 校验还是恢复检查。" : "",
          canManageAdmin(globalData) ? "管理员可以直接在本页执行备份或演练。" : "",
        ]),
      })}
    `;
  }

  const runBackupButton = shell.pageContent.querySelector("#run-backup");
  const runRestoreButton = shell.pageContent.querySelector("#run-restore");
  if (runBackupButton) {
    runBackupButton.style.display = canManageAdmin(globalData) ? "" : "none";
  }
  if (runRestoreButton) {
    runRestoreButton.style.display = canManageAdmin(globalData) ? "" : "none";
  }
}

function renderBackups() {
  const list = shell.pageContent.querySelector("#backup-list");
  const detail = shell.pageContent.querySelector("#backup-detail");
  if (!list || !detail) {
    return;
  }

  list.innerHTML = state.backups.length
    ? state.backups
        .map((item) =>
          recordButton({
            id: item.backupId,
            selected: item.backupId === state.selectedBackupId,
            attribute: "data-backup-id",
            title: translateBackupStatus(item.status),
            note: item.targets?.length ? `${item.targets.filter((target) => target.status === "success").length}/${item.targets.length} 个目标成功` : "等待目标结果",
            pillHtml: pill(item.status === "failure" ? "bad" : item.status === "partial_failure" ? "warn" : "good", item.trigger),
            meta: [formatDateTime(item.createdAt), formatBytes(item.totalBytes)],
          }),
        )
        .join("")
    : emptyState("还没有备份记录。");

  if (!state.selectedBackupDetail) {
    detail.innerHTML = emptyState("从左侧选择一条备份记录。");
    return;
  }
  if (state.selectedBackupDetail.error) {
    detail.innerHTML = emptyState(state.selectedBackupDetail.error);
    return;
  }

  detail.innerHTML = `
    <div class="section-stack">
      ${summaryCard({
        kicker: "备份详情",
        title: translateBackupStatus(state.selectedBackupDetail.status),
        note: state.selectedBackupDetail.snapshotPath || "查看快照与复制结果。",
        pillHtml: pill(state.selectedBackupDetail.status === "failure" ? "bad" : state.selectedBackupDetail.status === "partial_failure" ? "warn" : "good", state.selectedBackupDetail.trigger),
        meta: [formatDateTime(state.selectedBackupDetail.createdAt), formatBytes(state.selectedBackupDetail.totalBytes)],
      })}
      ${detailRows([
        { label: "Snapshot Path", value: state.selectedBackupDetail.snapshotPath },
        { label: "Archive SHA-256", value: state.selectedBackupDetail.archiveSha256 },
        { label: "Completed At", value: state.selectedBackupDetail.completedAt ? formatDateTime(state.selectedBackupDetail.completedAt) : "" },
      ])}
      ${jsonDetails("查看备份原始对象", state.selectedBackupDetail)}
    </div>
  `;
}

function renderRestores() {
  const list = shell.pageContent.querySelector("#restore-list");
  const detail = shell.pageContent.querySelector("#restore-detail");
  const globalData = shell.getGlobal();
  if (!list || !detail) {
    return;
  }
  if (!canManageAdmin(globalData)) {
    list.innerHTML = emptyState("只有管理员可以查看恢复演练历史。");
    detail.innerHTML = emptyState("登录为 admin 后可查看恢复演练详情。");
    return;
  }

  list.innerHTML = state.restores.length
    ? state.restores
        .map((item) =>
          recordButton({
            id: item.drillId,
            selected: item.drillId === state.selectedRestoreId,
            attribute: "data-restore-id",
            title: translateRestoreStatus(item.status),
            note: `${translateRestoreSource(item.sourceType)} · ${item.summary || item.error || "恢复就绪度摘要"}`,
            pillHtml: pill(item.status === "failure" ? "bad" : item.status === "degraded" ? "warn" : "good", item.status),
            meta: [formatDateTime(item.createdAt), item.backupId || "adhoc"],
          }),
        )
        .join("")
    : emptyState("还没有恢复演练记录。");

  if (!state.selectedRestoreDetail) {
    detail.innerHTML = emptyState("从左侧选择一次恢复演练。");
    return;
  }
  if (state.selectedRestoreDetail.error) {
    detail.innerHTML = emptyState(state.selectedRestoreDetail.error);
    return;
  }

  detail.innerHTML = `
    <div class="section-stack">
      ${summaryCard({
        kicker: "恢复演练详情",
        title: translateRestoreStatus(state.selectedRestoreDetail.status),
        note: `${translateRestoreSource(state.selectedRestoreDetail.sourceType)} · ${state.selectedRestoreDetail.sourceLocation}`,
        pillHtml: pill(state.selectedRestoreDetail.status === "failure" ? "bad" : state.selectedRestoreDetail.status === "degraded" ? "warn" : "good", state.selectedRestoreDetail.status),
        meta: [formatDateTime(state.selectedRestoreDetail.createdAt), state.selectedRestoreDetail.backupId || "adhoc"],
      })}
      ${detailRows([
        { label: "Restore Path", value: state.selectedRestoreDetail.restorePath },
        { label: "Completed At", value: state.selectedRestoreDetail.completedAt ? formatDateTime(state.selectedRestoreDetail.completedAt) : "" },
      ])}
      <div class="detail-table">
        ${state.selectedRestoreDetail.checks
          .map(
            (item) => `
              <div class="detail-row">
                <span>${item.label}</span>
                <strong>${translateRestoreCheckStatus(item.status)} · ${item.summary}</strong>
              </div>
            `,
          )
          .join("")}
      </div>
      ${jsonDetails("查看恢复演练原始对象", state.selectedRestoreDetail)}
    </div>
  `;
}

function renderSectionMessage(selector, message) {
  const node = shell.pageContent.querySelector(selector);
  if (node) {
    node.innerHTML = emptyState(message);
  }
}
