import {
  canManageAdmin,
  canReview,
  canViewGovernance,
  canViewSystem,
  getAuthFlash,
  getPreferredConsoleMode,
  getPrefs,
  loadGlobalData,
  rememberAction,
  setAdvancedMode,
  setLastVisitedPage,
  setPreferredConsoleMode,
  toggleAdvancedMode,
} from "./api.js";
import {
  escapeHtml,
  formatAuthMethod,
  formatRole,
  statusToneFromStatus,
  translateStatus,
} from "./format.js";
import { pill } from "./components.js";

const TOP_NAV_ITEMS = [
  { id: "home", href: "/index.html", label: "首页" },
  { id: "getting-started", href: "/getting-started.html", label: "开始使用" },
  { id: "business", href: "/workbench.html", label: "业务" },
  { id: "management", href: "/system.html", label: "管理" },
  { id: "agents", href: "/agents.html", label: "Agent Hub" },
];

const SECTION_NAV_ITEMS = {
  business: [
    { id: "workbench", href: "/workbench.html", label: "业务工作台" },
    { id: "decisions", href: "/decisions.html", label: "决策中心" },
    { id: "replays", href: "/replays.html", label: "回放中心" },
    { id: "library", href: "/library.html", label: "依据库" },
    { id: "library-review", href: "/library-review.html", label: "资料治理", permission: "review" },
  ],
  management: [
    { id: "system", href: "/system.html", label: "管理总览", permission: "system" },
    { id: "system-identity", href: "/system-identity.html", label: "身份与会话", permission: "system" },
    { id: "system-runtime", href: "/system-runtime.html", label: "运行时", permission: "system" },
    { id: "system-health", href: "/system-health.html", label: "健康与指标", permission: "system" },
    { id: "governance", href: "/governance.html", label: "治理总览", permission: "governance" },
    { id: "governance-exports", href: "/governance-exports.html", label: "审计与导出", permission: "governance" },
    { id: "governance-activity", href: "/governance-activity.html", label: "治理时间线", permission: "admin" },
    { id: "recovery", href: "/recovery.html", label: "恢复总览", permission: "system" },
    { id: "recovery-backups", href: "/recovery-backups.html", label: "备份", permission: "system" },
    { id: "recovery-restores", href: "/recovery-restores.html", label: "恢复演练", permission: "admin" },
  ],
};

