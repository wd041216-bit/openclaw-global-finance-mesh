import { spawnSync } from "node:child_process";

interface ReviewCheck {
  id: string;
  label: string;
  command: string;
  args: string[];
  required: boolean;
}

interface ReviewResult {
  id: string;
  label: string;
  required: boolean;
  status: "pass" | "warning" | "fail";
  exitCode: number | null;
  durationMs: number;
  excerpt: string;
  runtimeGate?: "pass" | "blocked" | "not_checked";
  runtimeGateReason?: string;
  provider?: string;
  validatedFlavor?: string;
  verifiedModel?: string;
  goLiveReady?: boolean;
}

const checks: ReviewCheck[] = [
  { id: "tests", label: "node:test 回归", command: "npm", args: ["test"], required: true },
  { id: "server", label: "服务端语法校验", command: "npm", args: ["run", "verify:server"], required: true },
  { id: "hosts", label: "三宿主联调检查", command: "npm", args: ["run", "doctor:hosts"], required: true },
  { id: "cloud", label: "cloud 运行时检查", command: "node", args: ["scripts/smoke-cloud.ts"], required: true },
  { id: "restore", label: "恢复演练 smoke", command: "npm", args: ["run", "smoke:restore"], required: true },
  { id: "ui", label: "多页面 UI smoke", command: "npm", args: ["run", "smoke:ui"], required: true },
];

async function main() {
  const includeUi = process.env.FINANCE_MESH_REVIEW_SKIP_UI !== "true";
  const selectedChecks = includeUi ? checks : checks.filter((item) => item.id !== "ui");
  const startedAt = new Date().toISOString();
  const results = selectedChecks.map(runCheck);
  const failures = results.filter((item) => item.status === "fail");
  const warnings = results.filter((item) => item.status === "warning");
  const runtimeGate = results.find((item) => item.id === "cloud");

  const lines = [
    "# Pilot review",
    "",
    `- startedAt: ${startedAt}`,
    `- requiredFailures: ${failures.length}`,
    `- warnings: ${warnings.length}`,
    `- overall: ${failures.length ? "needs_attention" : "ready_for_pilot"}`,
    `- runtimeGate: ${runtimeGate?.runtimeGate || (runtimeGate?.status === "pass" ? "pass" : "not_checked")}`,
    `- runtimeGateReason: ${runtimeGate?.runtimeGateReason || "未执行 cloud 运行时检查"}`,
    `- provider: ${runtimeGate?.provider || "unknown"}`,
    `- validatedFlavor: ${runtimeGate?.validatedFlavor || "n/a"}`,
    `- verifiedModel: ${runtimeGate?.verifiedModel || "n/a"}`,
    `- goLiveReady: ${runtimeGate?.goLiveReady === true ? "true" : "false"}`,
    "",
    "## Checks",
    "",
    ...results.map(renderResult),
  ];

  console.log(lines.join("\n"));
  if (failures.length) {
    process.exitCode = 1;
  }
}

function runCheck(check: ReviewCheck): ReviewResult {
  const startedAt = Date.now();
  const env = buildCheckEnvironment(check.id);
  const result = spawnSync(check.command, check.args, {
    encoding: "utf8",
    stdio: "pipe",
    env,
  });
  const durationMs = Date.now() - startedAt;
  const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const excerpt = combinedOutput
    .split("\n")
    .filter(Boolean)
    .slice(-8)
    .join("\n");

  if (check.id === "cloud") {
    return interpretCloudCheck(check, result.status, durationMs, combinedOutput, excerpt);
  }

  if (result.status === 0) {
    return {
      id: check.id,
      label: check.label,
      required: check.required,
      status: "pass",
      exitCode: result.status,
      durationMs,
      excerpt,
    };
  }

  return {
    id: check.id,
    label: check.label,
    required: check.required,
    status: check.required ? "fail" : "warning",
    exitCode: result.status,
    durationMs,
    excerpt,
  };
}

