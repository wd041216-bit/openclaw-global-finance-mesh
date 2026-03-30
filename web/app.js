const state = {
  config: null,
  access: null,
  auditRuns: [],
  selectedAuditId: null,
  sessionToken: sessionStorage.getItem("financeMeshSessionToken") || "",
};

const configForm = document.querySelector("#config-form");
const sessionForm = document.querySelector("#session-form");
const bootstrapForm = document.querySelector("#bootstrap-form");
const accessConfigForm = document.querySelector("#access-config-form");
const operatorForm = document.querySelector("#operator-form");
const chatForm = document.querySelector("#chat-form");
const searchForm = document.querySelector("#search-form");
const ingestForm = document.querySelector("#ingest-form");

const modelsOutput = document.querySelector("#models-output");
const probeOutput = document.querySelector("#probe-output");
const chatOutput = document.querySelector("#chat-output");
const citationsOutput = document.querySelector("#citations-output");
const libraryResults = document.querySelector("#library-results");
const financeOutput = document.querySelector("#finance-output");
const accessStatus = document.querySelector("#access-status");
const auditList = document.querySelector("#audit-list");
const auditDetail = document.querySelector("#audit-detail");
const operatorList = document.querySelector("#operator-list");

document.querySelector("#load-models").addEventListener("click", loadModels);
document.querySelector("#probe-runtime").addEventListener("click", probeRuntime);
document.querySelector("#refresh-library").addEventListener("click", refreshLibrary);
document.querySelector("#run-decision").addEventListener("click", runDecision);
document.querySelector("#run-replay").addEventListener("click", runReplay);
document.querySelector("#refresh-audit").addEventListener("click", refreshAuditHistory);
document.querySelector("#refresh-access").addEventListener("click", refreshAccessControl);
document.querySelector("#clear-session").addEventListener("click", async () => {
  setSessionToken("");
  await refreshAllProtectedViews();
  await refreshAccessControl();
});

configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = formToObject(configForm);
    payload.temperature = Number(payload.temperature);
    payload.persistSecret = Boolean(payload.persistSecret);
    const result = await api("/api/runtime/config", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    state.config = result.config;
    fillConfigForm(result.config);
    probeOutput.textContent = "Runtime configuration saved.";
  } catch (error) {
    probeOutput.textContent = String(error.message || error);
  }
});

sessionForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(sessionForm);
  setSessionToken(String(payload.sessionToken || ""));
  await refreshAccessControl();
  await refreshAllProtectedViews();
});

bootstrapForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  accessStatus.textContent = "Bootstrapping first admin...";
  const payload = formToObject(bootstrapForm);
  const result = await api("/api/access-control/bootstrap", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      token: payload.token,
      enableAuth: Boolean(payload.enableAuth),
    }),
  });
  setSessionToken(String(payload.token || ""));
  bootstrapForm.reset();
  state.access = result;
  renderAccessControl();
  await refreshAllProtectedViews();
  await refreshAccessControl();
});

accessConfigForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(accessConfigForm);
  await api("/api/access-control/config", {
    method: "POST",
    body: JSON.stringify({
      enabled: Boolean(payload.enabled),
    }),
  });
  await refreshAccessControl();
  await refreshAllProtectedViews();
});

operatorForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(operatorForm);
  await api("/api/access-control/operators", {
    method: "POST",
    body: JSON.stringify({
      name: payload.name,
      role: payload.role,
      token: payload.token,
      active: Boolean(payload.active),
    }),
  });
  operatorForm.reset();
  await refreshAccessControl();
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  chatOutput.textContent = "Running...";
  citationsOutput.innerHTML = "";

  try {
    const payload = formToObject(chatForm);
    payload.useLegalLibrary = Boolean(payload.useLegalLibrary);
    const result = await api("/api/chat", {
      method: "POST",
      body: JSON.stringify(payload),
    });

    chatOutput.textContent = result.reply;
    citationsOutput.innerHTML = (result.citations || [])
      .map(
        (item) => `
          <article class="citation">
            <h4>${escapeHtml(item.title)}</h4>
            <p>${escapeHtml(item.excerpt || "")}</p>
            <small>${escapeHtml(item.sourceRef || "")}</small>
          </article>
        `,
      )
      .join("");
  } catch (error) {
    chatOutput.textContent = String(error.message || error);
  }
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const query = new FormData(searchForm).get("query") || "";
    const result = await api(`/api/legal-library/search?q=${encodeURIComponent(String(query))}`);
    renderLibraryResults(result.results || []);
  } catch (error) {
    libraryResults.innerHTML = `<p class="empty-state">${escapeHtml(String(error.message || error))}</p>`;
  }
});

ingestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  try {
    const payload = formToObject(ingestForm);
    payload.tags = splitTags(payload.tags);
    await api("/api/legal-library/ingest", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    ingestForm.reset();
    await refreshLibrary();
  } catch (error) {
    libraryResults.innerHTML = `<p class="empty-state">${escapeHtml(String(error.message || error))}</p>`;
  }
});

boot();

async function boot() {
  fillSessionForm();
  await refreshAccessControl();
  await refreshAllProtectedViews();
}

async function refreshAllProtectedViews() {
  await Promise.all([refreshRuntimeConfig(), refreshLibrary(), refreshAuditHistory()]);
}

async function refreshRuntimeConfig() {
  try {
    const { config } = await api("/api/runtime/config");
    state.config = config;
    fillConfigForm(config);
    probeOutput.textContent = "";
  } catch (error) {
    state.config = null;
    probeOutput.textContent = String(error.message || error);
    modelsOutput.textContent = "";
  }
}

async function loadModels() {
  modelsOutput.textContent = "Loading models...";
  try {
    const result = await api("/api/runtime/models");
    modelsOutput.textContent = JSON.stringify(result.models, null, 2);
  } catch (error) {
    modelsOutput.textContent = String(error.message || error);
  }
}

async function probeRuntime() {
  probeOutput.textContent = "Probing runtime...";
  try {
    const result = await api("/api/runtime/probe", {
      method: "POST",
      body: JSON.stringify({}),
    });
    probeOutput.textContent = JSON.stringify(result, null, 2);
  } catch (error) {
    probeOutput.textContent = String(error.message || error);
  }
}

async function refreshLibrary() {
  try {
    const result = await api("/api/legal-library/documents");
    renderLibraryResults(
      (result.documents || []).map((document) => ({
        document,
        excerpt: document.summary,
        score: 0,
      })),
    );
  } catch (error) {
    libraryResults.innerHTML = `<p class="empty-state">${escapeHtml(String(error.message || error))}</p>`;
  }
}

async function runDecision() {
  financeOutput.textContent = "Running decision...";
  try {
    const result = await api("/api/decision/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    financeOutput.textContent = JSON.stringify(
      {
        auditRun: result.auditRun,
        decisionPacket: result.decision.decisionPacket,
      },
      null,
      2,
    );
    await refreshAuditHistory(result.auditRun?.id);
  } catch (error) {
    financeOutput.textContent = String(error.message || error);
  }
}

async function runReplay() {
  financeOutput.textContent = "Running replay...";
  try {
    const result = await api("/api/replay/run", {
      method: "POST",
      body: JSON.stringify({}),
    });
    financeOutput.textContent = JSON.stringify(
      {
        auditRun: result.auditRun,
        replay: result.replay,
      },
      null,
      2,
    );
    await refreshAuditHistory(result.auditRun?.id);
  } catch (error) {
    financeOutput.textContent = String(error.message || error);
  }
}

async function refreshAuditHistory(preferredId) {
  try {
    const result = await api("/api/audit/runs?limit=12");
    state.auditRuns = result.runs || [];
    if (preferredId) {
      state.selectedAuditId = preferredId;
    } else if (!state.selectedAuditId && state.auditRuns.length > 0) {
      state.selectedAuditId = state.auditRuns[0].id;
    } else if (!state.auditRuns.some((item) => item.id === state.selectedAuditId)) {
      state.selectedAuditId = state.auditRuns[0]?.id || null;
    }

    renderAuditRuns();
    if (state.selectedAuditId) {
      await openAuditRun(state.selectedAuditId);
    } else {
      auditDetail.textContent = "No persisted runs yet.";
    }
  } catch (error) {
    state.auditRuns = [];
    auditList.innerHTML = `<p class="empty-state">${escapeHtml(String(error.message || error))}</p>`;
    auditDetail.textContent = String(error.message || error);
  }
}

async function openAuditRun(runId) {
  state.selectedAuditId = runId;
  renderAuditRuns();
  auditDetail.textContent = "Loading audit run...";
  try {
    const result = await api(`/api/audit/runs/${encodeURIComponent(runId)}`);
    auditDetail.textContent = JSON.stringify(result.run, null, 2);
  } catch (error) {
    auditDetail.textContent = String(error.message || error);
  }
}

async function refreshAccessControl() {
  const result = await api("/api/access-control");
  state.access = result;
  renderAccessControl();
}

