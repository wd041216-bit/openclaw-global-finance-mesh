import { canManageAdmin, canViewGovernance } from "../core/api.js";
import {
  nextActionCard,
  pill,
  sectionHubCard,
  summaryCard,
} from "../core/components.js";
import { formatDateTime } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "governance",
  sectionLabel: "治理总览",
  title: "治理页只先讲结论、风险和下一步动作",
  intro: "审计链、导出和操作时间线已经继续拆到二级页面。治理总览只负责告诉你是否需要人工介入。",
  heroActions: `
    <a class="button" href="/governance-exports.html">查看审计与导出</a>
    <a class="button ghost" href="/governance-activity.html">查看治理时间线</a>
  `,
});

render();

function render() {
  const globalData = shell.getGlobal();
  const overview = globalData.overview;
  const integrity = overview?.governance?.integrity;
  const recovery = overview?.governance?.recovery;
  const sessions = overview?.governance?.sessions;
  const drafts = overview?.governance?.legalLibrary?.draftCount ?? 0;

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">治理结论</p>
            <h3>先判断今天是否需要人工处理</h3>
            <p class="section-copy">如果审计链异常、恢复演练失败或 draft 堆积过多，这里会先告诉管理员要看哪一块。</p>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "审计链",
            title: integrity?.summary || "等待完整性摘要",
            note: integrity?.lastVerifiedAt
              ? `最近校验 ${formatDateTime(integrity.lastVerifiedAt)}`
              : "还没有完整校验记录。",
            pillHtml: pill(
              integrity?.status === "mismatch"
                ? "bad"
                : integrity?.isStale
                  ? "warn"
                  : "good",
              integrity?.status || "pending",
            ),
            meta: [
              `mismatch ${integrity?.mismatchCount ?? 0}`,
              integrity?.isStale ? "校验已过期" : "校验仍有效",
            ],
          })}
          ${summaryCard({
            kicker: "恢复与会话",
            title: recovery?.summary || "等待恢复摘要",
            note: recovery?.recommendedAction || "恢复中心会继续拆出备份与演练细节。",
            pillHtml: pill(
              recovery?.status === "failure"
                ? "bad"
                : recovery?.status === "degraded"
                  ? "warn"
                  : "info",
              recovery?.status || "pending",
            ),
            meta: [
              `活跃会话 ${sessions?.activeCount ?? 0}`,
              recovery?.lastDrillAt ? `最近演练 ${formatDateTime(recovery.lastDrillAt)}` : "尚未演练",
            ],
          })}
          ${nextActionCard({
            kicker: "下一步",
            title: pickGovernanceActionTitle(integrity, recovery, drafts),
            note: pickGovernanceActionNote(integrity, recovery, drafts),
            href: pickGovernanceActionHref(integrity, recovery, drafts),
            buttonLabel: pickGovernanceActionButton(integrity, recovery, drafts),
            tone: integrity?.status === "mismatch" || recovery?.status === "failure" ? "warning" : "info",
            meta: [
              drafts ? `待审资料 ${drafts}` : "资料库没有待审堆积",
              canManageAdmin(globalData) ? "管理员可继续下钻处理" : "当前只读",
            ],
          })}
        </div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">角色说明</p>
            <h3>不是每个人都需要看完整治理细节</h3>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "Reviewer / Admin",
            title: canViewGovernance(globalData) ? "当前角色可看治理摘要" : "当前角色无治理权限",
            note: canManageAdmin(globalData)
              ? "你还可以进入时间线、导出和完整校验动作。"
              : "当前角色主要停留在摘要层，不会先看到复杂配置。",
            pillHtml: pill(canViewGovernance(globalData) ? "good" : "neutral", canViewGovernance(globalData) ? "summary_access" : "summary_hidden"),
            meta: [
              canManageAdmin(globalData) ? "admin" : "reviewer / operator / viewer",
            ],
          })}
          ${summaryCard({
            kicker: "资料治理",
            title: drafts ? `${drafts} 条待审资料` : "资料治理当前平稳",
            note: drafts
              ? "如果今天要清理资料质量，下一步应该进入资料治理子页。"
              : "依据库主页继续保持搜索优先，治理动作单独放到资料治理页。",
            pillHtml: pill(drafts ? "warn" : "good", drafts ? "needs_review" : "stable"),
            meta: [
              `approved ${overview?.governance?.legalLibrary?.approvedCount ?? 0}`,
              `reviewed ${overview?.governance?.legalLibrary?.reviewedCount ?? 0}`,
            ],
          })}
        </div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">治理子页面</p>
          <h3>继续往下钻，而不是把所有动作堆回总览</h3>
        </div>
      </div>
      <div class="hub-grid two-up">
        ${sectionHubCard({
          kicker: "审计与导出",
          title: "完整性、导出 readiness、切片创建",
          note: integrity?.summary || "如果今天要对外交付审计证据，先看这一页。",
          href: "/governance-exports.html",
          buttonLabel: "进入审计与导出",
          pillHtml: pill(integrity?.status === "mismatch" ? "bad" : integrity?.isStale ? "warn" : "good", integrity?.status || "pending"),
        })}
        ${sectionHubCard({
          kicker: "治理时间线",
          title: "Operator Activity 与失败动作",
          note: canManageAdmin(globalData)
            ? "只有 admin 才需要完整时间线；其他角色只看摘要即可。"
            : "如果需要深挖失败动作，请联系管理员打开治理时间线。",
          href: "/governance-activity.html",
          buttonLabel: "进入治理时间线",
          pillHtml: pill(canManageAdmin(globalData) ? "info" : "neutral", canManageAdmin(globalData) ? "admin_only" : "summary_only"),
        })}
      </div>
    </section>
  `;
}

function pickGovernanceActionTitle(integrity, recovery, drafts) {
  if (integrity?.status === "mismatch") {
    return "先处理审计链 mismatch";
  }
  if (recovery?.status === "failure") {
    return "先处理恢复失败风险";
  }
  if (drafts > 0) {
    return "先清理待审资料";
  }
  if (integrity?.isStale) {
    return "补一次完整校验";
  }
  return "当前治理链路相对平稳";
}

function pickGovernanceActionNote(integrity, recovery, drafts) {
  if (integrity?.status === "mismatch") {
    return "在继续导出或对外交付前，先把 mismatch 清零。";
  }
  if (recovery?.status === "failure") {
    return recovery?.recommendedAction || "先确认恢复链路失败点。";
  }
  if (drafts > 0) {
    return "依据库主页继续保持阅读优先，reviewer/admin 再去资料治理页处理状态更新。";
  }
  if (integrity?.isStale) {
    return "链路没有报错，但最近一次完整性校验已经过期。";
  }
  return "如果今天没有对外交付需求，可以继续只读观察。";
}

function pickGovernanceActionHref(integrity, recovery, drafts) {
  if (integrity?.status === "mismatch" || integrity?.isStale) {
    return "/governance-exports.html";
  }
  if (recovery?.status === "failure") {
    return "/recovery-restores.html";
  }
  if (drafts > 0) {
    return "/library-review.html";
  }
  return "/governance-exports.html";
}

function pickGovernanceActionButton(integrity, recovery, drafts) {
  if (integrity?.status === "mismatch") {
    return "去看审计链";
  }
  if (recovery?.status === "failure") {
    return "去看恢复演练";
  }
  if (drafts > 0) {
    return "去处理资料治理";
  }
  if (integrity?.isStale) {
    return "去补完整校验";
  }
  return "查看审计与导出";
}
