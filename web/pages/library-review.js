import {
  api,
  canReview,
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
import { escapeHtml, formatDateTime, splitTags } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "library-review",
  sectionLabel: "资料治理",
  title: "把资料治理单独收起来，不打扰依据库的阅读主路径",
  intro: "依据库主页继续搜索优先。只有 reviewer / admin 才需要进入这里，处理状态更新、录入新资料和外部采集。",
  heroActions: `
    <a class="button" href="/library.html">返回依据库</a>
    <a class="button ghost" href="/governance.html">返回治理总览</a>
  `,
});

const state = {
  documents: [],
  selectedId: null,
};

renderFrame();
await refreshDocuments();

function renderFrame() {
  shell.pageContent.innerHTML = `
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">治理摘要</p>
            <h3>先确认今天要处理哪类资料</h3>
          </div>
          <button id="refresh-documents" type="button" class="ghost">刷新资料</button>
        </div>
        <div id="review-summary" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">资料详情</p>
            <h3>先看摘要，再决定是否更新状态</h3>
          </div>
        </div>
        <div id="review-detail" class="detail-card detail-panel"></div>
      </article>
    </section>

    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">资料列表</p>
          <h3>默认从 draft 开始看</h3>
        </div>
      </div>
      <div id="review-list" class="record-list"></div>
    </section>

    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">状态更新与录入</p>
            <h3>这类动作从依据库首页移出来</h3>
          </div>
        </div>
        <div class="stack">
          <form id="review-form" class="stack">
            <label>
              Document ID
              <input name="documentId" placeholder="legal-library document id" value="${escapeHtml(state.selectedId || "")}" />
            </label>
            <label>
              目标状态
              <select name="status">
                <option value="draft">draft</option>
                <option value="reviewed">reviewed</option>
                <option value="approved">approved</option>
                <option value="retired">retired</option>
              </select>
            </label>
            <div class="action-row">
              <button type="submit">更新状态</button>
            </div>
          </form>

          <details class="management-panel">
            <summary>展开手动录入</summary>
            <div class="panel-body">
              <form id="create-document-form" class="stack">
                <label>
                  标题
                  <input name="title" placeholder="例如：欧盟 VAT 处理备忘" />
                </label>
                <div class="form-grid">
                  <label>
                    Jurisdiction
                    <input name="jurisdiction" placeholder="GLOBAL / EU / CN" />
                  </label>
                  <label>
                    Domain
                    <input name="domain" placeholder="tax / accounting / control" />
                  </label>
                </div>
                <div class="form-grid">
                  <label>
                    Source Type
                    <input name="sourceType" placeholder="manual / official_url" />
                  </label>
                  <label>
                    Source Ref
                    <input name="sourceRef" placeholder="https://official-source.example" />
                  </label>
                </div>
                <label>
                  Tags
                  <input name="tags" placeholder="comma,separated,tags" />
                </label>
                <label>
                  Summary
                  <textarea name="summary" rows="3"></textarea>
                </label>
                <label>
                  Body
                  <textarea name="body" rows="6"></textarea>
                </label>
                <div class="action-row">
                  <button type="submit">新建资料</button>
                </div>
              </form>
            </div>
          </details>
        </div>
      </article>

      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">外部采集</p>
            <h3>从 URL 或本地文件补录</h3>
          </div>
        </div>
        <form id="ingest-form" class="stack">
          <div class="form-grid three">
            <label>
              标题
              <input name="title" />
            </label>
            <label>
              Jurisdiction
              <input name="jurisdiction" />
            </label>
            <label>
              Domain
              <input name="domain" />
            </label>
          </div>
          <div class="form-grid">
            <label>
              Source URL
              <input name="url" />
            </label>
            <label>
              Local File Path
              <input name="filePath" />
            </label>
          </div>
          <label>
            Tags
            <input name="tags" />
          </label>
          <label>
            Raw Text
            <textarea name="body" rows="6"></textarea>
          </label>
          <div class="action-row">
            <button type="submit">采集到依据库</button>
          </div>
        </form>
      </article>
    </section>
  `;

  shell.pageContent.querySelector("#refresh-documents")?.addEventListener("click", () => void refreshDocuments());
  shell.pageContent.querySelector("#review-list")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-document-id]");
    if (!target) {
      return;
    }
    state.selectedId = target.getAttribute("data-document-id");
    renderSummary();
    renderList();
    renderDetail();
  });
  shell.pageContent.querySelector("#review-form")?.addEventListener("submit", onUpdateStatus);
  shell.pageContent.querySelector("#create-document-form")?.addEventListener("submit", onCreateDocument);
  shell.pageContent.querySelector("#ingest-form")?.addEventListener("submit", onIngest);

  renderSummary();
  renderList();
  renderDetail();
}

