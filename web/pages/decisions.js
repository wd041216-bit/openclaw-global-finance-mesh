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
import {
  formatDateTime,
  formatRisk,
  splitPaths,
} from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "decisions",
  sectionLabel: "决策中心",
  title: "把业务事件读成一份可解释的 Decision Packet",
  intro: "这页只负责一件事：运行决策。输入来源、决策模式和结果解释都放成清晰步骤，不再让人先面对技术细节。",
  heroActions: `
    <a class="button" href="/workbench.html">返回工作台</a>
    <a class="button ghost" href="/library.html">先查法规依据</a>
  `,
});

const state = {
  draft: {
    sourceType: window.location.hash === "#path" ? "path" : window.location.hash === "#paste" ? "paste" : "example",
    eventPath: "",
    eventPayloadText: "",
    mode: "L1",
    packPaths: "examples/packs",
    availableEvidence: "",
  },
  result: null,
  runs: [],
  selectedRunId: null,
  selectedRunDetail: null,
};

renderFrame();
await refreshHistory();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">运行决策</p>
            <h3>按三步完成一次决策</h3>
            <p class="section-copy">先选事件来源，再选 Pack 与模式，最后查看结论、风险与建议动作。</p>
          </div>
        </div>
        <form id="decision-form" class="workflow-shell">
          ${stepCard({
            step: "01",
            title: "选择事件来源",
            note: "业务同事通常从示例事件开始；如果已有业务事件文件，也可以直接读路径或粘贴 JSON。",
            content: `
              <fieldset>
                <legend>事件来源</legend>
                <div class="choice-grid">
                  ${renderSourceChoice("example", "示例事件", "直接使用仓库自带的 SaaS 预付费示例，最快看到完整决策结果。")}
                  ${renderSourceChoice("path", "读取文件", "输入一个本地 JSON 文件路径，让控制台直接读取该业务事件。")}
                  ${renderSourceChoice("paste", "粘贴 JSON", "把业务事件直接粘贴进来，适合临时判断或复制外部系统事件。")}
                </div>
              </fieldset>
              <div class="source-inputs">
                ${renderSourceInputs()}
              </div>
            `,
          })}
          ${stepCard({
            step: "02",
            title: "选择决策模式与 Pack",
            note: "默认 L1 足够覆盖大多数业务判断；只有需要更严格审批时再切高等级。",
            content: `
              <div class="form-grid">
                <label>
                  决策等级
                  <select name="mode">
                    ${["L0", "L1", "L2", "L3"].map((mode) => `<option value="${mode}" ${state.draft.mode === mode ? "selected" : ""}>${mode}</option>`).join("")}
                  </select>
                </label>
                <label>
                  Pack 路径
                  <textarea name="packPaths" rows="3" placeholder="examples/packs">${escapeValue(state.draft.packPaths)}</textarea>
                </label>
              </div>
              <details class="technical-details advanced-only">
                <summary>补充证据线索</summary>
                <label>
                  Available evidence（可选）
                  <textarea name="availableEvidence" rows="3" placeholder="invoice, contract, approval_memo">${escapeValue(state.draft.availableEvidence)}</textarea>
                </label>
              </details>
            `,
          })}
          ${stepCard({
            step: "03",
            title: "运行并阅读摘要",
            note: "结果区会先显示结论、风险、建议动作和缺失证据，只有需要时再展开技术详情。",
            content: `
              <div class="inline-form-note">
                当前建议：先用示例事件熟悉这条路径，再切换到你的真实事件文件或粘贴 JSON。
              </div>
              <div class="action-row">
                <button type="submit">运行决策</button>
              </div>
            `,
          })}
        </form>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">结果摘要</p>
            <h3>先看结论，再决定是否下钻</h3>
            <p class="section-copy">这里不会先把 Decision Packet 砸给你，而是先用业务语言解释结果。</p>
          </div>
        </div>
        <div id="decision-result" class="result-summary"></div>
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">最近审计</p>
          <h3>最近的决策记录</h3>
          <p class="section-copy">只有 reviewer/admin 能查看完整历史；operator 仍然可以在当前页直接运行新的决策。</p>
        </div>
        <div class="section-actions">
          <button id="refresh-runs" type="button" class="ghost">刷新历史</button>
        </div>
      </div>
      <div class="page-columns">
        <div id="runs-list" class="record-list"></div>
        <div id="run-detail" class="detail-card detail-panel"></div>
      </div>
    </section>
  `;

  const form = shell.pageContent.querySelector("#decision-form");
  form?.addEventListener("submit", onRunDecision);
  form?.addEventListener("input", syncDraftFromForm);
  form?.addEventListener("change", (event) => {
    syncDraftFromForm();
    const target = event.target;
    if (target instanceof HTMLInputElement && target.name === "sourceType") {
      state.draft.sourceType = target.value;
      renderFrame();
      renderHistory();
      renderResult();
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

async function onRunDecision(event) {
  event.preventDefault();
  const globalData = shell.getGlobal();
  if (!canOperate(globalData)) {
    renderMessage("decision-result", "需要 operator 以上角色才能运行决策。");
    return;
  }

  syncDraftFromForm();
  renderMessage("decision-result", "正在生成 Decision Packet…");
  try {
    const payload = formToObject(event.currentTarget);
    const request = buildDecisionRequest(payload);
    const result = await api("/api/decision/run", {
      method: "POST",
      body: JSON.stringify(request),
    });
    state.result = result;
    rememberAction(`已运行一次业务决策：${result.decision?.decisionPacket?.summary || "Decision Packet 已生成"}`);
    await shell.refreshChrome();
    await refreshHistory(result.auditRun?.id);
  } catch (error) {
    state.result = { error: String(error.message || error) };
    rememberAction(`决策运行失败：${String(error.message || error)}`);
  }
  renderResult();
}

function buildDecisionRequest(payload) {
  const request = {
    mode: payload.mode,
    packPaths: splitPaths(payload.packPaths),
    availableEvidence: splitPaths(payload.availableEvidence),
  };
  if (payload.sourceType === "path") {
    if (!String(payload.eventPath || "").trim()) {
      throw new Error("请输入事件文件路径。");
    }
    request.eventPath = String(payload.eventPath || "").trim();
  }
  if (payload.sourceType === "paste") {
    if (!String(payload.eventPayloadText || "").trim()) {
      throw new Error("请粘贴一份事件 JSON。");
    }
    request.eventPayload = JSON.parse(String(payload.eventPayloadText || ""));
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
    state.runs = (result.runs || []).filter((item) => item.type === "decision");
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
  const container = shell.pageContent.querySelector("#decision-result");
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
      title: "还没有新的决策结果",
      note: "先选择示例事件、文件路径或粘贴 JSON，再点击“运行决策”。",
      tone: "info",
      meta: ["建议第一次先用示例事件", "技术详情默认折叠"],
      })}
    `;
    return;
  }
  if (state.result.error) {
    container.innerHTML = `${runtimeGate}${emptyState(state.result.error)}`;
    return;
  }

  const decision = state.result.decision;
  const packet = decision?.decisionPacket;
  const actionPlan = Array.isArray(packet?.action_plan) ? packet.action_plan : [];
  const missingEvidence = Array.isArray(decision?.missingEvidence) ? decision.missingEvidence : [];
  const applicablePacks = Array.isArray(packet?.applicable_packs) ? packet.applicable_packs : [];
  const matchedRules = Array.isArray(decision?.matchedRules) ? decision.matchedRules : [];
  const auditMeta = state.result.auditRun;

  container.innerHTML = `
    ${runtimeGate}
    ${summaryCard({
      kicker: "Decision Packet",
      title: packet?.summary || "决策已生成",
      note: actionPlan.length
        ? `建议动作：${actionPlan.slice(0, 2).join("；")}`
        : "没有额外建议动作，可以按当前结论继续处理。",
      pillHtml: pill("good", packet?.risk_rating ? `风险 ${formatRisk(packet.risk_rating)}` : "已生成"),
      meta: [
        packet?.confidence != null ? `置信度 ${(packet.confidence * 100).toFixed(0)}%` : null,
        auditMeta?.createdAt ? formatDateTime(auditMeta.createdAt) : null,
      ].filter(Boolean),
    })}
    <div class="summary-grid">
      ${summaryCard({
        kicker: "当前结论",
        title: packet?.accounting_treatment?.recognition || "已生成结论",
        note: packet?.tax_treatment?.vat || "税务影响与审批路径已写进 Decision Packet。",
        pillHtml: pill("info", packet?.mode || "L1"),
        meta: [
          packet?.decision_packet_id ? `Packet ${packet.decision_packet_id}` : null,
          applicablePacks.length ? `命中 Pack ${applicablePacks.length}` : "未命中 Pack",
        ].filter(Boolean),
      })}
      ${summaryCard({
        kicker: "缺失证据",
        title: missingEvidence.length ? `还缺 ${missingEvidence.length} 项证据` : "当前没有缺失证据",
        note: missingEvidence.length
          ? missingEvidence.slice(0, 3).join("；")
          : "如果需要复核，可以继续查看适用 Pack 和命中规则。",
        pillHtml: pill(missingEvidence.length ? "warn" : "good", missingEvidence.length ? "待补证据" : "证据完整"),
        meta: [matchedRules.length ? `命中规则 ${matchedRules.length}` : "暂无命中规则"],
      })}
    </div>
    ${calloutCard({
      kicker: "建议动作",
      title: actionPlan.length ? "下一步应该怎么做" : "当前不需要额外动作",
      note: missingEvidence.length
        ? "建议先补全缺失证据，再决定是否执行或升级审批。"
        : "如果这份结论要进入流程，可直接把建议动作抄给业务同事。",
      tone: missingEvidence.length ? "warning" : "good",
      content: actionPlan.length ? bulletList(actionPlan.slice(0, 5)) : "",
    })}
    ${detailRows([
      { label: "Decision Packet ID", value: packet?.decision_packet_id },
      { label: "模式", value: packet?.mode },
      { label: "风险等级", value: packet?.risk_rating ? formatRisk(packet.risk_rating) : "" },
      { label: "审计记录", value: auditMeta?.id },
      { label: "审计序号", value: auditMeta?.sequence ? `#${auditMeta.sequence}` : "" },
    ])}
    ${applicablePacks.length ? calloutCard({
      kicker: "适用规则集",
      title: `命中 ${applicablePacks.length} 个 Pack`,
      note: "如果需要解释结论来源，可以从这些 Pack 和规则版本开始追溯。",
      tone: "info",
      content: bulletList(applicablePacks.map((item) => `${item.pack_id}@${item.version} · ${item.type}`)),
    }) : ""}
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
        || "系统设置页会告诉你当前 provider、协议、验证模型和具体阻塞项。",
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
    note: "你可以直接用示例事件运行决策，再把结论给业务同事阅读。",
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
    list.innerHTML = emptyState("当前角色不能查看历史审计记录。");
    detail.innerHTML = emptyState("Reviewer / Admin 登录后可查看历史详情。");
    return;
  }

  list.innerHTML = state.runs.length
    ? state.runs
        .map((item) =>
          recordButton({
            id: item.id,
            selected: item.id === state.selectedRunId,
            attribute: "data-run-id",
            title: item.label || "决策记录",
            note: item.summary || "已生成决策结果。",
            pillHtml: pill("good", item.sequence ? `#${item.sequence}` : "decision"),
            meta: [formatDateTime(item.createdAt), item.actorName || "anonymous"],
          }))
        .join("")
    : emptyState("还没有可展示的决策审计记录。");

  if (!state.selectedRunDetail) {
    detail.innerHTML = emptyState("从左侧选择一条决策记录。");
    return;
  }
  if (state.selectedRunDetail.error) {
    detail.innerHTML = emptyState(state.selectedRunDetail.error);
    return;
  }
  detail.innerHTML = `
    <div class="section-stack">
      ${summaryCard({
        kicker: "审计详情",
        title: state.selectedRunDetail.label || "决策记录",
        note: state.selectedRunDetail.summary || "查看生成时的完整数据。",
        pillHtml: pill("info", state.selectedRunDetail.sequence ? `#${state.selectedRunDetail.sequence}` : "decision"),
        meta: [formatDateTime(state.selectedRunDetail.createdAt), state.selectedRunDetail.actorName || "anonymous"],
      })}
      ${jsonDetails("查看审计原始对象", state.selectedRunDetail)}
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
        <input name="eventPath" placeholder="examples/events/saas-annual-prepayment.json" value="${escapeValue(state.draft.eventPath)}" />
      </label>
      <p class="supporting-copy">路径支持相对于仓库根目录的 JSON 文件。</p>
    `;
  }
  if (state.draft.sourceType === "paste") {
    return `
      <label>
        事件 JSON
        <textarea name="eventPayloadText" rows="10" placeholder='{"event_id":"evt-001","event_type":"saas.annual_prepayment"}'>${escapeValue(state.draft.eventPayloadText)}</textarea>
      </label>
      <p class="supporting-copy">这里直接粘贴单个事件对象即可，系统会自动读取 event_id 和 event_type。</p>
    `;
  }
  return `
    <div class="inline-form-note">
      当前会直接读取仓库内置示例事件：<code>examples/events/saas-annual-prepayment.json</code>。
    </div>
  `;
}

function syncDraftFromForm() {
  const form = shell.pageContent.querySelector("#decision-form");
  if (!form) {
    return;
  }
  const payload = formToObject(form);
  state.draft = {
    sourceType: String(payload.sourceType || state.draft.sourceType || "example"),
    eventPath: String(payload.eventPath || ""),
    eventPayloadText: String(payload.eventPayloadText || ""),
    mode: String(payload.mode || "L1"),
    packPaths: String(payload.packPaths || ""),
    availableEvidence: String(payload.availableEvidence || ""),
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
