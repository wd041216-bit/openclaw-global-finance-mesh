import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { IncomingHttpHeaders } from "node:http";

export type AccessRole = "viewer" | "operator" | "reviewer" | "admin";

export interface AuthenticatedActor {
  id: string;
  name: string;
  role: AccessRole;
}

export interface AccessOperator {
  id: string;
  name: string;
  role: AccessRole;
  active: boolean;
  createdAt: string;
}

export interface AccessControlPublicConfig {
  enabled: boolean;
  bootstrapRequired: boolean;
  operators: AccessOperator[];
}

interface AccessControlFile {
  enabled: boolean;
  operators: AccessOperator[];
}

interface AccessControlSecretsFile {
  tokenHashes: Record<string, string>;
}

const MODULE_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(MODULE_DIR, "..");
const RUNTIME_DIR = path.join(REPO_ROOT, "data", "runtime");
const CONFIG_PATH = path.join(RUNTIME_DIR, "access-control.json");
const SECRET_PATH = path.join(RUNTIME_DIR, "access-control.secrets.json");

const ROLE_RANK: Record<AccessRole, number> = {
  viewer: 1,
  operator: 2,
  reviewer: 3,
  admin: 4,
};

export class AccessControlStore {
  private readonly configPath: string;
  private readonly secretPath: string;
  private readonly runtimeDir: string;

  constructor(paths?: { configPath?: string; secretPath?: string }) {
    this.configPath = paths?.configPath ?? CONFIG_PATH;
    this.secretPath = paths?.secretPath ?? SECRET_PATH;
    this.runtimeDir = path.dirname(this.configPath);
  }

  async getPublicConfig(): Promise<AccessControlPublicConfig> {
    const state = await this.load();
    const operators = state.config.operators
      .filter((item) => item.active)
      .sort((left, right) => left.name.localeCompare(right.name));
    return {
      enabled: state.config.enabled,
      bootstrapRequired: !operators.some((item) => item.role === "admin"),
      operators,
    };
  }

  async getSession(headers: IncomingHttpHeaders): Promise<{ authenticated: boolean; actor: AuthenticatedActor | null }> {
    const actor = await this.authenticate(headers);
    return {
      authenticated: Boolean(actor),
      actor,
    };
  }

  async authorize(
    headers: IncomingHttpHeaders,
    requiredRole: AccessRole,
  ): Promise<{ ok: true; actor: AuthenticatedActor | null } | { ok: false; status: number; error: string }> {
    const config = await this.getPublicConfig();
    if (!config.enabled) {
      return {
        ok: true,
        actor: null,
      };
    }

    const actor = await this.authenticate(headers);
    if (!actor) {
      return {
        ok: false,
        status: 401,
        error: "Authentication required.",
      };
    }

    if (ROLE_RANK[actor.role] < ROLE_RANK[requiredRole]) {
      return {
        ok: false,
        status: 403,
        error: `Requires ${requiredRole} role.`,
      };
    }

    return {
      ok: true,
      actor,
    };
  }

  async bootstrapAdmin(input: { name: string; token: string; enableAuth?: boolean }): Promise<AccessOperator> {
    const name = input.name.trim();
    const token = input.token.trim();
    if (!name || !token) {
      throw new Error("Bootstrap admin name and token are required.");
    }

    const state = await this.load();
    const bootstrapRequired = !state.config.operators.some((item) => item.role === "admin");
    if (!bootstrapRequired) {
      throw new Error("Admin bootstrap is already complete.");
    }

    const operator = buildOperator(name, "admin");
    state.config.operators.push(operator);
    state.config.enabled = input.enableAuth !== false;
    state.secrets.tokenHashes[operator.id] = hashToken(token);
    await this.save(state);
    return operator;
  }

  async createOperator(input: { name: string; role: AccessRole; token: string; active?: boolean }): Promise<AccessOperator> {
    const name = input.name.trim();
    const token = input.token.trim();
    if (!name || !token) {
      throw new Error("Operator name and token are required.");
    }

    const state = await this.load();
    const operator: AccessOperator = {
      ...buildOperator(name, input.role),
      active: input.active !== false,
    };
    state.config.operators.push(operator);
    state.secrets.tokenHashes[operator.id] = hashToken(token);
    await this.save(state);
    return operator;
  }

  async updateConfig(input: { enabled?: boolean }): Promise<AccessControlPublicConfig> {
    const state = await this.load();
    if (typeof input.enabled === "boolean") {
      state.config.enabled = input.enabled;
    }
    await this.save(state);
    return this.getPublicConfig();
  }

  private async authenticate(headers: IncomingHttpHeaders): Promise<AuthenticatedActor | null> {
    const token = extractToken(headers);
    if (!token) {
      return null;
    }

    const state = await this.load();
    const tokenHash = hashToken(token);
    const operator = state.config.operators.find(
      (item) => item.active && state.secrets.tokenHashes[item.id] === tokenHash,
    );
    if (!operator) {
      return null;
    }

    return {
      id: operator.id,
      name: operator.name,
      role: operator.role,
    };
  }

  private async load(): Promise<{ config: AccessControlFile; secrets: AccessControlSecretsFile }> {
    await this.bootstrapFromEnv();
    const [configFile, secretsFile] = await Promise.all([
      readJsonFile<AccessControlFile>(this.configPath),
      readJsonFile<AccessControlSecretsFile>(this.secretPath),
    ]);
    return {
      config: {
        enabled: configFile?.enabled === true,
        operators: Array.isArray(configFile?.operators) ? configFile.operators : [],
      },
      secrets: {
        tokenHashes: secretsFile?.tokenHashes ?? {},
      },
    };
  }

  private async save(state: { config: AccessControlFile; secrets: AccessControlSecretsFile }): Promise<void> {
    await fs.mkdir(this.runtimeDir, { recursive: true });
    await Promise.all([
      fs.writeFile(this.configPath, JSON.stringify(state.config, null, 2), "utf8"),
      fs.writeFile(this.secretPath, JSON.stringify(state.secrets, null, 2), "utf8"),
    ]);
  }

  private async bootstrapFromEnv(): Promise<void> {
    const token = process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_TOKEN?.trim();
    const name = process.env.FINANCE_MESH_BOOTSTRAP_ADMIN_NAME?.trim();
    if (!token || !name) {
      return;
    }

    const configFile = await readJsonFile<AccessControlFile>(this.configPath);
    if (Array.isArray(configFile?.operators) && configFile.operators.length > 0) {
      return;
    }

    const operator = buildOperator(name, "admin");
    await this.save({
      config: {
        enabled: process.env.FINANCE_MESH_AUTH_ENABLED === "true",
        operators: [operator],
      },
      secrets: {
        tokenHashes: {
          [operator.id]: hashToken(token),
        },
      },
    });
  }
}

export function isAccessRole(value: unknown): value is AccessRole {
  return value === "viewer" || value === "operator" || value === "reviewer" || value === "admin";
}

function buildOperator(name: string, role: AccessRole): AccessOperator {
  return {
    id: crypto.randomUUID(),
    name,
    role,
    active: true,
    createdAt: new Date().toISOString(),
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

function extractToken(headers: IncomingHttpHeaders): string | null {
  const authorization = headers.authorization;
  if (typeof authorization === "string") {
    const match = authorization.match(/^Bearer\s+(.+)$/i);
    if (match?.[1]) {
      return match[1].trim();
    }
  }

  const headerToken = headers["x-finance-mesh-token"];
  if (typeof headerToken === "string" && headerToken.trim()) {
    return headerToken.trim();
  }

  return null;
}

function hashToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}
