import {
  api,
  canManageAdmin,
  canViewSystem,
  formToObject,
  rememberAction,
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
import {
  formatAuthMethod,
  formatDateTime,
  formatRole,
  shortHash,
} from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "system-identity",
  sectionLabel: "身份与会话",
  title: "把登录入口、管理员初始化、身份绑定和会话管理收成一个独立子页",
  intro: "业务用户不再在系统总览撞上这些表单。这里专门给管理员处理 bootstrap、登录、OIDC 绑定、本地账户和 session 撤销。",
  heroActions: `
    <a class="button" href="/system.html">返回管理总览</a>
    <a class="button ghost" href="/getting-started.html?mode=admin">返回管理引导</a>
  `,
});

const state = {
  sessions: [],
  currentSessionId: null,
  selectedSessionId: null,
  selectedSession: null,
  sessionError: "",
  accessMessage: "",
  sessionMessage: "",
};

renderFrame();
await refreshAll();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">身份摘要</p>
            <h3>先告诉管理员入口和当前会话状态</h3>
          </div>
          <button id="refresh-access" type="button" class="ghost">刷新身份状态</button>
        </div>
        <div id="access-overview" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">会话摘要</p>
            <h3>先看当前有没有活跃 session</h3>
          </div>
        </div>
        <div id="session-overview" class="section-stack"></div>
      </article>
    </section>

    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">登录与身份绑定</p>
            <h3>管理员入口、本地账户和 OIDC 绑定</h3>
          </div>
        </div>
        <div id="identity-admin" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">会话管理</p>
            <h3>活跃 session 与撤销动作</h3>
          </div>
        </div>
        <div id="session-admin" class="section-stack"></div>
      </article>
    </section>
  `;

  shell.pageContent.querySelector("#refresh-access")?.addEventListener("click", () => void refreshAccess());
  shell.pageContent.addEventListener("submit", (event) => {
    const form = event.target.closest("form");
    if (!form) {
      return;
    }
    if (form.id === "bootstrap-form") {
      event.preventDefault();
      void bootstrapAdmin(form);
      return;
    }
    if (form.id === "token-login-form") {
      event.preventDefault();
      void loginWithToken(form);
      return;
    }
    if (form.id === "access-config-form") {
      event.preventDefault();
      void updateAccessConfig(form);
      return;
    }
    if (form.id === "operator-form") {
      event.preventDefault();
      void createOperator(form);
      return;
    }
    if (form.id === "binding-form") {
      event.preventDefault();
      void createBinding(form);
    }
  });

  shell.pageContent.addEventListener("click", (event) => {
    const target = event.target.closest("button, a");
    if (!target) {
      return;
    }
    if (target.id === "start-oidc-login") {
      event.preventDefault();
      startOidcLogin();
      return;
    }
    if (target.id === "logout-button") {
      event.preventDefault();
      void logout();
      return;
    }
    if (target.matches("[data-binding-id][data-action='deactivate-binding']")) {
      event.preventDefault();
      void deactivateBinding(target.getAttribute("data-binding-id"));
      return;
    }
    if (target.matches("[data-session-id]")) {
      event.preventDefault();
      openSession(target.getAttribute("data-session-id"));
      return;
    }
    if (target.id === "revoke-session") {
      event.preventDefault();
      void revokeSession();
    }
  });

  renderAccess();
  renderIdentityAdmin();
  renderSessions();
}

async function refreshAll() {
  await refreshAccess();
  await refreshSessions();
}

async function refreshAccess() {
  await shell.refreshChrome();
  renderAccess();
  renderIdentityAdmin();
  renderSessions();
}

async function refreshSessions(preferredSessionId) {
  const globalData = shell.getGlobal();
  state.sessionError = "";
  if (!canManageAdmin(globalData)) {
    state.sessions = [];
    state.currentSessionId = null;
    state.selectedSessionId = null;
    state.selectedSession = null;
    renderSessions();
    return;
  }
  try {
    const result = await api("/api/access-control/sessions?limit=20");
    state.sessions = result.sessions || [];
    state.currentSessionId = result.currentSessionId || null;
    state.selectedSessionId =
      preferredSessionId
      || state.selectedSessionId
      || state.currentSessionId
      || state.sessions[0]?.sessionId
      || null;
    state.selectedSession =
      state.sessions.find((item) => item.sessionId === state.selectedSessionId)
      || state.sessions[0]
      || null;
  } catch (error) {
    state.sessions = [];
    state.currentSessionId = null;
    state.selectedSessionId = null;
    state.selectedSession = null;
    state.sessionError = String(error.message || error);
  }
  renderSessions();
}

async function bootstrapAdmin(form) {
  state.accessMessage = "正在创建初始管理员并签发当前会话…";
  renderAccess();
  try {
    const payload = formToObject(form);
    await api("/api/access-control/bootstrap", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        token: payload.token,
        enableAuth: payload.enableAuth,
      }),
    });
    form.reset();
    rememberAction("已完成控制台管理员初始化");
    state.accessMessage = "初始化完成，当前浏览器会话已经登录。";
    await refreshAll();
  } catch (error) {
    state.accessMessage = String(error.message || error);
    renderAccess();
  }
}

async function loginWithToken(form) {
  state.accessMessage = "正在建立本地应急登录会话…";
  renderAccess();
  try {
    const payload = formToObject(form);
    await api("/api/access-control/login/token", {
      method: "POST",
      body: JSON.stringify({ token: payload.token }),
    });
    form.reset();
    rememberAction("已使用本地令牌登录控制台");
    state.accessMessage = "本地令牌登录成功。";
    await refreshAll();
  } catch (error) {
    state.accessMessage = String(error.message || error);
    renderAccess();
  }
}

function startOidcLogin() {
  const target = new URL("/api/access-control/login", window.location.origin);
  target.searchParams.set("next", "/system-identity.html");
  window.location.href = target.toString();
}

async function logout() {
  state.accessMessage = "正在关闭当前会话…";
  renderAccess();
  try {
    await api("/api/access-control/logout", {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已退出当前控制台会话");
    state.accessMessage = "当前会话已关闭。";
    await refreshAll();
  } catch (error) {
    state.accessMessage = String(error.message || error);
    renderAccess();
  }
}

async function updateAccessConfig(form) {
  state.accessMessage = "正在保存身份配置…";
  renderIdentityAdmin();
  try {
    const payload = formToObject(form);
    await api("/api/access-control/config", {
      method: "POST",
      body: JSON.stringify({ enabled: payload.enabled }),
    });
    rememberAction("已更新控制台身份开关");
    state.accessMessage = "身份开关已更新。";
    await refreshAccess();
  } catch (error) {
    state.accessMessage = String(error.message || error);
    renderIdentityAdmin();
  }
}

async function createOperator(form) {
  state.accessMessage = "正在创建本地令牌账户…";
  renderIdentityAdmin();
  try {
    const payload = formToObject(form);
    await api("/api/access-control/operators", {
      method: "POST",
      body: JSON.stringify({
        name: payload.name,
        role: payload.role,
        token: payload.token,
        active: payload.active,
      }),
    });
    form.reset();
    rememberAction("已新增本地令牌账户");
    state.accessMessage = "本地账户已创建。";
    await refreshAccess();
  } catch (error) {
    state.accessMessage = String(error.message || error);
    renderIdentityAdmin();
  }
}

async function createBinding(form) {
  state.accessMessage = "正在创建身份绑定…";
  renderIdentityAdmin();
  try {
    const payload = formToObject(form);
    await api("/api/access-control/bindings", {
      method: "POST",
      body: JSON.stringify({
        label: payload.label || undefined,
        matchType: payload.matchType,
        role: payload.role,
        issuer: payload.issuer || undefined,
        subject: payload.subject || undefined,
        email: payload.email || undefined,
      }),
    });
    form.reset();
    rememberAction("已新增企业身份绑定");
    state.accessMessage = "身份绑定已创建。";
    await refreshAccess();
  } catch (error) {
    state.accessMessage = String(error.message || error);
    renderIdentityAdmin();
  }
}

async function deactivateBinding(bindingId) {
  if (!bindingId) {
    return;
  }
  state.accessMessage = "正在停用身份绑定…";
  renderIdentityAdmin();
  try {
    await api(`/api/access-control/bindings/${encodeURIComponent(bindingId)}/deactivate`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已停用企业身份绑定");
    state.accessMessage = "身份绑定已停用。";
    await refreshAccess();
  } catch (error) {
    state.accessMessage = String(error.message || error);
    renderIdentityAdmin();
  }
}

function openSession(sessionId) {
  if (!sessionId) {
    return;
  }
  state.selectedSessionId = sessionId;
  state.selectedSession = state.sessions.find((item) => item.sessionId === sessionId) || null;
  renderSessions();
}

async function revokeSession() {
  if (!state.selectedSessionId) {
    return;
  }
  state.sessionMessage = "正在撤销所选会话…";
  renderSessions();
  try {
    const result = await api(`/api/access-control/sessions/${encodeURIComponent(state.selectedSessionId)}/revoke`, {
      method: "POST",
      body: JSON.stringify({}),
    });
    rememberAction("已撤销控制台会话");
    state.sessionMessage =
      result.revoked?.sessionId === state.currentSessionId
        ? "当前会话已撤销，页面会回到未登录状态。"
        : "会话已撤销。";
    await refreshAll();
  } catch (error) {
    state.sessionMessage = String(error.message || error);
    renderSessions();
  }
}

function renderAccess() {
  const container = shell.pageContent.querySelector("#access-overview");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  const access = globalData.access;
  const config = access?.config;
  const session = access?.session;

  if (!canViewSystem(globalData) || !config) {
    container.innerHTML = emptyState("当前环境还没有提供身份与控制台配置。");
    return;
  }

  container.innerHTML = `
    <div class="summary-grid">
      ${summaryCard({
        kicker: "当前身份",
        title: session?.authenticated
          ? `${session.actor?.name || "当前用户"} · ${formatRole(session.actor?.role)}`
          : config.bootstrapRequired
            ? "等待创建首位管理员"
            : config.enabled
              ? "等待登录"
              : "开放模式",
        note: session?.authenticated
          ? `当前会话采用 ${formatAuthMethod(session.authMethod)} 方式登录，可继续进入下方系统管理。`
          : config.bootstrapRequired
            ? "先创建初始管理员，浏览器会自动签发会话并进入受保护模式。"
            : config.enabled
              ? "可以使用本地应急令牌或企业身份登录。"
              : "当前控制台处于开放模式，业务摘要不需要登录。",
        pillHtml: pill(
          session?.authenticated ? "good" : config.bootstrapRequired ? "warn" : config.enabled ? "info" : "neutral",
          session?.authenticated ? "已登录" : config.bootstrapRequired ? "待初始化" : config.enabled ? "未登录" : "开放模式",
        ),
        meta: [
          `身份模式 ${config.identityMode}`,
          config.oidcConfigured ? `OIDC ${config.oidcDisplayName || "configured"}` : "OIDC 未配置",
        ],
      })}
      ${summaryCard({
        kicker: "当前会话",
        title: session?.authenticated ? "浏览器 session 已就绪" : "当前还没有浏览器 session",
        note: session?.authenticated
          ? `当前会话预计在 ${session.currentSession?.expiresAt ? formatDateTime(session.currentSession.expiresAt) : "未提供时间"} 到期。`
          : "未登录时仍可浏览首页摘要，但管理动作会继续要求身份和角色门禁。",
        pillHtml: pill(session?.authenticated ? "good" : "warn", session?.authenticated ? "session_ready" : "pending"),
        meta: [
          session?.authMethod ? `当前方式 ${formatAuthMethod(session.authMethod)}` : "尚未建立浏览器 session",
          session?.currentSession?.expiresAt ? `到期 ${formatDateTime(session.currentSession.expiresAt)}` : "等待建立会话",
        ],
      })}
      ${calloutCard({
        kicker: "下一步",
        title: config.bootstrapRequired
          ? "先初始化首位管理员"
          : session?.authenticated
            ? "当前会话已经就绪"
            : config.oidcConfigured
              ? "优先使用企业身份登录"
              : config.allowLocalTokens
                ? "可用本地令牌进入"
                : "等待身份入口配置",
        note: config.bootstrapRequired
          ? "初始化完成后，浏览器会立刻切到受保护 session。"
          : session?.authenticated
            ? "你已经进入受保护的浏览器 session，可以继续管理绑定、会话和运行时。"
            : config.oidcConfigured
              ? `企业身份入口已准备好，默认显示为 ${config.oidcDisplayName || config.issuer || "OIDC Provider"}。`
              : config.allowLocalTokens
                ? "当前保留 break-glass 本地令牌入口，适合应急或本地调试。"
                : "当前还没有可用的浏览器登录入口。",
        tone: config.bootstrapRequired ? "warning" : session?.authenticated ? "good" : "info",
      })}
    </div>
    ${state.accessMessage ? `<p class="footer-note">${state.accessMessage}</p>` : ""}
    ${renderAccessActions(globalData)}
    ${jsonDetails("查看身份技术详情", { config, session })}
  `;
}

function renderAccessActions(globalData) {
  const config = globalData.access?.config;
  const session = globalData.access?.session;
  if (!config) {
    return "";
  }
  const blocks = [];

  if (config.bootstrapRequired) {
    blocks.push(`
      <article class="detail-card">
        <p class="section-kicker">首次初始化</p>
        <h4>创建首位管理员</h4>
        <form id="bootstrap-form" class="stack">
          <div class="form-grid">
            <label>
              管理员姓名
              <input name="name" placeholder="Alice Admin" required />
            </label>
            <label>
              初始令牌
              <input name="token" placeholder="admin-secret" required />
            </label>
          </div>
          <label class="inline-toggle">
            <input name="enableAuth" type="checkbox" checked />
            初始化后立即启用认证与角色门禁
          </label>
          <div class="action-row">
            <button type="submit">初始化管理员</button>
          </div>
        </form>
      </article>
    `);
  }

  if (!session?.authenticated && config.allowLocalTokens) {
    blocks.push(`
      <article class="detail-card">
        <p class="section-kicker">本地应急入口</p>
        <h4>用本地令牌登录</h4>
        <form id="token-login-form" class="stack">
          <label>
            本地令牌
            <input name="token" type="password" placeholder="输入 break-glass token" required />
          </label>
          <div class="action-row">
            <button type="submit">用本地令牌登录</button>
          </div>
        </form>
      </article>
    `);
  }

  if (!session?.authenticated && config.oidcConfigured) {
    blocks.push(`
      <article class="detail-card">
        <p class="section-kicker">企业身份入口</p>
        <h4>使用企业身份登录</h4>
        <p class="summary-note">当前配置会跳转到 ${config.oidcDisplayName || config.issuer || "OIDC Provider"} 完成企业登录。</p>
        <div class="action-row">
          <button id="start-oidc-login" type="button">使用企业身份登录</button>
        </div>
      </article>
    `);
  }

  if (session?.authenticated) {
    blocks.push(`
      <article class="detail-card">
        <p class="section-kicker">当前会话</p>
        <h4>${session.actor?.name || "当前用户"}</h4>
        ${detailRows([
          { label: "角色", value: formatRole(session.actor?.role) },
          { label: "登录方式", value: formatAuthMethod(session.authMethod) },
          { label: "到期时间", value: session.currentSession?.expiresAt ? formatDateTime(session.currentSession.expiresAt) : "未提供" },
          { label: "CSRF", value: session.currentSession ? "已保护" : "未启用" },
        ])}
        <div class="action-row">
          <button id="logout-button" type="button" class="ghost">退出当前会话</button>
        </div>
      </article>
    `);
  }

  return blocks.join("");
}

function renderIdentityAdmin() {
  const container = shell.pageContent.querySelector("#identity-admin");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  const config = globalData.access?.config;
  if (!config) {
    container.innerHTML = emptyState("等待身份配置。");
    return;
  }
  if (!canManageAdmin(globalData) && !config.bootstrapRequired) {
    container.innerHTML = emptyState("登录为管理员后，这里会显示认证开关、本地账户与身份绑定管理。");
    return;
  }
  const bindings = Array.isArray(config.bindings) ? config.bindings : [];
  const operators = Array.isArray(config.operators) ? config.operators : [];
  container.innerHTML = `
    <div class="summary-grid">
      ${summaryCard({
        kicker: "认证模式",
        title: config.enabled ? "控制台已启用认证" : "控制台当前处于开放模式",
        note: config.bootstrapRequired ? "还需要完成首位管理员初始化。" : "是否强制登录由下方折叠区统一管理。",
        pillHtml: pill(config.enabled ? "good" : "warn", config.enabled ? "enabled" : "open"),
      })}
      ${summaryCard({
        kicker: "本地账户",
        title: operators.length ? `${operators.length} 个本地账户` : "还没有本地账户",
        note: operators.length
          ? `${operators.filter((operator) => operator.active).length} 个当前可用，保留给 break-glass 或服务账户。`
          : "建议只保留少量 break-glass 账户，避免日常把本地令牌当主登录方式。",
        pillHtml: pill(operators.some((operator) => operator.active) ? "info" : "warn", "operators"),
      })}
      ${calloutCard({
        kicker: "身份绑定",
        title: bindings.length ? `${bindings.filter((binding) => binding.active).length} 条有效企业绑定` : "还没有企业身份绑定",
        note: bindings.length
          ? "企业身份登录能否落到正确角色，取决于这里的 subject / email 绑定。"
          : "如果要把 OIDC 登录交给团队使用，下一步优先补一条 admin 或 reviewer 绑定。",
        tone: bindings.length ? "info" : "warning",
      })}
    </div>

    <details class="management-panel" ${config.bootstrapRequired ? "open" : ""}>
      <summary>展开认证开关与本地账户管理</summary>
      <div class="panel-body">
        <article class="detail-card">
          <p class="section-kicker">认证开关</p>
          <h4>决定控制台是否强制登录</h4>
          <form id="access-config-form" class="stack">
            <label class="inline-toggle">
              <input name="enabled" type="checkbox" ${config.enabled ? "checked" : ""} />
              启用认证与角色门禁
            </label>
            <div class="action-row">
              <button type="submit">保存认证配置</button>
            </div>
          </form>
        </article>

        <article class="detail-card">
          <p class="section-kicker">本地账户</p>
          <h4>新增 break-glass 或服务账户</h4>
          ${operators.length
            ? `<div class="record-list">${operators.map((operator) => recordButton({
                id: operator.id,
                title: operator.name,
                note: `${formatRole(operator.role)} · ${operator.active ? "已启用" : "未启用"}`,
                pillHtml: pill(operator.active ? "good" : "neutral", operator.credentialType),
                meta: [formatDateTime(operator.createdAt)],
              })).join("")}</div>`
            : emptyState("还没有本地账户。")}
          <form id="operator-form" class="stack top-gap">
            <div class="form-grid three">
              <label>
                姓名
                <input name="name" placeholder="Olivia Operator" required />
              </label>
              <label>
                角色
                <select name="role">
                  <option value="viewer">viewer</option>
                  <option value="operator">operator</option>
                  <option value="reviewer">reviewer</option>
                  <option value="admin">admin</option>
                </select>
              </label>
              <label>
                令牌
                <input name="token" placeholder="operator-secret" required />
              </label>
            </div>
            <label class="inline-toggle">
              <input name="active" type="checkbox" checked />
              创建后立即可用
            </label>
            <div class="action-row">
              <button type="submit">创建本地账户</button>
            </div>
          </form>
        </article>
      </div>
    </details>

    <details class="management-panel">
      <summary>展开身份绑定与角色映射</summary>
      <div class="panel-body">
        <article class="detail-card">
          <p class="section-kicker">企业身份绑定</p>
          <h4>把 OIDC subject / email 绑定到角色</h4>
          ${bindings.length
            ? `<div class="record-list">${bindings.map((binding) => `
                <div class="record-card">
                  <div class="record-head">
                    <strong>${binding.label}</strong>
                    ${pill(binding.active ? "good" : "neutral", binding.matchType)}
                  </div>
                  <p class="record-copy">${formatRole(binding.role)} · ${binding.active ? "active" : "inactive"}</p>
                  <div class="record-meta">
                    ${binding.issuer ? `<span>${binding.issuer}</span>` : ""}
                    ${binding.subject ? `<span>${binding.subject}</span>` : ""}
                    ${binding.email ? `<span>${binding.email}</span>` : ""}
                  </div>
                  ${binding.active ? `<div class="action-row top-gap"><button type="button" class="ghost" data-action="deactivate-binding" data-binding-id="${binding.id}">停用绑定</button></div>` : ""}
                </div>
              `).join("")}</div>`
            : emptyState("还没有企业身份绑定。")}
          <form id="binding-form" class="stack top-gap">
            <div class="form-grid three">
              <label>
                标签
                <input name="label" placeholder="Finance Admin Binding" />
              </label>
              <label>
                匹配方式
                <select name="matchType">
                  <option value="email">email</option>
                  <option value="subject">subject</option>
                </select>
              </label>
              <label>
                角色
                <select name="role">
                  <option value="viewer">viewer</option>
                  <option value="operator">operator</option>
                  <option value="reviewer">reviewer</option>
                  <option value="admin">admin</option>
                </select>
              </label>
            </div>
            <div class="form-grid">
              <label>
                Issuer
                <input name="issuer" placeholder="https://accounts.example.com" />
              </label>
              <label>
                Subject
                <input name="subject" placeholder="subject-123" />
              </label>
            </div>
            <label>
              Email
              <input name="email" type="email" placeholder="admin@example.com" />
            </label>
            <div class="action-row">
              <button type="submit">创建身份绑定</button>
            </div>
          </form>
          ${state.accessMessage ? `<p class="footer-note">${state.accessMessage}</p>` : ""}
        </article>
      </div>
    </details>
  `;
}

function renderSessions() {
  const summary = shell.pageContent.querySelector("#session-overview");
  const container = shell.pageContent.querySelector("#session-admin");
  if (!container || !summary) {
    return;
  }
  const globalData = shell.getGlobal();

  summary.innerHTML = canManageAdmin(globalData)
    ? `
      ${summaryCard({
        kicker: "会话总览",
        title: state.sessions.length ? `当前有 ${state.sessions.length} 个活跃会话` : "当前没有活跃会话",
        note: state.currentSessionId ? "当前浏览器 session 也在列表中，可以单独撤销。" : "建立会话后，这里会显示当前浏览器和 OIDC 登录记录。",
        pillHtml: pill(state.sessions.length ? "info" : "neutral", "sessions"),
      })}
      ${calloutCard({
        kicker: "处理建议",
        title: state.selectedSession ? `正在查看 ${state.selectedSession.actor?.name || "当前会话"}` : "先从下方列表选择一个会话",
        note: state.selectedSession
          ? `${formatRole(state.selectedSession.actor?.role)} · ${formatAuthMethod(state.selectedSession.authMethod)}`
          : "如果发现异常登录或过期策略不对，再进入详情执行撤销。",
        tone: state.selectedSession ? "info" : "neutral",
      })}
    `
    : emptyState("登录为管理员后，这里会显示活跃会话摘要。");

  if (!canManageAdmin(globalData)) {
    container.innerHTML = emptyState("当前角色不能查看和撤销活跃会话。");
    return;
  }

  const selected = state.selectedSession;
  container.innerHTML = `
    <article class="detail-card">
      <p class="section-kicker">活跃会话</p>
      <h4>当前浏览器与企业登录 session</h4>
      ${state.sessionError ? `<p class="empty-state">${state.sessionError}</p>` : ""}
      <div id="active-session-list" class="record-list">
        ${state.sessions.length
          ? state.sessions.map((session) => recordButton({
              id: session.sessionId,
              attribute: "data-session-id",
              selected: session.sessionId === state.selectedSessionId,
              title: session.actor?.name || "Unknown Session",
              note: `${formatRole(session.actor?.role)} · ${formatAuthMethod(session.authMethod)}`,
              pillHtml: pill(session.sessionId === state.currentSessionId ? "info" : "neutral", session.sessionId === state.currentSessionId ? "current" : "session"),
              meta: [
                `到期 ${formatDateTime(session.expiresAt)}`,
                session.email || session.subject || shortHash(session.sessionId),
              ],
            })).join("")
          : emptyState("当前没有活跃会话。")}
      </div>
    </article>
    <article class="detail-card">
      <p class="section-kicker">会话详情</p>
      <h4>${selected ? selected.actor?.name || "当前会话" : "请选择一个会话"}</h4>
      ${selected
        ? detailRows([
            { label: "角色", value: formatRole(selected.actor?.role) },
            { label: "登录方式", value: formatAuthMethod(selected.authMethod) },
            { label: "创建时间", value: formatDateTime(selected.createdAt) },
            { label: "最近访问", value: formatDateTime(selected.lastSeenAt) },
            { label: "过期时间", value: formatDateTime(selected.expiresAt) },
            { label: "绝对过期", value: formatDateTime(selected.absoluteExpiresAt) },
            { label: "Email", value: selected.email || null },
            { label: "Subject", value: selected.subject || null },
          ])
        : emptyState("从左侧列表中选择一个会话查看详情。")}
      ${selected ? `<div class="action-row top-gap"><button id="revoke-session" type="button" class="ghost">${selected.sessionId === state.currentSessionId ? "撤销当前会话" : "撤销该会话"}</button></div>` : ""}
      ${state.sessionMessage ? `<p class="footer-note">${state.sessionMessage}</p>` : ""}
      ${selected ? jsonDetails("查看会话技术详情", selected) : ""}
    </article>
  `;
}
