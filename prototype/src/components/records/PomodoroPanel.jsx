import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowCounterClockwise, Pause, Play, SkipForward } from "@phosphor-icons/react";
import {
  POMODORO_PHASES,
  cycleDots,
  formatClock,
  isPomodoroPhase,
  localDateKey,
  nextPhase,
  phaseDurationMs,
  phaseLabel,
} from "../../pomodoroModel.js";
import "./pomodoro.css";

/**
 * 番茄钟（学习记录页）：
 * - 25 分钟专注 / 5 分钟短休，每 4 段专注后 15 分钟长休；
 * - 用「结束时间戳」计时而不是累加秒数：切走标签页被节流也不会走偏；
 * - 状态写 localStorage，切页面 / 刷新 / 关掉浏览器再回来都接着走；
 * - 阶段结束用 WebAudio 轻提示音（无音频资源，失败也不影响计时）；
 * - 运行中在标签页标题显示倒计时。
 */
const STORAGE_KEY = "zcyl:pomodoro:v1";
const DEFAULT_PHASE = "focus";

function initialPhaseState() {
  const duration = phaseDurationMs(DEFAULT_PHASE);
  return {
    phase: DEFAULT_PHASE,
    running: false,
    endAt: null,
    remainingMs: duration,
    completedFocus: 0,
    todayFocus: 0,
    date: localDateKey(),
  };
}

function loadPersisted() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const saved = JSON.parse(raw);
    if (!saved || !isPomodoroPhase(saved.phase)) return null;
    const today = localDateKey();
    // 跨天：今日计数归零，其余状态保留
    if (saved.date !== today) return { ...saved, date: today, todayFocus: 0 };
    // 运行中但结束时间已过：结算这段（可能在离开页面时结束）
    if (saved.running && Number(saved.endAt) <= Date.now()) {
      const finishedFocus = saved.phase === "focus";
      const advanced = nextPhase(saved.phase, saved.completedFocus ?? 0);
      return {
        ...saved,
        ...advanced,
        running: false,
        endAt: null,
        remainingMs: phaseDurationMs(advanced.phase),
        todayFocus: (saved.todayFocus ?? 0) + (finishedFocus ? 1 : 0),
      };
    }
    return saved;
  } catch {
    return null;
  }
}

