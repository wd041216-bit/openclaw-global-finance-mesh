import {
  api,
  canOperate,
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
  stepCard,
  summaryCard,
} from "../core/components.js";
import { formatDateTime, splitPaths } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "replays",
  sectionLabel: "回放中心",
  title: "在规则发布前先看清楚影响面",
  intro: "回放页只负责对比基线与候选规则。输入来源、Pack 选择和差异解释全部拆成步骤，让非技术用户也能读懂。",
  heroActions: `
    <a class="button" href="/decisions.html">切到决策页</a>
    <a class="button ghost" href="/workbench.html">返回工作台</a>
  `,
});

const state = {
  draft: {
    sourceType: window.location.hash === "#path" ? "path" : window.location.hash === "#paste" ? "paste" : "example",
    eventPaths: "",
    eventsText: "",
    mode: "L1",
    baselinePackPaths: "examples/packs",
    candidatePackPaths: "examples/packs",
  },
  result: null,
  runs: [],
  selectedRunId: null,
  selectedRunDetail: null,
};

renderFrame();
await refreshHistory();

function renderFrame() {
  const runtimeVerification = shell.getGlobal().overview?.runtime?.verification || shell.getGlobal().overview?.runtime?.doctorReport;
  const runtimeReady = Boolean(runtimeVerification?.goLiveReady);
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">运行回放</p>
            <h3>按三步看清规则漂移</h3>
            <p class="section-copy">先选择事件来源，再选择基线与候选 Pack，最后集中看差异、风险变化和建议动作。</p>
          </div>
        </div>
        ${runtimeReady
          ? ""
          : calloutCard({
              kicker: "当前阻断",
              title: "先完成运行时验证，再做真实规则回放",
              note: runtimeVerification?.goLiveBlockers?.[0]
                || runtimeVerification?.recommendedAction
                || "系统运行时还没有通过正式试点验证。",
              tone: "warning",
              content: `<div class="action-row"><a class="button ghost" href="/system-runtime.html">去处理运行时</a></div>`,
            })}
        <form id="replay-form" class="workflow-shell">
          ${stepCard({
            step: "01",
            title: "选择事件来源",
            note: "第一次使用建议直接跑示例；如果你已经有历史事件文件，也可以直接读取路径或粘贴事件数组。",
            content: `
              <fieldset>
                <legend>事件来源</legend>
                <div class="choice-grid">
                  ${renderSourceChoice("example", "示例事件", "直接使用仓库示例事件，最快体验回放摘要。")}
                  ${renderSourceChoice("path", "读取文件", "输入一个或多个本地事件 JSON 文件路径。")}
                  ${renderSourceChoice("paste", "粘贴事件", "粘贴单个事件对象或事件数组，适合临时分析。")}
                </div>
              </fieldset>
              <div class="source-inputs">
                ${renderSourceInputs()}
              </div>
            `,
          })}
          ${stepCard({
            step: "02",
            title: "选择基线与候选 Pack",
            note: "把当前线上规则放在基线，把待发布规则放在候选位，就能看到哪些事件会发生变化。",
            content: `
              <div class="form-grid">
                <label>
                  决策等级
                  <select name="mode">
                    ${["L0", "L1", "L2", "L3"].map((mode) => `<option value="${mode}" ${state.draft.mode === mode ? "selected" : ""}>${mode}</option>`).join("")}
                  </select>
                </label>
                <label>
                  基线 Pack 路径
                  <textarea name="baselinePackPaths" rows="3">${escapeValue(state.draft.baselinePackPaths)}</textarea>
                </label>
              </div>
              <label>
                候选 Pack 路径
                <textarea name="candidatePackPaths" rows="3">${escapeValue(state.draft.candidatePackPaths)}</textarea>
              </label>
            `,
          })}
          ${stepCard({
            step: "03",
            title: "运行并阅读差异摘要",
            note: "结果区会先告诉你 changed events、高风险上升和低置信漂移，不要求你先读 diff JSON。",
            content: `
              <div class="inline-form-note">
                ${runtimeReady
                  ? "如果只是想确认当前候选规则没有引入意外变化，先让基线和候选都指向示例 Pack 即可。"
                  : "当前还没通过运行时放行验证。先到系统运行时子页处理 provider、协议或模型问题。"}
              </div>
              <div class="action-row">
                <button type="submit">运行回放</button>
              </div>
            `,
          })}
        </form>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">回放摘要</p>
            <h3>先看 changed events 和高风险差异</h3>
            <p class="section-copy">结果会优先回答“有没有风险上升”和“该先看哪几个事件”，而不是直接扔出全部 diff。</p>
          </div>
        </div>
        <div id="replay-result" class="result-summary"></div>
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">最近审计</p>
          <h3>最近的回放记录</h3>
        </div>
        <button id="refresh-runs" type="button" class="ghost">刷新历史</button>
      </div>
      <div class="page-columns">
        <div id="runs-list" class="record-list"></div>
        <div id="run-detail" class="detail-card detail-panel"></div>
      </div>
    </section>
  `;

  const form = shell.pageContent.querySelector("#replay-form");
  form?.addEventListener("submit", onRunReplay);
  form?.addEventListener("input", syncDraftFromForm);
  form?.addEventListener("change", (event) => {
    syncDraftFromForm();
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === "sourceType") {
      state.draft.sourceType = target.value;
      renderFrame();
      renderResult();
      renderHistory();
    }
  });

  shell.pageContent.querySelector("#refresh-runs")?.addEventListener("click", () => {
    void refreshHistory();
  });
  shell.pageContent.querySelector("#runs-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-run-id]");
    if (!target) {
      return;
    }
    void openRun(target.getAttribute("data-run-id"));
  });

  renderResult();
  renderHistory();
}

async function onRunReplay(event) {
  event.preventDefault();
  const globalData = shell.getGlobal();
  if (!canOperate(globalData)) {
    renderMessage("replay-result", "需要 operator 以上角色才能运行回放。");
    return;
  }

  syncDraftFromForm();
  renderMessage("replay-result", "正在比较规则变更影响…");
  try {
    const payload = formToObject(event.currentTarget);
    const request = buildReplayRequest(payload);
    const result = await api("/api/replay/run", {
      method: "POST",
      body: JSON.stringify(request),
    });
    state.result = result;
    rememberAction(`已运行一次规则回放：${result.replay?.changed_events ?? 0} 个事件发生变化`);
    await shell.refreshChrome();
    await refreshHistory(result.auditRun?.id);
  } catch (error) {
    state.result = { error: String(error.message || error) };
    rememberAction(`回放失败：${String(error.message || error)}`);
  }
  renderResult();
}

function buildReplayRequest(payload) {
  const request = {
    mode: payload.mode,
    baselinePackPaths: splitPaths(payload.baselinePackPaths),
    candidatePackPaths: splitPaths(payload.candidatePackPaths),
  };
  if (payload.sourceType === "path") {
    const eventPaths = splitPaths(payload.eventPaths);
    if (!eventPaths.length) {
      throw new Error("请输入至少一个事件文件路径。");
    }
    request.eventPaths = eventPaths;
  }
  if (payload.sourceType === "paste") {
    if (!String(payload.eventsText || "").trim()) {
      throw new Error("请粘贴单个事件对象或事件数组。");
    }
    const parsed = JSON.parse(String(payload.eventsText || ""));
    request.events = Array.isArray(parsed) ? parsed : [parsed];
  }
  return request;
}

async function refreshHistory(preferredId) {
  const globalData = shell.getGlobal();
  if (!canViewGovernance(globalData)) {
    state.runs = [];
    state.selectedRunId = null;
    state.selectedRunDetail = null;
    renderHistory();
    return;
  }

  try {
    const result = await api("/api/audit/runs?limit=12");
    state.runs = (result.runs || []).filter((item) => item.type === "replay");
    state.selectedRunId = preferredId || state.selectedRunId || state.runs[0]?.id || null;
    if (state.selectedRunId) {
      await openRun(state.selectedRunId);
      return;
    }
  } catch (error) {
    state.runs = [];
    state.selectedRunDetail = { error: String(error.message || error) };
  }
  renderHistory();
}

async function openRun(runId) {
  if (!runId) {
    return;
  }
  state.selectedRunId = runId;
  renderHistory();
  try {
    const result = await api(`/api/audit/runs/${encodeURIComponent(runId)}`);
    state.selectedRunDetail = result.run;
  } catch (error) {
    state.selectedRunDetail = { error: String(error.message || error) };
  }
  renderHistory();
}

function renderResult() {
  const container = shell.pageContent.querySelector("#replay-result");
  if (!container) {
    return;
  }
  const verification = shell.getGlobal().overview?.runtime?.verification || shell.getGlobal().overview?.runtime?.doctorReport;
  const runtimeGate = renderRuntimeGateCallout(verification);
  if (!state.result) {
    container.innerHTML = `
      ${runtimeGate}
      ${calloutCard({
      kicker: "等待运行",
      title: "还没有新的回放结果",
      note: "先选择事件来源与基线/候选 Pack，再点击“运行回放”。",
      tone: "info",
      meta: ["建议第一次先用示例事件", "高风险差异会单独高亮"],
      })}
    `;
    return;
  }
  if (state.result.error) {
    container.innerHTML = `${runtimeGate}${emptyState(state.result.error)}`;
    return;
  }
  const replay = state.result.replay || state.result;
  const diffs = Array.isArray(replay.diffs) ? replay.diffs : [];
  const topDiffs = diffs.slice(0, 3).map((item) => {
    const changedFields = Array.isArray(item.changed_fields) ? item.changed_fields.join("、") : "无";
    return `${item.event_id || "unknown"}：${item.candidate_summary || "候选摘要未提供"}（变化字段：${changedFields}）`;
  });

  container.innerHTML = `
    ${runtimeGate}
    ${summaryCard({
      kicker: "Replay Summary",
      title: replay.changed_events != null ? `共有 ${replay.changed_events} 个事件发生变化` : "回放已完成",
      note: replay.higher_risk_events != null
        ? `高风险上升 ${replay.higher_risk_events} 个，低置信下降 ${replay.lower_confidence_events} 个。`
        : "可以展开高级详情查看完整 diff。",
      pillHtml: pill(replay.changed_events > 0 ? "warn" : "good", replay.changed_events > 0 ? "发现变化" : "没有变化"),
      meta: [
        replay.compared_events != null ? `比较事件 ${replay.compared_events}` : null,
        state.result.auditRun?.createdAt ? formatDateTime(state.result.auditRun.createdAt) : null,
      ].filter(Boolean),
    })}
    <div class="summary-grid">
      ${summaryCard({
        kicker: "重点变化",
        title: replay.higher_risk_events ? `${replay.higher_risk_events} 个事件风险上升` : "没有发现风险上升",
        note: replay.higher_risk_events
          ? "建议先优先检查这些事件对应的规则差异。"
          : "当前候选规则没有让风险等级进一步恶化。",
        pillHtml: pill(replay.higher_risk_events ? "warn" : "good", replay.higher_risk_events ? "先复核" : "状态稳定"),
        meta: [
          replay.lower_confidence_events != null ? `低置信下降 ${replay.lower_confidence_events}` : null,
        ].filter(Boolean),
      })}
      ${summaryCard({
        kicker: "发布建议",
        title: replay.changed_events ? "建议先复核变化事件" : "当前可以继续推进发布评审",
        note: replay.changed_events
          ? "先阅读下方前三个差异事件，再决定是否继续发布。"
          : "如果其他治理项也正常，可以进入发布评审。",
        pillHtml: pill("info", state.result.auditRun?.sequence ? `#${state.result.auditRun.sequence}` : "replay"),
        meta: [
          replay.ok === false ? "回放存在异常" : "回放已完成",
        ],
      })}
    </div>
    ${topDiffs.length ? calloutCard({
      kicker: "优先查看",
      title: "先看这几个变化事件",
      note: "这里只保留最需要先看的差异，完整 diff 仍然可以在高级详情里展开。",
      tone: replay.higher_risk_events ? "warning" : "info",
      content: bulletList(topDiffs),
    }) : ""}
    ${detailRows([
      { label: "变更事件", value: replay.changed_events },
      { label: "高风险事件", value: replay.higher_risk_events },
      { label: "低置信事件", value: replay.lower_confidence_events },
      { label: "审计序号", value: state.result.auditRun?.sequence ? `#${state.result.auditRun.sequence}` : "" },
    ])}
    ${jsonDetails("查看技术详情", state.result)}
  `;
}

function renderRuntimeGateCallout(verification) {
  if (!verification?.goLiveReady) {
    return calloutCard({
      kicker: "试点提示",
      title: verification?.requiresProviderAction ? "Provider 侧还需要放行推理权限" : "建议先完成 Ollama Cloud 验证",
      note: verification?.goLiveBlockers?.[0]
        || verification?.blockedReason
        || "回放流程已经就绪，但正式试点前仍建议先在系统设置页完成 runtime 放行。",
      tone: verification?.requiresProviderAction ? "warning" : "info",
      meta: [
        verification?.provider?.label ? `Provider ${verification.provider.label}` : "入口：系统设置",
        verification?.verifiedModel ? `已验证模型 ${verification.verifiedModel}` : "默认模型 kimi-k2.5",
      ],
    });
  }

  return calloutCard({
    kicker: "试点状态",
    title: "当前运行时已通过正式试点放行",
    note: "可以直接运行示例回放，先看 changed events 和高风险变化，再决定是否发布。",
    tone: "good",
    meta: [
      verification?.provider?.label ? `Provider ${verification.provider.label}` : null,
      verification?.verifiedModel ? `模型 ${verification.verifiedModel}` : null,
    ].filter(Boolean),
  });
}

function renderHistory() {
  const list = shell.pageContent.querySelector("#runs-list");
  const detail = shell.pageContent.querySelector("#run-detail");
  const globalData = shell.getGlobal();
  if (!list || !detail) {
    return;
  }

  if (!canViewGovernance(globalData)) {
    list.innerHTML = emptyState("当前角色不能查看历史回放记录。");
    detail.innerHTML = emptyState("Reviewer / Admin 登录后可查看回放审计详情。");
    return;
  }

  list.innerHTML = state.runs.length
    ? state.runs
        .map((item) =>
          recordButton({
            id: item.id,
            selected: item.id === state.selectedRunId,
            attribute: "data-run-id",
            title: item.label || "回放记录",
            note: item.summary || "已生成回放摘要。",
            pillHtml: pill("info", item.sequence ? `#${item.sequence}` : "replay"),
            meta: [formatDateTime(item.createdAt), item.actorName || "anonymous"],
          }))
        .join("")
    : emptyState("还没有可展示的回放记录。");

  if (!state.selectedRunDetail) {
    detail.innerHTML = emptyState("从左侧选择一条回放记录。");
    return;
  }
  if (state.selectedRunDetail.error) {
    detail.innerHTML = emptyState(state.selectedRunDetail.error);
    return;
  }
  detail.innerHTML = `
    <div class="section-stack">
      ${summaryCard({
        kicker: "回放详情",
        title: state.selectedRunDetail.label || "回放记录",
        note: state.selectedRunDetail.summary || "查看完整回放对象。",
        pillHtml: pill("info", state.selectedRunDetail.sequence ? `#${state.selectedRunDetail.sequence}` : "replay"),
        meta: [formatDateTime(state.selectedRunDetail.createdAt), state.selectedRunDetail.actorName || "anonymous"],
      })}
      ${jsonDetails("查看回放原始对象", state.selectedRunDetail)}
    </div>
  `;
}

function renderSourceChoice(value, label, note) {
  return `
    <label class="choice-card ${state.draft.sourceType === value ? "active" : ""}">
      <span class="choice-head">
        <input name="sourceType" type="radio" value="${value}" ${state.draft.sourceType === value ? "checked" : ""} />
        <strong>${label}</strong>
      </span>
      <p class="choice-note">${note}</p>
    </label>
  `;
}

function renderSourceInputs() {
  if (state.draft.sourceType === "path") {
    return `
      <label>
        事件文件路径
        <textarea name="eventPaths" rows="4" placeholder="examples/events/saas-annual-prepayment.json">${escapeValue(state.draft.eventPaths)}</textarea>
      </label>
      <p class="supporting-copy">支持一行一个路径，或用逗号分隔多个 JSON 文件。</p>
    `;
  }
  if (state.draft.sourceType === "paste") {
    return `
      <label>
        事件对象或事件数组
        <textarea name="eventsText" rows="10" placeholder='[{"event_id":"evt-001","event_type":"saas.annual_prepayment"}]'>${escapeValue(state.draft.eventsText)}</textarea>
      </label>
      <p class="supporting-copy">既支持单个对象，也支持事件数组；系统会自动转换成回放所需的事件列表。</p>
    `;
  }
  return `
    <div class="inline-form-note">
      当前会直接使用仓库示例事件作为回放输入，适合先熟悉 changed events、高风险变化和置信度下降的摘要。
    </div>
  `;
}

function syncDraftFromForm() {
  const form = shell.pageContent.querySelector("#replay-form");
  if (!form) {
    return;
  }
  const payload = formToObject(form);
  state.draft = {
    sourceType: String(payload.sourceType || state.draft.sourceType || "example"),
    eventPaths: String(payload.eventPaths || ""),
    eventsText: String(payload.eventsText || ""),
    mode: String(payload.mode || "L1"),
    baselinePackPaths: String(payload.baselinePackPaths || ""),
    candidatePackPaths: String(payload.candidatePackPaths || ""),
  };
}

function renderMessage(id, message) {
  const container = shell.pageContent.querySelector(`#${id}`);
  if (container) {
    container.innerHTML = emptyState(message);
  }
}

function escapeValue(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
