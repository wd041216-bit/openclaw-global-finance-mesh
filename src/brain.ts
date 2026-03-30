import type { BrainRuntimeConfig } from "./runtime-config.ts";

export interface BrainMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface BrainChatResult {
  model: string;
  provider: "ollama-local" | "ollama-cloud";
  content: string;
  raw: Record<string, unknown>;
}

export interface BrainProbeResult {
  ok: boolean;
  mode: BrainRuntimeConfig["mode"];
  listModelsOk: boolean;
  inferenceOk: boolean;
  availableModels: string[];
  inferencePreview?: string;
  error?: string;
}

export class OllamaBrainRuntime {
  private cloudQueue: Promise<unknown> = Promise.resolve();

  async listModels(config: BrainRuntimeConfig): Promise<Array<{ name: string; digest?: string }>> {
    const payload = await this.requestJson(config, "/api/tags", {
      method: "GET",
    });

    const models = Array.isArray(payload.models) ? payload.models : [];
    return models.map((item) => ({
      name: String((item as Record<string, unknown>).name ?? ""),
      digest:
        typeof (item as Record<string, unknown>).digest === "string"
          ? String((item as Record<string, unknown>).digest)
          : undefined,
    }));
  }

  async chat(config: BrainRuntimeConfig, messages: BrainMessage[]): Promise<BrainChatResult> {
    const runner = async () => {
      const payload = await this.requestJson(config, "/api/chat", {
        method: "POST",
        body: JSON.stringify({
          model: config.model,
          stream: false,
          messages,
          options: {
            temperature: config.temperature,
          },
        }),
      });

      const content = String(
        ((payload.message as Record<string, unknown> | undefined)?.content ?? ""),
      );

      return {
        model: config.model,
        provider: config.mode === "cloud" ? "ollama-cloud" : "ollama-local",
        content,
        raw: payload,
      } satisfies BrainChatResult;
    };

    if (config.mode === "cloud") {
      return this.runSerialized(runner);
    }

    return runner();
  }

  async probe(config: BrainRuntimeConfig): Promise<BrainProbeResult> {
    try {
      const models = await this.listModels(config);
      try {
        const inference = await this.chat(config, [
          {
            role: "user",
            content: "Reply with exactly: cloud ok",
          },
        ]);
        return {
          ok: true,
          mode: config.mode,
          listModelsOk: true,
          inferenceOk: true,
          availableModels: models.map((item) => item.name),
          inferencePreview: inference.content,
        };
      } catch (error) {
        return {
          ok: false,
          mode: config.mode,
          listModelsOk: true,
          inferenceOk: false,
          availableModels: models.map((item) => item.name),
          error: error instanceof Error ? error.message : String(error),
        };
      }
    } catch (error) {
      return {
        ok: false,
        mode: config.mode,
        listModelsOk: false,
        inferenceOk: false,
        availableModels: [],
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }

  private async requestJson(
    config: BrainRuntimeConfig,
    endpoint: string,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const url = `${config.mode === "cloud" ? config.cloudBaseUrl : config.localBaseUrl}${endpoint}`;
    const headers = new Headers(init.headers ?? {});
    headers.set("Content-Type", "application/json");

    if (config.mode === "cloud") {
      if (!config.apiKey) {
        throw new Error("OLLAMA_API_KEY is required for cloud mode.");
      }
      headers.set("Authorization", `Bearer ${config.apiKey}`);
    }

    const response = await fetch(url, {
      ...init,
      headers,
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Ollama request failed (${response.status}): ${text.slice(0, 400)}`);
    }

    return (await response.json()) as Record<string, unknown>;
  }

  private runSerialized<T>(task: () => Promise<T>): Promise<T> {
    const nextTask = this.cloudQueue.then(task, task);
    this.cloudQueue = nextTask.then(
      () => undefined,
      () => undefined,
    );
    return nextTask;
  }
}
