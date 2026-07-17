import { useState } from "react";
import { Play, ClockCountdown, CheckCircle } from "@phosphor-icons/react";

export function SessionSetupPanel({ onCreateSession }) {
  const [durationMinutes, setDurationMinutes] = useState(45);
  const [passScore, setPassScore] = useState(80);
  const [allowMakeup, setAllowMakeup] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    setSubmitting(true);
    try {
      await onCreateSession({
        templateKey: "computer-data-flow",
        durationMinutes,
        passScore,
        allowMakeup,
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="session-setup-panel">
      <div className="session-setup-header">
        <Play size={24} />
        <div>
          <strong>创建课堂任务</strong>
          <p>计算机五大部件与数据流实训</p>
        </div>
      </div>
      <div className="session-setup-form">
        <label className="session-setup-field">
          <span>课堂限时（分钟）</span>
          <div className="stepper">
            <button onClick={() => setDurationMinutes(Math.max(10, durationMinutes - 5))} type="button">-</button>
            <strong>{durationMinutes}</strong>
            <button onClick={() => setDurationMinutes(Math.min(180, durationMinutes + 5))} type="button">+</button>
          </div>
        </label>
        <label className="session-setup-field">
          <span>及格分数</span>
          <div className="stepper">
            <button onClick={() => setPassScore(Math.max(60, passScore - 5))} type="button">-</button>
            <strong>{passScore}</strong>
            <button onClick={() => setPassScore(Math.min(100, passScore + 5))} type="button">+</button>
          </div>
        </label>
        <label className="session-setup-field checkbox">
          <input type="checkbox" checked={allowMakeup} onChange={(e) => setAllowMakeup(e.target.checked)} />
          <span>允许课后补做</span>
        </label>
        <button className="primary-button" onClick={handleCreate} disabled={submitting} type="button">
          <Play size={16} /> {submitting ? "创建中..." : "创建草稿"}
        </button>
      </div>
    </div>
  );
}
