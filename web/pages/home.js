import {
  getPreferredConsoleMode,
  setPreferredConsoleMode,
  setPreferredRoleEntry,
} from "../core/api.js";
import {
  modeCard,
  nextActionCard,
  pill,
  sectionHubCard,
  summaryCard,
} from "../core/components.js";
import { formatDateTime, formatRole, humanizeSeconds } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "home",
  sectionLabel: "角色切换首页",
  title: "先选今天要做的事，再进入正确的控制台路径",
  intro: "首页不再承载重操作。它只负责告诉业务同学从哪里开始，也告诉管理员当前系统是否已经达到正式试点放行条件。",
  heroActions: `
    <a class="button" href="/getting-started.html?mode=business">进入业务引导</a>
    <a class="button ghost" href="/getting-started.html?mode=admin">进入管理引导</a>
  `,
});

render();

shell.pageContent.addEventListener("click", (event) => {
  const target = event.target.closest("[data-console-mode], [data-preferred-entry]");
  if (!target) {
    return;
  }
  const consoleMode = target.getAttribute("data-console-mode");
  if (consoleMode === "business" || consoleMode === "admin") {
    setPreferredConsoleMode(consoleMode);
    render();
  }
  const preferredEntry = target.getAttribute("data-preferred-entry");
  if (preferredEntry) {
    setPreferredRoleEntry(preferredEntry);
  }
});

