import { api } from "../core/api.js";
import { bulletList, codeBlock, emptyState, pill, stepCard, summaryCard } from "../core/components.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "agents",
  sectionLabel: "Agent Hub",
  title: "让 Zhouheng 被多个 Agent 宿主稳定接入",
  intro: "这里先讲每个宿主能做什么，再讲本地如何启动、如何验证，最后才展开配置片段和技术细节。",
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
        <section class="page-grid two-up">
          <article class="page-section">
            <div class="section-head compact">
              <div>
                <p class="section-kicker">接入原则</p>
                <h3>先统一契约，再区分宿主</h3>
                <p class="section-copy">OpenClaw 走原生 plugin，Claude / Manus / Cursor / Cline / Cherry Studio 走同一个共享 MCP 入口。业务能力保持同一事实源，不为不同宿主复制一套实现。</p>
              </div>
            </div>
            <div class="summary-grid">
              ${summaryCard({
                kicker: "当前策略",
                title: "OpenClaw = Native Plugin",
                note: "适合已经在使用 OpenClaw 的本地自动化环境，不需要单独启动 MCP 进程。",
                pillHtml: pill("good", "native_ready"),
                meta: ["工具面：校验 / 决策 / 回放"],
              })}
              ${summaryCard({
                kicker: "当前策略",
                title: "Claude / Manus / Cursor / Cline / Cherry = Shared MCP",
                note: "五个宿主复用同一个本地 stdio MCP server，避免 host-specific 分叉。",
                pillHtml: pill("warn", "shared_mcp_beta"),
                meta: ["工具面：5 个 finance_mesh_* 工具", "统一入口：integrations/mcp/server.ts"],
              })}
            </div>
          </article>
          <article class="page-section">
            <div class="section-head compact">
              <div>
                <p class="section-kicker">最小闭环</p>
                <h3>先把本地验证跑通</h3>
              </div>
            </div>
            <div class="section-stack">
              ${stepCard({
                step: "01",
                title: "先确认入口命令能启动",
                note: "MCP 线路先执行 npm run mcp:serve；OpenClaw 线路则让宿主直接加载 integrations/openclaw。",
              })}
              ${stepCard({
                step: "02",
                title: "再确认工具能被列出",
                note: "Claude / Manus / Cursor / Cline / Cherry 至少要看到五个 finance_mesh_* 工具；OpenClaw 至少要看到三个原生工具。",
              })}
              ${stepCard({
                step: "03",
                title: "最后跑一次真实调用",
                note: "建议至少调用一次决策工具和一次依据库搜索工具，确认 structuredContent 可被宿主读取。",
              })}
              ${stepCard({
                step: "04",
                title: "统一跑一遍宿主诊断",
                note: "当你不确定问题在配置、入口还是工具契约时，直接执行 npm run doctor:hosts。",
                footer: "这条命令会串起 MCP smoke、OpenClaw fixture smoke，以及六家宿主的接入文档/配置模板检查。",
              })}
            </div>
          </article>
        </section>
        <section class="page-section">
          <div class="section-head compact">
            <div>
              <p class="section-kicker">兼容层清单</p>
              <h3>每种宿主都看到同一个能力面</h3>
              <p class="section-copy">卡片顺序固定为：能做什么、如何启动、如何验证、最后再看配置片段和技术详情。</p>
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
  const startArtifact = findArtifact(adapter, "command");
  const verifyArtifact = findArtifact(adapter, "verify");
  return `
    <article id="adapter-${adapter.id}" class="install-card agent-card">
      <div class="record-head">
        <div>
          <p class="section-kicker">${adapter.kind === "openclaw_plugin" ? "OpenClaw Plugin" : "MCP Connector"}</p>
          <strong>${adapter.displayName}</strong>
        </div>
        <div class="button-stack">
          ${pill(adapter.status === "ready" ? "good" : "warn", adapter.status)}
          ${pill(adapter.supportLevel === "native_ready" ? "good" : "warn", adapter.supportLevel)}
        </div>
      </div>
      <p class="summary-note">${adapter.description}</p>
      ${summaryCard({
        kicker: "能做什么",
        title: adapter.installGuide.title,
        note: adapter.installGuide.summary,
        pillHtml: pill("info", adapter.installMode),
        meta: [
          ...(adapter.hosts?.length ? [`宿主 ${adapter.hosts.join(" / ")}`] : []),
          ...(adapter.platforms?.length ? [`平台 ${adapter.platforms.join(" / ")}`] : []),
          ...(adapter.testedHosts?.length ? adapter.testedHosts : []),
        ],
      })}
      <div>
        <p class="section-kicker">能力覆盖</p>
        ${bulletList(adapter.capabilities.map((item) => `${item.title}：${item.description}`), "capability-list")}
      </div>
      ${startArtifact ? `
        <div>
          <p class="section-kicker">本地如何启动</p>
          <p class="summary-note">${startArtifact.description}</p>
          ${codeBlock(startArtifact.value)}
        </div>
      ` : ""}
      <div>
        <p class="section-kicker">如何验证</p>
        ${verifyArtifact ? codeBlock(verifyArtifact.value) : ""}
        ${bulletList(adapter.installGuide.verification, "verify-list")}
      </div>
      <div>
        <p class="section-kicker">常见失败</p>
        ${bulletList(adapter.troubleshooting || adapter.installGuide.troubleshooting, "verify-list")}
      </div>
      <details class="technical-details">
        <summary>查看安装详情</summary>
        <div class="section-stack">
          <div>
            <p class="section-kicker">配置片段</p>
            ${codeBlock(adapter.installGuide.configSnippet)}
          </div>
          <div>
            <p class="section-kicker">安装步骤</p>
            ${bulletList(adapter.installGuide.steps, "step-list")}
          </div>
          <div>
            <p class="section-kicker">常见失败</p>
            ${bulletList(adapter.troubleshooting || adapter.installGuide.troubleshooting, "verify-list")}
          </div>
          <div class="detail-table">
            ${adapter.artifacts.map((artifact) => `
              <div class="detail-row">
                <span>${artifact.label}</span>
                <strong>${artifact.value}</strong>
              </div>
            `).join("")}
          </div>
        </div>
      </details>
    </article>
  `;
}

function findArtifact(adapter, kind) {
  return Array.isArray(adapter.artifacts)
    ? adapter.artifacts.find((artifact) => artifact.kind === kind)
    : null;
}
