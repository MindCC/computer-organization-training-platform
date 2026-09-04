export function CourseGuidePanel({ guide, index, completed, onAcknowledge, onClose }) {
  const step = guide?.guideScript?.[index];
  if (!guide || !step) return null;
  const isChallengeGate = step.completion === "challengeComplete";
  return (
    <aside className="course-guide-panel" aria-label="课程引导">
      <div className="course-guide-heading"><div><span className="eyebrow">课程引导</span><strong>{step.title}</strong></div><button aria-label="关闭课程引导" onClick={onClose} type="button">×</button></div>
      <p>{step.instruction}</p>
      <small>步骤 {index + 1} / {guide.guideScript.length}</small>
      {isChallengeGate ? <p className="course-guide-status">{completed ? "已检测到本关完成。" : "完成当前概述关卡后将继续。"}</p> : <button className="primary-button" onClick={onAcknowledge} type="button">我已完成这步</button>}
    </aside>
  );
}
