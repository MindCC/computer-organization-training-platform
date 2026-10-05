import { useEffect, useMemo, useRef, useState } from "react";
import { CaretLeft, CaretRight, CheckCircle, MonitorPlay, PencilSimple, Trophy, CircleNotch } from "@phosphor-icons/react";
import { api } from "../../apiClient.js";
import { buildCalendarModel } from "../../recordsScreenModel.js";
import { CHALLENGES } from "../../platformLogic.js";
import "./recordsCalendar.css";

/**
 * 学习日历（手写月历，浅色主题）：
 * - 每天按当天的学习活动盖一枚「贴纸」：点亮整章 / 完成实验 / 练习中 / 课堂演示；
 * - 数据来自 /api/student/activity（按天聚合的关卡尝试与演示练习），所有数字实时算出来；
 * - 点某一天展开当天明细，可点击直接回到对应实验。
 *
 * 美术资产约定：把同名 SVG 放进 prototype/public/calendar/ 即自动替换占位图标，
 * 缺失时自动回退到 Phosphor 图标，因此美术可以随时补齐而无需改代码。
 */
const STICKERS = {
  milestone: { art: "/calendar/day-milestone.svg", Icon: Trophy, label: "点亮整章" },
  complete: { art: "/calendar/day-complete.svg", Icon: CheckCircle, label: "完成实验" },
  practice: { art: "/calendar/day-practice.svg", Icon: PencilSimple, label: "练习中" },
  demo: { art: "/calendar/day-demo.svg", Icon: MonitorPlay, label: "课堂演示" },
};

const WEEKDAYS = ["一", "二", "三", "四", "五", "六", "日"];
const CHALLENGE_TITLES = new Map(CHALLENGES.map((challenge) => [challenge.id, challenge.title]));

function Sticker({ kind }) {
  const [failed, setFailed] = useState(false);
  const config = STICKERS[kind];
  if (!config) return null;
  const { Icon, label, art } = config;
  if (!failed) {
    return <img alt={label} className={`cal-sticker cal-sticker-${kind}`} onError={() => setFailed(true)} src={art} title={label} />;
  }
  return (
    <span className={`cal-sticker cal-sticker-fallback cal-sticker-${kind}`} title={label}>
      <Icon size={24} weight="duotone" />
    </span>
  );
}

function pad(value) {
  return String(value).padStart(2, "0");
}

