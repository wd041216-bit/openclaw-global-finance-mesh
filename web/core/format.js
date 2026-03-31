export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function formatDateTime(value) {
  if (!value) {
    return "未提供";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }
  return date.toLocaleString("zh-CN");
}

export function humanizeSeconds(seconds) {
  if (!Number.isFinite(seconds)) {
    return "0 秒";
  }
  if (seconds >= 3600) {
    return `${(seconds / 3600).toFixed(1)} 小时`;
  }
  if (seconds >= 60) {
    return `${Math.round(seconds / 60)} 分钟`;
  }
  return `${Math.round(seconds)} 秒`;
}

export function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024 * 1024) {
    return `${(value / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
  if (value >= 1024 * 1024) {
    return `${(value / (1024 * 1024)).toFixed(2)} MB`;
  }
  if (value >= 1024) {
    return `${(value / 1024).toFixed(1)} KB`;
  }
  return `${value} B`;
}

export function shortHash(value) {
  return value ? `${String(value).slice(0, 12)}…` : "n/a";
}

export function pathLeaf(value) {
  if (!value) {
    return "";
  }
  return String(value).split(/[\\/]/).at(-1) || String(value);
}

export function formatRole(role) {
  const labels = {
    viewer: "Viewer",
    operator: "Operator",
    reviewer: "Reviewer",
    admin: "Admin",
  };
  return labels[role] || role || "Unknown";
}

export function formatAuthMethod(value) {
  if (value === "oidc") {
    return "企业身份";
  }
  if (value === "token") {
    return "本地令牌";
  }
  if (value === "bearer") {
    return "Bearer 令牌";
  }
  return "未知方式";
}

export function formatRisk(risk) {
  if (risk === "high") {
    return "高";
  }
  if (risk === "medium") {
    return "中";
  }
  if (risk === "low") {
    return "低";
  }
  return risk || "未标注";
}

export function translateStatus(status) {
  if (status === "healthy") {
    return "正常";
  }
  if (status === "verified") {
    return "已验证";
  }
  if (status === "degraded") {
    return "降级";
  }
  if (status === "pending") {
    return "待处理";
  }
  if (status === "down") {
    return "异常";
  }
  if (status === "not_configured") {
    return "未配置";
  }
  if (status === "mismatch") {
    return "不匹配";
  }
  if (status === "success") {
    return "成功";
  }
  if (status === "failure") {
    return "失败";
  }
  if (status === "partial_failure") {
    return "部分成功";
  }
  return status || "未知";
}

export function translateBackupStatus(status) {
  if (status === "success") {
    return "备份成功";
  }
  if (status === "partial_failure") {
    return "部分成功";
  }
  if (status === "failure") {
    return "备份失败";
  }
  return "未配置";
}

export function translateRestoreStatus(status) {
  if (status === "success") {
    return "恢复演练成功";
  }
  if (status === "degraded") {
    return "恢复演练有告警";
  }
  if (status === "failure") {
    return "恢复演练失败";
  }
  return "恢复状态未知";
}

export function translateRestoreSource(sourceType) {
  if (sourceType === "s3") {
    return "S3 对象存储";
  }
  if (sourceType === "mounted_dir") {
    return "挂载目录";
  }
  return "本地快照";
}

export function translateRestoreCheckStatus(status) {
  if (status === "success") {
    return "通过";
  }
  if (status === "warning") {
    return "告警";
  }
  return "失败";
}

export function statusToneFromStatus(status) {
  if (status === "healthy" || status === "verified" || status === "success" || status === "ready") {
    return "good";
  }
  if (status === "degraded" || status === "pending" || status === "not_configured" || status === "partial_failure" || status === "beta") {
    return "warn";
  }
  if (status === "down" || status === "mismatch" || status === "failure") {
    return "bad";
  }
  if (status === "info") {
    return "info";
  }
  return "neutral";
}

export function splitTags(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

export function splitPaths(value) {
  return String(value || "")
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function toIsoIfPresent(value) {
  if (!value) {
    return undefined;
  }
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }
  return parsed.toISOString();
}

