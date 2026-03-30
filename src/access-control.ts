import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { IncomingHttpHeaders } from "node:http";

import { AuthSessionStore, type AuthenticatedSession, type SessionAuthMethod } from "./auth-session-store.ts";

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
  credentialType: "token";
  createdAt: string;
}

export type IdentityMode = "local_tokens" | "oidc_hybrid" | "oidc_only";
export type IdentityBindingMatchType = "subject" | "email";

export interface IdentityBinding {
  id: string;
  label: string;
  matchType: IdentityBindingMatchType;
  role: AccessRole;
  issuer?: string;
  subject?: string;
  email?: string;
  active: boolean;
  createdAt: string;
  deactivatedAt?: string;
}

export interface IdentityProviderStatus {
  identityMode: IdentityMode;
  allowLocalTokens: boolean;
  oidcConfigured: boolean;
  oidcDisplayName?: string;
  issuer?: string;
  redirectPath: string;
  scopes: string[];
}

export interface AccessControlPublicConfig extends IdentityProviderStatus {
  enabled: boolean;
  bootstrapRequired: boolean;
  operators: AccessOperator[];
  bindings: IdentityBinding[];
}

export interface AccessSessionState {
  authenticated: boolean;
  actor: AuthenticatedActor | null;
  authMethod?: SessionAuthMethod | "bearer";
  currentSession: AuthenticatedSession | null;
  csrfToken?: string;
  clearSessionCookies?: boolean;
}

interface AccessControlFile {
  enabled: boolean;
  operators: AccessOperator[];
  bindings: IdentityBinding[];
}

interface AccessControlSecretsFile {
  tokenHashes: Record<string, string>;
}

interface AccessControlState {
  config: AccessControlFile;
  secrets: AccessControlSecretsFile;
}

interface OidcConfig {
  baseUrl?: string;
  issuer?: string;
  clientId?: string;
  clientSecret?: string;
  scopes: string[];
  redirectPath: string;
}

interface OidcDiscovery {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint?: string;
}

interface OidcClaims {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
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
  private readonly allowLocalTokens: boolean;
  private readonly oidc: OidcConfig;
  private readonly sessionStore: AuthSessionStore;

  private discoveryPromise: Promise<OidcDiscovery> | null = null;

  constructor(paths?: {
    configPath?: string;
    secretPath?: string;
    sessionPath?: string;
    allowLocalTokens?: boolean;
    oidcBaseUrl?: string;
    oidcIssuer?: string;
    oidcClientId?: string;
    oidcClientSecret?: string;
    oidcScopes?: string[];
    oidcRedirectPath?: string;
    sessionIdleHours?: number;
    sessionAbsoluteHours?: number;
  }) {
    this.configPath = paths?.configPath ?? CONFIG_PATH;
    this.secretPath = paths?.secretPath ?? SECRET_PATH;
    this.runtimeDir = path.dirname(this.configPath);
    this.allowLocalTokens = normalizeBoolean(
      paths?.allowLocalTokens ?? process.env.FINANCE_MESH_ALLOW_LOCAL_TOKENS,
      true,
    );
    this.oidc = {
      baseUrl: normalizeOptionalString(paths?.oidcBaseUrl ?? process.env.FINANCE_MESH_BASE_URL) ?? undefined,
      issuer: normalizeIssuer(paths?.oidcIssuer ?? process.env.FINANCE_MESH_OIDC_ISSUER),
      clientId: normalizeOptionalString(paths?.oidcClientId ?? process.env.FINANCE_MESH_OIDC_CLIENT_ID) ?? undefined,
      clientSecret: normalizeOptionalString(
        paths?.oidcClientSecret ?? process.env.FINANCE_MESH_OIDC_CLIENT_SECRET,
      ) ?? undefined,
      scopes: normalizeScopes(paths?.oidcScopes ?? process.env.FINANCE_MESH_OIDC_SCOPES),
      redirectPath: normalizeRedirectPath(paths?.oidcRedirectPath ?? process.env.FINANCE_MESH_OIDC_REDIRECT_PATH),
    };
    this.sessionStore = new AuthSessionStore({
      dbPath: paths?.sessionPath,
      idleHours: paths?.sessionIdleHours,
      absoluteHours: paths?.sessionAbsoluteHours,
    });
  }

