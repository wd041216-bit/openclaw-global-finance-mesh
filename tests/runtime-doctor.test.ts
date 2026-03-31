import test from "node:test";
import assert from "node:assert/strict";

import { buildRuntimeDiagnosis } from "../src/runtime-diagnostics.ts";
import { buildRuntimeDoctorReport } from "../src/runtime-doctor.ts";

test("runtime doctor report turns catalog-only cloud access into an entitlement escalation packet", () => {
  const config = {
    mode: "cloud" as const,
    model: "qwen3:8b",
    hasApiKey: true,
    localBaseUrl: "http://127.0.0.1:11434",
    cloudBaseUrl: "https://ollama.com",
    cloudApiFlavor: "auto" as const,
  };
  const probe = {
    ok: false,
    mode: "cloud" as const,
    model: "qwen3:8b",
    cloudApiFlavor: "auto" as const,
    listModelsOk: true,
    inferenceOk: false,
    availableModels: ["qwen3:8b"],
    errorKind: "unauthorized" as const,
    authStatus: "unauthorized" as const,
    selectedCatalogEndpoint: "/api/tags",
    selectedInferenceEndpoint: undefined,
    catalogChecks: [
      {
        flavor: "ollama_native" as const,
        endpoint: "/api/tags",
        ok: true,
        latencyMs: 55,
        authStatus: "authorized" as const,
        modelCount: 1,
        availableModels: ["qwen3:8b"],
      },
    ],
    inferenceChecks: [
      {
        flavor: "ollama_native" as const,
        endpoint: "/api/chat",
        ok: false,
        latencyMs: 81,
        statusCode: 401,
        authStatus: "unauthorized" as const,
        errorKind: "unauthorized" as const,
        error: "unauthorized",
      },
    ],
  };

  const diagnosis = buildRuntimeDiagnosis(config, probe);
  const report = buildRuntimeDoctorReport(config, probe, diagnosis, {
    lastVerifiedAt: "2026-03-31T05:20:00.000Z",
  });

  assert.equal(report.provider.id, "ollama_cloud");
  assert.equal(report.verificationStatus, "catalog_only_entitlement_blocked");
  assert.equal(report.verificationLabel, "仅目录可用");
  assert.equal(report.catalogAccess, "ready");
  assert.equal(report.inferenceAccess, "blocked");
  assert.equal(report.lastVerifiedAt, "2026-03-31T05:20:00.000Z");
  assert.equal(report.recommendedFlavor, "ollama_native");
  assert.equal(report.verifiedModel, undefined);
  assert.equal(report.goLiveReady, false);
  assert.equal(report.requiresProviderAction, true);
  assert.ok(report.goLiveBlockers.some((item) => /推理放行结论|推理权限|目录/.test(item)));
  assert.equal(report.configuredModelVisible, true);
  assert.equal(report.recommendedAction, diagnosis.nextActionTitle);
  assert.match(report.operatorChecklist.join(" "), /entitlement|provider|401/);
  assert.ok(report.manualChecks.some((command) => command.endpoint === "/api/tags"));
  assert.ok(report.manualChecks.some((command) => command.endpoint === "/api/chat"));
  assert.match(report.escalationNote || "", /inference entitlement|401 unauthorized|推理/);
  assert.match(report.escalationTemplate || "", /inference entitlement|401 unauthorized|推理/);
});

