import {
  api,
  canReview,
  canViewLibrary,
  formToObject,
  rememberAction,
} from "../core/api.js";
import {
  detailRows,
  emptyState,
  jsonDetails,
  pill,
  recordButton,
  summaryCard,
} from "../core/components.js";
import { formatDateTime, splitTags } from "../core/format.js";
import { initShell } from "../core/shell.js";

const shell = await initShell({
  pageId: "library",
  sectionLabel: "依据库",
  title: "把法规与治理资料读成业务语言",
  intro: "搜索结果、资料详情和治理动作拆成明确区域。先检索和理解，再决定是否进入状态流转或补录。",
  heroActions: `
    <a class="button" href="/workbench.html">返回工作台</a>
    <a class="button ghost" href="/governance.html">查看治理中心</a>
  `,
});

const state = {
  documents: [],
  results: [],
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
            <p class="section-kicker">搜索</p>
            <h3>检索法规依据</h3>
            <p class="section-copy">默认优先看 reviewed / approved 材料。高级模式下 reviewer/admin 可以把 draft 也纳入搜索。</p>
          </div>
          <button id="refresh-library" type="button" class="ghost">刷新</button>
        </div>
        <form id="search-form" class="stack">
          <label>
            关键词
            <input name="query" placeholder="按 jurisdiction、topic、title 或 obligation 搜索" />
          </label>
          <label class="inline-toggle">
            <input id="search-include-drafts" name="includeDrafts" type="checkbox" />
            高级模式下允许把 draft 也纳入搜索
          </label>
          <div class="action-row">
            <button type="submit">搜索依据库</button>
          </div>
        </form>
        <div id="library-summary" class="section-stack"></div>
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">资料详情</p>
            <h3>先读摘要，再决定是否治理</h3>
          </div>
        </div>
        <div id="library-detail" class="detail-card detail-panel"></div>
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">结果列表</p>
          <h3>搜索结果与最近文档</h3>
        </div>
      </div>
      <div id="library-results" class="record-list"></div>
    </section>
    <section class="page-grid two-up">
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">治理</p>
            <h3>更新资料状态</h3>
          </div>
        </div>
        <form id="review-form" class="stack">
          <label>
            Document ID
            <input name="documentId" placeholder="legal-library document id" />
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
      </article>
      <article class="page-section">
        <div class="section-head compact">
          <div>
            <p class="section-kicker">新建资料</p>
            <h3>录入治理材料</h3>
          </div>
        </div>
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
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">采集</p>
          <h3>从 URL 或本地文件补录依据</h3>
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
    </section>
  `;

  shell.pageContent.querySelector("#search-form")?.addEventListener("submit", onSearch);
  shell.pageContent.querySelector("#refresh-library")?.addEventListener("click", () => {
    void refreshDocuments();
  });
  shell.pageContent.querySelector("#library-results")?.addEventListener("click", (event) => {
    const target = event.target.closest("[data-document-id]");
    if (!target) {
      return;
    }
    state.selectedId = target.getAttribute("data-document-id");
    renderResults();
    renderDetail();
  });
  shell.pageContent.querySelector("#review-form")?.addEventListener("submit", onUpdateStatus);
  shell.pageContent.querySelector("#create-document-form")?.addEventListener("submit", onCreateDocument);
  shell.pageContent.querySelector("#ingest-form")?.addEventListener("submit", onIngest);

  renderSummary();
  renderResults();
  renderDetail();
  updateGovernanceVisibility();
}

async function refreshDocuments() {
  const globalData = shell.getGlobal();
  if (!canViewLibrary(globalData)) {
    state.documents = [];
    state.results = [];
    state.selectedId = null;
    renderSummary();
    renderResults();
    renderDetail();
    updateGovernanceVisibility();
    return;
  }

  try {
    const result = await api("/api/legal-library/documents");
    state.documents = result.documents || [];
    if (!state.results.length) {
      state.results = state.documents.map((document) => ({
        document,
        excerpt: document.summary,
        score: 0,
      }));
    }
    state.selectedId = state.selectedId || state.results[0]?.document?.id || state.documents[0]?.id || null;
  } catch (error) {
    state.documents = [];
    state.results = [];
    state.selectedId = null;
    rememberAction(`依据库读取失败：${String(error.message || error)}`);
  }
  renderSummary();
  renderResults();
  renderDetail();
  updateGovernanceVisibility();
}

async function onSearch(event) {
  event.preventDefault();
  const globalData = shell.getGlobal();
  if (!canViewLibrary(globalData)) {
    renderSummaryMessage("登录后才能查看依据库。");
    return;
  }

  const payload = formToObject(event.currentTarget);
  try {
    const includeDrafts =
      canReview(globalData)
      && globalData.prefs.advancedMode
      && Boolean(payload.includeDrafts);
    const result = await api(`/api/legal-library/search?q=${encodeURIComponent(String(payload.query || ""))}${includeDrafts ? "&includeDrafts=true" : ""}`);
    state.results = result.results || [];
    state.selectedId = state.results[0]?.document?.id || null;
    rememberAction(`已搜索依据库：${String(payload.query || "全部资料")}`);
  } catch (error) {
    state.results = [];
    state.selectedId = null;
    rememberAction(`依据库搜索失败：${String(error.message || error)}`);
  }
  renderSummary();
  renderResults();
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
      body: JSON.stringify({
        status: payload.status,
      }),
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
  const container = shell.pageContent.querySelector("#library-summary");
  if (!container) {
    return;
  }
  const globalData = shell.getGlobal();
  const stats = globalData.overview?.governance?.legalLibrary;
  container.innerHTML = `
    ${summaryCard({
      kicker: "资料库状态",
      title: `共 ${stats?.totalDocuments ?? state.documents.length} 份资料`,
      note: "默认搜索 reviewed / approved 资料，高级模式下 reviewer/admin 可以显式把 draft 纳入搜索。",
      pillHtml: pill("info", `${stats?.approvedCount ?? 0} 已批准`),
      meta: [
        `草稿 ${stats?.draftCount ?? 0}`,
        stats?.latestUpdatedAt ? `最近更新 ${formatDateTime(stats.latestUpdatedAt)}` : "暂无更新时间",
      ],
    })}
  `;
}

function renderResults() {
  const container = shell.pageContent.querySelector("#library-results");
  if (!container) {
    return;
  }
  if (!state.results.length) {
    container.innerHTML = emptyState("还没有可展示的搜索结果。");
    return;
  }
  container.innerHTML = state.results
    .map((item) =>
      recordButton({
        id: item.document.id,
        selected: item.document.id === state.selectedId,
        attribute: "data-document-id",
        title: item.document.title,
        note: item.excerpt || item.document.summary,
        pillHtml: pill(item.document.status === "approved" ? "good" : item.document.status === "draft" ? "warn" : "info", item.document.status),
        meta: [item.document.jurisdiction, item.document.domain, formatDateTime(item.document.updatedAt)],
      }),
    )
    .join("");
}

function renderDetail() {
  const container = shell.pageContent.querySelector("#library-detail");
  if (!container) {
    return;
  }
  const selected =
    state.results.find((item) => item.document.id === state.selectedId)?.document
    || state.documents.find((item) => item.id === state.selectedId);

  if (!selected) {
    container.innerHTML = emptyState("从结果列表里选择一份资料。");
    return;
  }

  container.innerHTML = `
    <div class="section-stack">
      ${summaryCard({
        kicker: "资料详情",
        title: selected.title,
        note: selected.summary,
        pillHtml: pill(selected.status === "approved" ? "good" : selected.status === "draft" ? "warn" : "info", selected.status),
        meta: [selected.jurisdiction, selected.domain, `v${selected.version}`],
      })}
      ${detailRows([
        { label: "Document ID", value: selected.id },
        { label: "Source", value: selected.sourceRef },
        { label: "Reviewed By", value: selected.reviewedBy },
        { label: "Updated At", value: formatDateTime(selected.updatedAt) },
      ])}
      <div class="detail-row">
        <span>正文</span>
        <div class="summary-note">${selected.body}</div>
      </div>
      ${jsonDetails("查看技术详情", selected)}
    </div>
  `;
}

function updateGovernanceVisibility() {
  const globalData = shell.getGlobal();
  const allowed = canReview(globalData);
  for (const selector of ["#review-form", "#create-document-form", "#ingest-form"]) {
    const node = shell.pageContent.querySelector(selector);
    if (node) {
      node.closest(".page-section").style.display = allowed ? "" : "none";
    }
  }
}

function renderSummaryMessage(message) {
  const container = shell.pageContent.querySelector("#library-summary");
  if (container) {
    container.innerHTML = emptyState(message);
  }
}

