import {
  calloutCard,
  featureCard,
  pill,
  stepCard,
  summaryCard,
} from "../core/components.js";
import { formatDateTime, formatRisk } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "workbench",
  sectionLabel: "业务工作台",
  title: "先告诉业务用户下一步做什么",
  intro: "工作台不再像工程后台那样堆满面板，而是优先给出推荐任务、最近结论和最顺手的进入路径。",
  heroActions: `
    <a class="button" href="/decisions.html#example">运行示例决策</a>
    <a class="button ghost" href="/library.html">先查法规依据</a>
  `,
});

const ACTION_LINKS = {
  run_example_decision: {
    href: "/decisions.html#example",
    buttonLabel: "运行示例决策",
  },
  run_example_replay: {
    href: "/replays.html#example",
    buttonLabel: "运行示例回放",
  },
  search_legal_library: {
    href: "/library.html#search",
    buttonLabel: "打开依据库",
  },
  open_system_health: {
    href: "/system.html#health",
    buttonLabel: "查看系统状态",
  },
  verify_audit_chain: {
    href: "/governance.html#integrity",
    buttonLabel: "打开治理中心",
  },
  run_restore_drill: {
    href: "/recovery.html#restore",
    buttonLabel: "进入恢复中心",
  },
  configure_backups: {
    href: "/system.html#backups",
    buttonLabel: "前往系统设置",
  },
  review_draft_documents: {
    href: "/library.html#review",
    buttonLabel: "处理待审资料",
  },
  open_login: {
    href: "/system.html#login",
    buttonLabel: "登录控制台",
  },
};

render();

