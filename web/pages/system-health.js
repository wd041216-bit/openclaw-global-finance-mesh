import { canViewSystem, fetchText } from "../core/api.js";
import {
  calloutCard,
  detailRows,
  emptyState,
  jsonDetails,
  pill,
  summaryCard,
} from "../core/components.js";
import { formatDateTime, humanizeSeconds } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "system-health",
  sectionLabel: "健康与指标",
  title: "把部署状态、健康检查和指标预览单独收口",
  intro: "健康页不讨论身份与模型配置，只讲服务是否稳定、最近 probe/备份/恢复是否正常，以及 metrics 是否能抓到。",
  heroActions: `
    <a class="button" href="/system.html">返回管理总览</a>
    <a class="button ghost" href="/system-runtime.html">打开运行时</a>
  `,
  includeMetrics: true,
});

const state = {
  metrics: "",
  metricsError: "",
};

render();
await refreshMetrics();

async function refreshMetrics() {
  const globalData = shell.getGlobal();
  if (!canViewSystem(globalData)) {
    state.metrics = "";
    state.metricsError = "登录后才能查看健康与指标。";
    render();
    return;
  }
  try {
    state.metrics = await fetchText("/api/metrics");
    state.metricsError = "";
  } catch (error) {
    state.metrics = "";
    state.metricsError = String(error.message || error);
  }
  render();
}

function render() {
  const globalData = shell.getGlobal();
  const health = globalData.operationsHealth;
  const overview = globalData.overview;
  const runtimeVerification = overview?.runtime?.verification || overview?.runtime?.doctorReport;

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">系统状态</p>
            <h3>先看服务是否稳定</h3>
          </div>
          <button id="refresh-health" type="button" class="ghost">刷新</button>
        </div>
        ${
          !canViewSystem(globalData)
            ? emptyState("登录后才能查看健康与指标。")
            : `
              <div class="summary-grid">
                ${summaryCard({
                  kicker: "服务健康",
                  title: health ? `${health.environment}/${health.teamScope}` : "等待健康状态",
                  note: health?.checks?.runtime?.summary || overview?.runtime?.summary || "等待运行时检查结果。",
                  pillHtml: pill(
                    health?.checks?.runtime?.status === "healthy"
                      ? "good"
                      : health?.checks?.runtime?.status === "degraded"
                        ? "warn"
                        : "info",
                    health?.checks?.runtime?.status || "pending",
                  ),
                  meta: [
                    health ? `已运行 ${humanizeSeconds(health.uptimeSeconds)}` : "等待 uptime",
                    health?.metricsAvailable ? "metrics 已启用" : "metrics 未启用",
                  ],
                })}
                ${summaryCard({
                  kicker: "最近运行",
                  title: runtimeVerification?.goLiveReady ? "运行时已放行" : runtimeVerification?.goLiveBlockers?.[0] || "等待运行时放行",
                  note: runtimeVerification?.recommendedAction || "系统页和运行时页会继续说明 provider、协议和模型的状态。",
                  pillHtml: pill(runtimeVerification?.goLiveReady ? "good" : "warn", runtimeVerification?.goLiveReady ? "go_live_ready" : "needs_attention"),
                  meta: [
                    health?.recent?.probe?.createdAt ? `最近 probe ${formatDateTime(health.recent.probe.createdAt)}` : "尚未 probe",
                    health?.recent?.backup?.createdAt ? `最近备份 ${formatDateTime(health.recent.backup.createdAt)}` : "尚未备份",
                    health?.recent?.restoreDrill?.createdAt ? `最近演练 ${formatDateTime(health.recent.restoreDrill.createdAt)}` : "尚未演练",
                  ],
                })}
                ${calloutCard({
                  kicker: "下一步",
                  title: pickHealthActionTitle(health, runtimeVerification),
                  note: pickHealthActionNote(health, runtimeVerification),
                  tone: health?.checks?.runtime?.status === "healthy" && health?.checks?.recoveryDrill?.status === "healthy" ? "good" : "warning",
                })}
              </div>
            `
        }
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">检查项</p>
            <h3>不要只看一个总状态</h3>
          </div>
        </div>
        ${
          !health
            ? emptyState("等待 health check 数据。")
            : `
              <div class="summary-grid">
                ${renderCheckCard("运行时", health.checks.runtime)}
                ${renderCheckCard("审计账本", health.checks.ledger)}
                ${renderCheckCard("依据库", health.checks.legalLibrary)}
                ${renderCheckCard("备份目标", health.checks.backupTargets)}
                ${renderCheckCard("恢复演练", health.checks.recoveryDrill)}
              </div>
            `
        }
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">Metrics</p>
          <h3>Prometheus 文本预览</h3>
        </div>
        <button id="refresh-metrics" type="button" class="ghost">刷新 metrics</button>
      </div>
      ${
        state.metricsError
          ? emptyState(state.metricsError)
          : state.metrics
            ? jsonDetails("查看 metrics 文本", state.metrics)
            : emptyState("等待 metrics 内容。")
      }
    </section>
  `;

  shell.pageContent.querySelector("#refresh-health")?.addEventListener("click", async () => {
    await shell.refreshChrome();
    render();
  });
  shell.pageContent.querySelector("#refresh-metrics")?.addEventListener("click", () => {
    void refreshMetrics();
  });
}

function renderCheckCard(title, check) {
  return summaryCard({
    kicker: title,
    title: check?.summary || "等待检查摘要",
    note: check?.detail?.provider
      ? `Provider ${check.detail.provider}`
      : check?.detail?.service
        ? `服务 ${check.detail.service}`
        : "继续到对应子页查看细节。",
    pillHtml: pill(
      check?.status === "healthy"
        ? "good"
        : check?.status === "degraded"
          ? "warn"
          : "info",
      check?.status || "pending",
    ),
    meta: [
      check?.checkedAt ? `检查时间 ${formatDateTime(check.checkedAt)}` : "等待检查时间",
    ],
  });
}

function pickHealthActionTitle(health, runtimeVerification) {
  if (!runtimeVerification?.goLiveReady) {
    return "先回到运行时子页完成验证";
  }
  if (health?.checks?.backupTargets?.status !== "healthy") {
    return "先检查备份目标";
  }
  if (health?.checks?.recoveryDrill?.status !== "healthy") {
    return "先补一次恢复演练";
  }
  return "系统健康链路已经相对稳定";
}

function pickHealthActionNote(health, runtimeVerification) {
  if (!runtimeVerification?.goLiveReady) {
    return runtimeVerification?.goLiveBlockers?.[0] || runtimeVerification?.recommendedAction || "先完成真实 probe。";
  }
  if (health?.checks?.backupTargets?.status !== "healthy") {
    return health?.checks?.backupTargets?.summary || "至少保证一个 off-box 目标成功。";
  }
  if (health?.checks?.recoveryDrill?.status !== "healthy") {
    return health?.checks?.recoveryDrill?.summary || "恢复演练仍然需要处理。";
  }
  return "如果今天没有新的配置变更，继续保持定期 probe、备份和 restore drill。";
}
