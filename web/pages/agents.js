import { api } from "../core/api.js";
import { codeBlock, emptyState, pill } from "../core/components.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "agents",
  sectionLabel: "Agent Hub",
  title: "让 Zhouheng 被多个 Agent 宿主接入",
  intro: "统一 adapter registry 把 OpenClaw、Claude 和 Manus 的接入方式收口到同一个事实源。这里展示宿主如何把 Zhouheng 当插件或工具来用。",
  heroActions: `
    <a class="button" href="/workbench.html">返回业务工作台</a>
    <a class="button ghost" href="/system.html">查看系统设置</a>
  `,
});

await render();

async function render() {
  shell.pageContent.innerHTML = `<section class="page-section"><p class="empty-state">正在读取 Agent 适配器列表…</p></section>`;
  try {
    const result = await api("/api/integrations/adapters");
    const adapters = result.adapters || [];
    shell.pageContent.innerHTML = adapters.length
      ? `
        <section class="page-section">
          <div class="section-head compact">
            <div>
              <p class="section-kicker">兼容层清单</p>
              <h3>每种宿主都看到同一个能力面</h3>
              <p class="section-copy">OpenClaw 走原生 plugin，Claude / Manus 走同一个本地 MCP 入口。</p>
            </div>
          </div>
          <div class="install-grid">
            ${adapters.map(renderAdapterCard).join("")}
          </div>
        </section>
      `
      : `<section class="page-section">${emptyState("还没有可用的 Agent 适配器描述。")}</section>`;
  } catch (error) {
    shell.pageContent.innerHTML = `<section class="page-section">${emptyState(String(error.message || error))}</section>`;
  }
}

function renderAdapterCard(adapter) {
  return `
    <article class="install-card agent-card">
      <div class="record-head">
        <div>
          <p class="section-kicker">${adapter.kind === "openclaw_plugin" ? "OpenClaw Plugin" : "MCP Connector"}</p>
          <strong>${adapter.displayName}</strong>
        </div>
        ${pill(adapter.status === "ready" ? "good" : "warn", adapter.status)}
      </div>
      <p class="summary-note">${adapter.description}</p>
      <div class="detail-table">
        <div class="detail-row">
          <span>入口文件</span>
          <strong>${adapter.entrypoint}</strong>
        </div>
        <div class="detail-row">
          <span>安装方式</span>
          <strong>${adapter.installMode}</strong>
        </div>
      </div>
      <div>
        <p class="section-kicker">能做什么</p>
        <ul class="capability-list">
          ${adapter.capabilities
            .map((item) => `<li><strong>${item.title}</strong>：${item.description}</li>`)
            .join("")}
        </ul>
      </div>
      <div>
        <p class="section-kicker">安装步骤</p>
        <ol class="step-list">
          ${adapter.installGuide.steps.map((step) => `<li>${step}</li>`).join("")}
        </ol>
      </div>
      <details class="technical-details">
        <summary>查看安装详情</summary>
        <p class="summary-note">${adapter.installGuide.summary}</p>
        ${codeBlock(adapter.installGuide.configSnippet)}
        <div class="footer-note">配置模板：${adapter.configTemplatePath}</div>
        <div class="footer-note">文档路径：${adapter.docsPath}</div>
      </details>
      <div>
        <p class="section-kicker">如何验证</p>
        <ul class="verify-list">
          ${adapter.installGuide.verification.map((item) => `<li>${item}</li>`).join("")}
        </ul>
      </div>
    </article>
  `;
}

