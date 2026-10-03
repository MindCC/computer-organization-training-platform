import test from "node:test";
import assert from "node:assert/strict";

import { CHALLENGES } from "./platformLogic.js";
import { CHALLENGE_DEPS, dependencyDepth } from "./challengeDependencies.js";
import { COURSE_CHAPTERS } from "./courseChapters.js";
import {
  KNOWLEDGE_POINTS,
  CHAPTER_CORE_POINTS,
  challengeIdOfKp,
  chapterCorePoints,
  dependentsOf,
  knowledgePointForChallenge,
  knowledgePointOf,
  knowledgePointsByChapter,
  kpIdOf,
  kpStatusOf,
  layoutKnowledgeGraph,
  prerequisitesOf,
  validateKnowledgePoints,
} from "./knowledgePoints.js";

test("每个关卡生成知识点，id 唯一且互相可解析", () => {
  assert.equal(KNOWLEDGE_POINTS.length, CHALLENGES.length);
  assert.equal(new Set(KNOWLEDGE_POINTS.map((kp) => kp.id)).size, CHALLENGES.length);
  for (const challenge of CHALLENGES) {
    const kp = knowledgePointForChallenge(challenge.id);
    assert.ok(kp, `${challenge.id} 应有知识点`);
    assert.equal(kp.id, kpIdOf(challenge.id));
    assert.equal(challengeIdOfKp(kp.id), challenge.id);
    assert.equal(knowledgePointOf(kp.id), kp);
  }
});

test("知识点依赖镜像 CHALLENGE_DEPS，depth 等于 dependencyDepth", () => {
  assert.deepEqual(validateKnowledgePoints(), []);
  for (const kp of KNOWLEDGE_POINTS) {
    assert.deepEqual(kp.deps, (CHALLENGE_DEPS[kp.challengeId] ?? []).map(kpIdOf));
    assert.equal(kp.depth, dependencyDepth(kp.challengeId));
    assert.ok(kp.title && kp.summary, `${kp.id} 需要标题与摘要`);
    assert.ok(COURSE_CHAPTERS.some((chapter) => chapter.id === kp.chapterId));
  }
});

test("前置/后续知识点互为反查", () => {
  for (const kp of KNOWLEDGE_POINTS) {
    for (const pre of prerequisitesOf(kp.id)) {
      assert.ok(dependentsOf(pre.id).some((dep) => dep.id === kp.id), `${pre.id} 的后续应包含 ${kp.id}`);
    }
    for (const dep of dependentsOf(kp.id)) {
      assert.ok(prerequisitesOf(dep.id).some((pre) => pre.id === kp.id), `${dep.id} 的前置应包含 ${kp.id}`);
    }
  }
  // 顶层基础没有前置，终点 I/O 没有后续
  assert.equal(prerequisitesOf("kp-computer-components").length, 0);
  assert.equal(dependentsOf("kp-io-handshake").length, 0);
  assert.ok(dependentsOf('kp-io-transfer').length>=2);
});

test("按章聚合知识点与核心知识点文字", () => {
  const total = COURSE_CHAPTERS.reduce((sum, chapter) => sum + knowledgePointsByChapter(chapter.id).length, 0);
  assert.equal(total, CHALLENGES.length);
  assert.ok(knowledgePointsByChapter("ch3").length >= 8, "第三章是门电路/运算器主体");
  for (const chapter of COURSE_CHAPTERS) {
    const core = chapterCorePoints(chapter.id);
    assert.ok(core.keyPoints.length > 0, `${chapter.id} 应有核心知识点文字`);
    assert.deepEqual(CHAPTER_CORE_POINTS[chapter.id], core);
  }
});

test("星图布局：按 depth 分层，下层基础 y 大、上层进阶 y 小", () => {
  const model = layoutKnowledgeGraph({});
  assert.equal(model.nodes.length, CHALLENGES.length);
  assert.equal(model.edges.length, Object.values(CHALLENGE_DEPS).reduce((count,deps)=>count+deps.length,0));
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  for (const node of model.nodes) {
    assert.ok(node.x >= 0 && node.x <= model.width, `${node.id} x 越界`);
    assert.ok(node.y >= 0 && node.y <= model.height, `${node.id} y 越界`);
  }
  // depth 越大（越进阶）y 越小（越靠上）
  assert.ok(byId.get("kp-io-transfer").y < byId.get("kp-computer-components").y);
  assert.ok(byId.get("kp-alu").y < byId.get("kp-and-gate").y);
  // 同层节点 x 不重叠
  const byDepth = new Map();
  for (const node of model.nodes) {
    if (!byDepth.has(node.depth)) byDepth.set(node.depth, new Set());
    byDepth.get(node.depth).add(node.x);
  }
  for (const [depth, xs] of byDepth) {
    const count = model.nodes.filter((node) => node.depth === depth).length;
    assert.equal(xs.size, count, `第 ${depth} 层节点 x 坐标必须互不重叠`);
  }
  // 边两端必须是合法节点
  for (const edge of model.edges) {
    assert.ok(byId.has(edge.from) && byId.has(edge.to));
  }
});

test("掌握状态着色口径", () => {
  const andGate = knowledgePointOf("kp-and-gate");
  assert.equal(kpStatusOf(andGate, {}), "locked", "数据流未完成时与门未解锁");
  assert.equal(kpStatusOf(andGate, { "data-flow": { status: "completed" } }), "available");
  assert.equal(kpStatusOf(andGate, { "and-gate": { status: "in-progress" } }), "in-progress");
  assert.equal(kpStatusOf(andGate, { "and-gate": { status: "completed" } }), "completed");
  const root = knowledgePointOf("kp-computer-components");
  assert.equal(kpStatusOf(root, {}), "available", "无前置的根知识点随时可学");
});
