import { SealCheck, Star, Lightning, ArrowLeft, Play } from "@phosphor-icons/react";

export function MissionSettlement({ viewModel, onReturn, onReview }) {
  if (!viewModel.ended) return null;
  const { xp, stars, studentStatus } = viewModel;
  const result = viewModel.result ?? {};
  const badges = result.badges ?? [];
  const average = result.averageScore ?? 0;
  const passed = stars >= 1;

  return (
    <div className="mission-settlement">
      <div className="mission-settlement-card">
        <div className={`mission-settlement-badge ${passed ? "passed" : "failed"}`}>
          {passed ? <SealCheck size={48} weight="fill" /> : <span className="mission-settlement-x">✕</span>}
        </div>
        <h2>{passed ? "实训通过" : "实训未通过"}</h2>
        <div className="mission-settlement-stats">
          <div className="mission-settlement-stat">
            <Lightning size={18} />
            <strong>{xp}</strong>
            <span>XP</span>
          </div>
          <div className="mission-settlement-stat">
            {[1, 2, 3].map((n) => (
              <Star key={n} size={18} weight={n <= stars ? "fill" : "regular"} />
            ))}
            <span>{stars} 星</span>
          </div>
          <div className="mission-settlement-stat">
            <strong>{average}%</strong>
            <span>平均分</span>
          </div>
        </div>
        {badges.length > 0 && (
          <div className="mission-settlement-badges">
            {badges.map((badge) => (
              <span className="mission-badge" key={badge}>{badge}</span>
            ))}
          </div>
        )}
        <div className="mission-settlement-actions">
          <button className="secondary-button" onClick={onReturn} type="button">
            <ArrowLeft size={16} /> 返回课程
          </button>
          <button className="primary-button" onClick={onReview} type="button">
            <Play size={16} /> 再次优化
          </button>
        </div>
      </div>
    </div>
  );
}
