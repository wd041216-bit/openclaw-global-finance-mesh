import {
  api,
  canManageAdmin,
  canOperate,
  canViewSystem,
  formToObject,
  rememberAction,
} from "../core/api.js";
import {
  detailRows,
  emptyState,
  jsonDetails,
  metricRow,
  pill,
  recordButton,
  summaryCard,
} from "../core/components.js";
import {
  formatAuthMethod,
  formatDateTime,
  formatRole,
  humanizeSeconds,
  shortHash,
  translateStatus,
} from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "system",
  sectionLabel: "系统设置",
  title: "把登录、会话、运行时和部署健康收进一个独立页面",
  intro: "未登录时也能先看清入口和环境状态。管理员登录后，再进入身份、会话、运行时与健康配置，不再和业务主流程混在一起。",
  heroActions: `
    <a class="button" href="/workbench.html">返回业务工作台</a>
    <a class="button ghost" href="/recovery.html">打开恢复中心</a>
  `,
  includeMetrics: true,
});

const state = {
  runtimeConfig: null,
  runtimeError: "",
  models: [],
  modelsError: "",
  probeResult: null,
  sessions: [],
  currentSessionId: null,
  selectedSessionId: null,
  selectedSession: null,
  sessionError: "",
  accessMessage: "",
  runtimeMessage: "",
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
            <p class="section-kicker">身份与入口</p>
            <h3>先告诉用户怎么进入控制台</h3>
            <p class="section-copy">未登录时看到本地登录与企业身份入口；登录后展示当前会话与角色。</p>
          </div>
          <button id="refresh-access" type="button" class="ghost">刷新身份状态</button>
        </div>
        <div id="access-overview" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">系统健康</p>
            <h3>环境、探针、恢复与指标</h3>
            <p class="section-copy">这一块只给摘要和下一步动作，技术详情默认折叠。</p>
          </div>
          <div class="section-actions">
            <button id="refresh-runtime" type="button" class="ghost">刷新系统状态</button>
            <button id="run-probe" type="button">执行运行时探针</button>
          </div>
        </div>
        <div id="runtime-overview" class="section-stack"></div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">身份管理</p>
          <h3>登录、角色、身份绑定与会话</h3>
          <p class="section-copy">管理员专属的配置动作都收在这里，普通业务用户不会在首页看到这些表单。</p>
        </div>
      </div>
      <div class="page-grid two-up">
        <div id="identity-admin" class="section-stack"></div>
        <div id="session-admin" class="section-stack"></div>
      </div>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">运行时</p>
          <h3>模型配置、模型列表和当前指标预览</h3>
          <p class="section-copy">业务面板不会直接暴露这些内容，避免干扰日常使用。</p>
        </div>
      </div>
      <div class="page-grid two-up">
        <div id="runtime-config-panel" class="section-stack"></div>
        <div id="runtime-detail-panel" class="section-stack"></div>
      </div>
    </section>
  `;

  shell.pageContent.querySelector("#refresh-access")?.addEventListener("click", () => void refreshAccess());
  shell.pageContent.querySelector("#refresh-runtime")?.addEventListener("click", () => void refreshRuntime());
  shell.pageContent.querySelector("#run-probe")?.addEventListener("click", () => void runProbe());

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
      return;
    }
    if (form.id === "runtime-config-form") {
      event.preventDefault();
      void saveRuntimeConfig(form);
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
      return;
    }
    if (target.id === "load-models") {
      event.preventDefault();
      void refreshModels();
      return;
    }
  });

  renderAccess();
  renderIdentityAdmin();
  renderSessions();
  renderRuntime();
}

async function refreshAll() {
  await refreshAccess();
  await Promise.all([refreshRuntimeConfig(), refreshSessions()]);
}

async function refreshAccess() {
  await shell.refreshChrome();
  renderAccess();
  renderIdentityAdmin();
  renderSessions();
  renderRuntime();
}

async function refreshRuntime() {
  await shell.refreshChrome();
  await refreshRuntimeConfig();
  renderRuntime();
}

async function refreshRuntimeConfig() {
  const globalData = shell.getGlobal();
  state.runtimeError = "";
  if (!canViewSystem(globalData)) {
    state.runtimeConfig = null;
    state.models = [];
    state.modelsError = "";
    state.probeResult = null;
    renderRuntime();
    return;
  }

  try {
    const result = await api("/api/runtime/config");
    state.runtimeConfig = result.config || null;
  } catch (error) {
    state.runtimeConfig = null;
    state.runtimeError = String(error.message || error);
  }

  renderRuntime();
}

async function refreshModels() {
  const globalData = shell.getGlobal();
  state.modelsError = "";
  if (!canOperate(globalData)) {
    state.models = [];
    state.modelsError = "当前角色不能读取模型列表。";
    renderRuntime();
    return;
  }

  state.modelsError = "正在读取模型列表…";
  renderRuntime();
  try {
    const result = await api("/api/runtime/models");
    state.models = Array.isArray(result.models) ? result.models : [];
    state.modelsError = "";
  } catch (error) {
    state.models = [];
    state.modelsError = String(error.message || error);
  }
  renderRuntime();
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
      body: JSON.stringify({
        token: payload.token,
      }),
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
  target.searchParams.set("next", "/system.html");
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
      body: JSON.stringify({
        enabled: payload.enabled,
      }),
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

async function saveRuntimeConfig(form) {
  state.runtimeMessage = "正在保存运行时配置…";
  renderRuntime();
  try {
    const payload = formToObject(form);
    const result = await api("/api/runtime/config", {
      method: "POST",
      body: JSON.stringify({
        mode: payload.mode,
        model: payload.model,
        localBaseUrl: payload.localBaseUrl,
        cloudBaseUrl: payload.cloudBaseUrl,
        apiKey: payload.apiKey || undefined,
        temperature: payload.temperature ? Number(payload.temperature) : undefined,
        systemPrompt: payload.systemPrompt,
        persistSecret: payload.persistSecret,
      }),
    });
    state.runtimeConfig = result.config || null;
    rememberAction("已更新运行时模型配置");
    state.runtimeMessage = "运行时配置已保存。";
    await shell.refreshChrome();
    renderRuntime();
  } catch (error) {
    state.runtimeMessage = String(error.message || error);
    renderRuntime();
  }
}

async function runProbe() {
  const globalData = shell.getGlobal();
  if (!canOperate(globalData)) {
    state.runtimeMessage = "当前角色不能执行运行时探针。";
    renderRuntime();
    return;
  }
  state.runtimeMessage = "正在执行运行时探针…";
  renderRuntime();
  try {
    const result = await api("/api/runtime/probe", {
      method: "POST",
      body: JSON.stringify({}),
    });
    state.probeResult = result.probe || null;
    rememberAction("已执行运行时探针");
    await shell.refreshChrome();
    renderRuntime();
  } catch (error) {
    state.probeResult = null;
    state.runtimeMessage = String(error.message || error);
    renderRuntime();
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

  const identityTitle = session?.authenticated
    ? `${session.actor?.name || "当前用户"} · ${formatRole(session.actor?.role)}`
    : config.bootstrapRequired
      ? "等待创建首位管理员"
      : config.enabled
        ? "等待登录"
        : "开放模式";
  const identityNote = session?.authenticated
    ? `当前会话采用 ${formatAuthMethod(session.authMethod)} 方式登录，可继续进入下方系统管理。`
    : config.bootstrapRequired
      ? "先创建初始管理员，浏览器会自动签发会话并进入受保护模式。"
      : config.enabled
        ? "可以使用本地应急令牌或企业身份登录。"
        : "当前控制台处于开放模式，业务摘要不需要登录。";
  const identityTone = session?.authenticated ? "good" : config.bootstrapRequired ? "warn" : config.enabled ? "info" : "neutral";
  const identityLabel = session?.authenticated ? "已登录" : config.bootstrapRequired ? "待初始化" : config.enabled ? "未登录" : "开放模式";

  container.innerHTML = `
    ${summaryCard({
      kicker: "当前身份",
      title: identityTitle,
      note: identityNote,
      pillHtml: pill(identityTone, identityLabel),
      meta: [
        `身份模式 ${config.identityMode}`,
        config.oidcConfigured ? `OIDC ${config.oidcDisplayName || "configured"}` : "OIDC 未配置",
        config.allowLocalTokens ? "本地令牌已启用" : "本地令牌已关闭",
      ],
    })}
    ${detailRows([
      { label: "身份模式", value: config.identityMode },
      { label: "认证开关", value: config.enabled ? "已启用" : "未启用" },
      { label: "本地令牌", value: config.allowLocalTokens ? "允许作为 break-glass" : "已禁用" },
      { label: "OIDC", value: config.oidcConfigured ? (config.oidcDisplayName || config.issuer || "已配置") : "未配置" },
      { label: "当前会话方式", value: session?.authMethod ? formatAuthMethod(session.authMethod) : null },
      { label: "当前会话到期", value: session?.currentSession?.expiresAt ? formatDateTime(session.currentSession.expiresAt) : null },
    ])}
    ${state.accessMessage ? `<p class="footer-note">${state.accessMessage}</p>` : ""}
    ${renderAccessActions(globalData)}
    ${jsonDetails("查看身份技术详情", {
      config,
      session,
    })}
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
        <p class="summary-note">当前配置会跳转到 ${escapeHtml(config.oidcDisplayName || config.issuer || "OIDC Provider")} 完成企业登录。</p>
        <div class="action-row">
          <button id="start-oidc-login" type="button">使用企业身份登录</button>
        </div>
      </article>
    `);
  }

  if (session?.authenticated) {
    blocks.push(`
      <article id="access-summary" class="detail-card">
        <p class="section-kicker">当前会话</p>
        <h4>${escapeHtml(session.actor?.name || "当前用户")}</h4>
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
    container.innerHTML = emptyState("登录为管理员后，这里会显示认证开关、账户签发和身份绑定管理。");
    return;
  }

  const bindings = Array.isArray(config.bindings) ? config.bindings : [];
  const operators = Array.isArray(config.operators) ? config.operators : [];

  container.innerHTML = `
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
        ? `<div class="record-list">${operators
            .map((operator) =>
              recordButton({
                id: operator.id,
                title: operator.name,
                note: `${formatRole(operator.role)} · ${operator.active ? "已启用" : "未启用"}`,
                pillHtml: pill(operator.active ? "good" : "neutral", operator.credentialType),
                meta: [formatDateTime(operator.createdAt)],
              }),
            )
            .join("")}</div>`
        : emptyState("还没有本地账户。") }
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

    <article class="detail-card">
      <p class="section-kicker">企业身份绑定</p>
      <h4>把 OIDC subject / email 绑定到角色</h4>
      ${bindings.length
        ? `<div id="binding-list" class="record-list">${bindings
            .map((binding) =>
              `
                <div class="record-card">
                  <div class="record-head">
                    <strong>${escapeHtml(binding.label)}</strong>
                    ${pill(binding.active ? "good" : "neutral", binding.matchType)}
                  </div>
                  <p class="record-copy">${escapeHtml(formatRole(binding.role))} · ${escapeHtml(binding.active ? "active" : "inactive")}</p>
                  <div class="record-meta">
                    ${binding.issuer ? `<span>${escapeHtml(binding.issuer)}</span>` : ""}
                    ${binding.subject ? `<span>${escapeHtml(binding.subject)}</span>` : ""}
                    ${binding.email ? `<span>${escapeHtml(binding.email)}</span>` : ""}
                  </div>
                  ${binding.active ? `<div class="action-row top-gap"><button type="button" class="ghost" data-action="deactivate-binding" data-binding-id="${escapeHtml(binding.id)}">停用绑定</button></div>` : ""}
                </div>
              `,
            )
            .join("")}</div>`
        : emptyState("还没有企业身份绑定。") }
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
      ${state.accessMessage ? `<p class="footer-note">${escapeHtml(state.accessMessage)}</p>` : ""}
    </article>
  `;
}

