export function isTrustedRequestOrigin(req, publicBaseUrl = "") {
  const source = req.headers.origin || req.headers.referer;
  if (!source) return true;
  try {
    const expected = new URL(publicBaseUrl || `${req.protocol}://${req.headers.host}`);
    const actual = new URL(source);
    if (actual.origin === expected.origin) return true;
    // Vite 端口被占用时会依次选择 5174、5175…；只对默认本机开发地址放行该范围。
    const actualPort = Number(actual.port);
    return expected.protocol === "http:"
      && expected.hostname === "127.0.0.1"
      && expected.port === "5173"
      && actual.protocol === "http:"
      && actual.hostname === "127.0.0.1"
      && actualPort >= 5173
      && actualPort <= 5199;
  } catch {
    return false;
  }
}

export function createLoginFailureTracker({
  maxFailures = 5,
  windowMs = 60_000,
  maxEntries = 1_000,
  now = Date.now,
} = {}) {
  const records = new Map();

  function current(key) {
    const record = records.get(key);
    if (record && now() - record.since >= windowMs) {
      records.delete(key);
      return null;
    }
    return record ?? null;
  }

  function trim() {
    while (records.size > maxEntries) {
      records.delete(records.keys().next().value);
    }
  }

  return {
    check(key) {
      const record = current(key);
      const elapsed = record ? now() - record.since : 0;
      return {
        blocked: Boolean(record && record.count >= maxFailures),
        retryAfterMs: record ? Math.max(0, windowMs - elapsed) : 0,
      };
    },
    recordFailure(key) {
      const record = current(key) ?? { count: 0, since: now() };
      record.count += 1;
      records.set(key, record);
      trim();
      return { remaining: Math.max(0, maxFailures - record.count) };
    },
    clear(key) {
      records.delete(key);
    },
    size() {
      return records.size;
    },
  };
}

export function sanitizeProfile(profile) {
  const source = profile && typeof profile === "object" && !Array.isArray(profile) ? profile : {};
  const { initialPassword: _discarded, ...safe } = source;
  return safe;
}
