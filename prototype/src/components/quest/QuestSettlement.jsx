import { useRef } from "react";
import { ArrowRight, SealCheck } from "@phosphor-icons/react";
import { questUnlock } from "../../motion/questMotion.js";
import { useQuestMotion } from "../../motion/useQuestMotion.js";

export function QuestSettlement({ settlement, onContinue, onReview }) {
  const rootRef = useRef(null);

  useQuestMotion(rootRef, ({ gsap, reducedMotion }) => {
    if (settlement) {
      gsap.fromTo(
        ".quest-settlement-card",
        questUnlock(reducedMotion),
        {
          autoAlpha: 1,
          scale: 1,
          duration: reducedMotion ? 0.01 : 0.5,
        },
      );
    }
  }, [settlement?.challengeId]);

  if (!settlement) return null;

  return (
    <section aria-live="polite" className="quest-settlement" ref={rootRef}>
      <div className="quest-settlement-card">
        <SealCheck className="quest-settlement-seal" size={42} weight="fill" />
        <span className="eyebrow">评测结算</span>
        <h2>{settlement.title}</h2>
        <p>{settlement.verified}</p>
        <strong className="quest-settlement-score">{settlement.score} 分</strong>
        <p className="quest-settlement-next">
          {settlement.nextTitle ? `已解锁：${settlement.nextTitle}` : "课程路线已完成"}
        </p>
        <div className="quest-settlement-actions">
          <button className="ghost-button" onClick={onReview} type="button">
            复盘本关
          </button>
          <button className="primary-button" onClick={onContinue} type="button">
            继续下一关
            <ArrowRight aria-hidden="true" size={18} weight="bold" />
          </button>
        </div>
      </div>
    </section>
  );
}