function buildCheckEnvironment(checkId: string): NodeJS.ProcessEnv {
  if (checkId === "cloud") {
    return { ...process.env };
  }

  const env = { ...process.env };
  delete env.OLLAMA_MODE;
  delete env.OLLAMA_MODEL;
  delete env.OLLAMA_BASE_URL;
  delete env.OLLAMA_CLOUD_BASE_URL;
  delete env.OLLAMA_API_KEY;
  delete env.OLLAMA_TEMPERATURE;
  delete env.OLLAMA_SYSTEM_PROMPT;
  delete env.FINANCE_MESH_CLOUD_API_FLAVOR;
  delete env.OLLAMA_CLOUD_API_FLAVOR;
  return env;
}

function interpretCloudCheck(
  check: ReviewCheck,
  exitCode: number | null,
  durationMs: number,
  combinedOutput: string,
  fallbackExcerpt: string,
): ReviewResult {
  const payload = parseJsonSafely(combinedOutput);
  if (!payload || typeof payload !== "object") {
    return {
      id: check.id,
      label: check.label,
      required: check.required,
      status: "fail",
      exitCode,
      durationMs,
      excerpt: fallbackExcerpt || "无法解析 cloud 验证输出。",
      runtimeGate: "blocked",
      runtimeGateReason: "cloud 验证输出不是可解析的 JSON，无法判定是否允许正式试点。",
      provider: "unknown",
      goLiveReady: false,
    };
  }

  const verification = isRecord(payload.verification) ? payload.verification : {};
  const doctorReport = isRecord(payload.doctorReport) ? payload.doctorReport : {};
  const skipped = payload.skipped === true;
  const goLiveReady = doctorReport.goLiveReady === true || verification.goLiveReady === true;
  const verificationStatus = stringValue(verification.verificationStatus) || stringValue(doctorReport.verificationStatus);
  const provider = stringValue((doctorReport.provider as Record<string, unknown> | undefined)?.label)
    || stringValue(payload.provider)
    || "unknown";
  const validatedFlavor = stringValue(verification.validatedFlavor)
    || stringValue(doctorReport.validatedFlavor)
    || "n/a";
  const verifiedModel = stringValue(verification.verifiedModel)
    || stringValue(doctorReport.verifiedModel)
    || stringValue(payload.model)
    || "n/a";
  const blockers = arrayOfStrings(doctorReport.goLiveBlockers).concat(arrayOfStrings(verification.goLiveBlockers));
  const runtimeGateReason = skipped
    ? stringValue(payload.reason) || "当前没有进入 cloud 模式，无法完成正式试点放行。"
    : blockers[0]
      || stringValue(doctorReport.blockedReason)
      || stringValue(verification.blockedReason)
      || stringValue(doctorReport.recommendedAction)
      || stringValue(payload.recommendedAction)
      || (verificationStatus === "fully_usable" && goLiveReady
        ? "Ollama Cloud 已完成真实验证，可进入正式试点。"
        : "cloud 运行时还没有通过正式试点放行。");
  const status = !skipped && verificationStatus === "fully_usable" && goLiveReady ? "pass" : "fail";
  const excerptLines = [
    `verificationStatus: ${verificationStatus || "unknown"}`,
    `provider: ${provider}`,
    `validatedFlavor: ${validatedFlavor}`,
    `verifiedModel: ${verifiedModel}`,
    `goLiveReady: ${goLiveReady ? "true" : "false"}`,
    `reason: ${runtimeGateReason}`,
  ];

  return {
    id: check.id,
    label: check.label,
    required: check.required,
    status,
    exitCode,
    durationMs,
    excerpt: excerptLines.join("\n"),
    runtimeGate: status === "pass" ? "pass" : "blocked",
    runtimeGateReason,
    provider,
    validatedFlavor,
    verifiedModel,
    goLiveReady,
  };
}

function parseJsonSafely(value: string): Record<string, unknown> | null {
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function renderResult(result: ReviewResult): string {
  return [
    `### ${result.label}`,
    "",
    `- status: ${result.status}`,
    `- required: ${result.required ? "yes" : "no"}`,
    `- exitCode: ${result.exitCode == null ? "signal" : result.exitCode}`,
    `- durationMs: ${result.durationMs}`,
    result.excerpt ? "```text\n" + result.excerpt + "\n```" : "",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

await main();
