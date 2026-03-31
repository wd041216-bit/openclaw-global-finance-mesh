import {
  api,
  canManageAdmin,
  canOperate,
  canViewSystem,
  formToObject,
  rememberAction,
} from "../core/api.js";
import {
  calloutCard,
  codeBlock,
  detailRows,
  emptyState,
  jsonDetails,
  pill,
  recordButton,
  summaryCard,
} from "../core/components.js";
import { formatDateTime, shortHash } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "system-runtime",
  sectionLabel: "运行时",
  title: "把模型、探针、cloud doctor 和协议诊断收成独立子页",
  intro: "系统总览只给放行状态。真正的 provider、协议、模型、probe 和验证命令都集中在这里，方便管理员处理云端链路。",
  heroActions: `
    <a class="button" href="/system.html">返回管理总览</a>
    <a class="button ghost" href="/system-health.html">查看健康与指标</a>
  `,
});

const state = {
  runtimeConfig: null,
  runtimeError: "",
  models: [],
  modelsError: "",
  probeResult: null,
  probeDiagnosis: null,
  probeDoctorReport: null,
  runtimeMessage: "",
};

renderFrame();
await refreshRuntimeConfig();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">放行状态</p>
            <h3>先看今天是否已经满足正式试点条件</h3>
          </div>
          <div class="section-actions">
            <button id="refresh-runtime" type="button" class="ghost">刷新</button>
            <button id="run-probe" type="button">执行运行时探针</button>
          </div>
        </div>
        <div id="runtime-overview" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">运行时配置</p>
            <h3>模型、协议与系统提示词</h3>
          </div>
        </div>
        <div id="runtime-config-panel" class="section-stack"></div>
      </article>
    </section>

    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">Cloud Doctor</p>
            <h3>把 provider、协议、模型和阻断项说清楚</h3>
          </div>
        </div>
        <div id="runtime-detail-panel" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">模型目录</p>
            <h3>按当前协议读取可见模型</h3>
          </div>
          <button id="load-models" type="button" class="ghost">读取模型列表</button>
        </div>
        <div id="runtime-models" class="section-stack"></div>
      </article>
    </section>
  `;

  shell.pageContent.querySelector("#refresh-runtime")?.addEventListener("click", () => void refreshRuntime());
  shell.pageContent.querySelector("#run-probe")?.addEventListener("click", () => void runProbe());
  shell.pageContent.querySelector("#load-models")?.addEventListener("click", () => void refreshModels());
  shell.pageContent.addEventListener("submit", (event) => {
    const form = event.target.closest("form");
    if (form?.id === "runtime-config-form") {
      event.preventDefault();
      void saveRuntimeConfig(form);
    }
  });

  renderRuntime();
}

async function refreshRuntime() {
  await shell.refreshChrome();
  await refreshRuntimeConfig();
}

async function refreshRuntimeConfig() {
  const globalData = shell.getGlobal();
  state.runtimeError = "";
  if (!canViewSystem(globalData)) {
    state.runtimeConfig = null;
    state.models = [];
    state.modelsError = "";
    state.probeResult = null;
    state.probeDiagnosis = null;
    state.probeDoctorReport = null;
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
        cloudApiFlavor: payload.cloudApiFlavor,
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
    state.probeDiagnosis = result.diagnosis || null;
    state.probeDoctorReport = result.doctorReport || null;
    rememberAction("已执行运行时探针");
    await shell.refreshChrome();
    renderRuntime();
  } catch (error) {
    state.probeResult = null;
    state.probeDiagnosis = null;
    state.probeDoctorReport = null;
    state.runtimeMessage = String(error.message || error);
    renderRuntime();
  }
}

function renderRuntime() {
  const runtimeContainer = shell.pageContent.querySelector("#runtime-overview");
  const configContainer = shell.pageContent.querySelector("#runtime-config-panel");
  const detailContainer = shell.pageContent.querySelector("#runtime-detail-panel");
  const modelsContainer = shell.pageContent.querySelector("#runtime-models");
  if (!runtimeContainer || !configContainer || !detailContainer || !modelsContainer) {
    return;
  }

  const globalData = shell.getGlobal();
  const runtimeOverview = globalData.overview?.runtime;
  const runtime = state.runtimeConfig;
  const doctorReport = state.probeDoctorReport || runtimeOverview?.verification || runtimeOverview?.doctorReport || null;
  const diagnosis = state.probeDiagnosis || runtimeOverview?.diagnosis || null;
  const lastProbe = state.probeResult || runtimeOverview?.lastProbe || null;
  const canManageNow = canManageAdmin(globalData);
  const canOperateNow = canOperate(globalData);

  runtimeContainer.innerHTML = !canViewSystem(globalData)
    ? emptyState("登录后才能查看运行时子页。")
    : `
      <div class="summary-grid">
        ${summaryCard({
          kicker: "正式试点放行",
          title: doctorReport?.goLiveReady ? "现在可正式试点" : doctorReport?.goLiveBlockers?.[0] || runtimeOverview?.summary || "等待运行时验证",
          note: doctorReport?.goLiveReady
            ? "目录和推理都已经通过真实验证，可以继续对外开放小规模试点。"
            : doctorReport?.recommendedAction || runtimeOverview?.summary || "继续到下面的 doctor 报告查看详细阻断项。",
          pillHtml: pill(doctorReport?.goLiveReady ? "good" : doctorReport?.requiresProviderAction ? "warn" : "info", doctorReport?.goLiveReady ? "go_live_ready" : "blocked"),
          meta: [
            doctorReport?.provider?.label ? `Provider ${doctorReport.provider.label}` : runtime?.mode || "等待配置",
            doctorReport?.validatedFlavorLabel ? `已验证协议 ${doctorReport.validatedFlavorLabel}` : runtime?.cloudApiFlavor || "auto",
            doctorReport?.lastVerifiedAt ? `最近验证 ${formatDateTime(doctorReport.lastVerifiedAt)}` : "尚未形成真实验证时间",
          ],
        })}
        ${summaryCard({
          kicker: "当前模型",
          title: doctorReport?.verifiedModel || runtime?.model || "等待模型配置",
          note: doctorReport?.configuredModelVisible
            ? "当前模型已经出现在可见目录里。"
            : doctorReport?.summary || "如果模型名没有命中目录，doctor 报告会继续提示替代模型。",
          pillHtml: pill(doctorReport?.configuredModelVisible ? "good" : "warn", doctorReport?.configuredModelVisible ? "visible" : "check_model"),
          meta: [
            runtime?.mode === "cloud" ? `协议 ${formatCloudFlavor(runtime?.cloudApiFlavor)}` : runtime?.mode || "等待模式",
            doctorReport?.catalogAccess ? `目录 ${doctorReport.catalogAccess}` : "等待目录状态",
            doctorReport?.inferenceAccess ? `推理 ${doctorReport.inferenceAccess}` : "等待推理状态",
          ],
        })}
        ${calloutCard({
          kicker: "下一步",
          title: doctorReport?.goLiveReady
            ? "继续保持真实 probe 记录"
            : doctorReport?.requiresProviderAction
              ? "先联系 provider 处理权限"
              : diagnosis?.nextActionTitle || "继续排查云端链路",
          note: state.runtimeMessage || doctorReport?.goLiveBlockers?.[0] || diagnosis?.recommendedActions?.[0] || runtimeOverview?.summary || "执行一次 probe 后，这里会给出更具体的中文建议。",
          tone: doctorReport?.goLiveReady ? "good" : doctorReport?.requiresProviderAction ? "warning" : "info",
        })}
      </div>
    `;

  configContainer.innerHTML = canManageNow
    ? `
      ${summaryCard({
        kicker: "当前配置",
        title: runtime ? `${runtime.mode} · ${runtime.model}` : "等待读取运行时配置",
        note: runtime?.mode === "cloud"
          ? `当前 cloud protocol 为 ${formatCloudFlavor(runtime.cloudApiFlavor)}。`
          : "当前还是本地模式，可切换到 Ollama Cloud。", 
        pillHtml: pill("info", "editable"),
      })}
      ${state.runtimeError ? `<p class="empty-state">${state.runtimeError}</p>` : ""}
      <form id="runtime-config-form" class="stack">
        <div class="form-grid three">
          <label>
            运行模式
            <select name="mode">
              <option value="local" ${runtime?.mode === "local" ? "selected" : ""}>local</option>
              <option value="cloud" ${runtime?.mode === "cloud" ? "selected" : ""}>cloud</option>
            </select>
          </label>
          <label>
            模型名称
            <input name="model" value="${escapeHtml(runtime?.model || "")}" placeholder="kimi-k2.5" />
          </label>
          <label>
            Temperature
            <input name="temperature" type="number" step="0.1" min="0" max="2" value="${escapeHtml(runtime?.temperature ?? 0.2)}" />
          </label>
        </div>
        <div class="form-grid three">
          <label>
            本地 Base URL
            <input name="localBaseUrl" value="${escapeHtml(runtime?.localBaseUrl || "")}" placeholder="http://127.0.0.1:11434" />
          </label>
          <label>
            云端 Base URL
            <input name="cloudBaseUrl" value="${escapeHtml(runtime?.cloudBaseUrl || "")}" placeholder="https://ollama.com" />
          </label>
          <label>
            Cloud Protocol
            <select name="cloudApiFlavor">
              <option value="auto" ${runtime?.cloudApiFlavor === "auto" ? "selected" : ""}>auto</option>
              <option value="ollama_native" ${runtime?.cloudApiFlavor === "ollama_native" ? "selected" : ""}>ollama_native</option>
              <option value="openai_compatible" ${runtime?.cloudApiFlavor === "openai_compatible" ? "selected" : ""}>openai_compatible</option>
            </select>
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
    `
    : calloutCard({
        kicker: "权限说明",
        title: "当前角色只能查看运行时摘要",
        note: "登录为管理员后，这里会显示模型、协议和系统提示词表单。",
        tone: "info",
      });

  detailContainer.innerHTML = `
    ${renderDoctorReport(doctorReport)}
    ${lastProbe ? jsonDetails("查看探针技术详情", lastProbe) : ""}
    ${diagnosis ? jsonDetails("查看运行时诊断对象", diagnosis) : ""}
  `;

  modelsContainer.innerHTML = `
    ${state.modelsError ? `<p class="empty-state">${escapeHtml(state.modelsError)}</p>` : ""}
    ${state.models.length
      ? `<div class="record-list">${state.models.map((model) => recordButton({
          id: model.name,
          title: model.name,
          note: model.digest ? `digest ${shortHash(model.digest)}` : "未提供 digest",
          meta: [],
        })).join("")}</div>`
      : emptyState(canOperateNow ? "点击上方按钮读取当前模型列表。" : "登录为 operator 或 admin 后可读取模型列表。")}
  `;

  const runProbeButton = shell.pageContent.querySelector("#run-probe");
  if (runProbeButton) {
    runProbeButton.style.display = canOperateNow ? "" : "none";
  }
}

function renderDoctorReport(report) {
  if (!report) {
    return `
      <article class="detail-card">
        <p class="section-kicker">Cloud Doctor</p>
        <h4>等待第一份联调报告</h4>
        ${emptyState("执行一次探针后，这里会出现 provider 判断、推荐协议、验证命令和升级给 provider 的描述。")}
      </article>
    `;
  }
  return `
    <article class="detail-card">
      <p class="section-kicker">Cloud Doctor</p>
      <h4>${escapeHtml(report.goLiveReady ? "运行时已通过正式试点验证" : report.summary)}</h4>
      <div class="summary-grid">
        ${summaryCard({
          kicker: "验证状态",
          title: report.verificationLabel,
          note: report.goLiveReady
            ? "目录与推理都已经跑通，当前可以把这条配置作为正式试点默认路径。"
            : report.blockedReason || report.provider.reason,
          pillHtml: pill(report.goLiveReady ? "good" : report.requiresProviderAction ? "warn" : "info", report.verificationStatus),
          meta: [
            report.provider.label,
            report.lastVerifiedAt ? `最近验证 ${formatDateTime(report.lastVerifiedAt)}` : "尚未形成真实验证时间",
          ],
        })}
        ${summaryCard({
          kicker: "Provider 与模型",
          title: report.provider.label,
          note: report.verifiedModel ? `当前已验证模型为 ${report.verifiedModel}。` : "当前还没有形成可归档的已验证模型。",
          pillHtml: pill(report.configuredModelVisible ? "good" : "warn", report.configuredModelVisible ? "model_visible" : "check_model"),
          meta: [
            `当前 ${report.currentFlavorLabel}`,
            report.validatedFlavorLabel ? `已验证 ${report.validatedFlavorLabel}` : `建议 ${report.recommendedFlavorLabel}`,
          ],
        })}
        ${calloutCard({
          kicker: "放行阻断项",
          title: report.goLiveReady ? "当前没有阻断项" : "先把这些问题处理掉",
          note: report.goLiveReady ? "当前 provider、协议与模型都已经通过真实验证。" : report.goLiveBlockers[0] || report.recommendedAction,
          tone: report.goLiveReady ? "good" : report.requiresProviderAction ? "warning" : "info",
        })}
      </div>
      <div class="top-gap">
        ${detailRows([
          { label: "Provider", value: report.provider.label },
          { label: "当前协议", value: report.currentFlavorLabel },
          { label: "已验证协议", value: report.validatedFlavorLabel || "" },
          { label: "已验证模型", value: report.verifiedModel || "" },
          { label: "Catalog", value: report.catalogAccess || "" },
          { label: "Inference", value: report.inferenceAccess || "" },
        ])}
      </div>
      ${report.manualChecks?.length ? `
        <div class="record-list top-gap">
          ${report.manualChecks.map((command) => `
            <div class="record-card">
              <div class="record-head">
                <strong>${escapeHtml(command.title)}</strong>
                ${pill(command.scope === "catalog" ? "info" : "warn", command.scope)}
              </div>
              <p class="summary-note">${escapeHtml(command.expectedOutcome)}</p>
              ${codeBlock(command.command)}
            </div>
          `).join("")}
        </div>
      ` : ""}
      ${jsonDetails("查看 doctor 报告原始对象", report)}
    </article>
  `;
}

function formatCloudFlavor(value) {
  if (value === "ollama_native") {
    return "Ollama Native";
  }
  if (value === "openai_compatible") {
    return "OpenAI Compatible";
  }
  return "Auto";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
