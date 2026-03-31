import assert from "node:assert/strict";
import http from "node:http";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { once } from "node:events";
import { fileURLToPath } from "node:url";

import { chromium } from "playwright";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, "..");

async function main() {
  const captureDir = process.env.FINANCE_MESH_CAPTURE_DIR
    ? path.resolve(process.env.FINANCE_MESH_CAPTURE_DIR)
    : null;
  const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), "finance-mesh-smoke-ui-"));
  const appDir = path.join(tempRoot, "app");
  const offboxDir = path.join(tempRoot, "offbox-backups");
  await prepareAppFixture(appDir);

  const oidcServer = await startMockOidcServer();
  const oidcPort = getServerPort(oidcServer);
  const appPort = await getAvailablePort();
  const appProcess = startAppServer(appDir, {
    appPort,
    oidcPort,
    offboxDir,
  });

  try {
    await waitForHttp(`http://127.0.0.1:${appPort}/api/health`, 20_000);
    const browser = await chromium.launch({ headless: true });
    try {
      const page = await browser.newPage({
        viewport: {
          width: 1440,
          height: 1100,
        },
      });
      await page.goto(`http://127.0.0.1:${appPort}/index.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.body.textContent?.includes("像 Apple 一样克制的财务控制台"));
      await maybeCapture(page, captureDir, "home-apple-ui.png");
      await page.getByRole("link", { name: "打开业务工作台" }).click();
      await page.waitForURL(`http://127.0.0.1:${appPort}/workbench.html`);
      await page.waitForFunction(() => document.body.textContent?.includes("今天先做这几件事"));
      await maybeCapture(page, captureDir, "workbench-apple-ui.png");

      await page.goto(`http://127.0.0.1:${appPort}/system.html`, {
        waitUntil: "networkidle",
      });
      await page.locator('#token-login-form input[name="token"]').fill("admin-secret");
      await page.getByRole("button", { name: "用本地令牌登录" }).click();
      await page.waitForFunction(() => document.body.textContent?.includes("Alice Admin"));
      await maybeCapture(page, captureDir, "system-apple-ui.png");

      await page.goto(`http://127.0.0.1:${appPort}/decisions.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.body.textContent?.includes("按三步完成一次决策"));
      await page.getByRole("button", { name: "运行决策" }).click();
      await page.waitForFunction(() => document.querySelector("#decision-result")?.textContent?.includes("当前结论"));
      await maybeCapture(page, captureDir, "decisions-apple-ui.png");

      await page.goto(`http://127.0.0.1:${appPort}/library.html`, {
        waitUntil: "networkidle",
      });
      await page.locator('#search-form input[name="query"]').fill("VAT");
      await page.getByRole("button", { name: "搜索依据库" }).click();
      await page.waitForFunction(() => document.querySelectorAll("#library-results [data-document-id]").length > 0);

      await page.goto(`http://127.0.0.1:${appPort}/system.html`, {
        waitUntil: "networkidle",
      });
      await page.getByText("展开身份绑定与角色映射").click();
      await page.locator('#binding-form input[name="label"]').fill("Smoke Admin Binding");
      await page.locator('#binding-form select[name="matchType"]').selectOption("email");
      await page.locator('#binding-form select[name="role"]').selectOption("admin");
      await page.locator('#binding-form input[name="email"]').fill("admin@example.com");
      await page.getByRole("button", { name: "创建身份绑定" }).click();
      await page.waitForFunction(() => document.querySelector("#binding-list")?.textContent?.includes("admin@example.com"));

      await page.getByRole("button", { name: "退出当前会话" }).click();
      await page.waitForFunction(() => document.body.textContent?.includes("等待登录"));

      await page.getByRole("button", { name: "使用企业身份登录" }).click();
      await page.waitForURL((url) => url.toString().startsWith(`http://127.0.0.1:${appPort}/system.html`));
      await page.waitForFunction(() => document.body.textContent?.includes("Jamie Admin"));

      await page.goto(`http://127.0.0.1:${appPort}/governance.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.body.textContent?.includes("当前完整性结论"));
      await maybeCapture(page, captureDir, "governance-apple-ui.png");

      await page.goto(`http://127.0.0.1:${appPort}/recovery.html`, {
        waitUntil: "networkidle",
      });
      await page.getByRole("button", { name: "立即执行备份" }).click();
      await page.waitForFunction(() => document.querySelectorAll("#backup-list [data-backup-id]").length > 0);

      await page.getByRole("button", { name: "立即执行演练" }).click();
      await page.waitForFunction(() => document.querySelectorAll("#restore-list [data-restore-id]").length > 0);
      await page.waitForFunction(() => document.querySelector("#recovery-summary")?.textContent?.includes("恢复"));
      await maybeCapture(page, captureDir, "recovery-apple-ui.png");

      await page.goto(`http://127.0.0.1:${appPort}/agents.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.body.textContent?.includes("OpenClaw Plugin"));
      await page.waitForFunction(() => document.body.textContent?.includes("Claude MCP Connector"));
      await page.waitForFunction(() => document.body.textContent?.includes("Manus MCP Connector"));
      await maybeCapture(page, captureDir, "agents-apple-ui.png");

      await page.setViewportSize({
        width: 390,
        height: 844,
      });
      await page.goto(`http://127.0.0.1:${appPort}/workbench.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.body.textContent?.includes("今天先做这几件事"));
      await page.goto(`http://127.0.0.1:${appPort}/decisions.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.body.textContent?.includes("按三步完成一次决策"));
      await page.getByRole("button", { name: "运行决策" }).click();
      await page.waitForFunction(() => document.querySelector("#decision-result")?.textContent?.includes("当前结论"));
      await page.goto(`http://127.0.0.1:${appPort}/agents.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.body.textContent?.includes("最小闭环"));
      await page.goto(`http://127.0.0.1:${appPort}/system.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.body.textContent?.includes("身份与入口"));
      await maybeCapture(page, captureDir, "system-mobile-apple-ui.png");

      await page.setViewportSize({
        width: 1440,
        height: 1100,
      });

      await page.goto(`http://127.0.0.1:${appPort}/system.html`, {
        waitUntil: "networkidle",
      });
      await page.waitForFunction(() => document.querySelector("#active-session-list")?.textContent?.includes("Jamie Admin"));
      await page.locator("#active-session-list [data-session-id]").first().click();
      await page.getByRole("button", { name: /撤销/ }).click();
      await page.waitForFunction(() => document.body.textContent?.includes("等待登录"));

      const restoreStatus = await page.evaluate(async () => {
        const response = await fetch("/api/operations/restores", {
          credentials: "same-origin",
        });
        return response.status;
      });
      assert.equal(restoreStatus, 401);
    } finally {
      await browser.close();
    }

    console.log("UI smoke completed successfully.");
  } finally {
    oidcServer.close();
    appProcess.kill("SIGTERM");
    await once(appProcess, "exit").catch(() => undefined);
  }
}