function renderSessions() {
  const container = shell.pageContent.querySelector("#session-admin");
  if (!container) {
    return;
  }

  const globalData = shell.getGlobal();
  if (!canManageAdmin(globalData)) {
    container.innerHTML = emptyState("当前角色不能查看和撤销活跃会话。");
    return;
  }

  const selected = state.selectedSession;
  container.innerHTML = `
    <article class="detail-card">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">活跃会话</p>
          <h4>当前浏览器与企业登录 session</h4>
        </div>
      </div>
      ${state.sessionError ? `<p class="empty-state">${escapeHtml(state.sessionError)}</p>` : ""}
      <div id="active-session-list" class="record-list">
        ${state.sessions.length
          ? state.sessions
              .map((session) =>
                recordButton({
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
                }),
              )
              .join("")
          : emptyState("当前没有活跃会话。")}
      </div>
    </article>
    <article class="detail-card">
      <p class="section-kicker">会话详情</p>
      <h4>${selected ? escapeHtml(selected.actor?.name || "当前会话") : "请选择一个会话"}</h4>
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
      ${selected
        ? `<div class="action-row top-gap"><button id="revoke-session" type="button" class="ghost">${selected.sessionId === state.currentSessionId ? "撤销当前会话" : "撤销该会话"}</button></div>`
        : ""}
      ${state.sessionMessage ? `<p class="footer-note">${escapeHtml(state.sessionMessage)}</p>` : ""}
      ${selected ? jsonDetails("查看会话技术详情", selected) : ""}
    </article>
  `;
}

