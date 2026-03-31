import {
  api,
  canManageAdmin,
  canViewGovernance,
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
  pageId: "governance-activity",
  sectionLabel: "治理时间线",
  title: "把 Operator Activity 单独放在一页，避免挤占治理总览",
  intro: "只有 admin 才需要完整时间线。其他角色继续停留在治理总览的摘要层，不必先面对长时间线和技术对象。",
  heroActions: `
    <a class="button" href="/governance.html">返回治理总览</a>
    <a class="button ghost" href="/governance-exports.html">查看审计与导出</a>
  `,
});

const state = {
  activity: [],
  selectedActivityId: null,
  selectedActivityDetail: null,
};

renderFrame();
await refreshActivity();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">时间线摘要</p>
            <h3>先判断最近是否出现需要人工介入的治理动作</h3>
          </div>
          <button id="refresh-activity" type="button" class="ghost">刷新时间线</button>
        </div>
        <div id="activity-overview" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">当前说明</p>
            <h3>为什么这页只给管理员看</h3>
          </div>
        </div>
        <div id="activity-guidance" class="section-stack"></div>
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">Operator Activity</p>
          <h3>失败动作、最近动作与原始对象</h3>
        </div>
      </div>
      <div class="page-columns">
        <div id="activity-list" class="record-list"></div>
        <div id="activity-detail" class="detail-card detail-panel"></div>
      </div>
    </section>
  `;

  shell.pageContent.querySelector("#refresh-activity")?.addEventListener("click", () => void refreshActivity());
  shell.pageContent.querySelector("#activity-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-activity-id]");
    if (target) {
      void openActivity(target.getAttribute("data-activity-id"));
    }
  });

  renderActivityOverview();
  renderGuidance();
  renderActivity();
}

async function refreshActivity(preferredId) {
  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    state.activity = [];
    state.selectedActivityId = null;
    state.selectedActivityDetail = null;
    renderActivityOverview();
    renderGuidance();
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
  renderGuidance();
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
  renderGuidance();
  renderActivity();
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
    container.innerHTML = summaryCard({
      kicker: "时间线访问",
      title: "当前角色只看摘要，不看完整时间线",
      note: "如果完整性异常或恢复建议转为红色，再请管理员进入 Operator Activity 深挖。",
      pillHtml: pill("info", "summary_only"),
    });
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

function renderGuidance() {
  const container = shell.pageContent.querySelector("#activity-guidance");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  container.innerHTML = canManageAdmin(globalData)
    ? calloutCard({
        kicker: "管理员说明",
        title: "这页适合排查失败动作、查看 actor 和回放治理时间线",
        note: "如果当前没有失败动作，通常不需要停留在这页太久，继续回到治理总览看摘要即可。",
        tone: "info",
      })
    : calloutCard({
        kicker: "权限说明",
        title: "当前角色不看完整时间线",
        note: "非 admin 只需要在治理总览看完整性、导出 readiness 和恢复摘要。",
        tone: "info",
      });
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
    ? state.activity.map((item) => recordButton({
        id: item.id,
        selected: item.id === state.selectedActivityId,
        attribute: "data-activity-id",
        title: item.message || item.action,
        note: item.subject || "system",
        pillHtml: pill(item.outcome === "failure" ? "bad" : "info", item.action),
        meta: [formatDateTime(item.createdAt), item.actorName || "anonymous"],
      })).join("")
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
        kicker: "动作详情",
        title: state.selectedActivityDetail.message || state.selectedActivityDetail.action,
        note: state.selectedActivityDetail.subject || "system",
        pillHtml: pill(state.selectedActivityDetail.outcome === "failure" ? "bad" : "info", state.selectedActivityDetail.action),
        meta: [formatDateTime(state.selectedActivityDetail.createdAt), state.selectedActivityDetail.actorName || "anonymous"],
      })}
      ${detailRows([
        { label: "Action", value: state.selectedActivityDetail.action },
        { label: "Outcome", value: state.selectedActivityDetail.outcome },
        { label: "Actor", value: state.selectedActivityDetail.actorName },
        { label: "Role", value: state.selectedActivityDetail.actorRole },
        { label: "Subject", value: state.selectedActivityDetail.subject },
      ])}
      ${jsonDetails("查看时间线原始对象", state.selectedActivityDetail)}
    </div>
  `;
}
