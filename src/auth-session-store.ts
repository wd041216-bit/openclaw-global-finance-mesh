import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import type { IncomingHttpHeaders } from "node:http";

import { resolveFinanceMeshPaths } from "./app-paths.ts";
import type { AccessRole, AuthenticatedActor } from "./access-control.ts";
import { enableSqliteDefensiveMode } from "./sqlite-compat.ts";

export const SESSION_COOKIE_NAME = "finance_mesh_session";
export const CSRF_COOKIE_NAME = "finance_mesh_csrf";

export type SessionAuthMethod = "token" | "oidc";

export interface AuthenticatedSession {
  sessionId: string;
  authMethod: SessionAuthMethod;
  actor: AuthenticatedActor;
  issuer?: string;
  subject?: string;
  email?: string;
  createdAt: string;
  lastSeenAt: string;
  expiresAt: string;
  absoluteExpiresAt: string;
  revokedAt?: string;
}

export interface SessionIssueResult {
  session: AuthenticatedSession;
  csrfToken: string;
}

export type SessionResolution =
  | {
      status: "none";
      clearCookies?: boolean;
    }
  | {
      status: "error";
      statusCode: number;
      error: string;
      clearCookies?: boolean;
    }
  | {
      status: "ok";
      session: AuthenticatedSession;
      csrfToken?: string;
    };

export interface OidcStateRecord {
  state: string;
  nonce: string;
  codeVerifier: string;
  redirectTo: string;
  createdAt: string;
  expiresAt: string;
}

interface AuthSessionOptions {
  dbPath?: string;
  idleHours?: number;
  absoluteHours?: number;
  oidcStateTtlMinutes?: number;
}

interface SessionRow {
  session_id: string;
  auth_method: SessionAuthMethod;
  actor_id: string;
  actor_name: string;
  actor_role: AccessRole;
  issuer: string | null;
  subject: string | null;
  email: string | null;
  created_at: string;
  last_seen_at: string;
  expires_at: string;
  absolute_expires_at: string;
  revoked_at: string | null;
  csrf_token_hash: string;
}

interface OidcStateRow {
  state: string;
  nonce: string;
  code_verifier: string;
  redirect_to: string;
  created_at: string;
  expires_at: string;
}

const { runtimeDir: RUNTIME_DIR } = resolveFinanceMeshPaths(import.meta.url);
const SESSION_DB_PATH = path.join(RUNTIME_DIR, "auth-sessions.sqlite");

export class AuthSessionStore {
  private readonly dbPath: string;
  private readonly idleHours: number;
  private readonly absoluteHours: number;
  private readonly oidcStateTtlMinutes: number;

  private db: DatabaseSync | null = null;
  private ready: Promise<void> | null = null;

  constructor(options?: AuthSessionOptions) {
    this.dbPath = options?.dbPath ?? SESSION_DB_PATH;
    this.idleHours = normalizePositiveNumber(options?.idleHours, 8);
    this.absoluteHours = normalizePositiveNumber(options?.absoluteHours, 24);
    this.oidcStateTtlMinutes = normalizePositiveNumber(options?.oidcStateTtlMinutes, 10);
  }

  async issueSession(input: {
    authMethod: SessionAuthMethod;
    actor: AuthenticatedActor;
    issuer?: string;
    subject?: string;
    email?: string;
  }): Promise<SessionIssueResult> {
    await this.ensureReady();
    const now = new Date();
    const createdAt = now.toISOString();
    const absoluteExpiresAt = addHours(now, this.absoluteHours).toISOString();
    const expiresAt = addHours(now, this.idleHours).toISOString();
    const sessionId = randomToken();
    const csrfToken = randomToken();

    this.database().prepare(`
      INSERT INTO auth_sessions (
        session_id,
        auth_method,
        actor_id,
        actor_name,
        actor_role,
        issuer,
        subject,
        email,
        created_at,
        last_seen_at,
        expires_at,
        absolute_expires_at,
        revoked_at,
        csrf_token_hash
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)
    `).run(
      sessionId,
      input.authMethod,
      input.actor.id,
      input.actor.name,
      input.actor.role,
      normalizeOptionalString(input.issuer),
      normalizeOptionalString(input.subject),
      normalizeOptionalString(input.email),
      createdAt,
      createdAt,
      expiresAt,
      absoluteExpiresAt,
      sha256(csrfToken),
    );

    return {
      session: {
        sessionId,
        authMethod: input.authMethod,
        actor: input.actor,
        issuer: normalizeOptionalString(input.issuer) ?? undefined,
        subject: normalizeOptionalString(input.subject) ?? undefined,
        email: normalizeOptionalString(input.email) ?? undefined,
        createdAt,
        lastSeenAt: createdAt,
        expiresAt,
        absoluteExpiresAt,
      },
      csrfToken,
    };
  }