function render() {
  const globalData = shell.getGlobal();
  const overview = globalData.overview;
  const decision = overview?.decisioning?.lastDecision;
  const replay = overview?.decisioning?.lastReplay;
  const actions = Array.isArray(overview?.actions) && overview.actions.length > 0
    ? overview.actions
    : buildFallbackActions(overview);
  const runtime = overview?.runtime;
  const runtimeDiagnosis = runtime?.diagnosis;
  const runtimeDoctorReport = runtime?.verification || runtime?.doctorReport;
  const startCallout = buildPilotStartCallout(overview, runtimeDoctorReport);

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">推荐任务</p>
            <h3>今天先做这几件事</h3>
            <p class="section-copy">从这里直接进入最常见的业务路径，不需要先理解 session、ledger 或治理术语。</p>
          </div>
        </div>
        <div class="feature-grid two-up">
          ${actions.slice(0, 4).map(renderActionCard).join("")}
        </div>
        <div class="top-gap">
          ${startCallout}
        </div>
        <div class="soft-divider"></div>
        ${calloutCard({
          kicker: "业务提示",
          title: overview?.identity?.summary || "先从最接近业务问题的页面开始",
          note: runtimeDiagnosis?.nextActionTitle || runtime?.summary || overview?.governance?.recovery?.recommendedAction || "如果今天更关心规则发布影响，就从回放中心开始。",
          tone: actions.some((item) => item.tone === "warning") ? "warning" : "info",
          meta: [
            `24h 决策 ${overview?.decisioning?.counts24h?.decision ?? 0}`,
            `24h 回放 ${overview?.decisioning?.counts24h?.replay ?? 0}`,
            `Runtime ${runtime?.businessStatus || "待检查"}`,
          ],
        })}
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">最近结论</p>
            <h3>先读摘要，不要先读 JSON</h3>
            <p class="section-copy">决策、回放和治理提醒都先翻译成业务语言，技术细节留给后续页面展开。</p>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "最近决策",
            title: decision?.label || "还没有最近决策",
            note: decision?.summary || "从决策中心可以直接运行示例事件、文件路径或粘贴 JSON。",
            pillHtml: pill("good", decision?.riskRating ? `风险 ${formatRisk(decision.riskRating)}` : "等待执行"),
            meta: [
              decision?.confidence != null ? `置信度 ${(decision.confidence * 100).toFixed(0)}%` : null,
              decision?.createdAt ? formatDateTime(decision.createdAt) : null,
            ].filter(Boolean),
          })}
          ${summaryCard({
            kicker: "最近回放",
            title: replay?.label || "还没有最近回放",
            note: replay?.summary || "回放中心会把高风险变化和 changed events 拆开讲清楚。",
            pillHtml: pill("info", replay?.changedEvents != null ? `变更事件 ${replay.changedEvents}` : "等待执行"),
            meta: [replay?.createdAt ? formatDateTime(replay.createdAt) : "暂无记录"],
          })}
          ${summaryCard({
            kicker: "运行时状态",
            title: runtime?.businessStatus || "等待运行时摘要",
            note: runtime?.summary || "系统设置页会把目录读取、推理协议和权限问题拆开讲清楚。",
            pillHtml: pill(runtime?.lastProbe?.inferenceOk ? "good" : runtime?.mode === "cloud" ? "warn" : "info", runtime?.cloudApiFlavor || "local"),
            meta: [
              runtime?.model ? `模型 ${runtime.model}` : null,
              runtimeDoctorReport?.provider?.label ? `Provider ${runtimeDoctorReport.provider.label}` : null,
              runtimeDiagnosis?.nextActionTitle || null,
              runtime?.lastProbe?.createdAt ? formatDateTime(runtime.lastProbe.createdAt) : "尚未探针",
            ].filter(Boolean),
          })}
          ${summaryCard({
            kicker: "治理提醒",
            title: overview?.governance?.integrity?.summary || "等待治理状态",
            note: overview?.governance?.recovery?.summary || "恢复状态会在恢复中心给出更明确的下一步动作。",
            pillHtml: pill(
              overview?.governance?.integrity?.isStale ? "warn" : "info",
              overview?.governance?.integrity?.status || "pending",
            ),
            meta: [
              `待审资料 ${overview?.governance?.legalLibrary?.draftCount ?? 0}`,
              `活跃会话 ${overview?.governance?.sessions?.activeCount ?? 0}`,
            ],
          })}
        </div>
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">建议路径</p>
          <h3>一条标准业务动线</h3>
          <p class="section-copy">这条路径适合第一次使用的人，也适合在团队里做统一培训。</p>
        </div>
      </div>
      <div class="page-grid three-up">
        ${stepCard({
          step: "01",
          title: "先判断问题类型",
          note: "新业务判断去决策中心；规则变更验证去回放中心；需要引用法规时再进入依据库。",
        })}
        ${stepCard({
          step: "02",
          title: "先看摘要，再看依据",
          note: "结果页会先给结论、风险和建议动作；只有需要深挖时才展开高级详情。",
        })}
        ${stepCard({
          step: "03",
          title: "治理和恢复独立处理",
          note: "审计链、导出、备份和恢复演练已经拆到独立页面，不会干扰业务主流程。",
        })}
      </div>
    </section>
  `;
}

function buildPilotStartCallout(overview, verification) {
  if (overview?.identity?.bootstrapRequired) {
    return calloutCard({
      kicker: "试点第一步",
      title: "先创建首个管理员",
      note: "完成 bootstrap 之后，控制台的身份、治理、恢复和运行时设置才会全部开放。",
      tone: "warning",
      meta: ["入口：系统设置", "完成后再登录控制台"],
    });
  }

  if (overview?.identity?.authEnabled && !overview?.identity?.authenticated) {
    return calloutCard({
      kicker: "试点第一步",
      title: "先登录控制台，再开始真实业务操作",
      note: "未登录时仍能浏览首页和工作台摘要，但决策、回放、治理和系统动作都会继续要求身份门禁。",
      tone: "info",
      meta: ["入口：系统设置", overview?.identity?.summary || "支持本地应急令牌登录"],
    });
  }

  if (verification && verification.verificationStatus !== "fully_usable" && verification.verificationStatus !== "local_ready") {
    return calloutCard({
      kicker: "试点阻塞项",
      title: verification.recommendedAction,
      note: verification.blockedReason || "先把运行时链路打通，再让业务用户开始真实试点。",
      tone: verification.catalogAccess === "ready" && verification.inferenceAccess !== "ready" ? "warning" : "info",
      meta: [
        verification.provider?.label ? `Provider ${verification.provider.label}` : null,
        verification.lastVerifiedAt ? `最近验证 ${formatDateTime(verification.lastVerifiedAt)}` : "尚未形成真实验证时间",
      ].filter(Boolean),
    });
  }

  return calloutCard({
    kicker: "试点第一步",
    title: "可以直接从示例决策开始",
    note: "先跑一次示例决策，再进入回放中心和依据库，会是最顺的外部试点 onboarding 路径。",
    tone: "good",
    meta: ["推荐顺序：决策 → 回放 → 依据 → 治理摘要"],
  });
}

function renderActionCard(action) {
  const resolved = ACTION_LINKS[action.intent] || { href: "/workbench.html", buttonLabel: "打开" };
  return featureCard({
    title: action.title,
    note: action.description,
    meta: [
      `页面：${translateWorkspace(action.workspace)}`,
      action.tone === "warning" ? "建议优先处理" : "适合现在开始",
    ],
    href: resolved.href,
    buttonLabel: resolved.buttonLabel,
  });
}

function buildFallbackActions(overview) {
  return [
    {
      title: "运行示例决策",
      description: "最快速地熟悉 Zhouheng 的业务决策路径。",
      intent: "run_example_decision",
      workspace: "workbench",
      tone: "primary",
    },
    {
      title: "查看规则回放",
      description: "在规则发布前先看 changed events 和高风险漂移。",
      intent: "run_example_replay",
      workspace: "workbench",
      tone: "secondary",
    },
    {
      title: "搜索法规依据",
      description: overview?.governance?.legalLibrary?.draftCount
        ? `当前有 ${overview.governance.legalLibrary.draftCount} 条待审资料，先搜索再决定是否治理。`
        : "搜索 reviewed / approved 资料，优先阅读已经治理过的内容。",
      intent: "search_legal_library",
      workspace: "library",
      tone: "secondary",
    },
    {
      title: "查看恢复状态",
      description: overview?.governance?.recovery?.recommendedAction || "恢复中心会告诉你最近演练是否健康。",
      intent: "run_restore_drill",
      workspace: "system",
      tone: "warning",
    },
  ];
}

function translateWorkspace(workspace) {
  if (workspace === "library") {
    return "依据库";
  }
  if (workspace === "governance") {
    return "治理中心";
  }
  if (workspace === "system") {
    return "系统设置";
  }
  return "业务工作台";
}
