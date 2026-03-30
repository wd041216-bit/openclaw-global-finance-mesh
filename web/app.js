const state = {
  config: null,
};

const configForm = document.querySelector("#config-form");
const chatForm = document.querySelector("#chat-form");
const searchForm = document.querySelector("#search-form");
const ingestForm = document.querySelector("#ingest-form");

const modelsOutput = document.querySelector("#models-output");
const chatOutput = document.querySelector("#chat-output");
const citationsOutput = document.querySelector("#citations-output");
const libraryResults = document.querySelector("#library-results");
const financeOutput = document.querySelector("#finance-output");

document.querySelector("#load-models").addEventListener("click", loadModels);
document.querySelector("#refresh-library").addEventListener("click", refreshLibrary);
document.querySelector("#run-decision").addEventListener("click", runDecision);
document.querySelector("#run-replay").addEventListener("click", runReplay);

configForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(configForm);
  payload.temperature = Number(payload.temperature);
  payload.persistSecret = Boolean(payload.persistSecret);
  const result = await api("/api/runtime/config", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  state.config = result.config;
  fillConfigForm(result.config);
});

chatForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  chatOutput.textContent = "Running...";
  citationsOutput.innerHTML = "";

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
});

searchForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const query = new FormData(searchForm).get("query") || "";
  const result = await api(`/api/legal-library/search?q=${encodeURIComponent(String(query))}`);
  renderLibraryResults(result.results || []);
});

ingestForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const payload = formToObject(ingestForm);
  payload.tags = splitTags(payload.tags);
  await api("/api/legal-library/ingest", {
    method: "POST",
    body: JSON.stringify(payload),
  });
  ingestForm.reset();
  await refreshLibrary();
});

boot();

async function boot() {
  const [{ config }] = await Promise.all([api("/api/runtime/config")]);
  state.config = config;
  fillConfigForm(config);
  await refreshLibrary();
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

async function refreshLibrary() {
  const result = await api("/api/legal-library/documents");
  renderLibraryResults(
    (result.documents || []).map((document) => ({
      document,
      excerpt: document.summary,
      score: 0,
    })),
  );
}

async function runDecision() {
  financeOutput.textContent = "Running decision...";
  const result = await api("/api/decision/run", {
    method: "POST",
    body: JSON.stringify({}),
  });
  financeOutput.textContent = JSON.stringify(result.decision.decisionPacket, null, 2);
}

async function runReplay() {
  financeOutput.textContent = "Running replay...";
  const result = await api("/api/replay/run", {
    method: "POST",
    body: JSON.stringify({}),
  });
  financeOutput.textContent = JSON.stringify(result.replay, null, 2);
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

async function api(url, init = {}) {
  const response = await fetch(url, {
    headers: {
      "Content-Type": "application/json",
    },
    ...init,
  });
  const payload = await response.json();
  if (!response.ok || payload.ok === false) {
    throw new Error(payload.error || "Request failed");
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