async function refreshDocuments() {
  const globalData = shell.getGlobal();
  if (!canReview(globalData)) {
    state.documents = [];
    state.selectedId = null;
    renderSummary();
    renderList();
    renderDetail();
    return;
  }
  try {
    const result = await api("/api/legal-library/documents");
    state.documents = result.documents || [];
    const preferredDraft = state.documents.find((document) => document.status === "draft")?.id;
    state.selectedId = state.selectedId || preferredDraft || state.documents[0]?.id || null;
  } catch (error) {
    state.documents = [];
    state.selectedId = null;
    rememberAction(`依据资料治理读取失败：${String(error.message || error)}`);
  }
  renderSummary();
  renderList();
  renderDetail();
}

async function onUpdateStatus(event) {
  event.preventDefault();
  const globalData = shell.getGlobal();
  if (!canReview(globalData)) {
    return;
  }
  const payload = formToObject(event.currentTarget);
  try {
    await api(`/api/legal-library/documents/${encodeURIComponent(String(payload.documentId || ""))}/status`, {
      method: "POST",
      body: JSON.stringify({ status: payload.status }),
    });
    event.currentTarget.reset();
    rememberAction(`已更新资料状态：${String(payload.documentId || "")}`);
    await shell.refreshChrome();
    await refreshDocuments();
  } catch (error) {
    rememberAction(`资料状态更新失败：${String(error.message || error)}`);
  }
}

async function onCreateDocument(event) {
  event.preventDefault();
  const globalData = shell.getGlobal();
  if (!canReview(globalData)) {
    return;
  }
  const payload = formToObject(event.currentTarget);
  try {
    await api("/api/legal-library/documents", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        jurisdiction: payload.jurisdiction,
        domain: payload.domain,
        sourceType: payload.sourceType,
        sourceRef: payload.sourceRef,
        tags: splitTags(payload.tags),
        summary: payload.summary,
        body: payload.body,
      }),
    });
    event.currentTarget.reset();
    rememberAction(`已新建依据资料：${String(payload.title || "")}`);
    await shell.refreshChrome();
    await refreshDocuments();
  } catch (error) {
    rememberAction(`新建资料失败：${String(error.message || error)}`);
  }
}

async function onIngest(event) {
  event.preventDefault();
  const globalData = shell.getGlobal();
  if (!canReview(globalData)) {
    return;
  }
  const payload = formToObject(event.currentTarget);
  try {
    await api("/api/legal-library/ingest", {
      method: "POST",
      body: JSON.stringify({
        title: payload.title,
        jurisdiction: payload.jurisdiction,
        domain: payload.domain,
        url: payload.url,
        filePath: payload.filePath,
        tags: splitTags(payload.tags),
        body: payload.body,
      }),
    });
    event.currentTarget.reset();
    rememberAction("已从外部来源补录依据");
    await shell.refreshChrome();
    await refreshDocuments();
  } catch (error) {
    rememberAction(`资料采集失败：${String(error.message || error)}`);
  }
}

