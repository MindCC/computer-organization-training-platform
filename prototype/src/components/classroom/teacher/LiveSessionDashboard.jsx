import { ClockCountdown, Pause, Play, Stop, ArrowClockwise } from "@phosphor-icons/react";
import { TASK_TYPES } from '../../../shared/classroomTaskChain.js';

function formatTime(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function LiveSessionDashboard({ viewModel, onControl, onRefresh, onEdit, onPresent, lastUpdatedAt, busy = false }) {
  const { title, status, paused } = viewModel;

  return (
    <div className="live-session-dashboard">
      <div className="live-session-status">
        <div className="live-session-info">
          <strong>{title}</strong>
          <span className={`session-status-tag ${status}`}>
            {status === "live" ? "进行中" : status === "paused" ? "已暂停" : status === "ended" ? "已结束" : "草稿"}
          </span>
        </div>
        <div className="live-session-controls">
          <span className="live-session-time">
            <ClockCountdown size={14} />
            最后更新：{lastUpdatedAt ? new Date(lastUpdatedAt).toLocaleTimeString() : "—"}
          </span>
          <button className="ghost-button" onClick={onRefresh} type="button">
            <ArrowClockwise size={14} /> 刷新
          </button>
          {busy && <span role="status">正在更新课堂…</span>}
          <button className="secondary-button" type="button" onClick={()=>onPresent(0)}>课堂演示</button>
          {status === "draft" && (
            <>{onEdit&&<button disabled={busy} className="ghost-button" onClick={onEdit} type="button">编辑任务链</button>}<button disabled={busy} className="primary-button" onClick={() => onControl("start")} type="button">
              <Play size={16} /> 开始课堂
            </button></>
          )}
          {status === "live" && (
            <>
              <button disabled={busy} className="secondary-button" onClick={() => onControl("pause")} type="button">
                <Pause size={16} /> 暂停
              </button>
              <button disabled={busy} className="danger-button" onClick={() => onControl("end")} type="button">
                <Stop size={16} /> 结束课堂
              </button>
            </>
          )}
          {status === "paused" && (
            <>
              <button disabled={busy} className="primary-button" onClick={() => onControl("resume")} type="button">
                <Play size={16} /> 恢复
              </button>
              <button disabled={busy} className="danger-button" onClick={() => onControl("end")} type="button">
                <Stop size={16} /> 结束课堂
              </button>
            </>
          )}
        </div>
      </div>
      {viewModel.mission?.stages && <div className="chain-live-stages" aria-label="课堂任务链进度">{viewModel.mission.stages.map((stage,index)=>{
        const students=viewModel.students??[],done=students.filter(student=>student.currentStageIndex>index).length;
        const current=students.filter(student=>student.status==='in_progress'&&student.currentStageIndex===index).length;
        return <article key={stage.id}><span className={`chain-step-number type-${stage.type??'lab'}`}>{index+1}</span><div><small>{TASK_TYPES[stage.type??'lab']?.label}</small><strong>{stage.title}</strong><span>{status==='draft'?'等待开课':`${done} 人完成 · ${current} 人正在做`}</span><button type="button" className="ghost-button" onClick={()=>onPresent(index)}>打开本步演示</button></div></article>;
      })}</div>}
      {viewModel.lessonPlan && <div className="live-session-lesson-plan">
        <strong>本节教学安排</strong>
        <p>{viewModel.lessonPlan.focus}</p>
        <ol>{viewModel.lessonPlan.steps.map((step, index) => <li key={`${index}-${step}`}>{step}</li>)}</ol>
        {viewModel.lessonPlan.teacherScript && <p>讲解提示：{viewModel.lessonPlan.teacherScript}</p>}
      </div>}
    </div>
  );
}

export function EndConfirmation({ visible, title, onConfirm, onCancel }) {
  if (!visible) return null;
  return (
    <div className="confirmation-overlay">
      <div className="confirmation-dialog">
        <strong>结束课堂</strong>
        <p>确定要结束「{title}」吗？结束后不可恢复。</p>
        <div className="confirmation-actions">
          <button className="ghost-button" onClick={onCancel} type="button">取消</button>
          <button className="danger-button" onClick={onConfirm} type="button">确认结束</button>
        </div>
      </div>
    </div>
  );
}