test("runtime doctor report suggests nearby visible models when the configured model is gone", () => {
  const config = {
    mode: "cloud" as const,
    model: "qwen3:72b",
    hasApiKey: true,
    localBaseUrl: "http://127.0.0.1:11434",
    cloudBaseUrl: "https://gateway.example.com",
    cloudApiFlavor: "openai_compatible" as const,
  };
  const probe = {
    ok: false,
    mode: "cloud" as const,
    model: "qwen3:72b",
    cloudApiFlavor: "openai_compatible" as const,
    listModelsOk: true,
    inferenceOk: false,
    availableModels: ["qwen3:32b", "qwen3:8b", "gpt-finance"],
    errorKind: "model_not_found" as const,
    authStatus: "authorized" as const,
    selectedCatalogEndpoint: "/v1/models",
    selectedInferenceEndpoint: undefined,
    catalogChecks: [
      {
        flavor: "openai_compatible" as const,
        endpoint: "/v1/models",
        ok: true,
        latencyMs: 40,
        authStatus: "authorized" as const,
        modelCount: 3,
        availableModels: ["qwen3:32b", "qwen3:8b", "gpt-finance"],
      },
    ],
    inferenceChecks: [
      {
        flavor: "openai_compatible" as const,
        endpoint: "/v1/chat/completions",
        ok: false,
        latencyMs: 62,
        statusCode: 404,
        authStatus: "authorized" as const,
        errorKind: "model_not_found" as const,
        error: "model_not_found",
      },
    ],
  };

  const diagnosis = buildRuntimeDiagnosis(config, probe);
  const report = buildRuntimeDoctorReport(config, probe, diagnosis);

  assert.equal(report.provider.id, "openai_compatible_gateway");
  assert.equal(report.verificationStatus, "model_visibility_gap");
  assert.equal(report.goLiveReady, false);
  assert.equal(report.requiresProviderAction, false);
  assert.ok(report.goLiveBlockers.some((item) => /模型/.test(item)));
  assert.equal(report.configuredModelVisible, false);
  assert.ok(report.suggestedModels.includes("qwen3:32b"));
  assert.ok(report.suggestedModels.includes("qwen3:8b"));
  assert.equal(report.visibleModels.length, 3);
  assert.match(report.operatorChecklist.join(" "), /模型名|目录/);
});

test("runtime doctor report marks ollama cloud kimi-k2.5 as go-live ready when inference succeeds", () => {
  const config = {
    mode: "cloud" as const,
    model: "kimi-k2.5",
    hasApiKey: true,
    localBaseUrl: "http://127.0.0.1:11434",
    cloudBaseUrl: "https://ollama.com",
    cloudApiFlavor: "auto" as const,
  };
  const probe = {
    ok: true,
    mode: "cloud" as const,
    model: "kimi-k2.5",
    cloudApiFlavor: "auto" as const,
    listModelsOk: true,
    inferenceOk: true,
    availableModels: ["kimi-k2.5", "gemini-3-flash-preview", "glm-5"],
    authStatus: "authorized" as const,
    selectedCatalogEndpoint: "/api/tags",
    selectedInferenceEndpoint: "/api/chat",
    catalogChecks: [
      {
        flavor: "ollama_native" as const,
        endpoint: "/api/tags",
        ok: true,
        latencyMs: 48,
        authStatus: "authorized" as const,
        modelCount: 3,
        availableModels: ["kimi-k2.5", "gemini-3-flash-preview", "glm-5"],
      },
    ],
    inferenceChecks: [
      {
        flavor: "ollama_native" as const,
        endpoint: "/api/chat",
        ok: true,
        latencyMs: 130,
        authStatus: "authorized" as const,
        preview: "ready",
      },
    ],
  };

  const diagnosis = buildRuntimeDiagnosis(config, probe);
  const report = buildRuntimeDoctorReport(config, probe, diagnosis, {
    lastVerifiedAt: "2026-03-31T17:12:00.000Z",
  });

  assert.equal(report.provider.id, "ollama_cloud");
  assert.equal(report.verificationStatus, "fully_usable");
  assert.equal(report.validatedFlavor, "ollama_native");
  assert.equal(report.verifiedModel, "kimi-k2.5");
  assert.equal(report.goLiveReady, true);
  assert.deepEqual(report.goLiveBlockers, []);
  assert.equal(report.requiresProviderAction, false);
  assert.equal(report.catalogAccess, "ready");
  assert.equal(report.inferenceAccess, "ready");
  assert.equal(report.recommendedFlavor, "ollama_native");
});
