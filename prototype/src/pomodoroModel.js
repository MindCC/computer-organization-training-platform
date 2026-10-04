/**
 * 番茄钟纯逻辑：阶段状态机、时长与显示格式化。
 * 全部无副作用，方便单测；界面组件只负责计时与状态持久化。
 */

export const POMODORO_PHASES = {
  focus: { key: "focus", label: "专注", minutes: 25 },
  shortBreak: { key: "shortBreak", label: "短休息", minutes: 5 },
  longBreak: { key: "longBreak", label: "长休息", minutes: 15 },
};

/** 每完成多少个专注段进入一次长休息 */
export const FOCUS_PER_CYCLE = 4;

export function isPomodoroPhase(phase) {
  return Object.prototype.hasOwnProperty.call(POMODORO_PHASES, phase);
}

export function phaseLabel(phase) {
  return POMODORO_PHASES[phase]?.label ?? POMODORO_PHASES.focus.label;
}

export function phaseDurationMs(phase) {
  return (POMODORO_PHASES[phase]?.minutes ?? POMODORO_PHASES.focus.minutes) * 60_000;
}

/**
 * 进入下一阶段：休息段结束回到专注；第 4 个专注段结束后进入长休息。
 * 返回 { phase, completedFocus }，不修改入参。
 */
export function nextPhase(phase, completedFocus = 0) {
  if (phase !== "focus") return { phase: "focus", completedFocus };
  const done = completedFocus + 1;
  return { phase: done % FOCUS_PER_CYCLE === 0 ? "longBreak" : "shortBreak", completedFocus: done };
}

/** 毫秒 → "MM:SS"（向上取整，剩余 0 显示 00:00）。 */
export function formatClock(ms) {
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** 本地日期键 YYYY-MM-DD（用于「今日专注」跨天归零）。 */
export function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

/** 本轮四段循环的进度点：已完成的专注段 / 当前段 / 未开始。 */
export function cycleDots(completedFocus = 0) {
  const inCycle = completedFocus % FOCUS_PER_CYCLE;
  const filled = inCycle === 0 && completedFocus > 0 ? FOCUS_PER_CYCLE : inCycle;
  return Array.from({ length: FOCUS_PER_CYCLE }, (_, index) => (index < filled ? "done" : "todo"));
}
