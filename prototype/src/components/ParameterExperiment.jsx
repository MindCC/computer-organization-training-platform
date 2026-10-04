import { useEffect, useId, useMemo, useState } from "react";
import { ArrowCounterClockwise, ChartLine, SlidersHorizontal } from "@phosphor-icons/react";
import {
  PARAMETER_EXPERIMENTS, buildParameterCurve, defaultExperimentForChapter,
  evaluateParameterExperiment, getParameterExperiment, initialParametersForExperiment,
} from "../parameterExperiments.js";
import "./parameterExperiment.css";

const number = (value, digits = 3) => new Intl.NumberFormat("zh-CN", { maximumFractionDigits: digits }).format(value);

/** An exploration instrument: no result callback, grade state or submission API. */
export function ParameterExperiment({ chapterId }) {
  const uid = useId();
  const [topicId, setTopicId] = useState(() => defaultExperimentForChapter(chapterId));
  const [parametersByTopic, setParametersByTopic] = useState(() => Object.fromEntries(
    PARAMETER_EXPERIMENTS.map(topic => [topic.id, initialParametersForExperiment(topic.id)]),
  ));
  const [sweepByTopic, setSweepByTopic] = useState(() => Object.fromEntries(
    PARAMETER_EXPERIMENTS.map(topic => [topic.id, topic.defaultSweepKey]),
  ));
  useEffect(() => { setTopicId(defaultExperimentForChapter(chapterId)); }, [chapterId]);
  const topic = getParameterExperiment(topicId);
  const parameters = parametersByTopic[topic.id];
  const sweepKey = sweepByTopic[topic.id];
  const result = useMemo(() => evaluateParameterExperiment(topic.id, parameters), [topic.id, parameters]);
  const curve = useMemo(() => buildParameterCurve(topic.id, parameters, sweepKey), [topic.id, parameters, sweepKey]);

  const changeParameter = (key, value) => {
    setParametersByTopic(current => ({ ...current, [topic.id]: { ...current[topic.id], [key]: value } }));
    setSweepByTopic(current => ({ ...current, [topic.id]: key }));
  };
  const reset = () => {
    setParametersByTopic(current => ({ ...current, [topic.id]: initialParametersForExperiment(topic.id) }));
    setSweepByTopic(current => ({ ...current, [topic.id]: topic.defaultSweepKey }));
  };
  const recommended = defaultExperimentForChapter(chapterId);

  return <section className="lab-parameter-experiment" data-testid="parameter-experiment" data-experiment-topic={topic.id} aria-label="参数实验">
    <header className="lab-parameter-heading">
      <div><span className="lab-parameter-mode-label"><SlidersHorizontal size={16} />教学计算 · 不计分</span><h2>参数实验</h2><p>拖动参数，观察计算结果和关系曲线即时变化。</p></div>
      <p className="lab-parameter-grade-note">非实测数据，不改变关卡成绩或提交记录。</p>
    </header>
    <div className="lab-parameter-topic-tabs" role="tablist" aria-label="选择参数实验主题">
      {PARAMETER_EXPERIMENTS.map(item => <button
        aria-selected={topic.id === item.id} aria-controls={`${uid}-panel`} id={`${uid}-${item.id}-tab`}
        className={topic.id === item.id ? "active" : ""} data-parameter-topic={item.id}
        key={item.id} onClick={() => setTopicId(item.id)} role="tab" type="button"
      ><span>{item.shortTitle}</span><strong>{item.title}</strong>{recommended === item.id ? <small>本章推荐</small> : null}</button>)}
    </div>
    <div className="lab-parameter-instrument" role="tabpanel" id={`${uid}-panel`} aria-labelledby={`${uid}-${topic.id}-tab`}>
      <aside className="lab-parameter-controls" aria-label={`${topic.title}参数`}>
        <div className="lab-parameter-controls-title"><strong>调整参数</strong><button onClick={reset} type="button" data-testid="parameter-reset"><ArrowCounterClockwise size={15} />重置</button></div>
        {topic.inputs.map(input => <div className={`parameter-slider ${input.key === sweepKey ? "is-sweep" : ""}`} key={input.key}>
          <div className="lab-parameter-slider-title"><label htmlFor={`${uid}-${input.key}`}><span>{input.symbol}</span>{input.label}</label><output htmlFor={`${uid}-${input.key}`}>{number(parameters[input.key])}<small>{input.unit}</small></output></div>
          <input aria-describedby={`${uid}-${input.key}-help`} data-parameter-key={input.key}
            id={`${uid}-${input.key}`} min={input.min} max={input.max} step={input.step}
            onChange={event => changeParameter(input.key, Number(event.target.value))} type="range" value={parameters[input.key]}
          />
          <div className="lab-parameter-range-ends" aria-hidden="true"><span>{number(input.min)} {input.unit}</span><span>{number(input.max)} {input.unit}</span></div>
          <p id={`${uid}-${input.key}-help`}>{input.help}</p>
        </div>)}
        <div className="lab-parameter-current-result" role="status" aria-live="polite" aria-atomic="true">
          <span>{result.label}</span><strong data-testid="parameter-value">{number(result.value)}<small>{result.unit}</small></strong><p>当前参数下的计算结果</p>
        </div>
      </aside>
      <div className="lab-parameter-visualization">
        <div className="lab-parameter-chart-heading"><div><span><ChartLine size={17} />关系曲线</span><h3>{topic.question}</h3></div><label htmlFor={`${uid}-sweep`}>横轴参数<select id={`${uid}-sweep`} value={sweepKey} onChange={event => setSweepByTopic(current => ({ ...current, [topic.id]: event.target.value }))}>{topic.inputs.map(input => <option key={input.key} value={input.key}>{input.label}</option>)}</select></label></div>
        <ParameterCurve curve={curve} uid={uid} />
        <p className="lab-parameter-curve-caption"><i />圆点是当前参数。曲线只改变<strong>{curve.xLabel}</strong>，其余参数保持当前值。</p>
        <ParameterMetrics topicId={topic.id} result={result} />
      </div>
    </div>
    <footer className="lab-parameter-formula">
      <div><span>计算公式</span><strong>{topic.formula}</strong><code data-testid="parameter-substitution">{substitution(topic.id, parameters, result)}</code></div>
      <p>{topic.assumption}</p>
    </footer>
  </section>;
}