export function PomodoroPanel() {
  const [state, setState] = useState(() => loadPersisted() ?? initialPhaseState());
  const baseTitle = useRef(typeof document === "undefined" ? "" : document.title);
  const audioRef = useRef(null);
  const previousPhase = useRef(state.phase);

  // 计时：按 endAt 算剩余，250ms 刷新一次保证秒数跳动及时
  useEffect(() => {
    if (!state.running) return undefined;
    const id = window.setInterval(() => {
      setState((current) => {
        if (!current.running || !current.endAt) return current;
        const left = current.endAt - Date.now();
        if (left > 0) return { ...current, remainingMs: left };
        const finishedFocus = current.phase === "focus";
        const advanced = nextPhase(current.phase, current.completedFocus);
        return {
          ...current,
          phase: advanced.phase,
          completedFocus: advanced.completedFocus,
          endAt: Date.now() + phaseDurationMs(advanced.phase),
          remainingMs: phaseDurationMs(advanced.phase),
          todayFocus: current.todayFocus + (finishedFocus ? 1 : 0),
        };
      });
    }, 250);
    return () => window.clearInterval(id);
  }, [state.running]);

  // 持久化（不含每秒变化的 remainingMs，只在关键字段变化时写）
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      /* 隐私模式等场景写入失败：不影响计时 */
    }
  }, [state.phase, state.running, state.endAt, state.completedFocus, state.todayFocus, state.date, state.remainingMs]);

  // 阶段切换提示音
  useEffect(() => {
    if (previousPhase.current === state.phase) return;
    previousPhase.current = state.phase;
    try {
      const Ctor = window.AudioContext ?? window.webkitAudioContext;
      if (!Ctor) return;
      if (!audioRef.current) audioRef.current = new Ctor();
      const ctx = audioRef.current;
      if (ctx.state === "suspended") ctx.resume();
      const start = ctx.currentTime;
      [880, 1174.66].forEach((frequency, index) => {
        const oscillator = ctx.createOscillator();
        const gain = ctx.createGain();
        const at = start + index * 0.18;
        oscillator.type = "sine";
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0.0001, at);
        gain.gain.exponentialRampToValueAtTime(0.16, at + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.34);
        oscillator.connect(gain).connect(ctx.destination);
        oscillator.start(at);
        oscillator.stop(at + 0.38);
      });
    } catch {
      /* 没有音频权限也不影响计时 */
    }
  }, [state.phase]);

  // 运行中在标题显示倒计时
  const secondsLeft = Math.ceil(state.remainingMs / 1000);
  useEffect(() => {
    if (!state.running) return undefined;
    document.title = `(${formatClock(state.remainingMs)}) ${baseTitle.current}`;
    return undefined;
  }, [secondsLeft, state.running, state.remainingMs]);

  useEffect(() => () => { document.title = baseTitle.current; }, []);

  const dots = useMemo(() => cycleDots(state.completedFocus), [state.completedFocus]);

  // 循环动画只在计时运行时播放：这是 1280×720 的视频，静止时暂停可省掉持续解码
  const videoRef = useRef(null);
  const reducedMotion = useMemo(
    () => (typeof window === "undefined" ? false : window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false),
    [],
  );
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (state.running && !reducedMotion) {
      const played = video.play();
      if (played?.catch) played.catch(() => { /* 自动播放被拒也不影响计时 */ });
    } else {
      video.pause();
    }
  }, [state.running, reducedMotion]);

  const toggle = () => {
    setState((current) => {
      if (current.running) {
        const left = Math.max(0, (current.endAt ?? Date.now()) - Date.now());
        return { ...current, running: false, endAt: null, remainingMs: left };
      }
      const left = current.remainingMs > 0 ? current.remainingMs : phaseDurationMs(current.phase);
      return { ...current, running: true, endAt: Date.now() + left, remainingMs: left };
    });
  };

  const reset = () => {
    setState((current) => ({
      ...current,
      running: false,
      endAt: null,
      remainingMs: phaseDurationMs(current.phase),
    }));
  };

  const skip = () => {
    setState((current) => {
      const finishedFocus = current.phase === "focus";
      const advanced = nextPhase(current.phase, current.completedFocus);
      return {
        ...current,
        phase: advanced.phase,
        completedFocus: advanced.completedFocus,
        running: false,
        endAt: null,
        remainingMs: phaseDurationMs(advanced.phase),
        todayFocus: current.todayFocus + (finishedFocus ? 1 : 0),
      };
    });
  };

  const phaseMeta = POMODORO_PHASES[state.phase] ?? POMODORO_PHASES[DEFAULT_PHASE];

  return (
    <section aria-label="番茄钟" className={`records-panel pomodoro-panel pomodoro-${state.phase}`}>
      {/* 舞台：循环帧动画。倒计时印在画面自带的木牌上（位置由视频帧像素测量而来） */}
      <div className="pomo-stage">
        <video
          className="pomo-video"
          loop
          muted
          playsInline
          preload="metadata"
          ref={videoRef}
          src="/pomodoro/focus-loop.mp4"
        />
        <div className="pomo-sign">
          <strong className="pomo-sign-clock">{formatClock(state.remainingMs)}</strong>
        </div>
      </div>

      <div className="pomo-bar">
        <span className="pomo-phase">
          {phaseLabel(state.phase)}
          <small>{phaseMeta.minutes} 分钟</small>
        </span>

        <div className="pomo-dots" title={`本轮已完成 ${state.completedFocus % 4 || (state.completedFocus ? 4 : 0)} / 4 段专注`}>
          {dots.map((kind, index) => <span className={`pomo-dot ${kind}`} key={index} />)}
        </div>

        <div className="pomo-actions">
          <button className="pomo-primary" onClick={toggle} type="button">
            {state.running ? <><Pause size={16} weight="fill" /> 暂停</> : <><Play size={16} weight="fill" /> 开始</>}
          </button>
          <button onClick={reset} title="重置本阶段" type="button"><ArrowCounterClockwise size={16} /></button>
          <button onClick={skip} title="跳到下一阶段" type="button"><SkipForward size={16} /></button>
        </div>
      </div>

      <p className="pomo-meta">
        今日已完成 <strong>{state.todayFocus}</strong> 个专注段 · 累计 <strong>{state.completedFocus}</strong> 段专注
        <span className="pomo-hint">25 分钟专注 / 5 分钟短休，每 4 段后 15 分钟长休 · 状态会保留，切页面或刷新都接着走</span>
      </p>
    </section>
  );
}
