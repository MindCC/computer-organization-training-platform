import { useEffect, useMemo, useState } from "react";
import {
  PARAMETER_EXPERIMENTS,
  buildParameterCurve,
  defaultExperimentForChapter,
  evaluateParameterExperiment,
  initialParametersForExperiment,
} from "../parameterExperiments.js";
import "./parameterPlayground.css";

const VIEWBOX = { width: 640, height: 318, left: 64, right: 22, top: 24, bottom: 48 };

function numberText(value, digits = 2) {
  return new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);
}

function chartGeometry(curve, comparisonCurve) {
  const { width, height, left, right, top, bottom } = VIEWBOX;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const maximum = Math.max(1, ...curve.points.map(point => point.y), ...comparisonCurve.points.map(point => point.y), curve.current.y);
  const yMax = maximum * 1.1;
  const x = value => left + ((value - curve.xMin) / (curve.xMax - curve.xMin)) * plotWidth;
  const y = value => top + plotHeight - value / yMax * plotHeight;
  const pathFor = points => points.map((point, index) => `${index ? "L" : "M"}${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`).join(" ");
  return {
    x, y, yMax, plotWidth, plotHeight,
    path: pathFor(curve.points), referencePath: pathFor(comparisonCurve.points),
    area: `M${x(curve.points[0].x)},${y(0)} ${curve.points.map(point => `L${x(point.x).toFixed(2)},${y(point.y).toFixed(2)}`).join(" ")} L${x(curve.points.at(-1).x)},${y(0)} Z`,
  };
}

function ParameterChart({ experiment, curve, comparisonCurve }) {
  const geometry = chartGeometry(curve, comparisonCurve);
  const { left, top, height, bottom } = VIEWBOX;
  const currentX = geometry.x(curve.current.x);
  const currentY = geometry.y(curve.current.y);
  const titleId = `parameter-chart-${experiment.id}`;
  return <div className="parameter-chart-wrap" data-testid="parameter-chart">
    <svg className="parameter-chart" viewBox="0 0 640 318" role="img" aria-labelledby={`${titleId}-title ${titleId}-desc`}>
      <title id={`${titleId}-title`}>{curve.xLabel}与{curve.yLabel}的关系曲线</title>
      <desc id={`${titleId}-desc`}>其他参数固定。当前{curve.xLabel}为{numberText(curve.current.x)}{curve.xUnit}，{curve.yLabel}为{numberText(curve.current.y)}{curve.yUnit}。</desc>
      {[0, 0.25, 0.5, 0.75, 1].map(fraction => {
        const y = geometry.y(geometry.yMax * fraction);
        return <g key={fraction}><line className="parameter-chart-grid" x1={left} x2={left + geometry.plotWidth} y1={y} y2={y} /><text className="parameter-chart-tick" x={left - 10} y={y + 4} textAnchor="end">{numberText(geometry.yMax * fraction, 1)}</text></g>;
      })}
      <line className="parameter-chart-axis" x1={left} x2={left + geometry.plotWidth} y1={height - bottom} y2={height - bottom} />
      <path className="parameter-chart-area" d={geometry.area} />
      <path className="parameter-chart-reference" d={geometry.referencePath} />
      <path className="parameter-chart-line" d={geometry.path} />
      <line className="parameter-chart-guide" x1={currentX} x2={currentX} y1={currentY} y2={height - bottom} />
      <circle className="parameter-chart-halo" cx={currentX} cy={currentY} r="13" />
      <circle className="parameter-chart-dot" cx={currentX} cy={currentY} r="6" />
      <text className="parameter-chart-tick" x={left} y={height - bottom + 22} textAnchor="start">{numberText(curve.xMin)} {curve.xUnit}</text>
      <text className="parameter-chart-tick" x={left + geometry.plotWidth} y={height - bottom + 22} textAnchor="end">{numberText(curve.xMax)} {curve.xUnit}</text>
      <text className="parameter-chart-axis-label" x={left + geometry.plotWidth / 2} y={height - 5} textAnchor="middle">{curve.xLabel}（{curve.xUnit}）</text>
      <text className="parameter-chart-axis-label" x={left} y={top - 7}>{curve.yLabel}（{curve.yUnit}）</text>
    </svg>
  </div>;
}

function ResultDetails({ id, result }) {
  if (id === "cpu") return <div className="parameter-result-details"><span>时钟周期 <strong>{numberText(result.clockCycles / 1e9)} 十亿次</strong></span><span>单周期 <strong>{numberText(result.clockPeriodNs, 3)} ns</strong></span></div>;
  if (id === "cache") return <div className="parameter-result-details"><span>每次 Cache 查找 <strong>{numberText(result.cacheNs)} ns</strong></span><span>未命中带来的平均延迟 <strong>{numberText(result.missContributionNs)} ns</strong></span></div>;
  return <div className="parameter-result-details"><span>每次传输 <strong>{numberText(result.bytesPerTransfer)} B</strong></span><span>理论峰值 <strong>{numberText(result.bandwidthGBps, 3)} GB/s</strong></span></div>;
}

