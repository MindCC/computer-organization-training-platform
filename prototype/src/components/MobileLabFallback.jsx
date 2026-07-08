import { Desktop, Flask } from "@phosphor-icons/react";

export function MobileLabFallback({ challengeTitle = "" }) {
  return (
    <div className="mobile-lab-fallback">
      <div className="mobile-lab-icon">
        <Flask size={48} weight="duotone" />
      </div>
      <h2>请在电脑上打开实验台</h2>
      {challengeTitle ? <p>当前关卡：{challengeTitle}</p> : null}
      <p className="mobile-lab-hint">
        实验台需要拖拽连线操作，手机屏幕无法完整体验。<br />
        请使用电脑浏览器打开本页面，获得完整的电路实验学习体验。
      </p>
      <div className="mobile-lab-desktop">
        <Desktop size={24} />
        <span>推荐使用桌面端（≥ 768px 宽度）</span>
      </div>
    </div>
  );
}