  async getPublicConfig(viewer?: AuthenticatedActor | null): Promise<AccessControlPublicConfig> {
    const state = await this.load();
    const operators = state.config.operators
      .filter((item) => item.active)
      .sort((left, right) => left.name.localeCompare(right.name));
    const canViewBindings = !state.config.enabled || viewer?.role === "admin";
    return {
      enabled: state.config.enabled,
      bootstrapRequired: !operators.some((item) => item.role === "admin"),
      operators,
      bindings: canViewBindings
        ? [...state.config.bindings].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
        : [],
      ...this.getIdentityProviderStatus(),
    };
  }

  async getSession(headers: IncomingHttpHeaders): Promise<AccessSessionState> {
    const sessionResolution = await this.sessionStore.resolveSession(headers, {
      method: "GET",
    });
    if (sessionResolution.status === "ok") {
      return {
        authenticated: true,
        actor: sessionResolution.session.actor,
        authMethod: sessionResolution.session.authMethod,
        currentSession: sessionResolution.session,
        csrfToken: sessionResolution.csrfToken,
      };
    }

    if (this.allowLocalTokens) {
      const actor = await this.authenticateBearerToken(headers);
      if (actor) {
        return {
          authenticated: true,
          actor,
          authMethod: "bearer",
          currentSession: null,
        };
      }
    }

    return {
      authenticated: false,
      actor: null,
      currentSession: null,
      ...(sessionResolution.status !== "error" && sessionResolution.clearCookies === true
        ? { clearSessionCookies: true }
        : {}),
    };
  }

