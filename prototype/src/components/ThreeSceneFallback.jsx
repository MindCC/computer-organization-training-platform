import { useState } from "react";

const ASSEMBLY_ORDER = [
  "机箱与电源",
  "主板",
  "CPU",
  "内存",
  "显卡",
  "硬盘",
];

export function ThreeSceneFallback({
  completed = false,
  context = "overview",
  onComplete,
}) {
  const isOverview = context === "overview";
  const [currentStep, setCurrentStep] = useState(1);
  const isLastStep = currentStep === ASSEMBLY_ORDER.length;
  return (
    <section className="computer-exploded-fallback" role="status">
      <span className="eyebrow">静态教学视图</span>
      <strong>当前电脑无法启动 3D，已切换到静态教学视图</strong>
      <p>
        五大部件仍可按装配顺序学习；右侧控制和实验记录不会受影响。
      </p>
      <ol aria-label="计算机组装顺序">
        {ASSEMBLY_ORDER.map((step, index) => (
          <li aria-current={index + 1 === currentStep ? "step" : undefined} className={index + 1 <= currentStep ? "active" : ""} key={step}>
            {step}
          </li>
        ))}
      </ol>
      <div className="computer-exploded-fallback-buses">
        <span>数据总线传数据</span>
        <span>地址总线选位置</span>
        <span>控制总线协调读写</span>
      </div>
      {isOverview && onComplete ? (
        <div className="computer-exploded-fallback-actions">
          <button disabled={currentStep === 1} onClick={() => setCurrentStep((step) => Math.max(1, step - 1))} type="button">上一步</button>
          {isLastStep ? (
            <button className="primary-button" disabled={completed} onClick={onComplete} type="button">
              {completed ? "已完成静态探索" : "完成静态探索"}
            </button>
          ) : (
            <button className="primary-button" onClick={() => setCurrentStep((step) => Math.min(ASSEMBLY_ORDER.length, step + 1))} type="button">下一步</button>
          )}
        </div>
      ) : (
        <small>请使用右侧清单选择 CPU、内存、显卡和硬盘配置。</small>
      )}
    </section>
  );
}
