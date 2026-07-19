import { useState } from "react";
import { CheckCircle, CurrencyCny, Gauge, Target, WarningCircle } from "@phosphor-icons/react";
import { HARDWARE_GAME_CASES, gradeHardwareBuild } from "../hardwareGame.js";
import { HardwareBuilderView } from "./HardwareBuilderView.jsx";

const caseGroups = [
  { id: "overview", title: "\u7b2c\u4e00\u7ae0\u00b7\u8ba1\u7b97\u673a\u6982\u8ff0" },
  { id: "storage", title: "\u5b58\u50a8\u7cfb\u7edf" },
];

export function HardwareGamePage({
  hardwareSelection,
  setHardwareSelection,
  hardwareFeedback,
  setHardwareFeedback,
  selectedHardwareCaseId,
  setSelectedHardwareCaseId,
  progress,
  submitHardwareBuild,
}) {
  const [activeCategory, setActiveCategory] = useState("cpu");
  const selectedCase = HARDWARE_GAME_CASES.find((item) => item.id === selectedHardwareCaseId) ?? HARDWARE_GAME_CASES[0];
  const preview = gradeHardwareBuild(selectedCase.id, hardwareSelection);
  const budgetOk = preview.metrics.totalPrice <= selectedCase.targets.budget;

  function selectCase(caseId) {
    setSelectedHardwareCaseId(caseId);
    setHardwareFeedback(null);
  }

  return (
    <div className="hardware-game-page">
      <header className="hardware-game-hero">
        <div className="hardware-game-heading">
          <span className="eyebrow">{"\u5b9e\u6218\u4efb\u52a1\u00b7\u7b2c\u4e00\u7ae0"}</span>
          <h1>{"\u7535\u8111\u88c5\u673a\u5e97\u7ecf\u8425\u6311\u6218"}</h1>
          <p>{"\u8bfb\u61c2\u5ba2\u6237\u9700\u6c42\uff0c\u5728\u9884\u7b97\u3001\u6027\u80fd\u548c\u5229\u6da6\u4e4b\u95f4\u505a\u51fa\u53ef\u89e3\u91ca\u7684\u914d\u7f6e\u51b3\u7b56\u3002"}</p>
        </div>
        <div className="hardware-hero-status">
          <span>{"\u5f53\u524d\u8bc4\u4f30"}</span>
          <strong>{preview.score}</strong>
          <small>{preview.passed ? "\u76ee\u6807\u8fbe\u6210" : "\u9700\u8981\u8c03\u6574"}</small>
        </div>
      </header>

      <div className="hardware-game-layout">
        <aside className="hardware-mission-rail">
          <section className="hardware-mission-card customer">
            <span className="eyebrow">{"\u5ba2\u6237\u9700\u6c42"}</span>
            <h2>{selectedCase.title}</h2>
            <p>{selectedCase.customer}</p>
          </section>

          <section className="hardware-mission-card budget">
            <div>
              <span>{"\u9884\u7b97\u4e0a\u9650"}</span>
              <strong>{"\u00a5 " + selectedCase.targets.budget}</strong>
            </div>
            <small className={budgetOk ? "ok" : "warn"}>
              {budgetOk ? "\u5f53\u524d\u914d\u7f6e\u5728\u9884\u7b97\u5185" : "\u5f53\u524d\u914d\u7f6e\u5df2\u8d85\u9884\u7b97"}
            </small>
          </section>

          <section className="hardware-mission-card">
            <div className="hardware-mission-card-title">
              <span>{"\u4efb\u52a1\u8fdb\u5ea6"}</span>
              <strong>{preview.passed ? "4 / 4" : Math.max(1, 4 - preview.errors.length) + " / 4"}</strong>
            </div>
            <ol className="hardware-mission-steps">
              <li className="done"><CheckCircle size={17} weight="fill" /><span>{"\u9009\u62e9\u5408\u9002\u7684 CPU"}</span></li>
              <li className={preview.metrics.memory >= selectedCase.targets.memory ? "done" : "active"}><CheckCircle size={17} weight="fill" /><span>{"\u914d\u7f6e\u8db3\u591f\u5185\u5b58"}</span></li>
              <li className={preview.metrics.storageSpeed >= selectedCase.targets.storageSpeed ? "done" : "active"}><CheckCircle size={17} weight="fill" /><span>{"\u5e73\u8861\u5b58\u50a8\u5bb9\u91cf\u4e0e\u901f\u5ea6"}</span></li>
              <li className={preview.passed ? "done" : ""}><Target size={17} /><span>{"\u63d0\u4ea4\u62a5\u4ef7\u65b9\u6848"}</span></li>
            </ol>
          </section>

          <section className="hardware-case-rail">
            <span className="eyebrow">{"\u6311\u6218\u4efb\u52a1"}</span>
            {caseGroups.map((group) => (
              <div className="hardware-case-group" key={group.id}>
                <strong>{group.title}</strong>
                {HARDWARE_GAME_CASES.filter((item) => item.chapter === group.id).map((item) => {
                  const record = progress[item.id] ?? {};
                  return (
                    <button
                      aria-pressed={item.id === selectedHardwareCaseId}
                      className={item.id === selectedHardwareCaseId ? "hardware-case active" : "hardware-case"}
                      key={item.id}
                      onClick={() => selectCase(item.id)}
                      type="button"
                    >
                      <span>{item.title}</span>
                      <small>{(record.bestScore ?? 0) + " \u5206\u00b7" + (record.attempts ?? 0) + " \u6b21"}</small>
                    </button>
                  );
                })}
              </div>
            ))}
          </section>
        </aside>

        <section className="hardware-game-main">
          <HardwareBuilderView
            activeCategory={activeCategory}
            onCategoryChange={setActiveCategory}
            onPartChange={setHardwareSelection}
            parts={hardwareSelection}
            score={preview}
          />

          <section className="hardware-business-panel">
            <header className="section-heading">
              <div>
                <span className="eyebrow">{"\u5ba2\u6237\u53cd\u9988\u4e0e\u7ecf\u8425\u6570\u636e"}</span>
                <h2>{preview.passed ? "\u65b9\u6848\u53ef\u4ee5\u62a5\u4ef7" : "\u8fd8\u6709\u9700\u6c42\u672a\u6ee1\u8db3"}</h2>
              </div>
              <button className="primary-button" onClick={submitHardwareBuild} type="button">{"\u63d0\u4ea4\u65b9\u6848"}</button>
            </header>

            <div className="hardware-business-strip">
              <article className="hardware-business-card"><Gauge size={22} /><span>{"\u5ba2\u6237\u6ee1\u610f\u5ea6"}</span><strong>{preview.satisfaction}</strong><small>/ 100</small></article>
              <article className="hardware-business-card"><CurrencyCny size={22} /><span>{"\u65b9\u6848\u62a5\u4ef7"}</span><strong>{preview.quotePrice}</strong><small>{"\u5143"}</small></article>
              <article className="hardware-business-card"><Target size={22} /><span>{"\u7ecf\u8425\u5229\u6da6"}</span><strong>{preview.profit}</strong><small>{"\u5143"}</small></article>
            </div>

            <div className="hardware-targets" aria-label={"\u5ba2\u6237\u914d\u7f6e\u76ee\u6807"}>
              <span>{"CPU \u2265 " + selectedCase.targets.cpu}</span>
              <span>{"\u5185\u5b58 \u2265 " + selectedCase.targets.memory + "GB"}</span>
              <span>{"\u5bb9\u91cf \u2265 " + selectedCase.targets.storageCapacity + "GB"}</span>
              <span>{"\u901f\u5ea6 \u2265 " + selectedCase.targets.storageSpeed}</span>
            </div>

            <div className={preview.passed ? "hardware-result-box passed" : "hardware-result-box needs-work"}>
              {preview.passed ? <CheckCircle size={22} weight="fill" /> : <WarningCircle size={22} weight="fill" />}
              <div>
                <strong>{preview.passed ? "\u5df2\u6ee1\u8db3\u5ba2\u6237\u76ee\u6807" : "\u5c1a\u672a\u8fbe\u6210\u76ee\u6807"}</strong>
                <p>{preview.explanation}</p>
                <small>{preview.recommendation}</small>
              </div>
              {(hardwareFeedback ?? preview).errors.length > 0 ? (
                <div className="hardware-error-list">
                  {(hardwareFeedback ?? preview).errors.map((error) => <span key={error.type}>{error.type}</span>)}
                </div>
              ) : null}
            </div>
          </section>
        </section>
      </div>
    </div>
  );
}
