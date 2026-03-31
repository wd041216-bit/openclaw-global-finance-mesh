import { featureCard, pill, summaryCard } from "../core/components.js";
import { formatDateTime, formatRisk } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "workbench",
  sectionLabel: "业务工作台",
  title: "把高频业务动作放到第一屏",
  intro: "先给结论和下一步动作，再进入决策、回放、依据和恢复等专门页面。这里不再堆放治理或系统级表单。",
  heroActions: `
    <a class="button" href="/decisions.html">运行新决策</a>
    <a class="button ghost" href="/replays.html">查看规则回放</a>
  `,
});

render();

function render() {
  const globalData = shell.getGlobal();
  const overview = globalData.overview;
  const decision = overview?.decisioning?.lastDecision;
  const replay = overview?.decisioning?.lastReplay;

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">推荐任务</p>
            <h3>业务用户下一步最可能要做的事</h3>
          </div>
        </div>
        <div class="feature-grid two-up">
          ${featureCard({
            title: "运行决策",
            note: "进入独立决策页，填写事件、Pack 路径和证据后生成 Decision Packet。",
            meta: [decision?.summary || "适合处理新的财务判断请求"],
            href: "/decisions.html",
            buttonLabel: "打开决策页",
          })}
          ${featureCard({
            title: "回放规则变更",
            note: "进入回放页，对比基线和候选规则影响，先看 changed / higher-risk / confidence。",
            meta: [replay?.summary || "适合规则变更发布前验证"],
            href: "/replays.html",
            buttonLabel: "打开回放页",
          })}
          ${featureCard({
            title: "查询法规依据",
            note: "进入依据库检索法规、治理资料和引文摘要，再决定是否需要进入资料治理。",
            meta: [`草稿资料 ${overview?.governance?.legalLibrary?.draftCount ?? 0} 条`],
            href: "/library.html",
            buttonLabel: "打开依据库",
          })}
          ${featureCard({
            title: "查看恢复状态",
            note: "如果今天更关心备份、恢复演练和就绪度，不要再去治理页里翻。",
            meta: [overview?.governance?.recovery?.summary || "等待恢复状态"],
            href: "/recovery.html",
            buttonLabel: "打开恢复中心",
          })}
        </div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">最近结论</p>
            <h3>把最近结果读成人话</h3>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "最近决策",
            title: decision?.label || "暂无决策记录",
            note: decision?.summary || "从决策页开始生成新的 Decision Packet。",
            pillHtml: pill("good", decision?.riskRating ? `风险 ${formatRisk(decision.riskRating)}` : "等待执行"),
            meta: [
              decision?.confidence != null ? `置信度 ${(decision.confidence * 100).toFixed(0)}%` : null,
              decision?.createdAt ? formatDateTime(decision.createdAt) : null,
            ].filter(Boolean),
          })}
          ${summaryCard({
            kicker: "最近回放",
            title: replay?.label || "暂无回放记录",
            note: replay?.summary || "回放页会专门展示 changed events 与高风险事件。",
            pillHtml: pill("info", replay?.changedEvents != null ? `变更事件 ${replay.changedEvents}` : "等待执行"),
            meta: [replay?.createdAt ? formatDateTime(replay.createdAt) : null].filter(Boolean),
          })}
          ${summaryCard({
            kicker: "治理提醒",
            title: overview?.governance?.integrity?.summary || "等待治理状态",
            note: overview?.governance?.recovery?.recommendedAction || "恢复建议会在恢复中心显示得更完整。",
            pillHtml: pill(
              overview?.governance?.integrity?.isStale ? "warn" : "info",
              overview?.governance?.integrity?.status || "pending",
            ),
            meta: [
              `活跃会话 ${overview?.governance?.sessions?.activeCount ?? 0}`,
              `已批准资料 ${overview?.governance?.legalLibrary?.approvedCount ?? 0}`,
            ],
          })}
        </div>
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">业务动线</p>
          <h3>建议按这个顺序使用控制台</h3>
        </div>
      </div>
      <div class="feature-grid three-up">
        ${featureCard({
          title: "1. 先判断类型",
          note: "新的业务问题去决策页；规则发布前验证去回放页。",
        })}
        ${featureCard({
          title: "2. 再补依据",
          note: "如果结果需要解释或引用，去依据库搜索 reviewed / approved 文档。",
        })}
        ${featureCard({
          title: "3. 最后看治理",
          note: "审计链、导出、恢复演练和系统配置都在单独页面，不再影响业务主屏。",
        })}
      </div>
    </section>
  `;
}

