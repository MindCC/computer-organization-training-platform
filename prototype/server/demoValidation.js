/**
 * 课堂演示页练习成绩的校验与白名单。
 * 演示页（public/demos/*.html）是独立静态页，练习成绩走独立端点记入 demo_attempts 表，
 * 与关卡提交（challenge_attempts，服务端复算电路证据）互不冒充。
 */

import { HOSTED_DEMOS } from "../src/shared/demoNavigation.js";
export const DEMO_PAGES = HOSTED_DEMOS;

const DEMO_IDS = new Set(DEMO_PAGES.map((page) => page.id));

export function isValidDemoId(demoId) {
  return DEMO_IDS.has(demoId);
}

export function demoTitleOf(demoId) {
  return DEMO_PAGES.find((page) => page.id === demoId)?.title ?? demoId;
}

const MAX_TOTAL = 50;
const MAX_ERRORS = 8;
const MAX_ERROR_TEXT = 120;
const MAX_ELAPSED_MINUTES = 240;

export function normalizeDemoAttemptPayload(payload = {}) {
  const demoId = String(payload.demoId ?? "");
  if (!isValidDemoId(demoId)) {
    return { ok: false, status: 400, error: "未知演示页" };
  }
  const result = payload.result && typeof payload.result === "object" && !Array.isArray(payload.result) ? payload.result : {};
  const score = Number(result.score ?? 0);
  if (!Number.isInteger(score) || score < 0 || score > 100) {
    return { ok: false, status: 400, error: "score must be an integer from 0 to 100" };
  }
  const total = Number(result.total ?? 0);
  if (!Number.isInteger(total) || total < 1 || total > MAX_TOTAL) {
    return { ok: false, status: 400, error: `total must be an integer from 1 to ${MAX_TOTAL}` };
  }
  const correct = Number(result.correct ?? 0);
  if (!Number.isInteger(correct) || correct < 0 || correct > total) {
    return { ok: false, status: 400, error: "correct must be an integer from 0 to total" };
  }
  const elapsedMinutes = Number(result.elapsedMinutes ?? 0);
  if (!Number.isFinite(elapsedMinutes) || elapsedMinutes < 0 || elapsedMinutes > MAX_ELAPSED_MINUTES) {
    return { ok: false, status: 400, error: "elapsedMinutes must be between 0 and 240" };
  }
  const errors = Array.isArray(result.errors) ? result.errors.slice(0, MAX_ERRORS).map((error) => {
    if (typeof error === "string") return error.slice(0, MAX_ERROR_TEXT);
    if (error && typeof error === "object" && !Array.isArray(error)) {
      return { type: String(error.type ?? "练习反馈").slice(0, 60), message: String(error.message ?? "").slice(0, MAX_ERROR_TEXT) };
    }
    return String(error).slice(0, MAX_ERROR_TEXT);
  }) : [];

  return {
    ok: true,
    demoId,
    result: { score, total, correct, errors, elapsedMinutes },
  };
}
