import {
  canViewGovernance,
  canViewSystem,
  getAuthFlash,
  getPrefs,
  loadGlobalData,
  rememberAction,
  setAdvancedMode,
  setLastVisitedPage,
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

const NAV_ITEMS = [
  { id: "home", href: "/index.html", label: "首页" },
  { id: "workbench", href: "/workbench.html", label: "业务工作台" },
  { id: "decisions", href: "/decisions.html", label: "决策中心" },
  { id: "replays", href: "/replays.html", label: "回放中心" },
  { id: "library", href: "/library.html", label: "依据库" },
  { id: "governance", href: "/governance.html", label: "治理中心" },
  { id: "recovery", href: "/recovery.html", label: "恢复中心" },
  { id: "system", href: "/system.html", label: "系统设置" },
  { id: "agents", href: "/agents.html", label: "Agent Hub" },
];

export async function initShell(config) {
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
              <p class="section-kicker">${escapeHtml(config.sectionLabel || "Zhouheng Global Finance Mesh")}</p>
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
  let globalData = await loadGlobalData({ includeMetrics: Boolean(config.includeMetrics) });

  function renderChrome() {
    chrome.innerHTML = `
      <div class="chrome-top">
        <div>
          <p class="brand-eyebrow">Apple-style Enterprise Beta Control Plane</p>
          <h1 class="brand-title">周衡全球财务网格</h1>
          <p class="brand-copy">更克制的白色控制台，更清晰的页面边界，以及可以被多种 Agent 宿主接入的统一能力层。</p>
        </div>
        <div class="chrome-actions">
          <div class="identity-pill">${buildIdentityPill(globalData)}</div>
          <a class="button ghost" href="/agents.html">Agent Hub</a>
          <button id="toggle-advanced" type="button" class="ghost">${globalData.prefs.advancedMode ? "隐藏高级详情" : "显示高级详情"}</button>
          ${
            globalData.access?.session?.authenticated
              ? `<a class="button ghost" href="/system.html">系统设置</a>`
              : `<a class="button" href="/system.html">登录控制台</a>`
          }
        </div>
      </div>
      ${renderFlashBanner()}
      <nav class="global-nav" aria-label="全局导航">
        ${buildNav(globalData, config.pageId)}
      </nav>
    `;

    chrome.querySelector("#toggle-advanced")?.addEventListener("click", () => {
      toggleAdvancedMode();
      renderChrome();
    });
  }

  function renderHeroStatus() {
    heroStatus.innerHTML = buildHeroStatus(globalData, config.pageId);
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

function buildNav(globalData, activeId) {
  return NAV_ITEMS.filter((item) => isVisible(item.id, globalData))
    .map(
      (item) => `
        <a class="nav-link ${item.id === activeId ? "active" : ""}" href="${escapeHtml(item.href)}">${escapeHtml(item.label)}</a>
      `,
    )
    .join("");
}

function isVisible(id, globalData) {
  if (id === "governance") {
    return canViewGovernance(globalData);
  }
  if (id === "recovery") {
    return canViewSystem(globalData);
  }
  if (id === "system") {
    return canViewSystem(globalData);
  }
  return true;
}

function buildIdentityPill(globalData) {
  const environment = globalData.operationsHealth?.environment || globalData.overview?.governance?.integrity?.environment || "unknown";
  const teamScope = globalData.operationsHealth?.teamScope || globalData.overview?.governance?.integrity?.teamScope || "unknown";
  if (globalData.access?.session?.authenticated) {
    return `${escapeHtml(globalData.access.session.actor?.name || "当前用户")} · ${escapeHtml(formatRole(globalData.access.session.actor?.role))} · ${escapeHtml(formatAuthMethod(globalData.access.session.authMethod))} · ${escapeHtml(environment)}/${escapeHtml(teamScope)}`;
  }
  if (globalData.access?.config?.enabled) {
    return `未登录 · ${escapeHtml(environment)}/${escapeHtml(teamScope)} · 可以先从系统设置进入控制台`;
  }
  return `开放模式 · ${escapeHtml(environment)}/${escapeHtml(teamScope)} · 可直接查看业务摘要`;
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

function buildHeroStatus(globalData, pageId) {
  const overview = globalData.overview;
  const health = globalData.operationsHealth;
  if (pageId === "agents") {
    return `
      <p class="section-kicker">兼容方向</p>
      <div class="hero-stat">
        <strong>OpenClaw / Claude / Manus</strong>
        <p class="summary-note">统一由本地优先的 adapter registry 管理，控制台只展示如何被它们接入，不在这里代理它们执行。</p>
      </div>
    `;
  }

  const identityStatus = globalData.access?.session?.authenticated
    ? pill("good", formatRole(globalData.access.session.actor?.role))
    : globalData.access?.config?.enabled
      ? pill("warn", "未登录")
      : pill("neutral", "开放模式");
  const integrity = overview?.governance?.integrity;
  const integrityPill = integrity
    ? pill(statusToneFromStatus(integrity.status), integrity.summary || translateStatus(integrity.status))
    : "";
  const recovery = overview?.governance?.recovery;
  const recoveryPill = recovery
    ? pill(statusToneFromStatus(recovery.status), recovery.summary || translateStatus(recovery.status))
    : "";

  return `
    <p class="section-kicker">当前环境</p>
    <div class="hero-stat">
      <strong>${escapeHtml(health?.environment || "local")} / ${escapeHtml(health?.teamScope || "default")}</strong>
      <p class="summary-note">${escapeHtml(globalData.prefs.lastAction || "从更轻量的页面入口开始使用控制台。")}</p>
      <div class="meta-list">
        <span>${identityStatus}</span>
        ${integrityPill ? `<span>${integrityPill}</span>` : ""}
        ${recoveryPill ? `<span>${recoveryPill}</span>` : ""}
      </div>
    </div>
  `;
}

