import { setPreferredRoleEntry } from "../core/api.js";
import { featureCard, pill, summaryCard } from "../core/components.js";
import { formatDateTime, formatRole, humanizeSeconds } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "home",
  sectionLabel: "品牌首页",
  title: "像 Apple 一样克制的财务控制台",
  intro: "把业务执行、治理、恢复和 Agent 接入拆成清晰页面。先让非技术人员看懂，再让专业人员进入细节。",
  heroActions: `
    <a class="button" data-preferred-entry="workbench" href="/workbench.html">打开业务工作台</a>
    <a class="button ghost" href="/agents.html">查看 Agent Hub</a>
  `,
});

render();
bindLinks();

function render() {
  const globalData = shell.getGlobal();
  const overview = globalData.overview;
  const health = globalData.operationsHealth;
  const actor = globalData.access?.session?.actor;
  const preferred = globalData.prefs.preferredRoleEntry || "workbench";
  const runtimeVerification = overview?.runtime?.verification || overview?.runtime?.doctorReport;

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">应用分区</p>
            <h3>从首页进入最合适的工作空间</h3>
            <p class="section-copy">不再把所有能力塞进同一屏，而是按任务路径拆成清晰页面。</p>
          </div>
        </div>
        <div class="feature-grid two-up">
          ${featureCard({
            title: "业务工作台",
            note: "面向财务、法务、风控的默认入口。看摘要、挑任务、再进入决策或回放页。",
            meta: [`推荐入口：${preferred === "workbench" ? "是" : "否"}`],
            href: "/workbench.html",
            buttonLabel: "进入工作台",
          })}
          ${featureCard({
            title: "治理中心",
            note: "审计链、导出和操作时间线集中查看，恢复演练不再与治理详情混排。",
            meta: [overview?.governance?.integrity?.summary || "等待读取审计状态"],
            href: "/governance.html",
            buttonLabel: "进入治理中心",
          })}
          ${featureCard({
            title: "恢复中心",
            note: "专门查看备份状态、恢复演练历史和下一步恢复建议。",
            meta: [overview?.governance?.recovery?.summary || "等待读取恢复状态"],
            href: "/recovery.html",
            buttonLabel: "进入恢复中心",
          })}
          ${featureCard({
            title: "Agent Hub",
            note: "统一查看 OpenClaw、Claude、Manus 的接入方式、能力覆盖和本地安装片段。",
            meta: ["统一 adapter registry 驱动"],
            href: "/agents.html",
            buttonLabel: "查看兼容层",
          })}
        </div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">当前快照</p>
            <h3>给第一次进入的人一个可理解的上下文</h3>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "当前身份",
            title: actor ? `${actor.name} · ${formatRole(actor.role)}` : globalData.access?.config?.enabled ? "等待登录" : "开放模式",
            note: actor ? "当前会话已生效，可继续进入系统设置管理身份与运行时。" : "如果需要执行治理或系统动作，请从系统设置登录。",
            pillHtml: pill(actor ? "good" : globalData.access?.config?.enabled ? "warn" : "neutral", actor ? "已登录" : globalData.access?.config?.enabled ? "未登录" : "无需登录"),
            meta: [
              health ? `${health.environment}/${health.teamScope}` : "环境未知",
              health ? `已运行 ${humanizeSeconds(health.uptimeSeconds)}` : "等待健康状态",
            ],
          })}
          ${summaryCard({
            kicker: "决策与回放",
            title: overview?.decisioning?.lastDecision?.label || "还没有最近决策摘要",
            note: overview?.decisioning?.lastReplay?.summary || "从业务工作台开始运行一次决策或回放。",
            pillHtml: pill("info", `24h 决策 ${overview?.decisioning?.counts24h?.decision ?? 0} / 回放 ${overview?.decisioning?.counts24h?.replay ?? 0}`),
            meta: [
              overview?.decisioning?.lastDecision?.createdAt ? formatDateTime(overview.decisioning.lastDecision.createdAt) : "暂无时间线",
            ],
          })}
          ${summaryCard({
            kicker: "治理健康",
            title: overview?.governance?.integrity?.summary || "等待完整性状态",
            note: overview?.governance?.recovery?.recommendedAction || "恢复建议会在备份和演练数据就绪后显示。",
            pillHtml: pill(
              overview?.governance?.integrity?.isStale ? "warn" : "good",
              overview?.governance?.integrity?.status || "pending",
            ),
            meta: [
              overview?.governance?.integrity?.lastVerifiedAt ? `最近校验：${formatDateTime(overview.governance.integrity.lastVerifiedAt)}` : "尚未完整校验",
              overview?.governance?.recovery?.lastDrillAt ? `最近演练：${formatDateTime(overview.governance.recovery.lastDrillAt)}` : "尚未演练",
            ],
          })}
          ${summaryCard({
            kicker: "试点启动",
            title: buildPilotLaunchTitle(globalData, runtimeVerification),
            note: buildPilotLaunchNote(globalData, runtimeVerification),
            pillHtml: pill(
              runtimeVerification?.verificationStatus === "fully_usable" || runtimeVerification?.verificationStatus === "local_ready"
                ? "good"
                : actor
                  ? "warn"
                  : "info",
              actor ? "可继续" : "先登录",
            ),
            meta: [
              runtimeVerification?.provider?.label ? `Provider ${runtimeVerification.provider.label}` : null,
              runtimeVerification?.lastVerifiedAt ? `最近验证 ${formatDateTime(runtimeVerification.lastVerifiedAt)}` : null,
            ].filter(Boolean),
          })}
        </div>
      </article>
    </section>
    <section class="page-section home-spotlight">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">产品气质</p>
          <h3>为什么这次改成白色高留白多页面</h3>
          <p class="section-copy">当前阶段优先让非技术人员读得懂、找得到入口、知道下一步去哪，而不是一屏塞满治理和运维面板。</p>
        </div>
      </div>
      <div class="feature-grid three-up">
        ${featureCard({
          title: "更像产品，而不是后台",
          note: "首页只讲产品价值、当前状态和入口分区，不承载复杂表单。",
        })}
        ${featureCard({
          title: "任务拆分更自然",
          note: "决策、回放、治理、恢复和系统设置分别进入独立页面。",
        })}
        ${featureCard({
          title: "Agent 接入变成一等公民",
          note: "宿主如何接入 Zhouheng，不再藏在 README 角落里，而是有独立的 Agent Hub。",
        })}
      </div>
    </section>
  `;
}

function buildPilotLaunchTitle(globalData, verification) {
  if (globalData.access?.config?.bootstrapRequired) {
    return "先创建首个管理员";
  }
  if (globalData.access?.config?.enabled && !globalData.access?.session?.authenticated) {
    return "先登录控制台";
  }
  if (verification && verification.verificationStatus !== "fully_usable" && verification.verificationStatus !== "local_ready") {
    return verification.recommendedAction;
  }
  return "可以开始外部试点";
}

function buildPilotLaunchNote(globalData, verification) {
  if (globalData.access?.config?.bootstrapRequired) {
    return "完成首个管理员初始化后，再进入系统设置配置运行时、备份和恢复。";
  }
  if (globalData.access?.config?.enabled && !globalData.access?.session?.authenticated) {
    return "未登录时仍可浏览摘要，但真实业务操作和治理动作会继续要求身份门禁。";
  }
  if (verification && verification.verificationStatus !== "fully_usable" && verification.verificationStatus !== "local_ready") {
    return verification.blockedReason || "先把运行时链路和模型可见性打通，再把系统交给外部试点用户。";
  }
  return "建议从业务工作台的示例决策开始，再进入回放中心和依据库。";
}

function bindLinks() {
  shell.pageContent.addEventListener("click", (event) => {
    const target = event.target.closest("[data-preferred-entry]");
    if (!target) {
      return;
    }
    setPreferredRoleEntry(target.getAttribute("data-preferred-entry"));
  });
}
