import {
  escapeHtml,
  statusToneFromStatus,
  translateStatus,
} from "./format.js";

export function pill(tone, label) {
  return `<span class="status-pill ${escapeHtml(tone || "neutral")}">${escapeHtml(label || "")}</span>`;
}

export function statusPill(status, label = translateStatus(status)) {
  return pill(statusToneFromStatus(status), label);
}

export function summaryCard({ kicker, title, note, pillHtml = "", meta = [] }) {
  return `
    <article class="summary-card">
      <p class="section-kicker">${escapeHtml(kicker || "")}</p>
      <div class="record-head">
        <strong>${escapeHtml(title || "")}</strong>
        ${pillHtml}
      </div>
      <p class="summary-note">${escapeHtml(note || "")}</p>
      ${meta.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
    </article>
  `;
}

export function featureCard({ title, note, meta = [], href, buttonLabel }) {
  return `
    <article class="feature-card">
      <strong>${escapeHtml(title)}</strong>
      <p class="summary-note">${escapeHtml(note || "")}</p>
      ${meta.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${href ? `<a class="button ghost" href="${escapeHtml(href)}">${escapeHtml(buttonLabel || "打开")}</a>` : ""}
    </article>
  `;
}

export function modeCard({ title, note, meta = [], href, buttonLabel, pillHtml = "", active = false }) {
  return `
    <article class="mode-card ${active ? "active" : ""}">
      <div class="record-head">
        <strong>${escapeHtml(title || "")}</strong>
        ${pillHtml}
      </div>
      <p class="summary-note">${escapeHtml(note || "")}</p>
      ${meta.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${href ? `<a class="button ${active ? "" : "ghost"}" href="${escapeHtml(href)}">${escapeHtml(buttonLabel || "进入")}</a>` : ""}
    </article>
  `;
}

export function sectionHubCard({ kicker, title, note, meta = [], href, buttonLabel, pillHtml = "" }) {
  return `
    <article class="section-hub-card">
      <p class="section-kicker">${escapeHtml(kicker || "")}</p>
      <div class="record-head">
        <strong>${escapeHtml(title || "")}</strong>
        ${pillHtml}
      </div>
      <p class="summary-note">${escapeHtml(note || "")}</p>
      ${meta.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${href ? `<a class="button ghost" href="${escapeHtml(href)}">${escapeHtml(buttonLabel || "进入")}</a>` : ""}
    </article>
  `;
}

export function stepCard({ step, title, note, content = "", footer = "" }) {
  return `
    <article class="step-card">
      <div class="step-head">
        <span class="step-index">${escapeHtml(step || "")}</span>
        <div class="step-copy">
          <strong>${escapeHtml(title || "")}</strong>
          ${note ? `<p class="summary-note">${escapeHtml(note)}</p>` : ""}
        </div>
      </div>
      ${content ? `<div class="step-content">${content}</div>` : ""}
      ${footer ? `<div class="step-footer">${footer}</div>` : ""}
    </article>
  `;
}

export function guideStepCard({ step, title, description, status, href, ctaLabel, blockingReason }) {
  return `
    <article class="guide-step-card">
      <div class="guide-step-head">
        <div class="guide-step-index">${escapeHtml(step || "")}</div>
        <div class="guide-step-copy">
          <div class="record-head">
            <strong>${escapeHtml(title || "")}</strong>
            ${statusPill(status)}
          </div>
          <p class="summary-note">${escapeHtml(description || "")}</p>
        </div>
      </div>
      ${
        blockingReason
          ? `<div class="blocked-state-banner"><strong>当前阻断</strong><span>${escapeHtml(blockingReason)}</span></div>`
          : ""
      }
      <div class="action-row">
        <a class="button ghost" href="${escapeHtml(href || "#")}">${escapeHtml(ctaLabel || "继续")}</a>
      </div>
    </article>
  `;
}

export function nextActionCard({ kicker, title, note, tone = "info", href, buttonLabel, meta = [] }) {
  return `
    <article class="next-action-card tone-${escapeHtml(tone)}">
      <p class="section-kicker">${escapeHtml(kicker || "下一步")}</p>
      <strong>${escapeHtml(title || "")}</strong>
      <p class="summary-note">${escapeHtml(note || "")}</p>
      ${meta.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${href ? `<a class="button ${tone === "good" ? "" : "ghost"}" href="${escapeHtml(href)}">${escapeHtml(buttonLabel || "继续")}</a>` : ""}
    </article>
  `;
}

export function calloutCard({ kicker, title, note, tone = "neutral", meta = [], content = "" }) {
  return `
    <article class="callout-card tone-${escapeHtml(tone)}">
      <p class="section-kicker">${escapeHtml(kicker || "")}</p>
      <div class="record-head">
        <strong>${escapeHtml(title || "")}</strong>
        ${pill(tone === "critical" ? "bad" : tone === "warning" ? "warn" : tone === "good" ? "good" : "info", tone === "critical" ? "优先处理" : tone === "warning" ? "建议处理" : tone === "good" ? "状态良好" : "摘要")}
      </div>
      ${note ? `<p class="summary-note">${escapeHtml(note)}</p>` : ""}
      ${meta.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      ${content || ""}
    </article>
  `;
}

export function bulletList(items, className = "compact-list") {
  const filtered = (items || []).filter(Boolean);
  if (!filtered.length) {
    return "";
  }
  return `
    <ul class="${escapeHtml(className)}">
      ${filtered.map((item) => `<li>${escapeHtml(String(item))}</li>`).join("")}
    </ul>
  `;
}

export function emptyState(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

export function jsonDetails(title, data) {
  return `
    <details class="technical-details advanced-only">
      <summary>${escapeHtml(title || "查看技术详情")}</summary>
      <pre class="output">${escapeHtml(JSON.stringify(data, null, 2))}</pre>
    </details>
  `;
}

export function codeBlock(content) {
  return `<pre class="code-block">${escapeHtml(content || "")}</pre>`;
}

export function metricRow(label, value) {
  return `
    <div class="metric-row">
      <span>${escapeHtml(label)}</span>
      <strong>${escapeHtml(value)}</strong>
    </div>
  `;
}

export function detailRows(rows) {
  return `
    <div class="detail-table">
      ${rows
        .filter((row) => row && row.value != null && row.value !== "")
        .map(
          (row) => `
            <div class="detail-row">
              <span>${escapeHtml(row.label)}</span>
              <strong>${escapeHtml(String(row.value))}</strong>
            </div>
          `,
        )
        .join("")}
    </div>
  `;
}

export function recordButton({ id, selected = false, title, note, meta = [], pillHtml = "", attribute = "data-id" }) {
  return `
    <button type="button" class="record-button ${selected ? "active" : ""}" ${attribute}="${escapeHtml(id)}">
      <div class="record-button-inner">
        <div class="record-head">
          <strong class="record-title">${escapeHtml(title)}</strong>
          ${pillHtml}
        </div>
        <p class="record-copy">${escapeHtml(note || "")}</p>
        ${meta.length ? `<div class="record-meta">${meta.map((item) => `<span>${escapeHtml(item)}</span>`).join("")}</div>` : ""}
      </div>
    </button>
  `;
}
