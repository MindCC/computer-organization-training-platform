export function MissionPauseOverlay({ visible, children }) {
  if (!visible) return children;
  return (
    <div className="mission-pause-shell">
      {children}
      <div className="mission-pause-overlay" role="status" aria-label="课堂已暂停">
        <div className="mission-pause-message">
          <span className="mission-pause-icon">⏸</span>
          <strong>教师已暂停课堂</strong>
          <p>当前操作已保存，请等待教师恢复。</p>
        </div>
      </div>
    </div>
  );
}
