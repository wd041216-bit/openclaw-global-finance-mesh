import {
  api,
  canManageAdmin,
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
import {
  formatDateTime,
  translateRestoreCheckStatus,
  translateRestoreSource,
  translateRestoreStatus,
} from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "recovery-restores",
  sectionLabel: "恢复演练",
  title: "把恢复检查结果、失败原因和手动演练单独放一页",
  intro: "恢复总览只告诉你链路是否健康。这一页才负责展开检查项、source type、restore path 和手动执行演练。",
  heroActions: `
    <a class="button" href="/recovery.html">返回恢复总览</a>
    <a class="button ghost" href="/recovery-backups.html">查看备份</a>
  `,
});

const state = {
  restores: [],
  selectedRestoreId: null,
  selectedRestoreDetail: null,
};

renderFrame();
await refreshRestores();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">恢复就绪度</p>
            <h3>最近一次 restore drill 到底有没有通过</h3>
          </div>
          <button id="run-restore" type="button">立即执行演练</button>
        </div>
        <div id="restore-summary" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">恢复建议</p>
            <h3>先看链路当前卡在哪一步</h3>
          </div>
        </div>
        <div id="restore-guidance" class="section-stack"></div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">恢复演练历史</p>
          <h3>最近恢复验证与检查结果</h3>
        </div>
        <button id="refresh-restores" type="button" class="ghost">刷新演练</button>
      </div>
      <div class="page-columns">
        <div id="restore-list" class="record-list"></div>
        <div id="restore-detail" class="detail-card detail-panel"></div>
      </div>
    </section>
  `;

  shell.pageContent.querySelector("#run-restore")?.addEventListener("click", () => void runRestore());
  shell.pageContent.querySelector("#refresh-restores")?.addEventListener("click", () => void refreshRestores());
  shell.pageContent.querySelector("#restore-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-restore-id]");
    if (target) {
      void openRestore(target.getAttribute("data-restore-id"));
    }
  });

  renderSummary();
  renderRestores();
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

async function runRestore() {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    renderSectionMessage("#restore-guidance", "只有管理员可以执行恢复演练。");
    return;
  }
  renderSectionMessage("#restore-guidance", "正在从最近可用备份源执行恢复演练…");
  try {
    const result = await api("/api/operations/restores/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    await shell.refreshChrome();
    await refreshRestores(result.restore?.drillId);
  } catch (error) {
    renderSectionMessage("#restore-guidance", String(error.message || error));
  }
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
  const summary = shell.pageContent.querySelector("#restore-summary");
  const guidance = shell.pageContent.querySelector("#restore-guidance");
  const globalData = shell.getGlobal();
  const recovery = globalData.overview?.governance?.recovery;
  const latestRestore = state.restores[0] || recovery?.latestDrill || null;

  if (summary) {
    summary.innerHTML = `
      ${summaryCard({
        kicker: "恢复建议",
        title: recovery?.summary || "等待恢复就绪度",
        note: recovery?.recommendedAction || "当恢复演练数据就绪后，这里会告诉管理员下一步动作。",
        pillHtml: pill(
          recovery?.status === "failure"
            ? "bad"
            : recovery?.status === "degraded"
              ? "warn"
              : recovery?.status === "success"
                ? "good"
                : "info",
          recovery?.status || "pending",
        ),
        meta: [
          recovery?.lastDrillAt ? `最近演练 ${formatDateTime(recovery.lastDrillAt)}` : "尚未演练",
          recovery?.lastSuccessAt ? `最近成功 ${formatDateTime(recovery.lastSuccessAt)}` : "尚无成功记录",
        ],
      })}
      ${calloutCard({
        kicker: "管理员下一步",
        title: latestRestore?.status === "failure"
          ? "先打开失败检查项"
          : latestRestore?.status === "degraded"
            ? "继续处理恢复告警"
            : canManageAdmin(globalData)
              ? "如果今天改过配置，建议再执行一次演练"
              : "当前角色只能看摘要",
        note: latestRestore?.summary || "从左侧选择一条 restore drill，继续看检查结果。",
        tone: latestRestore?.status === "failure" ? "critical" : latestRestore?.status === "degraded" ? "warning" : "info",
      })}
    `;
  }

  if (guidance) {
    guidance.innerHTML = `
      ${summaryCard({
        kicker: "最近演练",
        title: latestRestore ? translateRestoreStatus(latestRestore.status) : "尚未执行恢复演练",
        note: latestRestore ? `${translateRestoreSource(latestRestore.sourceType)} · ${latestRestore.summary || latestRestore.error || "恢复就绪度摘要"}` : "当前还没有 restore drill 记录。",
        pillHtml: pill(
          latestRestore?.status === "failure"
            ? "bad"
            : latestRestore?.status === "degraded"
              ? "warn"
              : latestRestore
                ? "good"
                : "neutral",
          latestRestore?.status || "pending",
        ),
        meta: latestRestore?.createdAt ? [formatDateTime(latestRestore.createdAt), latestRestore.backupId || "adhoc"] : ["等待首次 restore drill"],
      })}
      ${calloutCard({
        kicker: "风险说明",
        title: latestRestore?.status === "failure" ? "当前恢复链路存在阻塞" : latestRestore?.status === "degraded" ? "恢复链路有告警" : "当前没有新的恢复阻塞",
        note: latestRestore?.error || latestRestore?.summary || "继续查看下方检查结果明细。",
        tone: latestRestore?.status === "failure" ? "warning" : latestRestore?.status === "degraded" ? "warning" : "good",
      })}
    `;
  }

  const runRestoreButton = shell.pageContent.querySelector("#run-restore");
  if (runRestoreButton) {
    runRestoreButton.style.display = canManageAdmin(globalData) ? "" : "none";
  }
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
    ? state.restores.map((item) => recordButton({
        id: item.drillId,
        selected: item.drillId === state.selectedRestoreId,
        attribute: "data-restore-id",
        title: translateRestoreStatus(item.status),
        note: `${translateRestoreSource(item.sourceType)} · ${item.summary || item.error || "恢复就绪度摘要"}`,
        pillHtml: pill(item.status === "failure" ? "bad" : item.status === "degraded" ? "warn" : "good", item.status),
        meta: [formatDateTime(item.createdAt), item.backupId || "adhoc"],
      })).join("")
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
        ${state.selectedRestoreDetail.checks.map((item) => `
          <div class="detail-row">
            <span>${item.label}</span>
            <strong>${translateRestoreCheckStatus(item.status)} · ${item.summary}</strong>
          </div>
        `).join("")}
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