export function RecordsCalendar({ onOpenChallenge }) {
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [selected, setSelected] = useState(null);

  useEffect(() => {
    let cancelled = false;
    api.learningActivity()
      .then((data) => { if (!cancelled) setActivity(data ?? { challenges: [], demos: [] }); })
      .catch((err) => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, []);

  const model = useMemo(() => buildCalendarModel(activity ?? {}), [activity]);

  // 首次拿到数据后：当前月没有任何记录时，自动跳到最近有记录的月份（避免一进来是空月）
  const jumped = useRef(false);
  useEffect(() => {
    if (jumped.current || !activity) return;
    jumped.current = true;
    const days = model.orderedDays;
    if (days.length === 0) return;
    const now = new Date();
    const currentKey = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
    if (days.some((day) => day.startsWith(currentKey))) return;
    const last = days[days.length - 1];
    setCursor({ year: Number(last.slice(0, 4)), month: Number(last.slice(5, 7)) - 1 });
  }, [activity, model]);

  const cells = useMemo(() => {
    const first = new Date(cursor.year, cursor.month, 1);
    const leading = (first.getDay() + 6) % 7; // 周一为一周第一天
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const list = [];
    for (let i = 0; i < leading; i += 1) list.push(null);
    for (let day = 1; day <= daysInMonth; day += 1) {
      const key = `${cursor.year}-${pad(cursor.month + 1)}-${pad(day)}`;
      list.push({ day, key, entry: model.days.get(key) ?? null });
    }
    while (list.length % 7 !== 0) list.push(null);
    return list;
  }, [cursor, model]);

  const monthKey = `${cursor.year}-${pad(cursor.month + 1)}`;
  const monthTotals = useMemo(() => {
    const days = [...model.days.values()].filter((entry) => entry.day.startsWith(monthKey));
    const litIds = new Set();
    for (const entry of days) for (const id of entry.passedIds) litIds.add(id);
    return {
      lit: litIds.size,
      attempts: days.reduce((sum, entry) => sum + entry.attempts, 0),
      minutes: days.reduce((sum, entry) => sum + entry.minutes, 0),
      milestones: days.reduce((sum, entry) => sum + entry.milestones.length, 0),
      activeDays: days.length,
    };
  }, [model, monthKey]);

  const shiftMonth = (delta) => {
    setSelected(null);
    setCursor((current) => {
      const next = new Date(current.year, current.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  const formatMinutes = (minutes) => (minutes >= 60 ? `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` : `${minutes} 分钟`);
  const selectedEntry = selected ? model.days.get(selected) : null;

  return (
    <section aria-label="学习日历" className="records-panel records-calendar-panel">
      <div className="records-panel-head">
        <strong>学习日历</strong>
        <small>
          共 {model.totals.activeDays} 天有学习记录 · 最近连续 {model.totals.streak} 天
        </small>
      </div>

      <div className="cal-wrap">
        <div className="cal-head">
          <span className="cal-title">
            MY <strong>{cursor.year}</strong> / {pad(cursor.month + 1)}
          </span>
          <div className="cal-nav">
            <button aria-label="上个月" onClick={() => shiftMonth(-1)} type="button"><CaretLeft size={16} /></button>
            <button aria-label="下个月" onClick={() => shiftMonth(1)} type="button"><CaretRight size={16} /></button>
          </div>
        </div>

        <div className="cal-weekdays">
          {WEEKDAYS.map((label) => <span key={label}>{label}</span>)}
        </div>

        <div className="cal-grid">
          {cells.map((cell, index) => {
            if (!cell) return <div className="cal-cell cal-cell-empty" key={`empty-${index}`} />;
            const entry = cell.entry;
            const kind = entry?.kind && entry.kind !== "idle" ? entry.kind : null;
            return (
              <button
                className={`cal-cell${kind ? " has-activity" : ""}${selected === cell.key ? " selected" : ""}`}
                key={cell.key}
                onClick={() => setSelected(selected === cell.key ? null : cell.key)}
                type="button"
              >
                <span className="cal-day">{pad(cell.day)}</span>
                {kind ? <Sticker kind={kind} /> : null}
                {entry ? (
                  <span className="cal-cell-meta">
                    {entry.passedIds.size > 0
                      ? `${entry.passedIds.size} 个实验`
                      : entry.attempts > 0
                        ? `${entry.attempts} 次尝试`
                        : entry.demoBatches > 0
                          ? `演示 ${entry.demoBatches} 批`
                          : ""}
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="cal-month-summary">
          <span><strong>{monthTotals.lit}</strong> 个实验点亮</span>
          <span><strong>{monthTotals.attempts}</strong> 次尝试</span>
          <span><strong>{formatMinutes(monthTotals.minutes)}</strong> 学习时长</span>
          {monthTotals.milestones > 0 ? <span className="accent"><strong>{monthTotals.milestones}</strong> 个章节里程碑</span> : null}
        </div>

        <div className="cal-legend">
          {Object.entries(STICKERS).map(([kind, config]) => (
            <span className="cal-legend-item" key={kind}><Sticker kind={kind} />{config.label}</span>
          ))}
          <span className="cal-legend-hint">点任意一天查看当天明细 · 贴纸会在你补上美术后自动替换</span>
        </div>

        {error ? <p className="cal-empty">学习日历加载失败：{error}</p> : null}
        {!activity && !error ? <p className="cal-loading"><CircleNotch className="spin" size={16} /> 正在统计学习日历…</p> : null}
        {activity && model.totals.activeDays === 0 ? <p className="cal-empty">还没有学习记录，完成一个实验后日历上就会出现第一枚贴纸。</p> : null}

        {selectedEntry ? (
          <div className="cal-day-detail">
            <div className="cal-day-detail-head">
              <strong>{selectedEntry.day}</strong>
              <span>
                {selectedEntry.entries.length} 个实验 · {selectedEntry.attempts} 次尝试 · {formatMinutes(selectedEntry.minutes)}
                {selectedEntry.demoBatches > 0 ? ` · 课堂演示 ${selectedEntry.demoBatches} 批` : ""}
              </span>
            </div>
            <div className="cal-day-list">
              {selectedEntry.entries.length === 0 && selectedEntry.demoBatches > 0 ? (
                <div className="cal-day-row demo">
                  <span className="cal-day-row-state demo">课堂演示</span>
                  <strong>课堂演示练习</strong>
                  <small>{selectedEntry.demoBatches} 批 · {formatMinutes(selectedEntry.minutes)}</small>
                </div>
              ) : null}
              {selectedEntry.entries
                .slice()
                .sort((a, b) => Number(b.passed) - Number(a.passed) || b.attempts - a.attempts)
                .map((row) => (
                  <button
                    className={`cal-day-row${row.passed ? " passed" : ""}`}
                    key={row.challengeId}
                    onClick={() => onOpenChallenge?.(row.challengeId)}
                    type="button"
                  >
                    <span className="cal-day-row-state">{row.passed ? "已通过" : "练习中"}</span>
                    <strong>{CHALLENGE_TITLES.get(row.challengeId) ?? row.challengeId}</strong>
                    <small>{row.attempts} 次尝试 · {formatMinutes(row.minutes)}</small>
                  </button>
                ))}
            </div>
            {selectedEntry.milestones.length > 0 ? (
              <p className="cal-day-milestone">
                <Trophy size={15} weight="duotone" /> 当天点亮整章：
                {selectedEntry.milestones.map((chapterId) => model.chapterTitles.get(chapterId) ?? chapterId).join("、")}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </section>
  );
}