const PAGE_META = {
  home: { topNavId: "home", topLabel: "首页" },
  "getting-started": { topNavId: "getting-started", topLabel: "开始使用" },
  workbench: { topNavId: "business", sectionId: "business", sectionLabel: "业务区", topLabel: "业务" },
  decisions: { topNavId: "business", sectionId: "business", sectionLabel: "业务区", topLabel: "业务" },
  replays: { topNavId: "business", sectionId: "business", sectionLabel: "业务区", topLabel: "业务" },
  library: { topNavId: "business", sectionId: "business", sectionLabel: "业务区", topLabel: "业务" },
  "library-review": { topNavId: "business", sectionId: "business", sectionLabel: "业务区", topLabel: "业务" },
  system: { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  "system-identity": { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  "system-runtime": { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  "system-health": { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  governance: { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  "governance-exports": { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  "governance-activity": { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  recovery: { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  "recovery-backups": { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  "recovery-restores": { topNavId: "management", sectionId: "management", sectionLabel: "管理区", topLabel: "管理" },
  agents: { topNavId: "agents", topLabel: "Agent Hub" },
};

export async function initShell(config) {
  const pageMeta = PAGE_META[config.pageId] || { topNavId: "home", topLabel: "首页" };
  setLastVisitedPage(config.pageId);
  setAdvancedMode(getPrefs().advancedMode);

  const root = document.getElementById("app");
  root.innerHTML = `
    <div class="app-shell">
      <header id="chrome" class="chrome"></header>
      <main class="page-frame">
        <section class="page-hero">
          <div class="page-hero-grid">
            <div>
              <div id="page-breadcrumb" class="breadcrumb-row"></div>
              <p class="section-kicker">${escapeHtml(config.sectionLabel || pageMeta.topLabel || "周衡全球财务网格")}</p>
              <h1 class="page-title">${escapeHtml(config.title)}</h1>
              <p class="page-copy">${escapeHtml(config.intro || "")}</p>
              <div class="hero-actions">${config.heroActions || ""}</div>
            </div>
            <div id="hero-status" class="hero-panel"></div>
          </div>
        </section>
        <div id="page-content" class="page-grid"></div>
      </main>
    </div>
  `;

  const pageContent = root.querySelector("#page-content");
  const chrome = root.querySelector("#chrome");
  const heroStatus = root.querySelector("#hero-status");
  const breadcrumb = root.querySelector("#page-breadcrumb");
  let globalData = await loadGlobalData({ includeMetrics: Boolean(config.includeMetrics) });

  function renderChrome() {
    const consoleMode = getPreferredConsoleMode(globalData);
    chrome.innerHTML = `
      <div class="chrome-top">
        <div>
          <p class="brand-eyebrow">Apple-style Guided Finance Console</p>
          <h1 class="brand-title">周衡全球财务网格</h1>
          <p class="brand-copy">先帮用户选对模式，再把复杂能力顺着任务路径 cascade 到正确子页面，并把桌面首次向导与 Agent 接入保持同一事实源。</p>
        </div>
        <div class="chrome-actions">
          <div class="identity-pill">${buildIdentityPill(globalData)}</div>
          <div class="mode-switch" role="tablist" aria-label="控制台模式">
            ${buildModeButton("business", "业务模式", consoleMode)}
            ${buildModeButton("admin", "管理模式", consoleMode)}
          </div>
          <button id="toggle-advanced" type="button" class="ghost">${globalData.prefs.advancedMode ? "隐藏高级详情" : "显示高级详情"}</button>
          ${
            globalData.access?.session?.authenticated
              ? `<a class="button ghost" href="/system-identity.html">当前会话</a>`
              : `<a class="button" href="/system-identity.html">登录控制台</a>`
          }
        </div>
      </div>
      ${renderFlashBanner()}
      <nav class="global-nav" aria-label="全局导航">
        ${buildTopNav(pageMeta.topNavId)}
      </nav>
      ${renderSectionShell(pageMeta, config.pageId, config.title, globalData, consoleMode)}
    `;

    chrome.querySelector("#toggle-advanced")?.addEventListener("click", () => {
      toggleAdvancedMode();
      renderChrome();
    });
    chrome.querySelectorAll("[data-console-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        const mode = button.getAttribute("data-console-mode");
        if (mode === "business" || mode === "admin") {
          setPreferredConsoleMode(mode);
          rememberAction(mode === "admin" ? "已切到管理模式" : "已切到业务模式");
          renderChrome();
          renderHeroStatus();
        }
      });
    });
  }

  function renderHeroStatus() {
    const consoleMode = getPreferredConsoleMode(globalData);
    heroStatus.innerHTML = buildHeroStatus(globalData, consoleMode, pageMeta.topNavId);
    breadcrumb.innerHTML = buildBreadcrumb(pageMeta, config.title, globalData);
  }

  async function refreshChrome() {
    globalData = await loadGlobalData({ includeMetrics: Boolean(config.includeMetrics) });
    renderChrome();
    renderHeroStatus();
    return globalData;
  }

  renderChrome();
  renderHeroStatus();

  return {
    pageContent,
    getGlobal: () => globalData,
    refreshChrome,
    rememberAction(message) {
      rememberAction(message);
    },
  };
}

function buildModeButton(mode, label, activeMode) {
  return `
    <button
      type="button"
      class="mode-button ${mode === activeMode ? "active" : ""}"
      data-console-mode="${escapeHtml(mode)}"
      aria-pressed="${String(mode === activeMode)}"
    >${escapeHtml(label)}</button>
  `;
}

function buildTopNav(activeId) {
  return TOP_NAV_ITEMS.map((item) => `
      <a class="nav-link ${item.id === activeId ? "active" : ""}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>
    `).join("");
}

function renderSectionShell(pageMeta, activePageId, pageTitle, globalData, consoleMode) {
  const items = pageMeta.sectionId ? getVisibleSectionItems(pageMeta.sectionId, globalData) : [];
  const experience = globalData.overview?.experience;
  const desktopOnboardingPending = Boolean(globalData?.prefs?.desktopOnboardingSeen) && !Boolean(globalData?.prefs?.desktopOnboardingCompleted);
  const modeLabel = consoleMode === "admin"
    ? experience?.adminStatusLabel || "先完成管理链路"
    : experience?.businessStatusLabel || "先进入业务链路";
  const summaryLabel = desktopOnboardingPending
    ? "桌面首次向导尚未完成，建议先回到开始使用页。"
    : modeLabel;

  return `
    <div class="section-shell">
      <div class="section-shell-head">
        <div>
          <p class="section-kicker">${escapeHtml(pageMeta.sectionLabel || pageMeta.topLabel || "当前分区")}</p>
          <h2 class="section-shell-title">${escapeHtml(pageTitle)}</h2>
          <p class="summary-note">${escapeHtml(summaryLabel)}</p>
        </div>
        ${
          pageMeta.topNavId === "agents"
            ? `<a class="button ghost" href="/getting-started.html?mode=${escapeHtml(consoleMode)}">查看开始使用</a>`
            : desktopOnboardingPending
              ? `<a class="button ghost" href="/getting-started.html?mode=admin&entry=desktop">继续首次向导</a>`
              : `<a class="button ghost" href="/getting-started.html?mode=${escapeHtml(consoleMode)}">进入${consoleMode === "admin" ? "管理" : "业务"}引导</a>`
        }
      </div>
      ${items.length ? `<nav class="section-nav" aria-label="当前分区导航">${items
        .map((item) => `<a class="section-link ${item.id === activePageId ? "active" : ""}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>`)
        .join("")}</nav>` : ""}
    </div>
  `;
}

function getVisibleSectionItems(sectionId, globalData) {
  return (SECTION_NAV_ITEMS[sectionId] || []).filter((item) => {
    if (item.permission === "review") {
      return canReview(globalData);
    }
    if (item.permission === "governance") {
      return canViewGovernance(globalData);
    }
    if (item.permission === "system") {
      return canViewSystem(globalData);
    }
    if (item.permission === "admin") {
      return canManageAdmin(globalData);
    }
    return true;
  });
}

function buildBreadcrumb(pageMeta, pageTitle, globalData) {
  const consoleMode = getPreferredConsoleMode(globalData);
  const parts = [
    `<a href="/index.html">首页</a>`,
    `<a href="/getting-started.html?mode=${escapeHtml(consoleMode)}">开始使用</a>`,
  ];
  if (pageMeta.topNavId === "business") {
    parts.push(`<a href="/workbench.html">业务</a>`);
  } else if (pageMeta.topNavId === "management") {
    parts.push(`<a href="/system.html">管理</a>`);
  } else if (pageMeta.topNavId === "agents") {
    parts.push(`<a href="/agents.html">Agent Hub</a>`);
  }
  if (pageMeta.topNavId !== "home" && pageMeta.topNavId !== "getting-started") {
    parts.push(`<span>${escapeHtml(pageTitle)}</span>`);
  } else {
    parts[parts.length - 1] = `<span>${escapeHtml(pageTitle)}</span>`;
  }
  return parts.join(`<span class="breadcrumb-sep">/</span>`);
}

function buildIdentityPill(globalData) {
  const environment = globalData.operationsHealth?.environment || globalData.overview?.governance?.integrity?.environment || "unknown";
  const teamScope = globalData.operationsHealth?.teamScope || globalData.overview?.governance?.integrity?.teamScope || "unknown";
  if (globalData.access?.session?.authenticated) {
    return `${escapeHtml(globalData.access.session.actor?.name || "当前用户")} · ${escapeHtml(formatRole(globalData.access.session.actor?.role))} · ${escapeHtml(formatAuthMethod(globalData.access.session.authMethod))} · ${escapeHtml(environment)}/${escapeHtml(teamScope)}`;
  }
  if (globalData.access?.config?.enabled) {
    return `未登录 · ${escapeHtml(environment)}/${escapeHtml(teamScope)} · 先从身份与会话进入`;
  }
  return `开放模式 · ${escapeHtml(environment)}/${escapeHtml(teamScope)} · 可直接阅读业务摘要`;
}

function renderFlashBanner() {
  const flash = getAuthFlash();
  if (!flash) {
    return "";
  }
  if (flash.authError) {
    return `<div class="flash-banner">登录失败：${escapeHtml(flash.authError)}</div>`;
  }
  if (flash.auth === "success") {
    return `<div class="flash-banner">企业身份登录成功，当前 session 已生效。</div>`;
  }
  return "";
}

function buildHeroStatus(globalData, consoleMode, topNavId) {
  const overview = globalData.overview;
  const health = globalData.operationsHealth;
  const integrity = overview?.governance?.integrity;
  const recovery = overview?.governance?.recovery;
  const runtime = overview?.runtime?.verification || overview?.runtime?.doctorReport;
  const modeLabel = consoleMode === "admin"
    ? overview?.experience?.adminStatusLabel || "先完成管理链路"
    : overview?.experience?.businessStatusLabel || "先进入业务链路";

  if (topNavId === "agents") {
    return `
      <p class="section-kicker">兼容层状态</p>
      <div class="hero-stat">
        <strong>统一 adapter registry</strong>
        <p class="summary-note">OpenClaw + 五个 MCP 宿主共用同一事实源，安装步骤和能力说明不再散落在各页。</p>
        <div class="meta-list">
          <span>${pill("good", "OpenClaw")}</span>
          <span>${pill("info", "Claude MCP")}</span>
          <span>${pill("info", "Manus MCP")}</span>
          <span>${pill("info", "Cursor MCP")}</span>
          <span>${pill("info", "Cline MCP")}</span>
          <span>${pill("info", "Cherry MCP")}</span>
        </div>
      </div>
    `;
  }

  return `
    <p class="section-kicker">当前模式</p>
    <div class="hero-stat">
      <strong>${escapeHtml(consoleMode === "admin" ? "管理模式" : "业务模式")}</strong>
      <p class="summary-note">${escapeHtml(modeLabel)}</p>
      <div class="meta-list">
        <span>${pill(globalData.access?.session?.authenticated ? "good" : globalData.access?.config?.enabled ? "warn" : "neutral", globalData.access?.session?.authenticated ? "已登录" : globalData.access?.config?.enabled ? "未登录" : "开放模式")}</span>
        ${runtime ? `<span>${pill(runtime.goLiveReady ? "good" : runtime.requiresProviderAction ? "warn" : statusToneFromStatus("degraded"), runtime.goLiveReady ? "可正式试点" : "待放行")}</span>` : ""}
        ${globalData?.prefs?.desktopOnboardingSeen && !globalData?.prefs?.desktopOnboardingCompleted ? `<span>${pill("warn", "向导未完成")}</span>` : ""}
        ${integrity ? `<span>${pill(statusToneFromStatus(integrity.status), integrity.summary || translateStatus(integrity.status))}</span>` : ""}
        ${recovery ? `<span>${pill(statusToneFromStatus(recovery.status), recovery.summary || translateStatus(recovery.status))}</span>` : ""}
      </div>
      <div class="detail-table top-gap">
        <div class="detail-row">
          <span>环境</span>
          <strong>${escapeHtml(health?.environment || "local")} / ${escapeHtml(health?.teamScope || "default")}</strong>
        </div>
        <div class="detail-row">
          <span>最近动作</span>
          <strong>${escapeHtml(globalData.prefs.lastAction || "等待新的用户动作")}</strong>
        </div>
      </div>
    </div>
  `;
}
