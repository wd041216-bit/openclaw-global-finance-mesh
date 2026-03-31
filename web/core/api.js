const STORAGE_KEYS = {
  lastVisitedPage: "financeMesh.lastVisitedPage",
  advancedMode: "financeMesh.advancedMode",
  lastAction: "financeMesh.lastAction",
  preferredRoleEntry: "financeMesh.preferredRoleEntry",
};

const sessionState = {
  csrfToken: "",
};

let authFlash = null;

export function getPrefs() {
  return {
    lastVisitedPage: window.localStorage.getItem(STORAGE_KEYS.lastVisitedPage) || "workbench",
    advancedMode: window.localStorage.getItem(STORAGE_KEYS.advancedMode) === "true",
    lastAction: window.localStorage.getItem(STORAGE_KEYS.lastAction) || "",
    preferredRoleEntry: window.localStorage.getItem(STORAGE_KEYS.preferredRoleEntry) || "workbench",
  };
}

export function setLastVisitedPage(pageId) {
  window.localStorage.setItem(STORAGE_KEYS.lastVisitedPage, pageId);
}

export function setAdvancedMode(enabled) {
  window.localStorage.setItem(STORAGE_KEYS.advancedMode, String(Boolean(enabled)));
  document.body.classList.toggle("advanced-mode", Boolean(enabled));
}

export function toggleAdvancedMode() {
  const next = !getPrefs().advancedMode;
  setAdvancedMode(next);
  return next;
}

export function rememberAction(message) {
  window.localStorage.setItem(STORAGE_KEYS.lastAction, message);
}

export function setPreferredRoleEntry(entry) {
  window.localStorage.setItem(STORAGE_KEYS.preferredRoleEntry, entry);
}

export function consumeAuthFlash() {
  const url = new URL(window.location.href);
  const auth = url.searchParams.get("auth");
  const authError = url.searchParams.get("authError");
  if (!auth && !authError) {
    return;
  }
  authFlash = { auth, authError };
  url.searchParams.delete("auth");
  url.searchParams.delete("authError");
  window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
}

export function getAuthFlash() {
  return authFlash;
}

function adoptSessionState(session) {
  if (session && typeof session === "object") {
    sessionState.csrfToken = session.csrfToken || sessionState.csrfToken || "";
    if (session.authenticated === false) {
      sessionState.csrfToken = "";
    }
  }
}

export async function api(url, init = {}) {
  const method = String(init.method || "GET").toUpperCase();
  const headers = {
    "Content-Type": "application/json",
    ...(!["GET", "HEAD", "OPTIONS"].includes(method) && sessionState.csrfToken
      ? { "x-finance-mesh-csrf": sessionState.csrfToken }
      : {}),
    ...(init.headers || {}),
  };

  const response = await fetch(url, {
    credentials: "same-origin",
    headers,
    ...init,
  });
  const payload = await response.json();
  adoptSessionState(payload.session);
  if (!response.ok || payload.ok === false) {
    const error = new Error(payload.error || "Request failed");
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function fetchText(url) {
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: {
      Accept: "text/plain",
    },
  });
  const content = await response.text();
  if (!response.ok) {
    throw new Error(content || "Request failed");
  }
  return content;
}

export async function loadGlobalData(options = {}) {
  let access = null;
  try {
    access = await api("/api/access-control");
  } catch {
    access = null;
  }

  const [overviewResult, healthResult, metricsResult] = await Promise.allSettled([
    api("/api/dashboard/overview"),
    api("/api/operations/health"),
    options.includeMetrics ? fetchText("/api/metrics") : Promise.resolve(""),
  ]);

  return {
    access,
    overview: overviewResult.status === "fulfilled" ? overviewResult.value.overview : null,
    operationsHealth: healthResult.status === "fulfilled" ? healthResult.value.health : null,
    metricsPreview: metricsResult.status === "fulfilled" ? metricsResult.value : "",
    prefs: getPrefs(),
    authFlash,
  };
}

export function isOpenMode(globalData) {
  return !globalData?.access?.config?.enabled;
}

export function hasRole(globalData, requiredRole) {
  const actor = globalData?.access?.session?.actor;
  if (!actor) {
    return false;
  }
  const rank = {
    viewer: 1,
    operator: 2,
    reviewer: 3,
    admin: 4,
  };
  return rank[actor.role] >= rank[requiredRole];
}

export function canViewLibrary(globalData) {
  return isOpenMode(globalData) || Boolean(globalData?.access?.session?.authenticated);
}

export function canOperate(globalData) {
  return isOpenMode(globalData) || hasRole(globalData, "operator");
}

export function canReview(globalData) {
  return isOpenMode(globalData) || hasRole(globalData, "reviewer");
}

export function canViewGovernance(globalData) {
  return isOpenMode(globalData) || hasRole(globalData, "reviewer");
}

export function canManageAdmin(globalData) {
  return isOpenMode(globalData) || hasRole(globalData, "admin");
}

export function canViewSystem(globalData) {
  return isOpenMode(globalData) || Boolean(globalData?.access?.config?.enabled) || Boolean(globalData?.access?.config?.bootstrapRequired);
}

export function formToObject(form) {
  const data = new FormData(form);
  const payload = {};
  for (const [key, value] of data.entries()) {
    const field = form.elements.namedItem(key);
    payload[key] = field?.type === "checkbox" ? true : value;
  }
  for (const element of form.querySelectorAll('input[type="checkbox"]')) {
    if (!(element.name in payload)) {
      payload[element.name] = false;
    }
  }
  return payload;
}

export function fillForm(form, values) {
  if (!form || !values) {
    return;
  }
  for (const [key, value] of Object.entries(values)) {
    const field = form.elements.namedItem(key);
    if (!field) {
      continue;
    }
    if (field.type === "checkbox") {
      field.checked = Boolean(value);
    } else {
      field.value = value == null ? "" : String(value);
    }
  }
}