function render() {
  const globalData = shell.getGlobal();
  const overview = globalData.overview;
  const health = globalData.operationsHealth;
  const actor = globalData.access?.session?.actor;
  const experience = overview?.experience;
  const preferredMode = getPreferredConsoleMode(globalData);
  const runtimeVerification = overview?.runtime?.verification || overview?.runtime?.doctorReport;

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">角色入口</p>
            <h3>我今天要做业务，还是要管理系统？</h3>
            <p class="section-copy">把两类人群的起点分开，避免业务同学第一次进来就撞上治理、恢复和运行时配置。</p>
          </div>
        </div>
        <div class="mode-grid two-up">
          ${modeCard({
            title: "业务模式",
            note: "适合财务、法务、风控、运营。先跑示例决策，再看回放与依据库，不先面对系统设置。",
            href: "/getting-started.html?mode=business",
            buttonLabel: "从业务引导开始",
            active: preferredMode === "business",
            pillHtml: pill(preferredMode === "business" ? "good" : "info", preferredMode === "business" ? "当前偏好" : experience?.businessStatusLabel || "建议路径"),
            meta: [
              experience?.businessStatusLabel || "先登录并验证 runtime",
              overview?.decisioning?.lastDecision?.label ? `最近决策 ${overview.decisioning.lastDecision.label}` : "可直接跑示例决策",
            ],
          })}
          ${modeCard({
            title: "管理模式",
            note: "适合管理员、reviewer、系统 owner。先看放行状态，再去身份、运行时、治理与恢复子页面。",
            href: "/getting-started.html?mode=admin",
            buttonLabel: "从管理引导开始",
            active: preferredMode === "admin",
            pillHtml: pill(preferredMode === "admin" ? "good" : "warn", preferredMode === "admin" ? "当前偏好" : experience?.adminStatusLabel || "存在待处理项"),
            meta: [
              experience?.adminStatusLabel || "先完成 bootstrap / runtime / 备份",
              runtimeVerification?.goLiveReady ? "当前可正式试点" : "仍有放行阻断项",
            ],
          })}
        </div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">当前环境</p>
            <h3>一眼看清现在能不能正式使用</h3>
            <p class="section-copy">把登录状态、试点放行状态和当前环境放在第一屏，不需要先进入系统页才知道发生了什么。</p>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "登录状态",
            title: actor ? `${actor.name} · ${formatRole(actor.role)}` : globalData.access?.config?.enabled ? "等待登录" : "开放模式",
            note: actor
              ? "当前浏览器会话已经建立，可继续进入业务或管理路径。"
              : globalData.access?.config?.bootstrapRequired
                ? "先创建首个管理员，之后才能启用受保护控制台。"
                : globalData.access?.config?.enabled
                  ? "未登录时仍可浏览首页和引导页，但受保护动作需要先登录。"
                  : "当前控制台处于开放模式，适合先阅读业务摘要。",
            pillHtml: pill(
              actor ? "good" : globalData.access?.config?.bootstrapRequired ? "warn" : globalData.access?.config?.enabled ? "info" : "neutral",
              actor ? "已登录" : globalData.access?.config?.bootstrapRequired ? "待初始化" : globalData.access?.config?.enabled ? "未登录" : "开放模式",
            ),
            meta: [
              health ? `${health.environment}/${health.teamScope}` : "环境未知",
              health ? `已运行 ${humanizeSeconds(health.uptimeSeconds)}` : "等待健康数据",
            ],
          })}
          ${summaryCard({
            kicker: "试点放行状态",
            title: runtimeVerification?.goLiveReady ? "现在可正式试点" : runtimeVerification?.goLiveBlockers?.[0] || "先完成运行时验证",
            note: runtimeVerification?.goLiveReady
              ? `当前默认模型 ${runtimeVerification.verifiedModel || "kimi-k2.5"} 已通过真实推理验证。`
              : runtimeVerification?.recommendedAction || overview?.runtime?.summary || "系统设置页会继续拆出 provider、协议和模型的具体阻塞点。",
            pillHtml: pill(
              runtimeVerification?.goLiveReady ? "good" : runtimeVerification?.requiresProviderAction ? "warn" : "info",
              runtimeVerification?.goLiveReady ? "可正式试点" : "待放行",
            ),
            meta: [
              runtimeVerification?.provider?.label ? `Provider ${runtimeVerification.provider.label}` : null,
              runtimeVerification?.validatedFlavorLabel ? `协议 ${runtimeVerification.validatedFlavorLabel}` : null,
              runtimeVerification?.lastVerifiedAt ? `最近验证 ${formatDateTime(runtimeVerification.lastVerifiedAt)}` : "尚未完成真实验证",
            ].filter(Boolean),
          })}
          ${summaryCard({
            kicker: "全局阻断",
            title: experience?.globalBlockers?.length ? `${experience.globalBlockers.length} 项待处理` : "当前没有全局阻断",
            note: experience?.globalBlockers?.length
              ? experience.globalBlockers.join(" ")
              : "你可以直接从开始使用页进入业务或管理链路。",
            pillHtml: pill(experience?.globalBlockers?.length ? "warn" : "good", experience?.globalBlockers?.length ? "需处理" : "已就绪"),
            meta: [
              overview?.governance?.integrity?.summary || "等待治理摘要",
              overview?.governance?.recovery?.summary || "等待恢复摘要",
            ],
          })}
        </div>
      </article>
    </section>

    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">推荐入口</p>
            <h3>把复杂能力继续往下钻</h3>
            <p class="section-copy">首页只给入口和状态，真正的执行与管理动作继续 cascade 到更聚焦的子页面。</p>
          </div>
        </div>
        <div class="hub-grid two-up">
          ${sectionHubCard({
            kicker: "业务区",
            title: "业务工作台",
            note: "推荐任务、最近结论和建议路径，适合作为业务同学的默认落点。",
            href: "/workbench.html",
            buttonLabel: "进入业务区",
            meta: [experience?.businessStatusLabel || "从示例决策开始"],
            pillHtml: pill("info", "业务"),
          })}
          ${sectionHubCard({
            kicker: "管理区",
            title: "管理总览",
            note: "系统、治理、恢复都先看摘要，再进入身份、runtime、导出和演练子页面。",
            href: "/system.html",
            buttonLabel: "进入管理区",
            meta: [experience?.adminStatusLabel || "从管理员引导开始"],
            pillHtml: pill("warn", "管理"),
          })}
          ${sectionHubCard({
            kicker: "开始使用",
            title: "分角色引导页",
            note: "把登录、runtime 验证、示例决策、备份与 restore drill 收成可执行清单。",
            href: `/getting-started.html?mode=${preferredMode}`,
            buttonLabel: "打开引导",
            meta: ["业务模式 / 管理模式双轨"],
            pillHtml: pill("good", "向导"),
          })}
          ${sectionHubCard({
            kicker: "兼容层",
            title: "Agent Hub",
            note: "继续查看 OpenClaw、Claude、Manus、Cursor、Cline、Cherry Studio 的接入方式，但不会干扰主业务路径。",
            href: "/agents.html",
            buttonLabel: "查看 Agent Hub",
            meta: ["统一 adapter registry", experience?.nextRecommendedInstall ? `建议先接入 ${experience.nextRecommendedInstall.title}` : "共享 MCP 入口"],
            pillHtml: pill("info", "Agent"),
          })}
        </div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">下一步动作</p>
            <h3>不让第一次进入的人卡在空白页</h3>
          </div>
        </div>
        <div class="stack">
          ${nextActionCard({
            kicker: "业务同学",
            title: "2-3 次点击内进入正确功能页",
            note: actor
              ? "建议从开始使用页进入业务模式，然后直接跑一次示例决策。"
              : "建议先登录控制台，再从业务引导进入示例决策与回放。",
            href: "/getting-started.html?mode=business",
            buttonLabel: "开始业务引导",
            tone: "info",
            meta: [overview?.decisioning?.lastDecision?.summary || "示例事件已内置"],
          })}
          ${nextActionCard({
            kicker: "管理员",
            title: runtimeVerification?.goLiveReady ? "继续完成备份与恢复演练" : "先补齐放行阻断项",
            note: runtimeVerification?.goLiveReady
              ? overview?.governance?.recovery?.recommendedAction || "建议执行一次备份和 restore drill，为试点留痕。"
              : runtimeVerification?.goLiveBlockers?.[0] || "先到系统页验证 runtime，再决定是否能正式试点。",
            href: "/getting-started.html?mode=admin",
            buttonLabel: "开始管理引导",
            tone: runtimeVerification?.goLiveReady ? "good" : "warning",
            meta: [
              experience?.adminStatusLabel || "先完成管理员链路",
              runtimeVerification?.verifiedModel ? `已验证模型 ${runtimeVerification.verifiedModel}` : "默认模型 kimi-k2.5",
            ],
          })}
        </div>
      </article>
    </section>
  `;
}
