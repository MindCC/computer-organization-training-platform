import { useEffect, useMemo, useState } from "react";
import { Clock, Flag, Lightning, Star } from "@phosphor-icons/react";
import "./classroomTaskCard.css";

/**
 * 教师任务卡（学习记录页右栏）。
 * 只读展示：任务名、剩余时间、阶段进度、经验值/星级。
 * 按用户决定，这里**不提供进入任务内部的入口**（任务从课程首页的地图/任务路线进入）。
 * 全部数字来自 /api/student/classroom/current，剩余时间在本地按秒递减、随服务端数据重同步。
 */
function clockText(seconds) {
  const total = Math.max(0, Math.floor(seconds));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function ClassroomTaskCard({ task = null }) {
  const remainingFromServer = Number(task?.remainingSeconds ?? 0);
  const [remaining, setRemaining] = useState(remainingFromServer);

  // 服务端每次给的都是权威值，先同步，再本地每秒递减
  useEffect(() => { setRemaining(remainingFromServer); }, [remainingFromServer]);
  useEffect(() => {
    if (!task?.session) return undefined;
    const id = window.setInterval(() => setRemaining((value) => Math.max(0, value - 1)), 1000);
    return () => window.clearInterval(id);
  }, [task?.session]);

  const model = useMemo(() => {
    const session = task?.session;
    const studentState = task?.studentState;
    const stages = task?.mission?.stages;
    if (!session || !studentState || !Array.isArray(stages) || stages.length === 0) return null;
    const total = stages.length;
    const done = Math.max(0, Math.min(total, Number(studentState.current_stage_index ?? 0)));
    return {
      title: session.title || task?.mission?.title || "课堂任务",
      total,
      done,
      xp: Number(studentState.xp ?? 0),
      stars: Number(studentState.stars ?? 0),
      durationMinutes: Number(session.duration_minutes ?? 0),
      currentStage: stages[done]?.title ?? null,
      finished: done >= total || studentState.status === "completed",
      stages: stages.map((stage, index) => ({
        id: stage.id ?? index,
        title: stage.title ?? `阶段 ${index + 1}`,
        state: index < done ? "done" : index === done ? "now" : "todo",
      })),
    };
  }, [task]);

  // 没有进行中的课堂任务时整张卡不渲染（用户决定：不要占位的空态）
  if (!model) return null;

  const low = model.durationMinutes > 0 && remaining <= Math.max(60, model.durationMinutes * 60 * 0.2);

  return (
    <section aria-label="教师任务" className="records-panel classroom-task-panel">
      <div className="records-panel-head">
        <strong><Flag size={16} /> 教师任务</strong>
        <small>{model.durationMinutes > 0 ? `限时 ${model.durationMinutes} 分钟` : "不限时"}</small>
      </div>

      <h3 className="task-title" title={model.title}>{model.title}</h3>

      <div className={`task-clock${low ? " is-low" : ""}`}>
        <Clock size={15} />
        <span className="task-clock-label">剩余时间</span>
        <strong>{model.finished ? "已结束" : clockText(remaining)}</strong>
      </div>

      <div className="task-progress">
        <div className="task-progress-track"><i style={{ width: `${Math.round((model.done / model.total) * 100)}%` }} /></div>
        <div className="task-progress-meta">
          <span><Lightning size={13} weight="fill" /> {model.xp} XP</span>
          <span className="task-stars" title={`已获 ${model.stars} 颗星`}>
            {[0, 1, 2].map((i) => <Star key={i} size={13} weight={i < model.stars ? "fill" : "regular"} />)}
          </span>
          <span className="task-count">{model.done} / {model.total} 阶段</span>
        </div>
      </div>

      <p className="task-now">
        {model.finished ? "任务已完成" : <>当前：<strong>{model.currentStage ?? "等待开始"}</strong></>}
      </p>

      <ol className="task-stage-list">
        {model.stages.map((stage) => (
          <li className={`task-stage is-${stage.state}`} key={stage.id}>
            <span className="task-stage-dot" aria-hidden="true" />
            <span className="task-stage-title">{stage.title}</span>
            <span className="task-stage-state">{stage.state === "done" ? "已完成" : stage.state === "now" ? "进行中" : "待开始"}</span>
          </li>
        ))}
      </ol>
      <p className="task-note">进度与经验值取服务端判定结果；用「我的学习计划」安排自己的节奏，任务本身请从课程首页进入。</p>
    </section>
  );
}
