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
import { formatDateTime } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "replays",
  sectionLabel: "回放中心",
  title: "把规则变更的影响提前看清楚",
  intro: "回放页只负责比较基线与候选 Pack 的差异，不再和决策或治理模块混在一起。",
  heroActions: `
    <a class="button" href="/decisions.html">切到决策页</a>
    <a class="button ghost" href="/workbench.html">返回工作台</a>
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
            <p class="section-kicker">运行回放</p>
            <h3>对比基线与候选规则</h3>
            <p class="section-copy">把变更影响和高风险漂移单独放在一个页面里读，不再打断业务决策主路径。</p>
          </div>
        </div>
        <form id="replay-form" class="stack">
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
              基线 Pack 路径
              <input name="baselinePackPaths" value="examples/packs" />
            </label>
          </div>
          <label>
            候选 Pack 路径
            <input name="candidatePackPaths" value="examples/packs" />
          </label>
          <div class="action-row">
            <button type="submit">运行回放</button>
          </div>
        </form>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">回放摘要</p>
            <h3>先看 changed events 和风险变化</h3>
          </div>
        </div>
        <div id="replay-result" class="section-stack"></div>
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

  shell.pageContent.querySelector("#replay-form")?.addEventListener("submit", onRunReplay);
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

  renderMessage("replay-result", "正在比较规则变更影响…");
  try {
    const payload = formToObject(event.currentTarget);
    const result = await api("/api/replay/run", {
      method: "POST",
      body: JSON.stringify({
        mode: payload.mode,
        baselinePackPaths: String(payload.baselinePackPaths || "")
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
        candidatePackPaths: String(payload.candidatePackPaths || "")
          .split(/[\n,]/)
          .map((item) => item.trim())
          .filter(Boolean),
      }),
    });
    state.result = result;
    rememberAction("已运行一次规则回放");
    await shell.refreshChrome();
    await refreshHistory(result.auditRun?.id);
  } catch (error) {
    state.result = { error: String(error.message || error) };
    rememberAction(`回放失败：${String(error.message || error)}`);
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
  if (!state.result) {
    container.innerHTML = emptyState("还没有运行过新的回放。");
    return;
  }
  if (state.result.error) {
    container.innerHTML = emptyState(state.result.error);
    return;
  }
  const replay = state.result.replay || state.result;
  container.innerHTML = `
    ${summaryCard({
      kicker: "Replay Summary",
      title: replay.changed_events != null ? `变更事件 ${replay.changed_events} 个` : "回放已完成",
      note: replay.higher_risk_events != null
        ? `高风险事件 ${replay.higher_risk_events} 个，低置信事件 ${replay.lower_confidence_events} 个。`
        : "可以展开高级详情查看完整 diff。",
      pillHtml: pill("info", replay.ok === false ? "存在差异" : "已完成"),
      meta: [
        replay.compared_events != null ? `比较事件 ${replay.compared_events}` : null,
        state.result.auditRun?.createdAt ? formatDateTime(state.result.auditRun.createdAt) : null,
      ].filter(Boolean),
    })}
    ${detailRows([
      { label: "变更事件", value: replay.changed_events },
      { label: "高风险事件", value: replay.higher_risk_events },
      { label: "低置信事件", value: replay.lower_confidence_events },
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
          }),
        )
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

function renderMessage(id, message) {
  const container = shell.pageContent.querySelector(`#${id}`);
  if (container) {
    container.innerHTML = emptyState(message);
  }
}

