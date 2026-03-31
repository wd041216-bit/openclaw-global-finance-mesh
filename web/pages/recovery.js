import { canManageAdmin } from "../core/api.js";
import {
  nextActionCard,
  pill,
  sectionHubCard,
  summaryCard,
} from "../core/components.js";
import { formatDateTime } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "recovery",
  sectionLabel: "恢复总览",
  title: "先判断恢复链路是否健康，再去看备份或演练明细",
  intro: "恢复页不再默认展开长列表和原始对象。它先告诉管理员现在有没有 off-box 备份、最近一次演练是否成功，以及下一步该进哪个子页面。",
  heroActions: `
    <a class="button" href="/recovery-backups.html">查看备份</a>
    <a class="button ghost" href="/recovery-restores.html">查看恢复演练</a>
  `,
});

render();

function render() {
  const globalData = shell.getGlobal();
  const overview = globalData.overview;
  const recovery = overview?.governance?.recovery;
  const backups = overview?.governance?.backups;
  const health = globalData.operationsHealth?.checks?.recoveryDrill;

  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">恢复就绪度</p>
            <h3>今天能不能证明“既能备份，也能恢复”</h3>
            <p class="section-copy">恢复页首屏先看恢复就绪度、最近失败原因和推荐动作，不先抛备份清单与恢复检查细节。</p>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "当前链路",
            title: recovery?.summary || "等待恢复摘要",
            note: recovery?.recommendedAction || "当备份与恢复数据就绪后，这里会告诉管理员下一步动作。",
            pillHtml: pill(
              recovery?.status === "failure"
                ? "bad"
                : recovery?.status === "degraded"
                  ? "warn"
                  : recovery?.status === "success"
                    ? "good"
                    : "info",
              recovery?.status || "pending",
            ),
            meta: [
              recovery?.lastDrillAt ? `最近演练 ${formatDateTime(recovery.lastDrillAt)}` : "尚未演练",
              backups?.lastBackup?.createdAt ? `最近备份 ${formatDateTime(backups.lastBackup.createdAt)}` : "尚未备份",
            ],
          })}
          ${summaryCard({
            kicker: "备份目标",
            title: backups?.configuredTargetCount ? `已配置 ${backups.configuredTargetCount} 个目标` : "还没有异地备份目标",
            note: backups?.summary || "正式试点前至少要配置一个 off-box 目标。",
            pillHtml: pill(backups?.configuredTargetCount ? "good" : "warn", backups?.configuredTargetCount ? "configured" : "pending"),
            meta: [
              backups?.lastBackup ? backups.lastBackup.summary : "还没有最近备份摘要",
            ],
          })}
          ${nextActionCard({
            kicker: "下一步",
            title: pickRecoveryActionTitle(recovery, backups),
            note: pickRecoveryActionNote(recovery, backups, health),
            href: pickRecoveryActionHref(recovery, backups),
            buttonLabel: pickRecoveryActionButton(recovery, backups),
            tone: recovery?.status === "failure" || !backups?.configuredTargetCount ? "warning" : "info",
            meta: [
              health?.summary || "等待恢复 health check",
              canManageAdmin(globalData) ? "管理员可直接执行动作" : "当前只读",
            ],
          })}
        </div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">风险说明</p>
            <h3>不要让恢复问题藏在明细里</h3>
          </div>
        </div>
        <div class="summary-grid">
          ${summaryCard({
            kicker: "当前风险",
            title: health?.summary || "等待恢复检查摘要",
            note: recovery?.status === "failure"
              ? recovery.recommendedAction
              : !backups?.configuredTargetCount
                ? "当前只有本地快照，不足以支撑正式试点。"
                : "如果今天刚改过备份配置，建议再跑一次 restore drill。",
            pillHtml: pill(
              health?.status === "healthy"
                ? "good"
                : health?.status === "degraded"
                  ? "warn"
                  : "info",
              health?.status || "pending",
            ),
            meta: [
              recovery?.latestDrill?.status ? `最近演练 ${recovery.latestDrill.status}` : "暂无演练结果",
              backups?.lastBackup?.status ? `最近备份 ${backups.lastBackup.status}` : "暂无备份结果",
            ],
          })}
        </div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">恢复子页面</p>
          <h3>继续下钻，不把明细塞回总览</h3>
        </div>
      </div>
      <div class="hub-grid two-up">
        ${sectionHubCard({
          kicker: "备份",
          title: "查看快照、复制链路与目标配置",
          note: backups?.summary || "适合先检查 off-box 目标是否已配置、最近一次复制是否成功。",
          href: "/recovery-backups.html",
          buttonLabel: "进入备份子页",
          pillHtml: pill(backups?.configuredTargetCount ? "good" : "warn", backups?.configuredTargetCount ? "ready" : "needs_config"),
        })}
        ${sectionHubCard({
          kicker: "恢复演练",
          title: "查看恢复检查结果与手动触发演练",
          note: recovery?.summary || "适合确认最近一次恢复验证是否真的通过。",
          href: "/recovery-restores.html",
          buttonLabel: "进入恢复演练子页",
          pillHtml: pill(
            recovery?.status === "failure"
              ? "bad"
              : recovery?.status === "degraded"
                ? "warn"
                : "good",
            recovery?.status || "pending",
          ),
        })}
      </div>
    </section>
  `;
}

function pickRecoveryActionTitle(recovery, backups) {
  if (!backups?.configuredTargetCount) {
    return "先配置异地备份目标";
  }
  if (!recovery?.latestDrill) {
    return "先执行一次恢复演练";
  }
  if (recovery?.status === "failure") {
    return "先定位恢复失败点";
  }
  if (recovery?.status === "degraded") {
    return "先处理恢复告警";
  }
  return "保持备份和演练节奏";
}

function pickRecoveryActionNote(recovery, backups, health) {
  if (!backups?.configuredTargetCount) {
    return "没有 off-box 目标时，正式试点仍然缺少恢复保障。";
  }
  if (!recovery?.latestDrill) {
    return "只有成功备份还不够，至少要有一次 restore drill 证明链路可恢复。";
  }
  if (recovery?.status === "failure") {
    return recovery.recommendedAction || "打开恢复演练子页查看失败检查项。";
  }
  if (recovery?.status === "degraded") {
    return health?.summary || "恢复链路可用，但仍有需要继续处理的告警。";
  }
  return "如果今天刚改过配置，建议补一轮备份和 restore drill 留痕。";
}

function pickRecoveryActionHref(recovery, backups) {
  if (!backups?.configuredTargetCount) {
    return "/recovery-backups.html";
  }
  return "/recovery-restores.html";
}

function pickRecoveryActionButton(recovery, backups) {
  if (!backups?.configuredTargetCount) {
    return "去配置备份";
  }
  if (!recovery?.latestDrill) {
    return "去执行演练";
  }
  return "去看恢复演练";
}