function niceCeiling(value) {
  if (!(value > 0)) return 1;
  const power = 10 ** Math.floor(Math.log10(value));
  return Math.ceil(value / power * 2) / 2 * power;
}

function ParameterCurve({ curve, uid }) {
  const width = 760, height = 370, left = 84, right = 25, top = 28, bottom = 64;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const baseline = height - bottom;
  const maxY = niceCeiling(Math.max(...curve.points.map(point => point.y), curve.current.y) * 1.08);
  const x = value => left + (value - curve.xMin) / (curve.xMax - curve.xMin) * plotWidth;
  const y = value => baseline - value / maxY * plotHeight;
  const points = curve.points.map(point => `${x(point.x)},${y(point.y)}`).join(" ");
  const pointX = x(curve.current.x), pointY = y(curve.current.y);
  const xTicks = Array.from({ length: 5 }, (_, index) => curve.xMin + (curve.xMax - curve.xMin) * index / 4);
  const yTicks = Array.from({ length: 5 }, (_, index) => maxY * index / 4);
  const titleId = `${uid}-plot-title`, descriptionId = `${uid}-plot-description`;
  return <svg className="lab-parameter-curve" viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={`${titleId} ${descriptionId}`} data-testid="parameter-curve">
    <title id={titleId}>{curve.xLabel}与{curve.yLabel}的关系</title>
    <desc id={descriptionId}>横轴{curve.xLabel}，单位{curve.xUnit}；纵轴{curve.yLabel}，单位{curve.yUnit}。当前横轴值{number(curve.current.x)}，计算结果{number(curve.current.y)}{curve.yUnit}。其余参数固定。</desc>
    <rect className="lab-parameter-plot-surface" x={left} y={top} width={plotWidth} height={plotHeight} rx="4" />
    {yTicks.map(value => <g key={value}><line className="lab-parameter-grid-line" x1={left} x2={width - right} y1={y(value)} y2={y(value)} /><text className="lab-parameter-tick" x={left - 12} y={y(value) + 5} textAnchor="end">{number(value, 2)}</text></g>)}
    {xTicks.map(value => <g key={value}><line className="lab-parameter-grid-line vertical" x1={x(value)} x2={x(value)} y1={top} y2={baseline} /><text className="lab-parameter-tick" x={x(value)} y={baseline + 25} textAnchor="middle">{number(value, 2)}</text></g>)}
    <polygon className="lab-parameter-curve-area" points={`${left},${baseline} ${points} ${width - right},${baseline}`} />
    <polyline className="lab-parameter-curve-line" points={points} />
    <path className="lab-parameter-crosshair" d={`M${pointX},${baseline}V${pointY}H${left}`} />
    <circle className="lab-parameter-current-halo" cx={pointX} cy={pointY} r="10" />
    <circle className="lab-parameter-current-dot" cx={pointX} cy={pointY} r="5" />
    <path className="lab-parameter-axis" d={`M${left},${top}V${baseline}H${width - right}`} />
    <text className="lab-parameter-axis-label" x={left} y="17">{curve.yUnit}</text>
    <text className="lab-parameter-axis-label" x={left + plotWidth / 2} y={height - 13} textAnchor="middle">{curve.xLabel} / {curve.xUnit}</text>
  </svg>;
}