function renderRuntime() {
  const runtimeContainer = shell.pageContent.querySelector("#runtime-overview");
  const configContainer = shell.pageContent.querySelector("#runtime-config-panel");
  const detailContainer = shell.pageContent.querySelector("#runtime-detail-panel");
  if (!runtimeContainer || !configContainer || !detailContainer) {
    return;
  }

  const globalData = shell.getGlobal();
  const health = globalData.operationsHealth;
  const runtime = state.runtimeConfig;
  const lastProbe = state.probeResult || health?.recent?.probe || globalData.overview?.runtime?.lastProbe;
  const canOperateNow = canOperate(globalData);
  const canManageNow = canManageAdmin(globalData);

  const runtimeSummary = health
    ? summaryCard({
        kicker: "运行摘要",
        title: runtime ? `${runtime.mode} · ${runtime.model}` : "等待运行时配置",
        note: health.checks.runtime?.summary || "系统运行状态会显示在这里。",
        pillHtml: pill(
          health.checks.runtime?.status === "healthy" ? "good" : health.checks.runtime?.status === "degraded" ? "warn" : "neutral",
          translateStatus(health.checks.runtime?.status || "pending"),
        ),
        meta: [
          `${health.environment}/${health.teamScope}`,
          `已运行 ${humanizeSeconds(health.uptimeSeconds)}`,
          health.recent?.backup?.createdAt ? `最近备份 ${formatDateTime(health.recent.backup.createdAt)}` : "尚无备份",
        ],
      })
    : emptyState("等待系统健康摘要。");

  runtimeContainer.innerHTML = `
    ${runtimeSummary}
    ${health
      ? detailRows([
          { label: "Ledger", value: health.checks.ledger?.summary },
          { label: "Legal Library", value: health.checks.legalLibrary?.summary },
          { label: "Backup Targets", value: health.checks.backupTargets?.summary },
          { label: "Recovery Drill", value: health.checks.recoveryDrill?.summary },
          { label: "最近探针", value: lastProbe?.createdAt ? formatDateTime(lastProbe.createdAt) : "尚未探针" },
        ])
      : ""}
    ${state.runtimeMessage ? `<p class="footer-note">${escapeHtml(state.runtimeMessage)}</p>` : ""}
    ${lastProbe ? jsonDetails("查看探针技术详情", lastProbe) : ""}
  `;

  shell.pageContent.querySelector("#run-probe").style.display = canOperateNow ? "" : "none";

  configContainer.innerHTML = canManageNow
    ? `
      <article class="detail-card">
        <p class="section-kicker">运行时配置</p>
        <h4>修改模型、模式和系统提示词</h4>
        ${state.runtimeError ? `<p class="empty-state">${escapeHtml(state.runtimeError)}</p>` : ""}
        <form id="runtime-config-form" class="stack">
          <div class="form-grid three">
            <label>
              Mode
              <select name="mode">
                <option value="local" ${runtime?.mode === "local" ? "selected" : ""}>local</option>
                <option value="cloud" ${runtime?.mode === "cloud" ? "selected" : ""}>cloud</option>
              </select>
            </label>
            <label>
              Model
              <input name="model" value="${escapeHtml(runtime?.model || "")}" placeholder="qwen3:8b" />
            </label>
            <label>
              Temperature
              <input name="temperature" type="number" step="0.1" min="0" max="2" value="${escapeHtml(runtime?.temperature ?? 0.2)}" />
            </label>
          </div>
          <div class="form-grid">
            <label>
              Local Base URL
              <input name="localBaseUrl" value="${escapeHtml(runtime?.localBaseUrl || "")}" placeholder="http://127.0.0.1:11434" />
            </label>
            <label>
              Cloud Base URL
              <input name="cloudBaseUrl" value="${escapeHtml(runtime?.cloudBaseUrl || "")}" placeholder="https://ollama.com" />
            </label>
          </div>
          <label>
            API Key
            <input name="apiKey" type="password" placeholder="${runtime?.hasApiKey ? "当前已配置 API Key，如需变更可重新输入" : "仅 cloud mode 需要"}" />
          </label>
          <label class="inline-toggle">
            <input name="persistSecret" type="checkbox" />
            把本次输入的 API Key 持久化到本地 secrets 文件
          </label>
          <label>
            System Prompt
            <textarea name="systemPrompt" placeholder="System prompt">${escapeHtml(runtime?.systemPrompt || "")}</textarea>
          </label>
          <div class="action-row">
            <button type="submit">保存运行时配置</button>
          </div>
        </form>
      </article>
    `
    : `
      <article class="detail-card">
        <p class="section-kicker">运行时配置</p>
        <h4>当前角色只能查看摘要</h4>
        <p class="summary-note">登录为管理员后，这里会显示模型配置表单。</p>
        ${runtime ? detailRows([
          { label: "模式", value: runtime.mode },
          { label: "模型", value: runtime.model },
          { label: "Local Base URL", value: runtime.localBaseUrl },
          { label: "Cloud Base URL", value: runtime.cloudBaseUrl },
        ]) : emptyState(state.runtimeError || "当前还没有可展示的运行时配置。")}
      </article>
    `;

  detailContainer.innerHTML = `
    <article class="detail-card">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">模型列表</p>
          <h4>按需拉取可用模型</h4>
        </div>
        <button id="load-models" type="button" class="ghost">读取模型列表</button>
      </div>
      ${state.modelsError ? `<p class="empty-state">${escapeHtml(state.modelsError)}</p>` : ""}
      ${state.models.length
        ? `<div class="record-list">${state.models
            .map((model) =>
              recordButton({
                id: model.name,
                title: model.name,
                note: model.digest ? `digest ${shortHash(model.digest)}` : "未提供 digest",
                meta: [],
              }),
            )
            .join("")}</div>`
        : emptyState(canOperateNow ? "点击上方按钮读取当前模型列表。" : "登录为 operator 或 admin 后可读取模型列表。")}
    </article>
    <article class="detail-card">
      <p class="section-kicker">指标预览</p>
      <h4>Prometheus 文本摘要</h4>
      <div class="metric-grid">
        ${metricRow("Metrics", health?.metricsAvailable ? "enabled" : "unavailable")}
        ${metricRow("Active Sessions", String(globalData.overview?.governance?.sessions?.activeCount ?? 0))}
        ${metricRow("Probe Status", lastProbe?.status || "pending")}
      </div>
      ${globalData.metricsPreview ? jsonDetails("查看 metrics 文本", globalData.metricsPreview) : ""}
      ${runtime ? jsonDetails("查看运行时技术详情", runtime) : ""}
    </article>
  `;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
