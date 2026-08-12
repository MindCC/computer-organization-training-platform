import {
  CheckCircle,
  Cpu,
  GraphicsCard,
  HardDrive,
  Memory,
  WarningCircle,
} from "@phosphor-icons/react";
import assemblyImage from "../assets/hardware-assembly-workbench.webp";
import { buildHardwareWorkbenchModel } from "../hardwareWorkbench.js";

const CATEGORY_ICONS = {
  cpu: Cpu,
  memory: Memory,
  storage: HardDrive,
  gpu: GraphicsCard,
};

export function HardwareBuilderView({
  parts,
  onPartChange,
  score,
  activeCategory,
  onCategoryChange,
}) {
  const model = buildHardwareWorkbenchModel(parts, score);
  const active = model.categories.find((category) => category.id === activeCategory) ?? model.categories[0];

  function selectPart(categoryId, partId) {
    onPartChange((current) => ({ ...current, [categoryId]: partId }));
  }

  return (
    <section className="hardware-workbench" aria-label={"\u7535\u8111\u88c5\u673a\u5de5\u4f5c\u53f0"}>
      <div className="hardware-workbench-stage">
        <header className="hardware-stage-toolbar">
          <div>
            <span className="eyebrow">{"\u53ef\u89c6\u5316\u88c5\u914d"}</span>
            <h2>{"\u7535\u8111\u90e8\u4ef6\u88c5\u914d\u53f0"}</h2>
          </div>
          <div className="hardware-stage-progress" aria-label={"\u5df2\u9009 " + model.progress.selected + " / " + model.progress.total}>
            <strong>{model.progress.percentage}%</strong>
            <span>{"\u5df2\u9009 " + model.progress.selected + " / " + model.progress.total}</span>
          </div>
        </header>

        <div className="hardware-workbench-visual">
          <img
            alt={"\u673a\u7bb1\u3001\u7535\u6e90\u3001CPU\u3001\u4e3b\u677f\u3001\u5185\u5b58\u3001\u663e\u5361\u548c\u56fa\u6001\u786c\u76d8\u7684\u62c6\u89e3\u88c5\u914d\u56fe"}
            className="hardware-workbench-image"
            src={assemblyImage}
          />
          {model.categories.map((category, index) => (
            <button
              aria-label={"\u9009\u62e9" + category.label}
              aria-pressed={active.id === category.id}
              className={active.id === category.id ? "hardware-workbench-hotspot active" : "hardware-workbench-hotspot"}
              key={category.id}
              onClick={() => onCategoryChange(category.id)}
              style={{ left: category.hotspot.x + "%", top: category.hotspot.y + "%" }}
              type="button"
            >
              <span>{index + 1}</span>
              <small>{category.label}</small>
            </button>
          ))}
        </div>

        <div className="hardware-workbench-hint">
          <CheckCircle size={18} weight="fill" />
          <span>{"\u70b9\u51fb\u56fe\u4e2d\u7f16\u53f7\u9009\u62e9\u90e8\u4ef6\uff0c\u518d\u4ece\u53f3\u4fa7\u96f6\u4ef6\u5e93\u5207\u6362\u914d\u7f6e\u3002"}</span>
        </div>
      </div>

      <aside className="hardware-catalog-panel">
        <header className="hardware-catalog-header">
          <div>
            <span className="eyebrow">{"\u96f6\u4ef6\u5e93"}</span>
            <h2>{active.label}</h2>
          </div>
          <span className={model.budget.withinBudget ? "compatibility-pill ok" : "compatibility-pill warn"}>
            {model.budget.withinBudget ? "\u9884\u7b97\u5185" : "\u5df2\u8d85\u9884\u7b97"}
          </span>
        </header>

        <div className="hardware-category-tabs" aria-label={"\u96f6\u4ef6\u7c7b\u522b"}>
          {model.categories.map((category) => {
            const Icon = CATEGORY_ICONS[category.id];
            return (
              <button
                aria-pressed={active.id === category.id}
                className={active.id === category.id ? "active" : ""}
                key={category.id}
                onClick={() => onCategoryChange(category.id)}
                type="button"
              >
                <Icon size={17} />
                <span>{category.label}</span>
              </button>
            );
          })}
        </div>

        <div className="hardware-catalog-list">
          {active.options.map((part) => {
            const Icon = CATEGORY_ICONS[active.id];
            return (
              <button
                aria-label={part.name + "\uff0c" + part.price + "\u5143\uff0c" + part.spec}
                aria-pressed={part.selected}
                className={part.selected ? "hardware-catalog-card selected" : "hardware-catalog-card"}
                key={part.id}
                onClick={() => selectPart(active.id, part.id)}
                type="button"
              >
                <span className="hardware-catalog-icon"><Icon size={24} weight={part.selected ? "fill" : "regular"} /></span>
                <span className="hardware-catalog-copy">
                  <small>{active.detail}</small>
                  <strong>{part.name}</strong>
                  <span>{part.spec}</span>
                </span>
                <span className="hardware-catalog-price">
                  <strong>{"\u00a5 " + part.price}</strong>
                  <small>{part.selected ? "\u5df2\u9009" : "\u9009\u62e9"}</small>
                </span>
              </button>
            );
          })}
        </div>

        <div className="hardware-build-summary">
          <div className="hardware-summary-heading">
            <strong>{"\u5f53\u524d\u88c5\u673a\u6e05\u5355"}</strong>
            <span>{model.progress.selected + " / " + model.progress.total}</span>
          </div>
          <div className="hardware-budget-row">
            <span>{"\u9884\u7b97\u4f7f\u7528"}</span>
            <strong>{"\u00a5 " + model.budget.totalPrice + " / \u00a5 " + model.budget.target}</strong>
          </div>
          <div className="hardware-budget-meter" aria-label={"\u9884\u7b97\u4f7f\u7528 " + model.budget.percentage + "%"}>
            <span className={model.budget.withinBudget ? "" : "over"} style={{ width: Math.min(model.budget.percentage, 100) + "%" }} />
          </div>
          <div className={model.feedback.passed ? "builder-score passed" : "builder-score needs-work"}>
            {model.feedback.passed ? <CheckCircle size={20} weight="fill" /> : <WarningCircle size={20} weight="fill" />}
            <span>
              <strong>{model.feedback.score + " \u5206"}</strong>
              <small>{model.feedback.passed ? "\u5ba2\u6237\u76ee\u6807\u5df2\u8fbe\u6210" : "\u8fd8\u9700\u8c03\u6574\u914d\u7f6e"}</small>
            </span>
          </div>
        </div>
      </aside>
    </section>
  );
}