function ParameterMetrics({ topicId, result }) {
  if (topicId === "cache") {
    const total = result.averageAccessNs;
    return <div className="lab-parameter-cache-breakdown"><div><span>平均访问时间的组成</span><strong>{number(total)} ns</strong></div><div className="lab-parameter-cache-track" aria-label={`缓存查找${number(result.cacheNs)}ns，未命中平均额外贡献${number(result.missContributionNs)}ns`}><i style={{ width: `${result.cacheNs / total * 100}%` }} /><b style={{ width: `${result.missContributionNs / total * 100}%` }} /></div><p><span><i />每次缓存查找 {number(result.cacheNs)} ns</span><span><i />未命中额外贡献 {number(result.missContributionNs)} ns</span></p></div>;
  }
  const items = topicId === "cpu" ? [
    ["总时钟周期", number(result.clockCycles / 1e6), "百万周期"],
    ["时钟周期长度", number(result.clockPeriodNs), "ns"],
    ["计算吞吐率", number(result.millionInstructionsPerSecond), "MIPS"],
  ] : [
    ["每次传输", number(result.bytesPerTransfer), "B"],
    ["每秒传输次数", number(result.transfersPerSecond / 1e6), "百万次"],
    ["换算为 GB/s", number(result.bandwidthGBps), "GB/s"],
  ];
  return <dl className="lab-parameter-metrics">{items.map(([label, value, unit]) => <div key={label}><dt>{label}</dt><dd>{value}<small>{unit}</small></dd></div>)}</dl>;
}

function substitution(topicId, values, result) {
  if (topicId === "cpu") return `${number(values.instructionMillions)} 百万条 × ${number(values.cpi)} 周期/指令 ÷ ${number(values.clockGHz)} GHz = ${number(result.value)} ms`;
  if (topicId === "cache") return `${number(values.cacheNs)} ns + (1 − ${number(values.hitPercent)}%) × ${number(values.memoryNs)} ns = ${number(result.value)} ns`;
  return `${number(values.widthBits)} bit × ${number(values.clockMHz)} MHz × ${number(values.transfersPerCycle)} 次/周期 ÷ 8 bit/B = ${number(result.value)} MB/s`;
}
