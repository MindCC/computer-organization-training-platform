import { useMemo } from "react";
import { ArrowRight, Star as StarIcon } from "@phosphor-icons/react";

import {
  KNOWLEDGE_POINTS,
  knowledgePointOf,
  kpStatusOf,
  layoutKnowledgeGraph,
  prerequisitesOf,
  dependentsOf,
} from "../knowledgePoints.js";
import { questionsForKp, QUESTION_TYPE_LABELS } from "../assignmentQuestions.js";
import { getChapterById } from "../courseChapters.js";

/** 五角星多边形顶点（指尖朝上）。 */
function starPoints(cx, cy, spikes, outerR, innerR) {
  const points = [];
  for (let i = 0; i < spikes * 2; i += 1) {
    const radius = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI / spikes) * i - Math.PI / 2;
    points.push(`${(cx + radius * Math.cos(angle)).toFixed(2)},${(cy + radius * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

const STATUS_META = {
  completed: { label: "已完成", glyph: "✓" },
  "in-progress": { label: "进行中", glyph: "" },
  available: { label: "可学习", glyph: "" },
  locked: { label: "未解锁", glyph: "🔒" },
};

/**
 * 知识星图（手写 SVG，无图谱库）：
 * 每个知识点一颗星，依赖关系一条细连线；按 dependencyDepth 分层，
 * 下层是基础（整机/机器数/门），上层是进阶（ALU→CPU→总线→I/O）。
 *
 * 状态着色：已完成=亮（teal）、进行中=闪烁（gold 脉冲）、可学习=蓝、未解锁=暗。
 * focusId 高亮定位：选中星加亮环，前置星加 teal 虚线环、后置星加 gold 虚线环，
 * 无关星与线压暗。点星 = 选中并展开详情；详情面板内可直接进入对应关卡实验。
 */
export function KnowledgeGraph({ progress = {}, focusId = null, onSelectKp, onEnterChallenge, onPickQuestion }) {
  const model = useMemo(() => layoutKnowledgeGraph({}), []);
  const focused = focusId ? knowledgePointOf(focusId) : null;
  const focusPrereqIds = useMemo(() => new Set((focused ? prerequisitesOf(focused.id) : []).map((kp) => kp.id)), [focused]);
  const focusDependentIds = useMemo(() => new Set((focused ? dependentsOf(focused.id) : []).map((kp) => kp.id)), [focused]);

  const statusById = useMemo(() => {
    const map = new Map();
    for (const kp of KNOWLEDGE_POINTS) map.set(kp.id, kpStatusOf(kp, progress));
    return map;
  }, [progress]);

  const counts = useMemo(() => {
    const tally = { completed: 0, "in-progress": 0, available: 0, locked: 0 };
    for (const status of statusById.values()) tally[status] += 1;
    return tally;
  }, [statusById]);

  function relationOf(kpId) {
    if (!focused) return "none";
    if (kpId === focused.id) return "focus";
    if (focusPrereqIds.has(kpId)) return "prereq";
    if (focusDependentIds.has(kpId)) return "dependent";
    return "dimmed";
  }

  return (
    <div className="kg-wrap">
      <div className="kg-legend" aria-label="星图图例">
        <span><i className="kg-dot completed" />已完成 {counts.completed}</span>
        <span><i className="kg-dot in-progress" />进行中 {counts["in-progress"]}</span>
        <span><i className="kg-dot available" />可学习 {counts.available}</span>
        <span><i className="kg-dot locked" />未解锁 {counts.locked}</span>
        <span className="kg-legend-hint">下层是基础，上层是进阶 · 点星查看知识点</span>
      </div>
      <div className="kg-canvas">
        <svg
          className="kg-svg"
          viewBox={`0 0 ${model.width} ${model.height}`}
          role="img"
          aria-label="知识点依赖星图"
        >
          {/* 依赖连线：前置 → 后续 */}
          {model.edges.map((edge) => {
            const hot = focused && (edge.from === focused.id || edge.to === focused.id);
            const done = statusById.get(edge.from) === "completed";
            return (
              <line
                key={`${edge.from}->${edge.to}`}
                className={`kg-edge${done ? " done" : ""}${hot ? " hot" : ""}${focused && !hot ? " dimmed" : ""}`}
                x1={edge.x1}
                y1={edge.y1}
                x2={edge.x2}
                y2={edge.y2}
              />
            );
          })}
          {model.nodes.map((node) => {
            const kp = knowledgePointOf(node.id);
            const status = statusById.get(node.id) ?? "locked";
            const relation = relationOf(node.id);
            return (
              <g
                key={node.id}
                className={`kg-node kg-${status}${relation === "focus" ? " highlighted" : ""}${relation === "prereq" || relation === "dependent" ? ` related ${relation}` : ""}${relation === "dimmed" ? " dimmed" : ""}`}
                data-kp-id={node.id}
                data-status={status}
                transform={`translate(${node.x}, ${node.y})`}
                onClick={() => onSelectKp?.(node.id)}
                role="button"
                tabIndex={0}
                onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onSelectKp?.(node.id); } }}
                aria-label={`知识点：${kp?.title ?? node.id}（${STATUS_META[status]?.label ?? status}）`}
              >
                {relation === "focus" ? <circle className="kg-ring focus" r="26" /> : null}
                {relation === "prereq" ? <circle className="kg-ring prereq" r="23" /> : null}
                {relation === "dependent" ? <circle className="kg-ring dependent" r="23" /> : null}
                <polygon className="kg-star" points={starPoints(0, 0, 5, 16, 6.8)} />
                {STATUS_META[status]?.glyph ? (
                  <text className="kg-glyph" textAnchor="middle" dominantBaseline="central" y="1">{STATUS_META[status].glyph}</text>
                ) : null}
                <text className="kg-label" textAnchor="middle" y="34">{kp?.shortTitle ?? node.id}</text>
                <text className="kg-depth" textAnchor="middle" y="-24">L{node.depth}</text>
              </g>
            );
          })}
        </svg>
      </div>
      {focused ? (
        <KpDetailPanel
          kp={focused}
          progress={progress}
          onSelectKp={onSelectKp}
          onEnterChallenge={onEnterChallenge}
          onPickQuestion={onPickQuestion}
        />
      ) : (
        <p className="kg-empty-hint">点击任意星星，或点击题目上的知识点标记，在这里查看它的前置/后续知识点与关卡入口。</p>
      )}
    </div>
  );
}

/** 知识点详情：标题、摘要、前置/后续知识点、相关关卡入口、该知识点下的练习题。 */
function KpDetailPanel({ kp, progress, onSelectKp, onEnterChallenge, onPickQuestion }) {
  const prereqs = prerequisitesOf(kp.id);
  const dependents = dependentsOf(kp.id);
  const questions = questionsForKp(kp.id);
  const chapter = getChapterById(kp.chapterId);
  const status = kpStatusOf(kp, progress);

  return (
    <div className="kp-detail" data-kp-detail={kp.id}>
      <div className="kp-detail-head">
        <StarIcon size={18} weight="fill" aria-hidden />
        <strong>{kp.title}</strong>
        <span className="kp-detail-meta">{chapter?.title ?? kp.chapterId} · 依赖层 L{kp.depth} · {STATUS_META[status]?.label ?? status}</span>
        <button className="primary-button kp-enter-btn" type="button" onClick={() => onEnterChallenge?.(kp.challengeId)}>
          进入关卡实验 <ArrowRight size={14} />
        </button>
      </div>
      <p className="kp-detail-summary">{kp.summary}</p>
      <div className="kp-detail-relations">
        <div className="kp-relation-group">
          <span className="kp-relation-label">前置知识点</span>
          {prereqs.length > 0 ? prereqs.map((pre) => (
            <button key={pre.id} type="button" className="kp-chip prereq" data-kp={pre.id} onClick={() => onSelectKp?.(pre.id)}>
              {pre.shortTitle}
            </button>
          )) : <span className="kp-relation-empty">无（最基础的知识点）</span>}
        </div>
        <div className="kp-relation-group">
          <span className="kp-relation-label">后续知识点</span>
          {dependents.length > 0 ? dependents.map((dep) => (
            <button key={dep.id} type="button" className="kp-chip dependent" data-kp={dep.id} onClick={() => onSelectKp?.(dep.id)}>
              {dep.shortTitle}
            </button>
          )) : <span className="kp-relation-empty">无（进阶终点）</span>}
        </div>
      </div>
      <div className="kp-detail-questions">
        <span className="kp-relation-label">该知识点下的练习题（{questions.length}）</span>
        <ul>
          {questions.map((question) => (
            <li key={question.id}>
              <button type="button" className="kp-question-link" onClick={() => onPickQuestion?.(question)}>
                [{QUESTION_TYPE_LABELS[question.type] ?? question.type} · {question.score}分] {question.stem.slice(0, 38)}{question.stem.length > 38 ? "…" : ""}
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
