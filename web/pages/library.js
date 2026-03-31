import {
  api,
  canReview,
  canViewLibrary,
  formToObject,
  rememberAction,
} from "../core/api.js";
import {
  bulletList,
  calloutCard,
  detailRows,
  emptyState,
  jsonDetails,
  pill,
  recordButton,
  summaryCard,
} from "../core/components.js";
import { formatDateTime, splitTags } from "../core/format.js";
import { initShell } from "../core/shell.js";

const RECOMMENDED_QUERIES = [
  "VAT prepayment",
  "跨境 SaaS 预收收入",
  "审批授权 matrix",
  "retention withholding tax",
];

const shell = await initShell({
  pageId: "library",
  sectionLabel: "依据库",
  title: "先搜索，再理解，再决定是否治理",
  intro: "依据库现在是搜索优先的阅读页。默认先给你最相关的资料和摘要，治理动作只在 reviewer/admin 场景下展开。",
  heroActions: `
    <a class="button" href="/workbench.html">返回工作台</a>
    <a class="button ghost" href="/library-review.html">进入资料治理</a>
  `,
});

const state = {
  documents: [],
  results: [],
  selectedId: null,
  query: "",
  includeDrafts: false,
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
            <h3>从业务问题开始查资料</h3>
            <p class="section-copy">默认优先返回 reviewed / approved 资料。只有 reviewer/admin 在高级模式下才会把 draft 纳入结果。</p>
          </div>
          <button id="refresh-library" type="button" class="ghost">刷新</button>
        </div>
        <form id="search-form" class="stack">
          <label>
            关键词
            <input name="query" placeholder="按 jurisdiction、topic、title 或 obligation 搜索" value="${escapeValue(state.query)}" />
          </label>
          <div class="chip-row">
            ${RECOMMENDED_QUERIES.map((query) => `<button type="button" class="chip-button" data-library-query="${escapeValue(query)}">${query}</button>`).join("")}
          </div>
          <label class="inline-toggle">
            <input id="search-include-drafts" name="includeDrafts" type="checkbox" ${state.includeDrafts ? "checked" : ""} />
            在高级模式下把 draft 也纳入搜索
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
            <h3>先读摘要，再看正文和技术细节</h3>
            <p class="section-copy">这里优先展示标题、状态、适用范围、摘要和引文来源；需要时再进入治理和原始对象。</p>
          </div>
        </div>
        <div id="library-detail" class="detail-card detail-panel"></div>
      </article>
    </section>
    <section class="page-section">
      <div class="section-head compact">
        <div>
          <p class="section-kicker">结果列表</p>
          <h3>${state.query ? `与“${escapeHtml(state.query)}”相关的资料` : "最近可用资料"}</h3>
        </div>
      </div>
      <div id="library-results" class="record-list"></div>
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
  shell.pageContent.querySelectorAll("[data-library-query]").forEach((button) => {
    button.addEventListener("click", () => {
      state.query = button.getAttribute("data-library-query") || "";
      const form = shell.pageContent.querySelector("#search-form");
      if (form) {
        form.querySelector('input[name="query"]').value = state.query;
      }
      void runSearch();
    });
  });
  renderSummary();
  renderResults();
  renderDetail();
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
    return;
  }

  try {
    const result = await api("/api/legal-library/documents");
    state.documents = result.documents || [];
    if (!state.query) {
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
}

async function onSearch(event) {
  event.preventDefault();
  state.query = String(formToObject(event.currentTarget).query || "").trim();
  state.includeDrafts = Boolean(formToObject(event.currentTarget).includeDrafts);
  await runSearch();
}

async function runSearch() {
  const globalData = shell.getGlobal();
  if (!canViewLibrary(globalData)) {
    renderSummaryMessage("登录后才能查看依据库。");
    return;
  }

  try {
    const includeDrafts =
      canReview(globalData)
      && globalData.prefs.advancedMode
      && Boolean(state.includeDrafts);
    if (!state.query) {
      state.results = state.documents.map((document) => ({
        document,
        excerpt: document.summary,
        score: 0,
      }));
      state.selectedId = state.results[0]?.document?.id || null;
    } else {
      const result = await api(`/api/legal-library/search?q=${encodeURIComponent(state.query)}${includeDrafts ? "&includeDrafts=true" : ""}`);
      state.results = result.results || [];
      state.selectedId = state.results[0]?.document?.id || null;
      rememberAction(`已搜索依据库：${state.query}`);
    }
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
  const viewingResults = state.query ? `${state.results.length} 条搜索结果` : `共 ${stats?.totalDocuments ?? state.documents.length} 份资料`;
  container.innerHTML = `
    ${summaryCard({
      kicker: "资料库状态",
      title: viewingResults,
      note: state.query
        ? `当前关键词：${state.query}`
        : "默认优先阅读 reviewed / approved 资料，高级模式下 reviewer/admin 才会显式加入 draft。",
      pillHtml: pill("info", `${stats?.approvedCount ?? 0} 已批准`),
      meta: [
        `草稿 ${stats?.draftCount ?? 0}`,
        stats?.latestUpdatedAt ? `最近更新 ${formatDateTime(stats.latestUpdatedAt)}` : "暂无更新时间",
      ],
    })}
    ${calloutCard({
      kicker: "阅读建议",
      title: state.query ? "先读前三条最相关结果" : "先从最近已治理资料开始",
      note: state.query
        ? "如果搜索结果里已经有 reviewed / approved 资料，优先阅读这些内容，不要先跳去治理表单。"
        : "当还没有明确关键词时，先从最近更新的 approved / reviewed 资料熟悉控制台的依据表达方式。治理动作已经移到资料治理页。",
      tone: "info",
    })}
  `;
}

function renderResults() {
  const container = shell.pageContent.querySelector("#library-results");
  if (!container) {
    return;
  }
  if (!state.results.length) {
    container.innerHTML = emptyState(state.query ? `没有找到与“${state.query}”直接相关的资料。` : "还没有可展示的资料。");
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
        meta: [
          item.document.jurisdiction,
          item.document.domain,
          item.score ? `相关度 ${item.score}` : "最近资料",
          formatDateTime(item.document.updatedAt),
        ],
      }))
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
        { label: "适用范围", value: `${selected.jurisdiction} / ${selected.domain}` },
        { label: "来源", value: selected.sourceRef },
        { label: "Reviewed By", value: selected.reviewedBy },
        { label: "Updated At", value: formatDateTime(selected.updatedAt) },
      ])}
      ${selected.tags?.length ? calloutCard({
        kicker: "标签与索引",
        title: "这份资料适合用这些关键词再检索",
        note: "如果你要给同事复用搜索路径，可以直接复制下面这些 tags。",
        tone: "info",
        content: bulletList(selected.tags),
      }) : ""}
      <div class="focus-item">
        <strong>正文摘要</strong>
        <p>${escapeHtml(selected.body)}</p>
      </div>
      ${jsonDetails("查看技术详情", selected)}
    </div>
  `;
}

function renderSummaryMessage(message) {
  const container = shell.pageContent.querySelector("#library-summary");
  if (container) {
    container.innerHTML = emptyState(message);
  }
}

function escapeValue(value) {
  return escapeHtml(String(value || ""));
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
