import {
  api,
  canManageAdmin,
  canViewGovernance,
  formToObject,
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
import { formatDateTime } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "governance-exports",
  sectionLabel: "审计与导出",
  title: "把完整性、导出 readiness 和导出切片集中到一个子页面",
  intro: "如果今天要做完整校验或对外交付审计证据，就直接进这页。治理总览只负责告诉你是不是需要来这里处理。",
  heroActions: `
    <a class="button" href="/governance.html">返回治理总览</a>
    <a class="button ghost" href="/governance-activity.html">查看治理时间线</a>
  `,
});

const state = {
  integrity: null,
  exports: [],
  selectedExportId: null,
  selectedExportDetail: null,
};

renderFrame();
await refreshAll();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">审计链完整性</p>
            <h3>先判断今天要不要重新验证</h3>
          </div>
          <div class="section-actions">
            <button id="refresh-integrity" type="button" class="ghost">刷新</button>
            <button id="verify-integrity" type="button">执行完整校验</button>
          </div>
        </div>
        <div id="integrity-summary" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">导出 readiness</p>
            <h3>先确认当前是否适合对外交付</h3>
          </div>
        </div>
        <div id="export-overview" class="section-stack"></div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">导出创建与历史</p>
          <h3>切片范围、manifest 与原始对象</h3>
          <p class="section-copy">先看摘要，再决定是否创建新的导出切片或展开技术详情。</p>
        </div>
      </div>
      <div id="export-controls" class="section-stack"></div>
      <div class="page-columns">
        <div id="export-list" class="record-list"></div>
        <div id="export-detail" class="detail-card detail-panel"></div>
      </div>
    </section>
  `;

  shell.pageContent.querySelector("#refresh-integrity")?.addEventListener("click", () => void refreshIntegrity());
  shell.pageContent.querySelector("#verify-integrity")?.addEventListener("click", () => void verifyIntegrity());
  shell.pageContent.addEventListener("submit", (event) => {
    const form = event.target.closest("form");
    if (form?.id === "export-form") {
      event.preventDefault();
      void onCreateExport(form);
    }
  });
  shell.pageContent.querySelector("#export-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-export-id]");
    if (target) {
      void openExport(target.getAttribute("data-export-id"));
    }
  });

  renderIntegrity();
  renderExportOverview();
  renderExportControls();
  renderExports();
}

async function refreshAll() {
  await Promise.all([refreshIntegrity(), refreshExports()]);
}

async function refreshIntegrity() {
  const globalData = shell.getGlobal();
  if (!canViewGovernance(globalData)) {
    state.integrity = null;
    renderIntegrity();
    renderExportOverview();
    return;
  }
  try {
    const result = await api("/api/audit/integrity");
    state.integrity = result.integrity;
  } catch (error) {
    state.integrity = { error: String(error.message || error) };
  }
  renderIntegrity();
  renderExportOverview();
}

async function verifyIntegrity() {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    renderSectionMessage("#integrity-summary", "只有管理员可以执行完整审计校验。");
    return;
  }
  renderSectionMessage("#integrity-summary", "正在执行完整校验…");
  try {
    const result = await api("/api/audit/integrity/verify", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.integrity = result.integrity;
    rememberAction("已执行审计链完整校验");
    await shell.refreshChrome();
    await refreshExports();
  } catch (error) {
    state.integrity = { error: String(error.message || error) };
  }
  renderIntegrity();
  renderExportOverview();
}

async function refreshExports(preferredId) {
  const globalData = shell.getGlobal();
  if (!canViewGovernance(globalData)) {
    state.exports = [];
    state.selectedExportId = null;
    state.selectedExportDetail = null;
    renderExportOverview();
    renderExportControls();
    renderExports();
    return;
  }
  try {
    const result = await api("/api/audit/exports?limit=12");
    state.exports = result.exports || [];
    state.selectedExportId = preferredId || state.selectedExportId || state.exports[0]?.id || null;
    if (state.selectedExportId) {
      await openExport(state.selectedExportId);
      return;
    }
  } catch (error) {
    state.exports = [];
    state.selectedExportDetail = { error: String(error.message || error) };
  }
  renderExportOverview();
  renderExportControls();
  renderExports();
}

async function onCreateExport(form) {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    renderSectionMessage("#export-detail", "只有管理员可以创建导出。");
    return;
  }
  try {
    const payload = formToObject(form);
    const result = await api("/api/audit/exports", {
      method: "POST",
      body: JSON.stringify({
        sequenceFrom: payload.sequenceFrom ? Number(payload.sequenceFrom) : undefined,
        sequenceTo: payload.sequenceTo ? Number(payload.sequenceTo) : undefined,
        createdFrom: payload.createdFrom ? new Date(payload.createdFrom).toISOString() : undefined,
        createdTo: payload.createdTo ? new Date(payload.createdTo).toISOString() : undefined,
      }),
    });
    form.reset();
    rememberAction("已创建审计切片导出");
    await shell.refreshChrome();
    await refreshIntegrity();
    await refreshExports(result.exportBatch?.id);
  } catch (error) {
    state.selectedExportDetail = { error: String(error.message || error) };
    renderExports();
  }
}

async function openExport(exportId) {
  if (!exportId) {
    return;
  }
  state.selectedExportId = exportId;
  renderExports();
  try {
    const result = await api(`/api/audit/exports/${encodeURIComponent(exportId)}`);
    state.selectedExportDetail = result.exportBatch;
  } catch (error) {
    state.selectedExportDetail = { error: String(error.message || error) };
  }
  renderExportOverview();
  renderExports();
}

function renderIntegrity() {
  const container = shell.pageContent.querySelector("#integrity-summary");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  const verifyButton = shell.pageContent.querySelector("#verify-integrity");
  if (verifyButton) {
    verifyButton.style.display = canManageAdmin(globalData) ? "" : "none";
  }
  if (!canViewGovernance(globalData)) {
    container.innerHTML = emptyState("当前角色不能查看治理摘要。");
    return;
  }
  if (!state.integrity) {
    container.innerHTML = emptyState("正在读取审计链状态。");
    return;
  }
  if (state.integrity.error) {
    container.innerHTML = emptyState(state.integrity.error);
    return;
  }
  const tone = state.integrity.mismatchCount > 0 ? "bad" : state.integrity.isStale ? "warn" : "good";
  container.innerHTML = `
    ${summaryCard({
      kicker: "完整性摘要",
      title: state.integrity.mismatchCount > 0 ? `发现 ${state.integrity.mismatchCount} 处异常` : "审计链状态正常",
      note: state.integrity.lastVerifiedAt
        ? `最近完整校验时间：${formatDateTime(state.integrity.lastVerifiedAt)}`
        : "还没有执行过完整校验。",
      pillHtml: pill(tone, state.integrity.status),
      meta: [
        `最新序号 #${state.integrity.latestSequence}`,
        `环境 ${state.integrity.environment}/${state.integrity.teamScope}`,
      ],
    })}
    ${calloutCard({
      kicker: "下一步",
      title: state.integrity.mismatchCount > 0
        ? `先处理 ${state.integrity.mismatchCount} 处链路异常`
        : state.integrity.isStale
          ? "建议今天补一次完整校验"
          : "当前不需要额外治理动作",
      note: state.integrity.mismatchCount > 0
        ? "在继续导出或对外提供审计证据前，先把 mismatch 清零。"
        : state.integrity.isStale
          ? "链路没有报错，但完整性结果已经变旧，建议重新验证。"
          : "最近一次完整校验仍然有效，可以继续沿用当前审计链。",
      tone: state.integrity.mismatchCount > 0 ? "critical" : state.integrity.isStale ? "warning" : "good",
      meta: [
        `Verified through #${state.integrity.verifiedThroughSequence}`,
        state.integrity.lastExport?.id ? `最近导出 ${state.integrity.lastExport.id}` : "还没有导出批次",
      ],
    })}
    ${jsonDetails("查看技术详情", state.integrity)}
  `;
}

function renderExportOverview() {
  const container = shell.pageContent.querySelector("#export-overview");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  if (!canViewGovernance(globalData)) {
    container.innerHTML = emptyState("Reviewer / Admin 登录后可查看导出 readiness。");
    return;
  }
  const latestExport = state.exports[0] || state.integrity?.lastExport || null;
  container.innerHTML = `
    ${summaryCard({
      kicker: "最近导出",
      title: latestExport ? `最近导出 ${latestExport.entryCount || 0} 条` : "尚未生成导出切片",
      note: latestExport
        ? `最近导出时间：${formatDateTime(latestExport.createdAt)}`
        : canManageAdmin(globalData)
          ? "当前还没有对外共享的审计切片。"
          : "当前没有可浏览的导出批次。",
      pillHtml: pill(latestExport ? "info" : "warn", latestExport ? "exported" : "pending"),
      meta: latestExport
        ? [
            latestExport.sequenceFrom ? `范围 #${latestExport.sequenceFrom} → #${latestExport.sequenceTo}` : "未提供序号范围",
            latestExport.manifestFileName || latestExport.dataFileName || "manifest",
          ]
        : ["建议先补一份导出作为对外交付基线"],
    })}
    ${calloutCard({
      kicker: "建议动作",
      title: latestExport ? "复核范围后再共享给外部审计方" : "先生成一份导出切片",
      note: latestExport
        ? "确认序号范围和时间窗口覆盖本次需要交付的审计证据。"
        : canManageAdmin(globalData)
          ? "管理员可以在下方折叠区直接生成新的 NDJSON + manifest。"
          : "如果需要新的导出，请联系管理员执行导出动作。",
      tone: latestExport ? "info" : "warning",
    })}
  `;
}

function renderExportControls() {
  const container = shell.pageContent.querySelector("#export-controls");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  if (!canViewGovernance(globalData)) {
    container.innerHTML = "";
    return;
  }
  if (!canManageAdmin(globalData)) {
    container.innerHTML = calloutCard({
      kicker: "权限说明",
      title: "当前角色只能查看导出历史",
      note: "创建新的导出切片仍然需要管理员权限。",
      tone: "info",
    });
    return;
  }
  container.innerHTML = `
    <details class="management-panel">
      <summary>展开导出创建面板</summary>
      <div class="panel-body">
        <p class="inline-note">建议只导出这次需要交付的序号范围或时间窗口，避免把整条账本一次性外发。</p>
        <form id="export-form" class="stack">
          <div class="form-grid">
            <label>
              Sequence From
              <input name="sequenceFrom" type="number" min="1" />
            </label>
            <label>
              Sequence To
              <input name="sequenceTo" type="number" min="1" />
            </label>
          </div>
          <div class="form-grid">
            <label>
              Created From
              <input name="createdFrom" type="datetime-local" />
            </label>
            <label>
              Created To
              <input name="createdTo" type="datetime-local" />
            </label>
          </div>
          <div class="action-row">
            <button type="submit">创建导出</button>
          </div>
        </form>
      </div>
    </details>
  `;
}

function renderExports() {
  const list = shell.pageContent.querySelector("#export-list");
  const detail = shell.pageContent.querySelector("#export-detail");
  const globalData = shell.getGlobal();
  if (!list || !detail) {
    return;
  }
  if (!canViewGovernance(globalData)) {
    list.innerHTML = emptyState("当前角色不能查看导出历史。");
    detail.innerHTML = emptyState("Reviewer / Admin 登录后可查看导出详情。");
    return;
  }
  list.innerHTML = state.exports.length
    ? state.exports.map((item) => recordButton({
        id: item.id,
        selected: item.id === state.selectedExportId,
        attribute: "data-export-id",
        title: `导出 ${item.entryCount || 0} 条`,
        note: item.label || item.summary || "审计切片导出",
        pillHtml: pill("info", item.sequenceFrom ? `#${item.sequenceFrom} → #${item.sequenceTo}` : "export"),
        meta: [formatDateTime(item.createdAt), item.dataFileName || item.manifestFileName || "manifest"],
      })).join("")
    : emptyState("还没有导出记录。");

  if (!state.selectedExportDetail) {
    detail.innerHTML = emptyState("从左侧选择一条导出批次。");
    return;
  }
  if (state.selectedExportDetail.error) {
    detail.innerHTML = emptyState(state.selectedExportDetail.error);
    return;
  }
  detail.innerHTML = `
    <div class="section-stack">
      ${summaryCard({
        kicker: "导出详情",
        title: state.selectedExportDetail.label || "审计导出",
        note: state.selectedExportDetail.manifestFileName || state.selectedExportDetail.dataFileName || "包含 NDJSON 与 manifest。",
        pillHtml: pill("info", state.selectedExportDetail.entryCount ? `${state.selectedExportDetail.entryCount} entries` : "export"),
        meta: [formatDateTime(state.selectedExportDetail.createdAt)],
      })}
      ${detailRows([
        { label: "Sequence Range", value: state.selectedExportDetail.sequenceFrom ? `#${state.selectedExportDetail.sequenceFrom} → #${state.selectedExportDetail.sequenceTo}` : "" },
        { label: "Manifest", value: state.selectedExportDetail.manifestFileName || "" },
        { label: "Data File", value: state.selectedExportDetail.dataFileName || "" },
      ])}
      ${jsonDetails("查看导出原始对象", state.selectedExportDetail)}
    </div>
  `;
}

function renderSectionMessage(selector, message) {
  const node = shell.pageContent.querySelector(selector);
  if (node) {
    node.innerHTML = emptyState(message);
  }
}
