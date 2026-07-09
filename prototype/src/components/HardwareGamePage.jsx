import { HARDWARE_GAME_CASES, HARDWARE_PARTS, gradeHardwareBuild } from "../hardwareGame.js";
import { HardwareBuilderView } from "./HardwareBuilderView.jsx";

const categoryLabel = (category) => ({ cpu: "CPU", memory: "内存", storage: "存储", gpu: "显卡" })[category] ?? category;
const partMetric = (category, part) => category === "memory" ? part.capacity + "GB" : category === "storage" ? part.capacity + "GB / " + part.performance : "性能 " + part.performance;
const caseGroups = [{ id: "overview", title: "第一章计算机概述" }, { id: "storage", title: "存储系统" }];

export function HardwareGamePage({ hardwareSelection, setHardwareSelection, hardwareFeedback, setHardwareFeedback, selectedHardwareCaseId, setSelectedHardwareCaseId, progress, submitHardwareBuild }) {
  const selectedCase = HARDWARE_GAME_CASES.find((item) => item.id === selectedHardwareCaseId) ?? HARDWARE_GAME_CASES[0];
  const preview = gradeHardwareBuild(selectedCase.id, hardwareSelection);

  return (
    <div className="hardware-game-page">
      <header className="hardware-game-hero">
        <div>
          <span className="eyebrow">游戏章节</span>
          <h1>电脑装机店经营挑战</h1>
          <p>扮演电脑配件店老板，在预算、性能、容量、报价和利润之间做取舍，给客户配出能解释得清楚的方案。</p>
        </div>
        <div className="hardware-score-card">
          <span>当前预估</span>
          <strong>{preview.score}</strong>
          <small>{preview.passed ? "目标达成" : "需要调整"}</small>
        </div>
      </header>

      <div style={{ height: 520, marginBottom: 16, borderRadius: 12, overflow: "hidden" }}>
        <HardwareBuilderView parts={hardwareSelection} onPartChange={setHardwareSelection} score={preview} />
      </div>

      <div className="hardware-game-grid">
        <aside className="hardware-case-list">
          {caseGroups.map((group) => (
            <section key={group.id}>
              <h2>{group.title}</h2>
              {HARDWARE_GAME_CASES.filter((item) => item.chapter === group.id).map((item) => {
                const record = progress[item.id] ?? {};
                return (
                  <button
                    className={item.id === selectedHardwareCaseId ? "hardware-case active" : "hardware-case"}
                    key={item.id}
                    onClick={() => { setSelectedHardwareCaseId(item.id); setHardwareFeedback(null); }}
                    type="button"
                  >
                    <strong>{item.title}</strong>
                    <span>{record.bestScore ?? 0} / 100 · {record.attempts ?? 0} 次</span>
                  </button>
                );
              })}
            </section>
          ))}
        </aside>

        <section className="hardware-builder section-panel">
          <div className="section-heading">
            <div>
              <h2>{selectedCase.title}</h2>
              <p>{selectedCase.customer}</p>
            </div>
            <button className="primary-button" onClick={submitHardwareBuild} type="button">提交方案</button>
          </div>

          <div className="hardware-business-strip">
            <article className="hardware-business-card"><span>客户满意度</span><strong>{preview.satisfaction}</strong><small>/ 100</small></article>
            <article className="hardware-business-card"><span>方案报价</span><strong>{preview.quotePrice}</strong><small>元</small></article>
            <article className="hardware-business-card"><span>经营利润</span><strong>{preview.profit}</strong><small>元</small></article>
          </div>

          <div className="hardware-market-tags">
            {preview.marketTags.map((tag) => <span key={tag}>{tag}</span>)}
          </div>

          <div className="hardware-targets">
            <span>预算不超过 {selectedCase.targets.budget} 元</span>
            <span>CPU ≥ {selectedCase.targets.cpu}</span>
            <span>内存 ≥ {selectedCase.targets.memory}GB</span>
            <span>容量 ≥ {selectedCase.targets.storageCapacity}GB</span>
            <span>速度 ≥ {selectedCase.targets.storageSpeed}</span>
          </div>

          <div className="hardware-part-grid">
            {Object.entries(HARDWARE_PARTS).map(([category, parts]) => (
              <div className="hardware-part-group" key={category}>
                <strong>{categoryLabel(category)}</strong>
                {parts.map((part) => (
                  <button
                    className={hardwareSelection[category] === part.id ? "hardware-part selected" : "hardware-part"}
                    key={part.id}
                    onClick={() => setHardwareSelection((current) => ({ ...current, [category]: part.id }))}
                    type="button"
                  >
                    <span>{part.name}</span>
                    <small>{part.price} 元 · {partMetric(category, part)}</small>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </section>

        <aside className="hardware-feedback section-panel">
          <h2>客户反馈与经营诊断</h2>
          <div className="hardware-metrics">
            <p className={preview.metrics.totalPrice <= preview.targets.budget ? "ok" : "warn"}><span>总价</span><strong>{preview.metrics.totalPrice} 元</strong></p>
            <p className={preview.metrics.cpu >= preview.targets.cpu ? "ok" : "warn"}><span>CPU</span><strong>{preview.metrics.cpu}</strong></p>
            <p className={preview.metrics.memory >= preview.targets.memory ? "ok" : "warn"}><span>内存</span><strong>{preview.metrics.memory}GB</strong></p>
            <p className={preview.metrics.storageCapacity >= preview.targets.storageCapacity && preview.metrics.storageSpeed >= preview.targets.storageSpeed ? "ok" : "warn"}><span>存储</span><strong>{preview.metrics.storageCapacity}GB / {preview.metrics.storageSpeed}</strong></p>
            <p className={preview.metrics.gpu >= preview.targets.gpu ? "ok" : "warn"}><span>图形</span><strong>{preview.metrics.gpu}</strong></p>
          </div>
          <div className={preview.passed ? "hardware-result-box passed" : "hardware-result-box needs-work"}>
            <strong>{preview.passed ? "已满足客户目标" : "尚未达成目标"}</strong>
            <p>{preview.explanation}</p>
            <small>{preview.recommendation}</small>
            {(hardwareFeedback ?? preview).errors.length > 0 ? (
              <div className="hardware-error-list">
                {(hardwareFeedback ?? preview).errors.map((error) => <span key={error.type}>{error.type}</span>)}
              </div>
            ) : null}
          </div>
        </aside>
      </div>
    </div>
  );
}
