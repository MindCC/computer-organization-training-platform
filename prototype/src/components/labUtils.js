export function statusText(status) {
  if (status === "completed") return "已完成";
  if (status === "in-progress") return "进行中";
  return "未解锁";
}

export function statusTone(status) {
  if (status === "completed") return "success";
  if (status === "in-progress") return "active";
  return "locked";
}

export function formatMinutes(minutes) {
  if (minutes < 60) return `${minutes}分钟`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours > 0 ? `${hours}小时${rest}分` : `${rest}分钟`;
}

export function formatOutputs(outputs) {
  return Object.entries(outputs ?? {})
    .map(([key, value]) => `${key}=${value ?? "?"}`)
    .join(" · ") || "等待连接";
}

export function formatEndpointLabel(endpoint) {
  if (!endpoint) return "等待拖到目标端点";
  if (endpoint.componentLabel && endpoint.pin) return `${endpoint.componentLabel} · ${endpoint.pin}`;
  if (endpoint.componentName && endpoint.pin) return `${endpoint.componentName} · ${endpoint.pin}`;
  return endpoint.label;
}