function renderSummary() {
  const container = shell.pageContent.querySelector("#review-summary");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  const stats = globalData.overview?.governance?.legalLibrary;
  if (!canReview(globalData)) {
    container.innerHTML = emptyState("只有 reviewer / admin 才能进入资料治理页。");
    return;
  }
  container.innerHTML = `
    ${summaryCard({
      kicker: "资料治理摘要",
      title: stats ? `待审 ${stats.draftCount} / 已批准 ${stats.approvedCount}` : "等待资料统计",
      note: stats?.draftCount
        ? "建议先从 draft 资料开始处理状态升级。"
        : "当前没有明显的 draft 堆积，可以继续只读浏览依据库。",
      pillHtml: pill(stats?.draftCount ? "warn" : "good", stats?.draftCount ? "needs_review" : "stable"),
      meta: [
        `总数 ${stats?.totalDocuments ?? state.documents.length}`,
        stats?.latestUpdatedAt ? `最近更新 ${formatDateTime(stats.latestUpdatedAt)}` : "暂无更新时间",
      ],
    })}
    ${calloutCard({
      kicker: "处理建议",
      title: state.documents.find((document) => document.status === "draft")
        ? "先打开第一条 draft，确认是否可以升到 reviewed"
        : "当前资料库更适合保持阅读优先",
      note: "治理动作已经从依据库主页拆出来，业务同学不需要再在阅读页撞上这些表单。",
      tone: "info",
    })}
  `;
}

function renderList() {
  const container = shell.pageContent.querySelector("#review-list");
  if (!container) {
    return;
  }
  if (!state.documents.length) {
    container.innerHTML = emptyState("还没有可治理的资料。");
    return;
  }
  const ordered = [...state.documents].sort((left, right) => {
    if (left.status === right.status) {
      return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    }
    if (left.status === "draft") {
      return -1;
    }
    if (right.status === "draft") {
      return 1;
    }
    return left.status.localeCompare(right.status);
  });
  container.innerHTML = ordered.map((document) => recordButton({
    id: document.id,
    selected: document.id === state.selectedId,
    attribute: "data-document-id",
    title: document.title,
    note: document.summary,
    pillHtml: pill(document.status === "approved" ? "good" : document.status === "draft" ? "warn" : "info", document.status),
    meta: [document.jurisdiction, document.domain, formatDateTime(document.updatedAt)],
  })).join("");
}

function renderDetail() {
  const container = shell.pageContent.querySelector("#review-detail");
  if (!container) {
    return;
  }
  const selected = state.documents.find((document) => document.id === state.selectedId);
  if (!selected) {
    container.innerHTML = emptyState("从资料列表里选择一份文档。");
    return;
  }
  container.innerHTML = `
    <div class="section-stack">
      ${summaryCard({
        kicker: "当前资料",
        title: selected.title,
        note: selected.summary,
        pillHtml: pill(selected.status === "approved" ? "good" : selected.status === "draft" ? "warn" : "info", selected.status),
        meta: [selected.jurisdiction, selected.domain, `v${selected.version}`],
      })}
      ${detailRows([
        { label: "Document ID", value: selected.id },
        { label: "适用范围", value: `${selected.jurisdiction} / ${selected.domain}` },
        { label: "来源", value: selected.sourceRef },
        { label: "Reviewed By", value: selected.reviewedBy },
        { label: "Updated At", value: formatDateTime(selected.updatedAt) },
      ])}
      ${selected.tags?.length ? calloutCard({
        kicker: "标签与索引",
        title: "后续搜索会命中这些 tags",
        note: "如果要给团队固化搜索路径，可以直接沿用下面这些关键词。",
        tone: "info",
        content: `<ul class="compact-list">${selected.tags.map((tag) => `<li>${escapeHtml(tag)}</li>`).join("")}</ul>`,
      }) : ""}
      ${jsonDetails("查看资料原始对象", selected)}
    </div>
  `;
}
