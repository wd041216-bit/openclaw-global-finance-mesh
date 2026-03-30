import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type BrainMode = "local" | "cloud";

export interface BrainRuntimeConfig {
  mode: BrainMode;
  model: string;
  localBaseUrl: string;
  cloudBaseUrl: string;
  apiKey?: string;
  temperature: number;
  systemPrompt: string;
}

type PublicBrainRuntimeConfig = Omit<BrainRuntimeConfig, "apiKey"> & {
  hasApiKey: boolean;
};

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const RUNTIME_DIR = path.join(REPO_ROOT, "data", "runtime");
const CONFIG_PATH = path.join(RUNTIME_DIR, "config.json");
const SECRET_PATH = path.join(RUNTIME_DIR, "local.secrets.json");

export class RuntimeConfigStore {
  private readonly configPath: string;
  private readonly secretPath: string;
  private readonly runtimeDir: string;
  private cache: BrainRuntimeConfig | null = null;

  constructor(options?: { configPath?: string; secretPath?: string }) {
    this.configPath = options?.configPath ?? CONFIG_PATH;
    this.secretPath = options?.secretPath ?? SECRET_PATH;
    this.runtimeDir = path.dirname(this.configPath);
  }

  async get(): Promise<BrainRuntimeConfig> {
    if (this.cache) {
      return this.cache;
    }

    const defaults = defaultConfig();
    const configFile = await readJsonFile<Record<string, unknown>>(this.configPath);
    const secretFile = await readJsonFile<Record<string, unknown>>(this.secretPath);

    this.cache = normalizeConfig({
      ...defaults,
      ...configFile,
      apiKey: process.env.OLLAMA_API_KEY || secretFile?.apiKey || defaults.apiKey,
    });
    return this.cache;
  }

  async getPublic(): Promise<PublicBrainRuntimeConfig> {
    const config = await this.get();
    return {
      mode: config.mode,
      model: config.model,
      localBaseUrl: config.localBaseUrl,
      cloudBaseUrl: config.cloudBaseUrl,
      temperature: config.temperature,
      systemPrompt: config.systemPrompt,
      hasApiKey: Boolean(config.apiKey),
    };
  }

  async update(
    nextValues: Partial<BrainRuntimeConfig> & { persistSecret?: boolean },
  ): Promise<PublicBrainRuntimeConfig> {
    const current = await this.get();
    const persistSecret = nextValues.persistSecret === true;
    const next = normalizeConfig({
      ...current,
      ...nextValues,
      apiKey:
        typeof nextValues.apiKey === "string"
          ? nextValues.apiKey.trim()
            ? nextValues.apiKey
            : current.apiKey
          : current.apiKey,
    });

    await fs.mkdir(this.runtimeDir, { recursive: true });
    await fs.writeFile(
      this.configPath,
      JSON.stringify(
        {
          mode: next.mode,
          model: next.model,
          localBaseUrl: next.localBaseUrl,
          cloudBaseUrl: next.cloudBaseUrl,
          temperature: next.temperature,
          systemPrompt: next.systemPrompt,
        },
        null,
        2,
      ),
      "utf8",
    );

    if (persistSecret && next.apiKey) {
      await fs.writeFile(this.secretPath, JSON.stringify({ apiKey: next.apiKey }, null, 2), "utf8");
    }

    this.cache = next;
    return this.getPublic();
  }
}

function defaultConfig(): BrainRuntimeConfig {
  return normalizeConfig({
    mode: process.env.OLLAMA_MODE,
    model: process.env.OLLAMA_MODEL,
    localBaseUrl: process.env.OLLAMA_BASE_URL,
    cloudBaseUrl: process.env.OLLAMA_CLOUD_BASE_URL,
    apiKey: process.env.OLLAMA_API_KEY,
    temperature: process.env.OLLAMA_TEMPERATURE,
    systemPrompt:
      "You are Zhouheng Global Finance Mesh. Use cited legal material when available, stay auditable, and prefer deterministic finance reasoning over vague claims.",
  });
}

function normalizeConfig(raw: Partial<BrainRuntimeConfig> & Record<string, unknown>): BrainRuntimeConfig {
  return {
    mode: raw.mode === "cloud" ? "cloud" : "local",
    model: typeof raw.model === "string" && raw.model.trim() ? raw.model.trim() : "qwen3:8b",
    localBaseUrl:
      typeof raw.localBaseUrl === "string" && raw.localBaseUrl.trim()
        ? stripTrailingSlash(raw.localBaseUrl.trim())
        : "http://127.0.0.1:11434",
    cloudBaseUrl:
      typeof raw.cloudBaseUrl === "string" && raw.cloudBaseUrl.trim()
        ? stripTrailingSlash(raw.cloudBaseUrl.trim())
        : "https://ollama.com",
    apiKey: typeof raw.apiKey === "string" && raw.apiKey.trim() ? raw.apiKey.trim() : undefined,
    temperature: normalizeTemperature(raw.temperature),
    systemPrompt:
      typeof raw.systemPrompt === "string" && raw.systemPrompt.trim()
        ? raw.systemPrompt.trim()
        : "You are Zhouheng Global Finance Mesh. Use cited legal material when available, stay auditable, and prefer deterministic finance reasoning over vague claims.",
  };
}

async function readJsonFile<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, "utf8");
    return JSON.parse(content) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

function stripTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function normalizeTemperature(value: unknown): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric)) {
    return Math.max(0, Math.min(2, numeric));
  }
  return 0.2;
}
