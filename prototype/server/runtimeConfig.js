export function resolvePublicBaseUrl(env = process.env) {
  if (env.PUBLIC_BASE_URL) return env.PUBLIC_BASE_URL;
  return env.NODE_ENV === "production" ? "" : "http://127.0.0.1:5173";
}