  async authorize(
    headers: IncomingHttpHeaders,
    requiredRole: AccessRole,
    options?: { method?: string },
  ): Promise<
    | {
        ok: true;
        actor: AuthenticatedActor | null;
        authMethod?: SessionAuthMethod | "bearer";
        currentSession: AuthenticatedSession | null;
        csrfToken?: string;
        clearSessionCookies?: boolean;
      }
    | { ok: false; status: number; error: string; clearSessionCookies?: boolean }
  > {
    const config = await this.getPublicConfig();
    const sessionResolution = await this.sessionStore.resolveSession(headers, {
      method: options?.method,
    });
    const shouldClearCookies = sessionResolution.status !== "ok" && sessionResolution.clearCookies === true ? true : undefined;

    if (sessionResolution.status === "error") {
      return {
        ok: false,
        status: sessionResolution.statusCode,
        error: sessionResolution.error,
      };
    }

    const sessionIdentity =
      sessionResolution.status === "ok"
        ? {
            actor: sessionResolution.session.actor,
            authMethod: sessionResolution.session.authMethod,
            currentSession: sessionResolution.session,
            csrfToken: sessionResolution.csrfToken,
          }
        : null;

    let bearerActor: AuthenticatedActor | null = null;
    if (!sessionIdentity && this.allowLocalTokens) {
      bearerActor = await this.authenticateBearerToken(headers);
    }

    const actor = sessionIdentity?.actor ?? bearerActor ?? null;
    const authMethod = sessionIdentity?.authMethod ?? (bearerActor ? "bearer" : undefined);
    const currentSession = sessionIdentity?.currentSession ?? null;

    if (!config.enabled) {
      return {
        ok: true,
        actor,
        authMethod,
        currentSession,
        csrfToken: sessionIdentity?.csrfToken,
        ...(shouldClearCookies ? { clearSessionCookies: true } : {}),
      };
    }

    if (!actor) {
      return {
        ok: false,
        status: 401,
        error: "Authentication required.",
        ...(shouldClearCookies ? { clearSessionCookies: true } : {}),
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
      authMethod,
      currentSession,
      csrfToken: sessionIdentity?.csrfToken,
      ...(shouldClearCookies ? { clearSessionCookies: true } : {}),
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

  async createBinding(input: {
    label?: string;
    matchType: IdentityBindingMatchType;
    role: AccessRole;
    issuer?: string;
    subject?: string;
    email?: string;
  }): Promise<IdentityBinding> {
    const state = await this.load();
    const matchType = input.matchType;
    const label = normalizeOptionalString(input.label);
    const issuer = normalizeIssuer(input.issuer);
    const subject = normalizeOptionalString(input.subject);
    const email = normalizeEmail(input.email);

    if (matchType === "subject") {
      if (!issuer || !subject) {
        throw new Error("Subject bindings require issuer and subject.");
      }
    } else if (matchType === "email") {
      if (!email) {
        throw new Error("Email bindings require a verified email address.");
      }
    } else {
      throw new Error("Invalid binding type.");
    }

    const duplicate = state.config.bindings.find((binding) => {
      if (!binding.active || binding.matchType !== matchType || binding.role !== input.role) {
        return false;
      }
      if (matchType === "subject") {
        return binding.issuer === issuer && binding.subject === subject;
      }
      return normalizeEmail(binding.email) === email;
    });
    if (duplicate) {
      throw new Error("An active identity binding already exists for that subject.");
    }

    const binding: IdentityBinding = {
      id: crypto.randomUUID(),
      label: label ?? (matchType === "subject" ? `${issuer}:${subject}` : email ?? "email binding"),
      matchType,
      role: input.role,
      issuer: issuer ?? undefined,
      subject: subject ?? undefined,
      email: email ?? undefined,
      active: true,
      createdAt: new Date().toISOString(),
    };

    state.config.bindings.push(binding);
    await this.save(state);
    return binding;
  }

  async deactivateBinding(id: string): Promise<IdentityBinding | null> {
    const state = await this.load();
    const binding = state.config.bindings.find((item) => item.id === id);
    if (!binding) {
      return null;
    }
    if (!binding.active) {
      return binding;
    }
    binding.active = false;
    binding.deactivatedAt = new Date().toISOString();
    await this.save(state);
    return binding;
  }

  async updateConfig(input: { enabled?: boolean }): Promise<AccessControlPublicConfig> {
    const state = await this.load();
    if (typeof input.enabled === "boolean") {
      state.config.enabled = input.enabled;
    }
    await this.save(state);
    return this.getPublicConfig();
  }

  async loginWithToken(token: string): Promise<{
    actor: AuthenticatedActor;
    authMethod: SessionAuthMethod;
    currentSession: AuthenticatedSession;
    csrfToken: string;
  }> {
    if (!this.allowLocalTokens) {
      throw new Error("Local token login is disabled by configuration.");
    }

    const actor = await this.authenticateRawToken(token);
    if (!actor) {
      throw new Error("Invalid or inactive local token.");
    }

    const issued = await this.sessionStore.issueSession({
      authMethod: "token",
      actor,
    });

    return {
      actor,
      authMethod: "token",
      currentSession: issued.session,
      csrfToken: issued.csrfToken,
    };
  }

  async issueSessionForActor(input: {
    authMethod: SessionAuthMethod;
    actor: AuthenticatedActor;
    issuer?: string;
    subject?: string;
    email?: string;
  }): Promise<{
    actor: AuthenticatedActor;
    authMethod: SessionAuthMethod;
    currentSession: AuthenticatedSession;
    csrfToken: string;
  }> {
    const issued = await this.sessionStore.issueSession(input);
    return {
      actor: input.actor,
      authMethod: input.authMethod,
      currentSession: issued.session,
      csrfToken: issued.csrfToken,
    };
  }

  async logout(headers: IncomingHttpHeaders): Promise<{ session: AuthenticatedSession | null }> {
    const sessionResolution = await this.sessionStore.resolveSession(headers, {
      method: "GET",
    });
    if (sessionResolution.status !== "ok") {
      return {
        session: null,
      };
    }

    return {
      session: await this.sessionStore.revokeSession(sessionResolution.session.sessionId),
    };
  }

  async listSessions(limit = 50): Promise<AuthenticatedSession[]> {
    return this.sessionStore.listSessions(limit);
  }

  async revokeSession(sessionId: string): Promise<AuthenticatedSession | null> {
    return this.sessionStore.revokeSession(sessionId);
  }

  async beginOidcLogin(input?: { redirectTo?: string }): Promise<{ location: string }> {
    const status = this.getIdentityProviderStatus();
    if (!status.oidcConfigured) {
      throw new Error("OIDC is not configured.");
    }

    const [discovery, state] = await Promise.all([
      this.getOidcDiscovery(),
      this.sessionStore.createOidcState({
        redirectTo: input?.redirectTo,
      }),
    ]);

    const redirectUri = new URL(this.oidc.redirectPath, this.oidc.baseUrl).toString();
    const authUrl = new URL(discovery.authorization_endpoint);
    authUrl.searchParams.set("response_type", "code");
    authUrl.searchParams.set("client_id", this.oidc.clientId ?? "");
    authUrl.searchParams.set("redirect_uri", redirectUri);
    authUrl.searchParams.set("scope", this.oidc.scopes.join(" "));
    authUrl.searchParams.set("state", state.state);
    authUrl.searchParams.set("nonce", state.nonce);
    authUrl.searchParams.set("code_challenge", toCodeChallenge(state.codeVerifier));
    authUrl.searchParams.set("code_challenge_method", "S256");

    return {
      location: authUrl.toString(),
    };
  }

  async completeOidcLogin(input: { state: string; code: string }): Promise<{
    actor: AuthenticatedActor;
    authMethod: SessionAuthMethod;
    currentSession: AuthenticatedSession;
    csrfToken: string;
    issuer: string;
    subject: string;
    email?: string;
    redirectTo: string;
  }> {
    const oidcStatus = this.getIdentityProviderStatus();
    if (!oidcStatus.oidcConfigured) {
      throw new Error("OIDC is not configured.");
    }

    const oidcState = await this.sessionStore.consumeOidcState(input.state);
    if (!oidcState) {
      throw new Error("OIDC login state is invalid or expired.");
    }

    const discovery = await this.getOidcDiscovery();
    const redirectUri = new URL(this.oidc.redirectPath, this.oidc.baseUrl).toString();
    const tokenResponse = await fetchJson(discovery.token_endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${this.oidc.clientId}:${this.oidc.clientSecret}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code: input.code,
        redirect_uri: redirectUri,
        code_verifier: oidcState.codeVerifier,
      }),
    }) as {
      access_token?: string;
      id_token?: string;
    };

    const claims = await this.fetchOidcClaims(tokenResponse, discovery);
    const binding = await this.matchIdentityBinding(claims);
    if (!binding) {
      throw new Error("No active identity binding matched the OIDC subject or verified email.");
    }

    const actor = buildOidcActor(binding, claims, this.oidc.issuer ?? "");
    const issued = await this.issueSessionForActor({
      authMethod: "oidc",
      actor,
      issuer: this.oidc.issuer,
      subject: claims.sub,
      email: claims.email,
    });

    return {
      ...issued,
      issuer: this.oidc.issuer ?? "",
      subject: claims.sub,
      email: claims.email,
      redirectTo: oidcState.redirectTo,
    };
  }

