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
}

const checks: ReviewCheck[] = [
  { id: "tests", label: "node:test 回归", command: "npm", args: ["test"], required: true },
  { id: "server", label: "服务端语法校验", command: "npm", args: ["run", "verify:server"], required: true },
  { id: "hosts", label: "三宿主联调检查", command: "npm", args: ["run", "doctor:hosts"], required: true },
  { id: "cloud", label: "cloud 运行时检查", command: "npm", args: ["run", "smoke:cloud"], required: false },
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

  const lines = [
    "# Pilot review",
    "",
    `- startedAt: ${startedAt}`,
    `- requiredFailures: ${failures.length}`,
    `- warnings: ${warnings.length}`,
    `- overall: ${failures.length ? "needs_attention" : "ready_for_pilot"}`,
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
  const result = spawnSync(check.command, check.args, {
    encoding: "utf8",
    stdio: "pipe",
  });
  const durationMs = Date.now() - startedAt;
  const combinedOutput = `${result.stdout || ""}\n${result.stderr || ""}`.trim();
  const excerpt = combinedOutput
    .split("\n")
    .filter(Boolean)
    .slice(-8)
    .join("\n");

  if (result.status === 0) {
    if (check.id === "cloud" && /"skipped":\s*true/.test(combinedOutput)) {
      return {
        id: check.id,
        label: check.label,
        required: check.required,
        status: "warning",
        exitCode: result.status,
        durationMs,
        excerpt: `${excerpt}\n真实 cloud key 尚未注入，当前只验证了脚本和本地入口。`.trim(),
      };
    }
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