async function prepareAppFixture(appDir: string): Promise<void> {
  await fs.mkdir(appDir, { recursive: true });
  const copies = ["src", "web", "examples", "package.json"];
  for (const entry of copies) {
    const source = path.join(REPO_ROOT, entry);
    const destination = path.join(appDir, entry);
    await fs.cp(source, destination, {
      recursive: true,
      force: true,
    });
  }
  await fs.mkdir(path.join(appDir, "data", "legal-library"), { recursive: true });
  await fs.cp(
    path.join(REPO_ROOT, "data", "legal-library", "library.json"),
    path.join(appDir, "data", "legal-library", "library.json"),
    {
      force: true,
    },
  );
  await fs.mkdir(path.join(appDir, "data", "runtime"), { recursive: true });
  await fs.mkdir(path.join(appDir, "data", "audit"), { recursive: true });
  await fs.symlink(path.join(REPO_ROOT, "node_modules"), path.join(appDir, "node_modules"), "dir");
}

function startAppServer(
  appDir: string,
  input: {
    appPort: number;
    oidcPort: number;
    offboxDir: string;
  },
) {
  return spawn(process.execPath, ["src/server.ts"], {
    cwd: appDir,
    env: {
      ...process.env,
      FINANCE_MESH_PORT: String(input.appPort),
      FINANCE_MESH_AUTH_ENABLED: "true",
      FINANCE_MESH_BOOTSTRAP_ADMIN_NAME: "Alice Admin",
      FINANCE_MESH_BOOTSTRAP_ADMIN_TOKEN: "admin-secret",
      FINANCE_MESH_ALLOW_LOCAL_TOKENS: "true",
      FINANCE_MESH_BASE_URL: `http://127.0.0.1:${input.appPort}`,
      FINANCE_MESH_OIDC_ISSUER: `http://127.0.0.1:${input.oidcPort}`,
      FINANCE_MESH_OIDC_CLIENT_ID: "finance-mesh-smoke",
      FINANCE_MESH_OIDC_CLIENT_SECRET: "smoke-secret",
      FINANCE_MESH_OIDC_SCOPES: "openid profile email",
      FINANCE_MESH_COOKIE_SECURE: "false",
      FINANCE_MESH_BACKUP_LOCAL_DIR: input.offboxDir,
      FINANCE_MESH_LOG_FORMAT: "json",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

async function startMockOidcServer(): Promise<http.Server> {
  const server = http.createServer((req, res) => {
    const requestUrl = new URL(req.url || "/", "http://127.0.0.1");
    const baseUrl = `http://127.0.0.1:${getServerPort(server)}`;

    if (requestUrl.pathname === "/.well-known/openid-configuration") {
      sendJson(res, 200, {
        authorization_endpoint: `${baseUrl}/authorize`,
        token_endpoint: `${baseUrl}/token`,
        userinfo_endpoint: `${baseUrl}/userinfo`,
      });
      return;
    }

    if (requestUrl.pathname === "/authorize") {
      const redirectUri = requestUrl.searchParams.get("redirect_uri");
      const state = requestUrl.searchParams.get("state");
      if (!redirectUri || !state) {
        sendJson(res, 400, { error: "missing redirect_uri or state" });
        return;
      }
      const location = new URL(redirectUri);
      location.searchParams.set("code", "mock-code");
      location.searchParams.set("state", state);
      res.writeHead(302, {
        Location: location.toString(),
      });
      res.end();
      return;
    }

    if (requestUrl.pathname === "/token") {
      sendJson(res, 200, {
        access_token: "mock-access-token",
        token_type: "Bearer",
      });
      return;
    }

    if (requestUrl.pathname === "/userinfo") {
      sendJson(res, 200, {
        sub: "mock-admin-subject",
        email: "admin@example.com",
        email_verified: true,
        name: "Jamie Admin",
      });
      return;
    }

    sendJson(res, 404, { error: "not found" });
  });

  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  return server;
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // keep polling while the app boots
    }
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function getAvailablePort(): Promise<number> {
  const server = http.createServer();
  await new Promise<void>((resolve) => {
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = getServerPort(server);
  server.close();
  return port;
}

function getServerPort(server: http.Server): number {
  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Server is not bound to a TCP port.");
  }
  return address.port;
}

function sendJson(res: http.ServerResponse, status: number, payload: Record<string, unknown>) {
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
  });
  res.end(JSON.stringify(payload));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function maybeCapture(page: import("playwright").Page, captureDir: string | null, fileName: string): Promise<void> {
  if (!captureDir) {
    return;
  }
  await fs.mkdir(captureDir, { recursive: true });
  await page.screenshot({
    path: path.join(captureDir, fileName),
    fullPage: true,
  });
}

await main();
