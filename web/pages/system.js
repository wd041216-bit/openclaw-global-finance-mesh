import { canManageAdmin, canViewSystem } from "../core/api.js";
import {
  nextActionCard,
  pill,
  sectionHubCard,
  summaryCard,
} from "../core/components.js";
import { formatDateTime } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "system",
  sectionLabel: "管理总览",
  title: "先看状态、风险和下一步，再进入具体配置页",
  intro: "系统页不再承担所有配置表单。它只负责告诉管理员身份、运行时和健康状态是否就绪，再把你引到对应子页面处理。",
  heroActions: `
    <a class="button" href="/getting-started.html?mode=admin">回到管理引导</a>
    <a class="button ghost" href="/workbench.html">切到业务区</a>
  `,
  includeMetrics: true,
});

render();

function render() {
  const globalData = shell.getGlobal();
  const overview = globalData.overview;
  const runtimeVerification = overview?.runtime?.verification || overview?.runtime?.doctorReport;
  const health = globalData.operationsHealth;

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">管理状态</p>
            <h3>先看今天管理员最该处理的事</h3>
            <p class="section-copy">如果首位管理员未初始化、runtime 未放行或备份未配置，这里会先把它们翻译成可执行的下一步。</p>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "当前入口",
            title: overview?.identity?.bootstrapRequired
              ? "先创建首个管理员"
              : overview?.identity?.authenticated
                ? "管理员会话已就绪"
                : "先登录管理员控制台",
            note: overview?.identity?.summary || "等待身份摘要",
            pillHtml: pill(
              overview?.identity?.authenticated
                ? "good"
                : overview?.identity?.bootstrapRequired
                  ? "warn"
                  : "info",
              overview?.identity?.authenticated ? "已登录" : overview?.identity?.bootstrapRequired ? "待初始化" : "未登录",
            ),
            meta: [
              overview?.identity?.sessionExpiresAt ? `会话到期 ${formatDateTime(overview.identity.sessionExpiresAt)}` : "等待浏览器 session",
              overview?.identity?.oidcConfigured ? "OIDC 已配置" : "OIDC 未配置",
            ],
          })}
          ${summaryCard({
            kicker: "试点放行",
            title: runtimeVerification?.goLiveReady ? "现在可正式试点" : runtimeVerification?.goLiveBlockers?.[0] || "先完成运行时验证",
            note: runtimeVerification?.goLiveReady
              ? `当前默认模型 ${runtimeVerification.verifiedModel || "kimi-k2.5"} 已通过真实验证。`
              : runtimeVerification?.recommendedAction || overview?.runtime?.summary || "先到运行时子页看 provider、协议和模型的阻断项。",
            pillHtml: pill(runtimeVerification?.goLiveReady ? "good" : runtimeVerification?.requiresProviderAction ? "warn" : "info", runtimeVerification?.goLiveReady ? "ready" : "blocked"),
            meta: [
              runtimeVerification?.provider?.label ? `Provider ${runtimeVerification.provider.label}` : "等待 provider 判断",
              runtimeVerification?.lastVerifiedAt ? `最近验证 ${formatDateTime(runtimeVerification.lastVerifiedAt)}` : "尚未真实验证",
            ],
          })}
          ${nextActionCard({
            kicker: "建议动作",
            title: pickSystemActionTitle(overview, runtimeVerification),
            note: pickSystemActionNote(overview, runtimeVerification),
            href: pickSystemActionHref(overview, runtimeVerification),
            buttonLabel: pickSystemActionButton(overview, runtimeVerification),
            tone: runtimeVerification?.goLiveReady && overview?.governance?.recovery?.status !== "failure" ? "good" : "warning",
            meta: overview?.experience?.globalBlockers?.slice(0, 2) || [],
          })}
        </div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">环境摘要</p>
            <h3>把系统环境先讲清楚</h3>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "环境与健康",
            title: health ? `${health.environment}/${health.teamScope}` : "等待系统健康",
            note: health?.checks?.runtime?.summary || overview?.runtime?.summary || "系统健康摘要会显示在这里。",
            pillHtml: pill(health?.checks?.runtime?.status === "healthy" ? "good" : health?.checks?.runtime?.status === "degraded" ? "warn" : "info", health?.checks?.runtime?.status || "pending"),
            meta: [
              health ? `服务已运行 ${Math.max(0, Math.round(health.uptimeSeconds / 60))} 分钟` : "等待 uptime",
              health?.metricsAvailable ? "metrics 已启用" : "metrics 未启用",
            ],
          })}
          ${summaryCard({
            kicker: "恢复与治理",
            title: overview?.governance?.recovery?.summary || "等待恢复摘要",
            note: overview?.governance?.integrity?.summary || "等待审计摘要",
            pillHtml: pill(
              overview?.governance?.recovery?.status === "failure"
                ? "bad"
                : overview?.governance?.recovery?.status === "degraded"
                  ? "warn"
                  : "info",
              overview?.governance?.recovery?.status || "pending",
            ),
            meta: [
              overview?.governance?.recovery?.lastDrillAt ? `最近演练 ${formatDateTime(overview.governance.recovery.lastDrillAt)}` : "尚未演练",
              overview?.governance?.backups?.lastBackup?.createdAt ? `最近备份 ${formatDateTime(overview.governance.backups.lastBackup.createdAt)}` : "尚未备份",
            ],
          })}
        </div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">子页面</p>
          <h3>按主题下钻，不再在总览页堆表单</h3>
          <p class="section-copy">身份、运行时、健康都拆成单独子页。总览页只保留一个主 CTA 和当前状态。</p>
        </div>
      </div>
      <div class="hub-grid two-up">
        ${sectionHubCard({
          kicker: "身份与会话",
          title: "登录、bootstrap、绑定、session",
          note: overview?.identity?.summary || "处理管理员初始化、本地令牌、OIDC 绑定和会话撤销。",
          href: "/system-identity.html",
          buttonLabel: "打开身份子页",
          pillHtml: pill(overview?.identity?.authenticated ? "good" : "warn", overview?.identity?.authenticated ? "session_ready" : "pending"),
        })}
        ${sectionHubCard({
          kicker: "运行时",
          title: "模型、探针、cloud doctor",
          note: runtimeVerification?.recommendedAction || overview?.runtime?.summary || "处理 Provider、协议、模型和 probe。",
          href: "/system-runtime.html",
          buttonLabel: "打开运行时子页",
          pillHtml: pill(runtimeVerification?.goLiveReady ? "good" : "warn", runtimeVerification?.goLiveReady ? "go_live_ready" : "needs_attention"),
        })}
        ${sectionHubCard({
          kicker: "健康与指标",
          title: "health checks、metrics、部署状态",
          note: health?.checks?.ledger?.summary || "查看 uptime、metrics、最近 probe、最近备份和恢复状态。",
          href: "/system-health.html",
          buttonLabel: "打开健康子页",
          pillHtml: pill(health?.checks?.runtime?.status === "healthy" ? "good" : "info", health?.checks?.runtime?.status || "pending"),
        })}
        ${sectionHubCard({
          kicker: "下一步",
          title: canManageAdmin(globalData) ? "继续治理或恢复链路" : canViewSystem(globalData) ? "先完成管理员登录" : "当前只读",
          note: canManageAdmin(globalData)
            ? "如果系统页已经就绪，下一步通常是审计导出或恢复演练。"
            : "未登录时也可以先读摘要，但配置动作会继续要求管理员权限。",
          href: canManageAdmin(globalData) ? "/governance.html" : "/system-identity.html",
          buttonLabel: canManageAdmin(globalData) ? "进入治理总览" : "去处理身份入口",
          pillHtml: pill(canManageAdmin(globalData) ? "info" : "warn", canManageAdmin(globalData) ? "ready_for_next" : "login_required"),
        })}
      </div>
    </section>
  `;
}

function pickSystemActionTitle(overview, runtimeVerification) {
  if (overview?.identity?.bootstrapRequired) {
    return "先创建首个管理员";
  }
  if (overview?.identity?.authEnabled && !overview?.identity?.authenticated) {
    return "先登录管理员控制台";
  }
  if (!runtimeVerification?.goLiveReady) {
    return runtimeVerification?.requiresProviderAction ? "先处理 Provider 阻断" : "先完成 Ollama Cloud 验证";
  }
  if (!overview?.governance?.backups?.configuredTargetCount) {
    return "先配置异地备份目标";
  }
  if (!overview?.governance?.recovery?.latestDrill) {
    return "先执行一次恢复演练";
  }
  return "继续完成治理与恢复检查";
}

function pickSystemActionNote(overview, runtimeVerification) {
  if (overview?.identity?.bootstrapRequired || (overview?.identity?.authEnabled && !overview?.identity?.authenticated)) {
    return overview?.identity?.summary || "先处理身份入口，再继续管理动作。";
  }
  if (!runtimeVerification?.goLiveReady) {
    return runtimeVerification?.goLiveBlockers?.[0] || runtimeVerification?.recommendedAction || "先完成真实 probe。";
  }
  if (!overview?.governance?.backups?.configuredTargetCount) {
    return "正式试点前至少要有一个 off-box 备份目标。";
  }
  return overview?.governance?.recovery?.recommendedAction || "先补 restore drill，再继续对外试点准备。";
}

function pickSystemActionHref(overview, runtimeVerification) {
  if (overview?.identity?.bootstrapRequired || (overview?.identity?.authEnabled && !overview?.identity?.authenticated)) {
    return "/system-identity.html";
  }
  if (!runtimeVerification?.goLiveReady) {
    return "/system-runtime.html";
  }
  if (!overview?.governance?.backups?.configuredTargetCount) {
    return "/recovery-backups.html";
  }
  return "/recovery-restores.html";
}

function pickSystemActionButton(overview, runtimeVerification) {
  if (overview?.identity?.bootstrapRequired) {
    return "去初始化管理员";
  }
  if (overview?.identity?.authEnabled && !overview?.identity?.authenticated) {
    return "去登录";
  }
  if (!runtimeVerification?.goLiveReady) {
    return "去验证运行时";
  }
  if (!overview?.governance?.backups?.configuredTargetCount) {
    return "去配置备份";
  }
  return "去执行演练";
}
