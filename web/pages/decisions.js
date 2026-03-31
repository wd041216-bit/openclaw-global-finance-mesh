import {
  api,
  canOperate,
  canViewGovernance,
  formToObject,
  rememberAction,
} from "../core/api.js";
import {
  detailRows,
  emptyState,
  jsonDetails,
  pill,
  recordButton,
  summaryCard,
} from "../core/components.js";
import {
  formatDateTime,
  formatRisk,
} from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "decisions",
  sectionLabel: "决策中心",
  title: "把业务事件变成可解释的 Decision Packet",
  intro: "这里只做一件事：运行决策，并把结果解释清楚。历史审计记录只作为辅助，不再和其他治理模块混排。",
  heroActions: `
    <a class="button" href="/workbench.html">返回工作台</a>
    <a class="button ghost" href="/library.html">打开依据库</a>
  `,
});

const state = {
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
            <h3>输入模式与 Pack 路径</h3>
            <p class="section-copy">业务用户从这里启动一次真实决策；更深的 JSON 只在高级详情中展开。</p>
          </div>
        </div>
        <form id="decision-form" class="stack">
          <div class="form-grid">
            <label>
              决策等级
              <select name="mode">
                <option value="L1">L1</option>
                <option value="L0">L0</option>
                <option value="L2">L2</option>
                <option value="L3">L3</option>
              </select>
            </label>
            <label>
              Pack 路径
              <input name="packPaths" value="examples/packs" placeholder="examples/packs" />
            </label>
          </div>
          <div class="action-row">
            <button type="submit">运行决策</button>
          </div>
        </form>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">结果摘要</p>
            <h3>先看结论，再看技术细节</h3>
          </div>
        </div>
        <div id="decision-result" class="section-stack"></div>
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">最近审计</p>
          <h3>最近的决策记录</h3>
          <p class="section-copy">只有 reviewer/admin 能看到完整历史；operator 仍然可以在当前页面运行新的决策。</p>
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

  shell.pageContent.querySelector("#decision-form")?.addEventListener("submit", onRunDecision);
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

  renderMessage("decision-result", "正在生成 Decision Packet…");
  try {
    const payload = formToObject(event.currentTarget);
    const result = await api("/api/decision/run", {
      method: "POST",
      body: JSON.stringify({
        mode: payload.mode,
        packPaths: String(payload.packPaths || "")
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    });
    state.result = result;
    rememberAction("已运行一次业务决策");
    await shell.refreshChrome();
    await refreshHistory(result.auditRun?.id);
  } catch (error) {
    state.result = { error: String(error.message || error) };
    rememberAction(`决策运行失败：${String(error.message || error)}`);
  }
  renderResult();
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
  if (!state.result) {
    container.innerHTML = emptyState("还没有运行过新的决策。");
    return;
  }
  if (state.result.error) {
    container.innerHTML = emptyState(state.result.error);
    return;
  }

  const packet = state.result.decision?.decisionPacket || state.result.decisionPacket || state.result.decisionPacket;
  const decisionPacket = state.result.decisionPacket || state.result.decision?.decisionPacket || state.result?.decisionPacket || state.result?.decision?.decisionPacket;
  const activePacket = decisionPacket || state.result?.decisionPacket || packet;
  const packetSummary = activePacket?.summary || "决策已生成";
  container.innerHTML = `
    ${summaryCard({
      kicker: "Decision Packet",
      title: packetSummary,
      note: activePacket?.action_plan?.length
        ? `建议动作：${activePacket.action_plan.slice(0, 2).join("；")}`
        : "可以展开高级详情查看完整 Packet。",
      pillHtml: pill("good", activePacket?.risk_rating ? `风险 ${formatRisk(activePacket.risk_rating)}` : "已生成"),
      meta: [
        activePacket?.confidence != null ? `置信度 ${(activePacket.confidence * 100).toFixed(0)}%` : null,
        state.result.auditRun?.createdAt ? formatDateTime(state.result.auditRun.createdAt) : null,
      ].filter(Boolean),
    })}
    ${detailRows([
      { label: "Decision Packet ID", value: activePacket?.decision_packet_id },
      { label: "模式", value: activePacket?.mode },
      { label: "审计记录", value: state.result.auditRun?.id },
      { label: "审计序号", value: state.result.auditRun?.sequence ? `#${state.result.auditRun.sequence}` : "" },
    ])}
    ${jsonDetails("查看技术详情", state.result)}
  `;
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
          }),
        )
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

function renderMessage(id, message) {
  const container = shell.pageContent.querySelector(`#${id}`);
  if (container) {
    container.innerHTML = emptyState(message);
  }
}

