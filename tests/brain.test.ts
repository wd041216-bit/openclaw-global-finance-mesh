import test from "node:test";
import assert from "node:assert/strict";

import { OllamaBrainRuntime } from "../src/brain.ts";
import type { BrainRuntimeConfig } from "../src/runtime-config.ts";

function makeConfig(overrides: Partial<BrainRuntimeConfig> = {}): BrainRuntimeConfig {
  return {
    mode: "cloud",
    model: "demo-model",
    localBaseUrl: "http://127.0.0.1:11434",
    cloudBaseUrl: "https://ollama.example.com",
    cloudApiFlavor: "auto",
    apiKey: "secret",
    temperature: 0.2,
    systemPrompt: "demo",
    ...overrides,
  };
}

test("cloud mode serializes requests to respect single-concurrency limits", async () => {
  const originalFetch = globalThis.fetch;
  let activeRequests = 0;
  let maxConcurrent = 0;

  globalThis.fetch = (async () => {
    activeRequests += 1;
    maxConcurrent = Math.max(maxConcurrent, activeRequests);
    await new Promise((resolve) => setTimeout(resolve, 25));
    activeRequests -= 1;
    return new Response(
      JSON.stringify({
        message: {
          content: "ok",
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }) as typeof fetch;

  const runtime = new OllamaBrainRuntime();
  const config = makeConfig();

  try {
    await Promise.all([
      runtime.chat(config, [{ role: "user", content: "one" }]),
      runtime.chat(config, [{ role: "user", content: "two" }]),
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.equal(maxConcurrent, 1);
});

test("cloud runtime uses ollama native endpoints when explicitly configured", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input, init) => {
    seen.push(`${String(init?.method || "GET").toUpperCase()} ${String(input)}`);
    if (String(input).endsWith("/api/tags")) {
      return jsonResponse({
        models: [{ name: "qwen3:8b" }],
      });
    }
    if (String(input).endsWith("/api/chat")) {
      return jsonResponse({
        message: { content: "native ok" },
      });
    }
    return textResponse(404, "not found");
  }) as typeof fetch;

  try {
    const runtime = new OllamaBrainRuntime();
    const config = makeConfig({ cloudApiFlavor: "ollama_native", model: "qwen3:8b" });
    const models = await runtime.listModels(config);
    const chat = await runtime.chat(config, [{ role: "user", content: "hello" }]);

    assert.deepEqual(models.map((item) => item.name), ["qwen3:8b"]);
    assert.equal(chat.content, "native ok");
    assert.deepEqual(seen, [
      "GET https://ollama.example.com/api/tags",
      "POST https://ollama.example.com/api/chat",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("cloud runtime uses openai-compatible endpoints when explicitly configured", async () => {
  const originalFetch = globalThis.fetch;
  const seen: string[] = [];
  globalThis.fetch = (async (input, init) => {
    seen.push(`${String(init?.method || "GET").toUpperCase()} ${String(input)}`);
    if (String(input).endsWith("/v1/models")) {
      return jsonResponse({
        data: [{ id: "gpt-finance" }],
      });
    }
    if (String(input).endsWith("/v1/chat/completions")) {
      return jsonResponse({
        choices: [{ message: { content: "openai ok" } }],
      });
    }
    return textResponse(404, "not found");
  }) as typeof fetch;

  try {
    const runtime = new OllamaBrainRuntime();
    const config = makeConfig({ cloudApiFlavor: "openai_compatible", model: "gpt-finance" });
    const models = await runtime.listModels(config);
    const chat = await runtime.chat(config, [{ role: "user", content: "hello" }]);

    assert.deepEqual(models.map((item) => item.name), ["gpt-finance"]);
    assert.equal(chat.content, "openai ok");
    assert.deepEqual(seen, [
      "GET https://ollama.example.com/v1/models",
      "POST https://ollama.example.com/v1/chat/completions",
    ]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("auto cloud probe prefers openai-compatible endpoints when native endpoints are unsupported", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags") || url.endsWith("/api/chat")) {
      return textResponse(404, "native endpoint missing");
    }
    if (url.endsWith("/v1/models")) {
      return jsonResponse({
        data: [{ id: "gpt-finance" }],
      });
    }
    if (url.endsWith("/v1/chat/completions")) {
      return jsonResponse({
        choices: [{ message: { content: "cloud ok" } }],
      });
    }
    return textResponse(404, "not found");
  }) as typeof fetch;

  try {
    const runtime = new OllamaBrainRuntime();
    const config = makeConfig({ cloudApiFlavor: "auto", model: "gpt-finance" });
    const probe = await runtime.probe(config);

    assert.equal(probe.ok, true);
    assert.equal(probe.selectedCatalogEndpoint, "/v1/models");
    assert.equal(probe.selectedInferenceEndpoint, "/v1/chat/completions");
    assert.equal(probe.catalogChecks[0]?.errorKind, "endpoint_not_supported");
    assert.equal(probe.catalogChecks[1]?.ok, true);
    assert.equal(probe.inferenceChecks[0]?.errorKind, "endpoint_not_supported");
    assert.equal(probe.inferenceChecks[1]?.ok, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("auto cloud probe preserves catalog success when inference is unauthorized", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input) => {
    const url = String(input);
    if (url.endsWith("/api/tags")) {
      return jsonResponse({
        models: [{ name: "qwen3:8b" }],
      });
    }
    if (url.endsWith("/api/chat") || url.endsWith("/v1/chat/completions")) {
      return textResponse(401, "unauthorized");
    }
    if (url.endsWith("/v1/models")) {
      return jsonResponse({
        data: [{ id: "qwen3:8b" }],
      });
    }
    return textResponse(404, "not found");
  }) as typeof fetch;

  try {
    const runtime = new OllamaBrainRuntime();
    const config = makeConfig({ cloudApiFlavor: "auto", model: "qwen3:8b" });
    const probe = await runtime.probe(config);

    assert.equal(probe.ok, false);
    assert.equal(probe.listModelsOk, true);
    assert.equal(probe.inferenceOk, false);
    assert.deepEqual(probe.availableModels, ["qwen3:8b"]);
    assert.equal(probe.errorKind, "unauthorized");
    assert.equal(probe.authStatus, "unauthorized");
    assert.equal(probe.selectedCatalogEndpoint, "/api/tags");
    assert.equal(probe.selectedInferenceEndpoint, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

function textResponse(status: number, body: string) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "text/plain",
    },
  });
}
