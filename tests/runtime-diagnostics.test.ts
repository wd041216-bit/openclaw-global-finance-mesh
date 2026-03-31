import test from "node:test";
import assert from "node:assert/strict";

import { buildRuntimeDiagnosis } from "../src/runtime-diagnostics.ts";

test("runtime diagnosis explains catalog-only cloud access as an entitlement issue", () => {
  const diagnosis = buildRuntimeDiagnosis(
    {
      mode: "cloud",
      model: "qwen3:8b",
      hasApiKey: true,
      cloudApiFlavor: "auto",
    },
    {
      ok: false,
      mode: "cloud",
      model: "qwen3:8b",
      cloudApiFlavor: "auto",
      listModelsOk: true,
      inferenceOk: false,
      availableModels: ["qwen3:8b"],
      errorKind: "unauthorized",
      authStatus: "unauthorized",
      selectedCatalogEndpoint: "/api/tags",
      catalogChecks: [
        {
          flavor: "ollama_native",
          endpoint: "/api/tags",
          ok: true,
          latencyMs: 50,
          authStatus: "authorized",
          modelCount: 1,
          availableModels: ["qwen3:8b"],
        },
      ],
      inferenceChecks: [
        {
          flavor: "ollama_native",
          endpoint: "/api/chat",
          ok: false,
          latencyMs: 80,
          statusCode: 401,
          authStatus: "unauthorized",
          errorKind: "unauthorized",
          error: "unauthorized",
        },
      ],
    },
  );

  assert.equal(diagnosis.businessStatus, "仅模型目录可用");
  assert.match(diagnosis.summary, /模型目录/);
  assert.match(diagnosis.nextActionTitle, /推理权限|entitlement/);
  assert.equal(diagnosis.catalog.status, "ready");
  assert.equal(diagnosis.inference.status, "warning");
  assert.equal(diagnosis.protocolSummary.includes("/api/tags"), true);
});

test("runtime diagnosis calls out protocol mismatch when both endpoints are unsupported", () => {
  const diagnosis = buildRuntimeDiagnosis(
    {
      mode: "cloud",
      model: "qwen3:8b",
      hasApiKey: true,
      cloudApiFlavor: "auto",
    },
    {
      ok: false,
      mode: "cloud",
      model: "qwen3:8b",
      cloudApiFlavor: "auto",
      listModelsOk: false,
      inferenceOk: false,
      availableModels: [],
      errorKind: "endpoint_not_supported",
      authStatus: "authorized",
      catalogChecks: [
        {
          flavor: "ollama_native",
          endpoint: "/api/tags",
          ok: false,
          latencyMs: 20,
          statusCode: 404,
          authStatus: "authorized",
          errorKind: "endpoint_not_supported",
          error: "missing",
        },
        {
          flavor: "openai_compatible",
          endpoint: "/v1/models",
          ok: false,
          latencyMs: 20,
          statusCode: 404,
          authStatus: "authorized",
          errorKind: "endpoint_not_supported",
          error: "missing",
        },
      ],
      inferenceChecks: [],
    },
  );

  assert.equal(diagnosis.businessStatus, "云端协议未匹配");
  assert.match(diagnosis.summary, /protocol|协议/);
  assert.match(
    diagnosis.recommendedActions.join(" "),
    /auto|ollama_native|openai_compatible|cloudBaseUrl/,
  );
});