  getIdentityProviderStatus(): IdentityProviderStatus {
    const oidcConfigured = Boolean(
      this.oidc.baseUrl && this.oidc.issuer && this.oidc.clientId && this.oidc.clientSecret,
    );
    return {
      identityMode: oidcConfigured ? (this.allowLocalTokens ? "oidc_hybrid" : "oidc_only") : "local_tokens",
      allowLocalTokens: this.allowLocalTokens,
      oidcConfigured,
      oidcDisplayName: this.oidc.issuer ? new URL(this.oidc.issuer).hostname : undefined,
      issuer: this.oidc.issuer,
      redirectPath: this.oidc.redirectPath,
      scopes: this.oidc.scopes,
    };
  }

  private async authenticateBearerToken(headers: IncomingHttpHeaders): Promise<AuthenticatedActor | null> {
    const token = extractToken(headers);
    if (!token) {
      return null;
    }
    return this.authenticateRawToken(token);
  }

  private async authenticateRawToken(token: string): Promise<AuthenticatedActor | null> {
    const normalizedToken = token.trim();
    if (!normalizedToken) {
      return null;
    }

    const state = await this.load();
    const tokenHash = hashToken(normalizedToken);
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

  private async matchIdentityBinding(claims: OidcClaims): Promise<IdentityBinding | null> {
    const state = await this.load();
    const activeBindings = state.config.bindings.filter((item) => item.active);

    const subjectBinding = activeBindings.find(
      (binding) =>
        binding.matchType === "subject" &&
        binding.issuer === this.oidc.issuer &&
        binding.subject === claims.sub,
    );
    if (subjectBinding) {
      return subjectBinding;
    }

    const email = normalizeEmail(claims.email);
    if (claims.email_verified && email) {
      const emailBinding = activeBindings.find(
        (binding) => binding.matchType === "email" && normalizeEmail(binding.email) === email,
      );
      if (emailBinding) {
        return emailBinding;
      }
    }

    return null;
  }

  private async fetchOidcClaims(
    tokenResponse: { access_token?: string; id_token?: string },
    discovery: OidcDiscovery,
  ): Promise<OidcClaims> {
    if (discovery.userinfo_endpoint && tokenResponse.access_token) {
      const claims = await fetchJson(discovery.userinfo_endpoint, {
        headers: {
          Authorization: `Bearer ${tokenResponse.access_token}`,
        },
      });
      return normalizeOidcClaims(claims);
    }

    if (tokenResponse.id_token) {
      return normalizeOidcClaims(parseJwtPayload(tokenResponse.id_token));
    }

    throw new Error("OIDC provider did not return user claims.");
  }

  private async getOidcDiscovery(): Promise<OidcDiscovery> {
    if (!this.discoveryPromise) {
      if (!this.oidc.issuer) {
        throw new Error("OIDC issuer is not configured.");
      }

      const discoveryUrl = new URL("/.well-known/openid-configuration", `${this.oidc.issuer}/`).toString();
      this.discoveryPromise = fetchJson(discoveryUrl).then((value) => {
        const discovery = value as Partial<OidcDiscovery>;
        if (!discovery.authorization_endpoint || !discovery.token_endpoint) {
          throw new Error("OIDC discovery response is missing required endpoints.");
        }
        return {
          authorization_endpoint: discovery.authorization_endpoint,
          token_endpoint: discovery.token_endpoint,
          userinfo_endpoint: discovery.userinfo_endpoint,
        };
      });
    }
    return this.discoveryPromise;
  }

  private async load(): Promise<AccessControlState> {
    await this.bootstrapFromEnv();
    const [configFile, secretsFile] = await Promise.all([
      readJsonFile<AccessControlFile>(this.configPath),
      readJsonFile<AccessControlSecretsFile>(this.secretPath),
    ]);
    return {
      config: {
        enabled: configFile?.enabled === true,
        operators: Array.isArray(configFile?.operators)
          ? configFile.operators.map((operator) => ({
              credentialType: "token" as const,
              ...operator,
            }))
          : [],
        bindings: Array.isArray(configFile?.bindings) ? configFile.bindings : [],
      },
      secrets: {
        tokenHashes: secretsFile?.tokenHashes ?? {},
      },
    };
  }

  private async save(state: AccessControlState): Promise<void> {
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
        bindings: [],
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

export function isIdentityBindingMatchType(value: unknown): value is IdentityBindingMatchType {
  return value === "subject" || value === "email";
}

function buildOperator(name: string, role: AccessRole): AccessOperator {
  return {
    id: crypto.randomUUID(),
    name,
    role,
    active: true,
    credentialType: "token",
    createdAt: new Date().toISOString(),
  };
}

function buildOidcActor(binding: IdentityBinding, claims: OidcClaims, issuer: string): AuthenticatedActor {
  const normalizedIssuer = normalizeIssuer(issuer) ?? "oidc";
  const identityRef = `${normalizedIssuer}:${claims.sub}`;
  return {
    id: `oidc:${hashToken(identityRef).slice(0, 24)}`,
    name: claims.name ?? claims.preferred_username ?? claims.email ?? binding.label,
    role: binding.role,
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

function normalizeBoolean(value: unknown, fallback: boolean): boolean {
  if (typeof value === "boolean") {
    return value;
  }
  if (typeof value === "string") {
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
  }
  return fallback;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function normalizeRedirectPath(value: unknown): string {
  const normalized = String(value || "/api/access-control/callback").trim();
  if (!normalized.startsWith("/")) {
    return "/api/access-control/callback";
  }
  return normalized;
}

function normalizeIssuer(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  if (!normalized) {
    return undefined;
  }
  return normalized.replace(/\/+$/, "");
}

function normalizeScopes(value: unknown): string[] {
  if (Array.isArray(value) && value.length > 0) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }

  const raw = String(value || "openid profile email");
  return raw
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function normalizeEmail(value: unknown): string | undefined {
  const normalized = normalizeOptionalString(value);
  return normalized ? normalized.toLowerCase() : undefined;
}

function normalizeOidcClaims(value: unknown): OidcClaims {
  const record = (value ?? {}) as Record<string, unknown>;
  const subject = normalizeOptionalString(record.sub);
  if (!subject) {
    throw new Error("OIDC claims did not include a subject.");
  }
  return {
    sub: subject,
    email: normalizeEmail(record.email),
    email_verified: normalizeBoolean(record.email_verified, false),
    name: normalizeOptionalString(record.name) ?? undefined,
    preferred_username: normalizeOptionalString(record.preferred_username) ?? undefined,
  };
}

function parseJwtPayload(token: string): unknown {
  const parts = token.split(".");
  if (parts.length < 2) {
    throw new Error("Invalid id_token payload.");
  }
  const payload = parts[1];
  const normalized = payload.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf8"));
}

function toCodeChallenge(codeVerifier: string): string {
  return crypto.createHash("sha256").update(codeVerifier).digest("base64url");
}

async function fetchJson(url: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new Error(`Request to ${url} failed with status ${response.status}.`);
  }
  return response.json();
}
