import {
  api,
  canManageAdmin,
  canViewSystem,
  rememberAction,
} from "../core/api.js";
import {
  calloutCard,
  detailRows,
  emptyState,
  jsonDetails,
  pill,
  recordButton,
  summaryCard,
} from "../core/components.js";
import { formatBytes, formatDateTime, translateBackupStatus } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "recovery-backups",
  sectionLabel: "备份",
  title: "把备份目标、复制链路和快照历史放进独立页面",
  intro: "恢复总览只负责讲当前能不能恢复。真正的目标配置、快照历史和手动备份动作都放在这里。",
  heroActions: `
    <a class="button" href="/recovery.html">返回恢复总览</a>
    <a class="button ghost" href="/recovery-restores.html">查看恢复演练</a>
  `,
});

const state = {
  backups: [],
  selectedBackupId: null,
  selectedBackupDetail: null,
  backupConfig: null,
};

renderFrame();
await refreshBackups();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">复制链路</p>
            <h3>先看 off-box 目标是否已经就绪</h3>
          </div>
          <button id="run-backup" type="button">立即执行备份</button>
        </div>
        <div id="backup-config" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">备份建议</p>
            <h3>不要只看“有没有快照”，要看是否真的复制出去了</h3>
          </div>
        </div>
        <div id="backup-guidance" class="section-stack"></div>
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
  `;

  shell.pageContent.querySelector("#run-backup")?.addEventListener("click", () => void runBackup());
  shell.pageContent.querySelector("#refresh-backups")?.addEventListener("click", () => void refreshBackups());
  shell.pageContent.querySelector("#backup-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-backup-id]");
    if (target) {
      void openBackup(target.getAttribute("data-backup-id"));
    }
  });

  renderSummary();
  renderBackups();
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

async function runBackup() {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    renderSectionMessage("#backup-guidance", "只有管理员可以手动触发备份。");
    return;
  }
  renderSectionMessage("#backup-guidance", "正在生成快照并复制到已配置目标…");
  try {
    const result = await api("/api/operations/backups/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已手动触发异地备份");
    await shell.refreshChrome();
    await refreshBackups(result.backup?.backupId);
  } catch (error) {
    renderSectionMessage("#backup-guidance", String(error.message || error));
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

function renderSummary() {
  const config = shell.pageContent.querySelector("#backup-config");
  const guidance = shell.pageContent.querySelector("#backup-guidance");
  const globalData = shell.getGlobal();
  const latestBackup = state.backups[0] || globalData.overview?.governance?.backups?.lastBackup || null;

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
    guidance.innerHTML = `
      ${summaryCard({
        kicker: "最近备份",
        title: latestBackup ? translateBackupStatus(latestBackup.status) : "尚未生成最近备份",
        note: latestBackup?.summary || "还没有最近备份摘要。",
        pillHtml: pill(
          latestBackup?.status === "failure"
            ? "bad"
            : latestBackup?.status === "partial_failure"
              ? "warn"
              : latestBackup
                ? "good"
                : "neutral",
          latestBackup?.status || "pending",
        ),
        meta: latestBackup?.createdAt ? [formatDateTime(latestBackup.createdAt)] : ["等待最近备份"],
      })}
      ${calloutCard({
        kicker: "管理员动作",
        title: latestBackup?.status === "partial_failure" || latestBackup?.status === "failure"
          ? "先看失败目标"
          : canManageAdmin(globalData)
            ? "如果今天改过配置，建议再跑一次备份"
            : "当前角色只能看摘要",
        note: latestBackup?.status === "partial_failure" || latestBackup?.status === "failure"
          ? latestBackup.summary
          : "备份明细会告诉你 snapshot 路径、SHA-256 和每个目标的复制结果。",
        tone: latestBackup?.status === "partial_failure" || latestBackup?.status === "failure" ? "warning" : "info",
      })}
    `;
  }

  const runBackupButton = shell.pageContent.querySelector("#run-backup");
  if (runBackupButton) {
    runBackupButton.style.display = canManageAdmin(globalData) ? "" : "none";
  }
}

function renderBackups() {
  const list = shell.pageContent.querySelector("#backup-list");
  const detail = shell.pageContent.querySelector("#backup-detail");
  if (!list || !detail) {
    return;
  }
  list.innerHTML = state.backups.length
    ? state.backups.map((item) => recordButton({
        id: item.backupId,
        selected: item.backupId === state.selectedBackupId,
        attribute: "data-backup-id",
        title: translateBackupStatus(item.status),
        note: item.targets?.length ? `${item.targets.filter((target) => target.status === "success").length}/${item.targets.length} 个目标成功` : "等待目标结果",
        pillHtml: pill(item.status === "failure" ? "bad" : item.status === "partial_failure" ? "warn" : "good", item.trigger),
        meta: [formatDateTime(item.createdAt), formatBytes(item.totalBytes)],
      })).join("")
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

function renderSectionMessage(selector, message) {
  const node = shell.pageContent.querySelector(selector);
  if (node) {
    node.innerHTML = emptyState(message);
  }
}