  async resolveSession(
    headers: IncomingHttpHeaders,
    options?: { method?: string },
  ): Promise<SessionResolution> {
    await this.ensureReady();
    await this.expireStaleSessions();

    const cookies = parseCookies(headers);
    const sessionId = cookies[SESSION_COOKIE_NAME];
    if (!sessionId) {
      return { status: "none" };
    }

    const row = this.selectSessionRow(sessionId);
    if (!row || row.revoked_at) {
      return {
        status: "none",
        clearCookies: true,
      };
    }

    const csrfToken = cookies[CSRF_COOKIE_NAME];
    const unsafeMethod = isUnsafeMethod(options?.method);
    if (unsafeMethod) {
      const csrfHeader = extractHeaderValue(headers["x-finance-mesh-csrf"]);
      if (!csrfHeader || sha256(csrfHeader) !== row.csrf_token_hash) {
        return {
          status: "error",
          statusCode: 403,
          error: "A valid x-finance-mesh-csrf header is required for cookie-authenticated writes.",
        };
      }
    }

    const touched = this.touchSession(row);
    return {
      status: "ok",
      session: touched,
      csrfToken: csrfToken && sha256(csrfToken) === row.csrf_token_hash ? csrfToken : undefined,
    };
  }

  async revokeSession(sessionId: string): Promise<AuthenticatedSession | null> {
    await this.ensureReady();
    const row = this.selectSessionRow(sessionId);
    if (!row) {
      return null;
    }

    const revokedAt = new Date().toISOString();
    this.database().prepare(`
      UPDATE auth_sessions
      SET revoked_at = ?
      WHERE session_id = ?
    `).run(revokedAt, sessionId);

    return this.deserializeSession({
      ...row,
      revoked_at: revokedAt,
    });
  }

  async listSessions(limit = 50): Promise<AuthenticatedSession[]> {
    await this.ensureReady();
    await this.expireStaleSessions();

    const rows = this.database().prepare(`
      SELECT
        session_id,
        auth_method,
        actor_id,
        actor_name,
        actor_role,
        issuer,
        subject,
        email,
        created_at,
        last_seen_at,
        expires_at,
        absolute_expires_at,
        revoked_at,
        csrf_token_hash
      FROM auth_sessions
      WHERE revoked_at IS NULL
      ORDER BY last_seen_at DESC, created_at DESC
      LIMIT ?
    `).all(Math.max(1, limit)) as SessionRow[];

    return rows.map((row) => this.deserializeSession(row));
  }

  async countActiveSessions(): Promise<number> {
    await this.ensureReady();
    await this.expireStaleSessions();

    const row = this.database().prepare(`
      SELECT COUNT(*) AS count
      FROM auth_sessions
      WHERE revoked_at IS NULL
    `).get() as { count?: number } | undefined;

    return Number(row?.count ?? 0);
  }

