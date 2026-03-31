import {
  api,
  canManageAdmin,
  canViewGovernance,
  formToObject,
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
import { formatDateTime } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "governance",
  sectionLabel: "治理中心",
  title: "先看链路状态、导出 readiness 和治理动作风险",
  intro: "治理页首屏只讲结论、风险和下一步。创建导出、查看时间线和技术对象都收进下方次级区域。",
  heroActions: `
    <a class="button" href="/recovery.html">打开恢复中心</a>
    <a class="button ghost" href="/workbench.html">返回工作台</a>
  `,
});

const state = {
  integrity: null,
  exports: [],
  selectedExportId: null,
  selectedExportDetail: null,
  activity: [],
  selectedActivityId: null,
  selectedActivityDetail: null,
};

renderFrame();
await refreshAll();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid three-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">审计链</p>
            <h3>当前完整性结论</h3>
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
            <h3>对外交付前先看导出状态</h3>
          </div>
        </div>
        <div id="export-overview" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">治理动作</p>
            <h3>最近操作与处理建议</h3>
          </div>
        </div>
        <div id="activity-overview" class="section-stack"></div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">导出历史</p>
          <h3>审计切片与 manifest</h3>
          <p class="section-copy">对外提供审计证据前，先从这里确认范围、时间和条目数量。</p>
        </div>
      </div>
      <div id="export-controls" class="section-stack"></div>
      <div class="page-columns">
        <div id="export-list" class="record-list"></div>
        <div id="export-detail" class="detail-card detail-panel"></div>
      </div>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">Operator Activity</p>
          <h3>治理动作时间线</h3>
          <p class="section-copy">只有管理员能看到完整时间线，但其他角色仍能从首屏读懂当前是否需要人工介入。</p>
        </div>
        <button id="refresh-activity" type="button" class="ghost">刷新时间线</button>
      </div>
      <div class="page-columns">
        <div id="activity-list" class="record-list"></div>
        <div id="activity-detail" class="detail-card detail-panel"></div>
      </div>
    </section>
  `;

  shell.pageContent.querySelector("#refresh-integrity")?.addEventListener("click", () => void refreshIntegrity());
  shell.pageContent.querySelector("#verify-integrity")?.addEventListener("click", () => void verifyIntegrity());
  shell.pageContent.addEventListener("submit", (event) => {
    const form = event.target.closest("form");
    if (form?.id === "export-form") {
      event.preventDefault();
      void onCreateExport(event);
    }
  });
  shell.pageContent.querySelector("#export-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-export-id]");
    if (target) {
      void openExport(target.getAttribute("data-export-id"));
    }
  });
  shell.pageContent.querySelector("#refresh-activity")?.addEventListener("click", () => void refreshActivity());
  shell.pageContent.querySelector("#activity-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-activity-id]");
    if (target) {
      void openActivity(target.getAttribute("data-activity-id"));
    }
  });

  renderIntegrity();
  renderExportOverview();
  renderExportControls();
  renderExports();
  renderActivityOverview();
  renderActivity();
}

async function refreshAll() {
  await Promise.all([refreshIntegrity(), refreshExports(), refreshActivity()]);
}

async function refreshIntegrity() {
  const globalData = shell.getGlobal();
  if (!canViewGovernance(globalData)) {
    state.integrity = null;
    renderIntegrity();
    renderExportOverview();
    renderActivityOverview();
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
  renderActivityOverview();
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
  renderActivityOverview();
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

async function onCreateExport(event) {
  const globalData = shell.getGlobal();
  const form = event.target.closest("form");
  if (!canManageAdmin(globalData)) {
    renderSectionMessage("#export-detail", "只有管理员可以创建导出。");
    return;
  }
  if (!form) {
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

async function refreshActivity(preferredId) {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    state.activity = [];
    state.selectedActivityId = null;
    state.selectedActivityDetail = null;
    renderActivityOverview();
    renderActivity();
    return;
  }
  try {
    const result = await api("/api/access-control/activity?limit=20");
    state.activity = result.events || [];
    state.selectedActivityId = preferredId || state.selectedActivityId || state.activity[0]?.id || null;
    if (state.selectedActivityId) {
      await openActivity(state.selectedActivityId);
      return;
    }
  } catch (error) {
    state.activity = [];
    state.selectedActivityDetail = { error: String(error.message || error) };
  }
  renderActivityOverview();
  renderActivity();
}

async function openActivity(activityId) {
  if (!activityId) {
    return;
  }
  state.selectedActivityId = activityId;
  renderActivity();
  try {
    const result = await api(`/api/access-control/activity/${encodeURIComponent(activityId)}`);
    state.selectedActivityDetail = result.event;
  } catch (error) {
    state.selectedActivityDetail = { error: String(error.message || error) };
  }
  renderActivityOverview();
  renderActivity();
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
  const actionTitle = state.integrity.mismatchCount > 0
    ? `先处理 ${state.integrity.mismatchCount} 处链路异常`
    : state.integrity.isStale
      ? "建议今天补一次完整校验"
      : "当前不需要额外治理动作";
  const actionNote = state.integrity.mismatchCount > 0
    ? "在继续导出或对外提供审计证据前，先把 mismatch 清零。"
    : state.integrity.isStale
      ? "链路没有报错，但完整性结果已经变旧，建议重新验证。"
      : "最近一次完整校验仍然有效，可以继续沿用当前审计链。";

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
      title: actionTitle,
      note: actionNote,
      tone: state.integrity.mismatchCount > 0 ? "critical" : state.integrity.isStale ? "warning" : "good",
      meta: [
        `Verified through #${state.integrity.verifiedThroughSequence}`,
        state.integrity.lastExport?.id ? `最近导出 ${state.integrity.lastExport.id}` : "还没有导出批次",
      ],
      content: bulletList([
        state.integrity.mismatchCount > 0 ? "先执行完整校验并检查最近变更。" : "",
        canManageAdmin(globalData) ? "管理员可以在本页下方创建新的导出切片。" : "Reviewer 可先查看导出历史和完整性摘要。",
      ]),
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
  const note = latestExport
    ? `最近导出时间：${formatDateTime(latestExport.createdAt)}`
    : canManageAdmin(globalData)
      ? "当前还没有对外共享的审计切片。"
      : "当前没有可浏览的导出批次。";

  container.innerHTML = `
    ${summaryCard({
      kicker: "最近导出",
      title: latestExport ? `最近导出 ${latestExport.entryCount || 0} 条` : "尚未生成导出切片",
      note,
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
      meta: [
        canManageAdmin(globalData) ? "管理员可创建新导出" : "当前只读",
      ],
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
    container.innerHTML = `
      ${calloutCard({
        kicker: "权限说明",
        title: "当前角色只能查看导出历史",
        note: "创建新的导出切片仍然需要管理员权限。",
        tone: "info",
      })}
    `;
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
    ? state.exports
        .map((item) =>
          recordButton({
            id: item.id,
            selected: item.id === state.selectedExportId,
            attribute: "data-export-id",
            title: `导出 ${item.entryCount || 0} 条`,
            note: item.label || item.summary || "审计切片导出",
            pillHtml: pill("info", item.sequenceFrom ? `#${item.sequenceFrom} → #${item.sequenceTo}` : "export"),
            meta: [formatDateTime(item.createdAt), item.dataFileName || item.manifestFileName || "manifest"],
          }),
        )
        .join("")
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

