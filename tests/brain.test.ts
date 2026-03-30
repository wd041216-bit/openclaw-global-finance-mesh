import test from "node:test";
import assert from "node:assert/strict";

import { OllamaBrainRuntime } from "../src/brain.ts";
import type { BrainRuntimeConfig } from "../src/runtime-config.ts";

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
  const config: BrainRuntimeConfig = {
    mode: "cloud",
    model: "demo-model",
    localBaseUrl: "http://127.0.0.1:11434",
    cloudBaseUrl: "https://ollama.com",
    apiKey: "secret",
    temperature: 0.2,
    systemPrompt: "demo",
  };

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