  async createOidcState(input?: { redirectTo?: string }): Promise<OidcStateRecord> {
    await this.ensureReady();
    await this.pruneExpiredOidcStates();

    const now = new Date();
    const record: OidcStateRecord = {
      state: randomToken(),
      nonce: randomToken(),
      codeVerifier: randomToken(48),
      redirectTo: sanitizeRedirectTo(input?.redirectTo),
      createdAt: now.toISOString(),
      expiresAt: addMinutes(now, this.oidcStateTtlMinutes).toISOString(),
    };

    this.database().prepare(`
      INSERT INTO oidc_login_states (
        state,
        nonce,
        code_verifier,
        redirect_to,
        created_at,
        expires_at
      ) VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      record.state,
      record.nonce,
      record.codeVerifier,
      record.redirectTo,
      record.createdAt,
      record.expiresAt,
    );

    return record;
  }

  async consumeOidcState(state: string): Promise<OidcStateRecord | null> {
    await this.ensureReady();
    await this.pruneExpiredOidcStates();

    const row = this.database().prepare(`
      SELECT
        state,
        nonce,
        code_verifier,
        redirect_to,
        created_at,
        expires_at
      FROM oidc_login_states
      WHERE state = ?
    `).get(state) as OidcStateRow | undefined;

    if (!row) {
      return null;
    }

    this.database().prepare("DELETE FROM oidc_login_states WHERE state = ?").run(state);

    return {
      state: row.state,
      nonce: row.nonce,
      codeVerifier: row.code_verifier,
      redirectTo: sanitizeRedirectTo(row.redirect_to),
      createdAt: row.created_at,
      expiresAt: row.expires_at,
    };
  }

  private async ensureReady(): Promise<void> {
    if (!this.ready) {
      this.ready = this.initialize();
    }
    await this.ready;
  }

  private async initialize(): Promise<void> {
    await fs.mkdir(path.dirname(this.dbPath), { recursive: true });
    this.db = new DatabaseSync(this.dbPath);
    enableSqliteDefensiveMode(this.db);
    this.db.exec(`
      PRAGMA journal_mode = WAL;
      PRAGMA synchronous = FULL;
      CREATE TABLE IF NOT EXISTS auth_sessions (
        session_id TEXT PRIMARY KEY,
        auth_method TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        actor_name TEXT NOT NULL,
        actor_role TEXT NOT NULL,
        issuer TEXT,
        subject TEXT,
        email TEXT,
        created_at TEXT NOT NULL,
        last_seen_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        absolute_expires_at TEXT NOT NULL,
        revoked_at TEXT,
        csrf_token_hash TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_auth_sessions_active ON auth_sessions(revoked_at, expires_at, absolute_expires_at);
      CREATE TABLE IF NOT EXISTS oidc_login_states (
        state TEXT PRIMARY KEY,
        nonce TEXT NOT NULL,
        code_verifier TEXT NOT NULL,
        redirect_to TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL
      );
    `);
  }

  private database(): DatabaseSync {
    if (!this.db) {
      throw new Error("Auth session database is not initialized.");
    }
    return this.db;
  }

  private selectSessionRow(sessionId: string): SessionRow | null {
    const row = this.database().prepare(`
      SELECT
        session_id,
        auth_method,
        actor_id,
        actor_name,
        actor_role,
        issuer,
        subject,
        email,
        created_at,
        last_seen_at,
        expires_at,
        absolute_expires_at,
        revoked_at,
        csrf_token_hash
      FROM auth_sessions
      WHERE session_id = ?
    `).get(sessionId) as SessionRow | undefined;

    return row ?? null;
  }

  private touchSession(row: SessionRow): AuthenticatedSession {
    const now = new Date();
    const lastSeenAt = now.toISOString();
    const absoluteExpiresAt = new Date(row.absolute_expires_at);
    const nextIdleExpiry = addHours(now, this.idleHours);
    const expiresAt = new Date(Math.min(absoluteExpiresAt.getTime(), nextIdleExpiry.getTime())).toISOString();

    this.database().prepare(`
      UPDATE auth_sessions
      SET last_seen_at = ?, expires_at = ?
      WHERE session_id = ?
    `).run(lastSeenAt, expiresAt, row.session_id);

    return this.deserializeSession({
      ...row,
      last_seen_at: lastSeenAt,
      expires_at: expiresAt,
    });
  }

  private deserializeSession(row: SessionRow): AuthenticatedSession {
    return {
      sessionId: row.session_id,
      authMethod: row.auth_method,
      actor: {
        id: row.actor_id,
        name: row.actor_name,
        role: row.actor_role,
      },
      issuer: row.issuer ?? undefined,
      subject: row.subject ?? undefined,
      email: row.email ?? undefined,
      createdAt: row.created_at,
      lastSeenAt: row.last_seen_at,
      expiresAt: row.expires_at,
      absoluteExpiresAt: row.absolute_expires_at,
      revokedAt: row.revoked_at ?? undefined,
    };
  }

  private async expireStaleSessions(): Promise<void> {
    const now = new Date().toISOString();
    this.database().prepare(`
      UPDATE auth_sessions
      SET revoked_at = COALESCE(revoked_at, ?)
      WHERE revoked_at IS NULL
        AND (expires_at <= ? OR absolute_expires_at <= ?)
    `).run(now, now, now);
  }

  private async pruneExpiredOidcStates(): Promise<void> {
    const now = new Date().toISOString();
    this.database().prepare(`
      DELETE FROM oidc_login_states
      WHERE expires_at <= ?
    `).run(now);
  }
}

function parseCookies(headers: IncomingHttpHeaders): Record<string, string> {
  const raw = extractHeaderValue(headers.cookie);
  if (!raw) {
    return {};
  }

  return raw
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce<Record<string, string>>((cookies, entry) => {
      const separatorIndex = entry.indexOf("=");
      if (separatorIndex === -1) {
        return cookies;
      }
      const key = entry.slice(0, separatorIndex).trim();
      const value = entry.slice(separatorIndex + 1).trim();
      if (key) {
        cookies[key] = decodeURIComponent(value);
      }
      return cookies;
    }, {});
}

function extractHeaderValue(value: string | string[] | undefined): string | null {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (Array.isArray(value)) {
    const first = value.find((item) => item.trim());
    return first?.trim() ?? null;
  }
  return null;
}

function isUnsafeMethod(method: string | undefined): boolean {
  const normalized = String(method || "GET").toUpperCase();
  return normalized !== "GET" && normalized !== "HEAD" && normalized !== "OPTIONS";
}

function randomToken(bytes = 32): string {
  return crypto.randomBytes(bytes).toString("base64url");
}

function addHours(value: Date, hours: number): Date {
  return new Date(value.getTime() + hours * 60 * 60 * 1000);
}

function addMinutes(value: Date, minutes: number): Date {
  return new Date(value.getTime() + minutes * 60 * 1000);
}

function normalizePositiveNumber(value: unknown, fallback: number): number {
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) {
    return numeric;
  }
  return fallback;
}

function sanitizeRedirectTo(value: unknown): string {
  const redirectTo = String(value || "").trim();
  if (!redirectTo.startsWith("/") || redirectTo.startsWith("//")) {
    return "/";
  }
  return redirectTo;
}

function normalizeOptionalString(value: unknown): string | null {
  const normalized = String(value || "").trim();
  return normalized ? normalized : null;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}