function renderActivityOverview() {
  const container = shell.pageContent.querySelector("#activity-overview");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  const latest = state.activity[0] || state.selectedActivityDetail || null;

  if (!canViewGovernance(globalData)) {
    container.innerHTML = emptyState("当前角色不能查看治理动作摘要。");
    return;
  }

  if (!canManageAdmin(globalData)) {
    container.innerHTML = `
      ${summaryCard({
        kicker: "时间线访问",
        title: "当前角色只看摘要，不看完整时间线",
        note: "如果完整性异常或恢复建议转为红色，再请管理员进入 Operator Activity 深挖。",
        pillHtml: pill("info", "summary-only"),
      })}
    `;
    return;
  }

  container.innerHTML = `
    ${summaryCard({
      kicker: "最近动作",
      title: latest?.message || latest?.action || "等待新的治理动作",
      note: latest?.subject || "还没有新的 admin/operator 操作记录。",
      pillHtml: pill(latest?.outcome === "failure" ? "bad" : "info", latest?.action || "activity"),
      meta: latest?.createdAt ? [formatDateTime(latest.createdAt), latest.actorName || "anonymous"] : ["时间线为空"],
    })}
    ${calloutCard({
      kicker: "处理建议",
      title: latest?.outcome === "failure" ? "建议回看失败动作详情" : "目前没有新的治理阻塞",
      note: latest?.outcome === "failure"
        ? "先确认失败动作是否影响导出、完整性校验或恢复演练。"
        : "如果最近没有失败动作，通常只需要继续关注完整性和恢复建议。",
      tone: latest?.outcome === "failure" ? "warning" : "good",
    })}
  `;
}

function renderActivity() {
  const list = shell.pageContent.querySelector("#activity-list");
  const detail = shell.pageContent.querySelector("#activity-detail");
  const globalData = shell.getGlobal();
  if (!list || !detail) {
    return;
  }
  if (!canManageAdmin(globalData)) {
    list.innerHTML = emptyState("只有 admin 可以查看 Operator Activity。");
    detail.innerHTML = emptyState("登录为 admin 后可查看操作时间线详情。");
    return;
  }

  list.innerHTML = state.activity.length
    ? state.activity
        .map((item) =>
          recordButton({
            id: item.id,
            selected: item.id === state.selectedActivityId,
            attribute: "data-activity-id",
            title: item.message || item.action,
            note: item.subject || "system",
            pillHtml: pill(item.outcome === "failure" ? "bad" : "info", item.action),
            meta: [formatDateTime(item.createdAt), item.actorName || "anonymous"],
          }),
        )
        .join("")
    : emptyState("还没有可展示的操作时间线。");

  if (!state.selectedActivityDetail) {
    detail.innerHTML = emptyState("从左侧选择一条操作事件。");
    return;
  }
  if (state.selectedActivityDetail.error) {
    detail.innerHTML = emptyState(state.selectedActivityDetail.error);
    return;
  }

  detail.innerHTML = `
    <div class="section-stack">
      ${summaryCard({
        kicker: "操作详情",
        title: state.selectedActivityDetail.message || state.selectedActivityDetail.action,
        note: state.selectedActivityDetail.subject || "system",
        pillHtml: pill(state.selectedActivityDetail.outcome === "failure" ? "bad" : "info", state.selectedActivityDetail.action),
        meta: [formatDateTime(state.selectedActivityDetail.createdAt), state.selectedActivityDetail.actorName || "anonymous"],
      })}
      ${jsonDetails("查看原始对象", state.selectedActivityDetail)}
    </div>
  `;
}

function renderSectionMessage(selector, message) {
  const node = shell.pageContent.querySelector(selector);
  if (node) {
    node.innerHTML = emptyState(message);
  }
}