/** A small, self-contained teaching model. It does not submit grades or alter experiment progress. */
export function ParameterPlayground({ chapterId }) {
  const [experimentId, setExperimentId] = useState(() => defaultExperimentForChapter(chapterId));
  const [parameterSets, setParameterSets] = useState(() => Object.fromEntries(PARAMETER_EXPERIMENTS.map(item => [item.id, initialParametersForExperiment(item.id)])));
  const [sweepKeys, setSweepKeys] = useState(() => Object.fromEntries(PARAMETER_EXPERIMENTS.map(item => [item.id, item.defaultSweepKey])));
  useEffect(() => { setExperimentId(defaultExperimentForChapter(chapterId)); }, [chapterId]);

  const experiment = PARAMETER_EXPERIMENTS.find(item => item.id === experimentId) ?? PARAMETER_EXPERIMENTS[0];
  const parameters = parameterSets[experiment.id];
  const sweepKey = sweepKeys[experiment.id];
  const result = useMemo(() => evaluateParameterExperiment(experiment.id, parameters), [experiment.id, parameters]);
  const curve = useMemo(() => buildParameterCurve(experiment.id, parameters, sweepKey), [experiment.id, parameters, sweepKey]);
  const comparisonCurve = useMemo(() => buildParameterCurve(experiment.id, initialParametersForExperiment(experiment.id), sweepKey), [experiment.id, sweepKey]);
  const sweepInput = experiment.inputs.find(input => input.key === sweepKey);
  const firstValue = curve.points[0].y;
  const lastValue = curve.points.at(-1).y;
  const trend = lastValue > firstValue ? "增加" : lastValue < firstValue ? "减少" : "保持不变";

  const setParameter = (key, value) => setParameterSets(previous => ({
    ...previous,
    [experiment.id]: { ...previous[experiment.id], [key]: Number(value) },
  }));

  return <section className="parameter-playground" aria-labelledby="parameter-playground-title">
    <header className="parameter-playground-head">
      <div><span className="parameter-kicker">交互探究 · 拖动即计算</span><h2 id="parameter-playground-title">性能参数实验</h2><p>改变一个条件，观察数值和曲线怎样一起变化。</p></div>
      <button type="button" className="parameter-reset" onClick={() => setParameterSets(previous => ({ ...previous, [experiment.id]: initialParametersForExperiment(experiment.id) }))}>恢复本组初始值</button>
    </header>
    <div className="parameter-tabs" role="tablist" aria-label="选择参数实验">
      {PARAMETER_EXPERIMENTS.map(item => <button type="button" role="tab" aria-selected={item.id === experiment.id} className={item.id === experiment.id ? "active" : ""} key={item.id} onClick={() => setExperimentId(item.id)}>{item.title}</button>)}
    </div>
    <div className="parameter-workspace">
      <div className="parameter-controls">
        <div className="parameter-question"><strong>{experiment.question}</strong><small>{experiment.formula}</small></div>
        {experiment.inputs.map(input => <div className="parameter-control" key={input.key}>
          <div className="parameter-control-heading"><label htmlFor={`parameter-${experiment.id}-${input.key}`}>{input.label}</label><output htmlFor={`parameter-${experiment.id}-${input.key}`}>{numberText(parameters[input.key], 3)} <small>{input.unit}</small></output></div>
          <input id={`parameter-${experiment.id}-${input.key}`} type="range" min={input.min} max={input.max} step={input.step} value={parameters[input.key]} onChange={event => setParameter(input.key, event.target.value)} style={{ "--range-progress": `${(parameters[input.key] - input.min) / (input.max - input.min) * 100}%` }} />
          <div className="parameter-control-ends"><span>{numberText(input.min)}</span><span>{numberText(input.max)}</span></div>
          <p>{input.help}</p>
        </div>)}
      </div>
      <div className="parameter-visual">
        <div className="parameter-live-result"><div><span>当前结果</span><strong data-testid="parameter-result">{numberText(result.value, 3)} <small>{result.unit}</small></strong><small>{result.label}</small></div><span className="parameter-live-badge">实时更新</span></div>
        <ResultDetails id={experiment.id} result={result} />
        <div className="parameter-chart-heading"><div><strong>关系曲线</strong><span>其余参数保持当前值</span></div><label>观察变量 <select value={sweepKey} onChange={event => setSweepKeys(previous => ({ ...previous, [experiment.id]: event.target.value }))} aria-label="选择曲线横轴">{experiment.inputs.map(input => <option key={input.key} value={input.key}>{input.label}</option>)}</select></label></div>
        <ParameterChart experiment={experiment} curve={curve} comparisonCurve={comparisonCurve} />
        <span className="parameter-mobile-chart-hint">左右滑动图表，查看完整曲线</span>
        <div className="parameter-chart-legend"><span><i className="current" />当前条件</span><span><i className="reference" />初始条件</span></div>
        <p className="parameter-insight">在当前条件下，{sweepInput.label}增大，{experiment.outputLabel}会{trend}。圆点标出滑块的当前位置。</p>
      </div>
    </div>
    <p className="parameter-assumption">模型说明：{experiment.assumption}</p>
  </section>;
}
