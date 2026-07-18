export function isTrustedRequestOrigin(req, publicBaseUrl = "") {
  const source = req.headers.origin || req.headers.referer;
  if (!source) return true;
  try {
    const expected = new URL(publicBaseUrl || `${req.protocol}://${req.headers.host}`);
    return new URL(source).origin === expected.origin;
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