function renderAccessControl() {
  const access = state.access;
  const actor = access?.session?.actor || null;
  const config = access?.config || {
    enabled: false,
    bootstrapRequired: true,
    operators: [],
  };

  fillSessionForm();
  fillAccessConfigForm(config);
  bootstrapForm.hidden = !config.bootstrapRequired;
  accessConfigForm.hidden = !(actor && actor.role === "admin");
  operatorForm.hidden = !(actor && actor.role === "admin");

  accessStatus.textContent = JSON.stringify(
    {
      enabled: config.enabled,
      bootstrapRequired: config.bootstrapRequired,
      authenticated: Boolean(access?.session?.authenticated),
      actor,
      operators: config.operators.map((item) => ({
        name: item.name,
        role: item.role,
        active: item.active,
      })),
    },
    null,
    2,
  );

  renderOperatorList(config.operators || []);
}

function renderOperatorList(operators) {
  if (!operators.length) {
    operatorList.innerHTML = '<p class="empty-state">No operators have been issued yet.</p>';
    return;
  }

  operatorList.innerHTML = operators
    .map(
      (item) => `
        <article class="library-card">
          <div class="library-head">
            <strong>${escapeHtml(item.name)}</strong>
            <span>${escapeHtml(item.role)}</span>
          </div>
          <p>${escapeHtml(item.active ? "Active operator" : "Inactive operator")}</p>
          <small>${escapeHtml(new Date(item.createdAt).toLocaleString())}</small>
        </article>
      `,
    )
    .join("");
}

function renderAuditRuns() {
  if (state.auditRuns.length === 0) {
    auditList.innerHTML = '<p class="empty-state">Run a decision or replay to build your audit trail.</p>';
    return;
  }

  auditList.innerHTML = state.auditRuns
    .map(
      (item) => `
        <button
          type="button"
          class="audit-item ${item.id === state.selectedAuditId ? "active" : ""}"
          data-run-id="${escapeHtml(item.id)}"
        >
          <div class="audit-item-head">
            <strong>${escapeHtml(item.type === "decision" ? "Decision Run" : "Replay Run")}</strong>
            <span>${escapeHtml(item.mode)}</span>
          </div>
          <p>${escapeHtml(item.label || "")}</p>
          <small>${escapeHtml(formatAuditMeta(item))}</small>
        </button>
      `,
    )
    .join("");

  for (const element of auditList.querySelectorAll("[data-run-id]")) {
    element.addEventListener("click", () => {
      void openAuditRun(element.getAttribute("data-run-id"));
    });
  }
}

function renderLibraryResults(results) {
  libraryResults.innerHTML = results
    .map(
      (item) => `
        <article class="library-card">
          <div class="library-head">
            <strong>${escapeHtml(item.document.title)}</strong>
            <span>${escapeHtml(item.document.jurisdiction)}</span>
          </div>
          <p>${escapeHtml(item.excerpt || item.document.summary || "")}</p>
          <small>${escapeHtml(item.document.sourceRef || "")}</small>
        </article>
      `,
    )
    .join("");
}

function fillConfigForm(config) {
  if (!config) {
    return;
  }
  for (const [key, value] of Object.entries(config)) {
    const field = configForm.elements.namedItem(key);
    if (!field) continue;
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value == null ? "" : String(value);
    }
  }
}

function fillSessionForm() {
  const field = sessionForm.elements.namedItem("sessionToken");
  if (field) {
    field.value = state.sessionToken;
  }
}

function fillAccessConfigForm(config) {
  const field = accessConfigForm.elements.namedItem("enabled");
  if (field) {
    field.checked = Boolean(config.enabled);
  }
}

async function api(url, init = {}) {
  const headers = {
    "Content-Type": "application/json",
    ...(state.sessionToken ? { Authorization: `Bearer ${state.sessionToken}` } : {}),
    ...(init.headers || {}),
  };
  const response = await fetch(url, {
    headers,
    ...init,
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

function formToObject(form) {
  const data = new FormData(form);
  const payload = {};
  for (const [key, value] of data.entries()) {
    if (form.elements.namedItem(key)?.type === "checkbox") {
      payload[key] = true;
    } else {
      payload[key] = value;
    }
  }
  for (const element of form.querySelectorAll('input[type="checkbox"]')) {
    if (!(element.name in payload)) {
      payload[element.name] = false;
    }
  }
  return payload;
}

function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function formatAuditMeta(item) {
  const createdAt = new Date(item.createdAt).toLocaleString();
  if (item.type === "decision") {
    return `${createdAt} | ${item.riskRating || "unknown"} risk | ${item.actorName || "anonymous"} | confidence ${Number(item.confidence || 0).toFixed(2)}`;
  }
  return `${createdAt} | ${item.changedEvents || 0} changed | ${item.actorName || "anonymous"} | ${item.higherRiskEvents || 0} higher risk`;
}

function setSessionToken(value) {
  state.sessionToken = String(value || "").trim();
  if (state.sessionToken) {
    sessionStorage.setItem("financeMeshSessionToken", state.sessionToken);
  } else {
    sessionStorage.removeItem("financeMeshSessionToken");
  }
  fillSessionForm();
}
