import {
  getPreferredConsoleMode,
  setPreferredConsoleMode,
} from "../core/api.js";
import {
  guideStepCard,
  nextActionCard,
  pill,
  summaryCard,
} from "../core/components.js";
import { formatDateTime } from "../core/format.js";
import { initShell } from "../core/shell.js";

const params = new URLSearchParams(window.location.search);
const requestedMode = params.get("mode");
const initialMode = requestedMode === "admin" || requestedMode === "business" ? requestedMode : null;
if (initialMode) {
  setPreferredConsoleMode(initialMode);
}

const shell = await initShell({
  pageId: "getting-started",
  sectionLabel: "开始使用",
  title: "把上手路径收成一条清晰的 checklist",
  intro: "无论是业务模式还是管理模式，都先告诉你现在卡在哪一步，再告诉你该去哪一页完成它。",
  heroActions: `
    <a class="button" href="/index.html">返回首页</a>
    <a class="button ghost" href="/workbench.html">直接去业务工作台</a>
  `,
});

render();

shell.pageContent.addEventListener("click", (event) => {
  const target = event.target.closest("[data-guide-mode]");
  if (!target) {
    return;
  }
  const mode = target.getAttribute("data-guide-mode");
  if (mode === "business" || mode === "admin") {
    setPreferredConsoleMode(mode);
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    render();
  }
});

function render() {
  const globalData = shell.getGlobal();
  const overview = globalData.overview;
  const experience = overview?.experience;
  const mode = getPreferredConsoleMode(globalData);
  const steps = mode === "admin" ? experience?.adminGuide || [] : experience?.businessGuide || [];
  const runtimeVerification = overview?.runtime?.verification || overview?.runtime?.doctorReport;
  const completedCount = steps.filter((step) => step.status === "verified" || step.status === "healthy" || step.status === "ready").length;

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">模式选择</p>
            <h3>先切到你今天要走的路径</h3>
            <p class="section-copy">业务模式适合财务、法务、风控；管理模式适合管理员与 reviewer。</p>
          </div>
        </div>
        <div class="mode-grid two-up">
          <button type="button" class="mode-card ${mode === "business" ? "active" : ""}" data-guide-mode="business">
            <div class="record-head">
              <strong>业务模式</strong>
              ${pill(mode === "business" ? "good" : "info", experience?.businessStatusLabel || "从示例决策开始")}
            </div>
            <p class="summary-note">先登录、验证运行时，再去决策、回放和依据库，不先面对治理与系统表单。</p>
          </button>
          <button type="button" class="mode-card ${mode === "admin" ? "active" : ""}" data-guide-mode="admin">
            <div class="record-head">
              <strong>管理模式</strong>
              ${pill(mode === "admin" ? "good" : "warn", experience?.adminStatusLabel || "从管理员引导开始")}
            </div>
            <p class="summary-note">先看 bootstrap、runtime、备份、恢复与审计链，再决定是否对外开放试点。</p>
          </button>
        </div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">当前进度</p>
            <h3>${mode === "admin" ? "管理链路" : "业务链路"}已经走到哪一步</h3>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "完成度",
            title: `${completedCount}/${steps.length || 0} 步已完成`,
            note: mode === "admin"
              ? experience?.adminStatusLabel || "按顺序完成管理员链路。"
              : experience?.businessStatusLabel || "按顺序完成业务链路。",
            pillHtml: pill(completedCount === steps.length && steps.length ? "good" : "warn", completedCount === steps.length && steps.length ? "已就绪" : "继续完成"),
            meta: [
              runtimeVerification?.lastVerifiedAt ? `最近验证 ${formatDateTime(runtimeVerification.lastVerifiedAt)}` : "等待真实验证",
              overview?.identity?.summary || "等待身份状态",
            ],
          })}
          ${nextActionCard({
            kicker: "下一步",
            title: pickNextStepTitle(steps),
            note: pickNextStepNote(steps),
            href: pickNextStepHref(steps),
            buttonLabel: pickNextStepButton(steps),
            tone: steps.some((step) => step.status === "down" || step.status === "not_configured") ? "warning" : "info",
            meta: experience?.globalBlockers?.slice(0, 2) || [],
          })}
        </div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">分步清单</p>
          <h3>${mode === "admin" ? "按这条路径完成试点放行" : "按这条路径带业务用户上手"}</h3>
          <p class="section-copy">每一步都给出状态、阻断原因和明确跳转按钮，不让人停在模糊状态里。</p>
        </div>
      </div>
      <div class="guide-list">
        ${steps.map((step, index) => guideStepCard({
          step: String(index + 1).padStart(2, "0"),
          title: step.title,
          description: step.description,
          status: step.status,
          href: step.href,
          ctaLabel: step.ctaLabel,
          blockingReason: step.blockingReason,
        })).join("")}
      </div>
    </section>
  `;
}

function pickNextStep(steps) {
  return steps.find((step) => step.status === "down" || step.status === "not_configured" || step.status === "degraded" || step.status === "pending")
    || steps[0]
    || null;
}

function pickNextStepTitle(steps) {
  const step = pickNextStep(steps);
  return step ? step.title : "当前没有待执行步骤";
}

function pickNextStepNote(steps) {
  const step = pickNextStep(steps);
  return step ? step.blockingReason || step.description : "当前模式已经完成基础步骤，可以直接进入对应工作区。";
}

function pickNextStepHref(steps) {
  return pickNextStep(steps)?.href || "/index.html";
}

function pickNextStepButton(steps) {
  return pickNextStep(steps)?.ctaLabel || "返回首页";
}
