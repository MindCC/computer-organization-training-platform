import test from "node:test";
import assert from "node:assert/strict";
import { CHALLENGES } from "./platformLogic.js";
import { COURSE_CHAPTERS } from "./courseChapters.js";
import * as k from "./knowledgePoints.js";

test("八章课程概念覆盖，有摘要、无旧关卡节点且允许没有实验", () => {
  assert.ok(k.KNOWLEDGE_POINTS.length >= 65, "课程目录按内容覆盖扩展，不限制实际概念总数");
  assert.equal(new Set(k.KNOWLEDGE_POINTS.map(p=>p.id)).size,k.KNOWLEDGE_POINTS.length);
  for(const p of k.KNOWLEDGE_POINTS){assert.ok(p.id.startsWith("concept-"));assert.ok(p.summary.length>=30,p.id);assert.ok(Array.isArray(p.challengeIds));}
  for(const c of COURSE_CHAPTERS) assert.ok(k.knowledgePointsByChapter(c.id).length>=6,c.id);
  for(const id of ["stored-program","system-hierarchy","fixed-point","ieee754","cache-mapping","virtual-memory","relative-addressing","pipeline-hazards","bus-arbitration","dma-transfer"]) assert.ok(k.knowledgePointOf("concept-"+id),id);
  assert.ok(k.KNOWLEDGE_POINTS.some(p=>p.challengeIds.length===0));
  assert.deepEqual(k.validateKnowledgePoints(),[]);
});
test("全部历史kp标记精确解析为主概念，不伪造未知节点",()=>{
  for(const c of CHALLENGES){
    const alias=k.kpIdOf(c.id),p=k.knowledgePointOf(alias);
    assert.ok(p,alias);assert.equal(k.knowledgePointForChallenge(c.id),p);
    assert.equal(k.challengeIdOfKp(alias),c.id);assert.ok(p.challengeIds.includes(c.id));
    assert.ok(!k.KNOWLEDGE_POINTS.some(p=>p.id===alias));
  }
  assert.equal(k.knowledgePointOf("kp-missing"),null);
  assert.equal(k.challengeIdOfKp("kp-missing"),null);
  assert.equal(k.challengeIdOfKp("concept-twos-complement"),null);
});
test("多对多实验映射与课程教学依赖互相独立",()=>{
  assert.ok(k.knowledgePointsForChallenge("alu").length>=2);
  const p=k.knowledgePointOf("concept-multiplexer");
  assert.ok(p.challengeIds.includes("mux")&&p.challengeIds.includes("gate-mux"));
  assert.deepEqual(k.knowledgePointsForChallenge("missing"),[]);
  assert.ok(k.prerequisitesOf("concept-cache-mapping").some(p=>p.id==="concept-locality"));
  assert.ok(k.prerequisitesOf("concept-pipeline-hazards").some(p=>p.id==="concept-pipeline"));
  assert.ok(k.prerequisitesOf("concept-bus-functions").every(p=>p.id!=="concept-cpu-datapath"));
  for(const p of k.KNOWLEDGE_POINTS)for(const pre of k.prerequisitesOf(p.id)){assert.ok(pre.depth<p.depth);assert.ok(k.dependentsOf(pre.id).some(n=>n.id===p.id));}
  assert.deepEqual(k.knowledgeRelationsOf(p.id),{prerequisites:k.prerequisitesOf(p.id),dependents:k.dependentsOf(p.id)});
  assert.deepEqual(k.prerequisitesOf("kp-mux"),k.prerequisitesOf(p.id));
  assert.deepEqual(k.dependentsOf("kp-mux"),k.dependentsOf(p.id));
});
test("搜索标题摘要别名并按章过滤，保持课程顺序",()=>{
  assert.deepEqual(k.searchKnowledgePoints(""),k.KNOWLEDGE_POINTS);
  assert.deepEqual(k.searchKnowledgePoints("",{chapterId:"ch4"}),k.knowledgePointsByChapter("ch4"));
  const result=k.searchKnowledgePoints(" cAcHe ",{chapterId:"ch4"});assert.ok(result.length>=2&&result.every(p=>p.chapterId==="ch4"));
  assert.ok(k.searchKnowledgePoints("缺页").some(p=>p.id==="concept-virtual-memory"));
  assert.ok(k.searchKnowledgePoints("kp-machine-number").some(p=>p.id==="concept-twos-complement"));
  assert.deepEqual(k.searchKnowledgePoints("不存在的概念"),[]);assert.deepEqual(k.searchKnowledgePoints("",{chapterId:"missing"}),[]);
});
test("知识浏览不锁定，零提交的in-progress不冒充学习证据",()=>{
  for(const progress of [{},{mux:{status:"locked",attempts:0}},{mux:{status:"in-progress",attempts:0}}]){
    const e=k.knowledgeEvidenceOf("concept-multiplexer",progress);assert.equal(e.status,"unseen");assert.equal(e.canBrowse,true);assert.equal(k.kpStatusOf(k.knowledgePointOf("concept-multiplexer"),progress),"unseen");
  }
});
test("一次实验完成只记录相关证据，不自动宣称整章掌握",()=>{
  const progress={"memory-address":{status:"completed",attempts:1,bestScore:0}},e=k.knowledgeEvidenceOf("concept-memory-read-write",progress);
  assert.equal(e.status,"evidence");assert.equal(e.completedCount,1);assert.equal(e.totalExperiments,2);assert.match(e.label,/实验/);assert.ok(!/掌握|解锁/.test(e.label+e.description));
  const participation=e.experiments.find(p=>p.id==="memory-address");assert.equal(participation.score,null);assert.equal(participation.grading,"participation");
  assert.equal(k.knowledgeEvidenceOf("concept-cache-mapping",progress).status,"no-experiment");assert.equal(k.knowledgeEvidenceOf("concept-virtual-memory",progress).completedCount,0);
  assert.ok(k.knowledgePointsByChapter("ch4").some(p=>k.kpStatusOf(p,progress)!=="evidence"));
});
test("真实提交形成练习证据，虚空成绩不算完成，多完成仍不授予掌握",()=>{
  const progress={mux:{status:"in-progress",attempts:1,bestScore:40},"gate-mux":{status:"locked",attempts:0,bestScore:100}};
  assert.equal(k.knowledgeEvidenceOf("concept-multiplexer",progress).status,"practicing");assert.equal(k.knowledgeEvidenceOf("concept-multiplexer",progress).startedCount,1);
  progress.mux.status="completed";progress["gate-mux"]={status:"completed",attempts:2,bestScore:100};
  const e=k.knowledgeEvidenceOf("concept-multiplexer",progress);assert.equal(e.status,"evidence");assert.equal(e.completedCount,2);assert.ok(e.experiments.some(p=>p.id==="gate-mux"&&p.score===100));assert.ok(!/掌握|解锁/.test(e.label+e.description));assert.equal(k.knowledgeEvidenceOf("missing",progress),null);
});
test("章核心文字沿用课件，概念列表来自本章",()=>{
  for(const c of COURSE_CHAPTERS){const core=k.chapterCorePoints(c.id);assert.ok(core.keyPoints.length);assert.deepEqual(core.kpIds,k.knowledgePointsByChapter(c.id).map(p=>p.id));assert.deepEqual(k.CHAPTER_CORE_POINTS[c.id],core);}
});
test("布局过滤仅输出课程概念和有效关系，坐标不越界",()=>{
  for(const options of [{},{width:760,height:600,chapterId:"ch4"},{query:"Cache"},{chapterId:"missing"}]){
    const model=k.layoutKnowledgeGraph(options),ids=new Set(model.nodes.map(n=>n.id)),points=k.searchKnowledgePoints(options.query??"",{chapterId:options.chapterId});
    assert.equal(model.nodes.length,points.length);for(const n of model.nodes)assert.ok(n.x>=0&&n.x<=model.width&&n.y>=0&&n.y<=model.height&&n.id.startsWith("concept-"));
    for(const e of model.edges){assert.ok(ids.has(e.from)&&ids.has(e.to));assert.ok(k.knowledgePointOf(e.to).deps.includes(e.from));}
    assert.equal(model.edges.length,points.reduce((sum,p)=>sum+p.deps.filter(id=>ids.has(id)).length,0));
  }
});

test("即使所有实验完成，未被实验覆盖的课程概念也不会自动染亮", () => {
  const progress = Object.fromEntries(CHALLENGES.map((challenge) => [challenge.id, { status: "completed", attempts: 1, bestScore: 100 }]));
  for (const point of k.KNOWLEDGE_POINTS.filter((point) => point.challengeIds.length === 0)) {
    const evidence = k.knowledgeEvidenceOf(point, progress);
    assert.equal(evidence.status, "no-experiment", point.id);
    assert.equal(evidence.completedCount, 0, point.id);
    assert.equal(evidence.canBrowse, true);
  }
  for (const chapter of COURSE_CHAPTERS) assert.ok(k.knowledgePointsByChapter(chapter.id).some((point) => k.kpStatusOf(point, progress) !== "evidence"), chapter.id);
});

test("八章图谱按实际层排列，176×76节点不重叠且画布容纳矩形", () => {
  const nodeWidth = 176, nodeHeight = 76;
  for (const chapter of COURSE_CHAPTERS) {
    for (const requested of [{ width: 920, height: 620 }, { width: 320, height: 240 }]) {
      const graph = k.layoutKnowledgeGraph({ ...requested, chapterId: chapter.id });
      assert.ok(graph.width >= requested.width && graph.height >= requested.height, chapter.id);
      const byLayer = new Map();
      for (const node of graph.nodes) {
        assert.ok(node.x - nodeWidth / 2 >= 0 && node.x + nodeWidth / 2 <= graph.width, node.id + "横向边界");
        assert.ok(node.y - nodeHeight / 2 >= 0 && node.y + nodeHeight / 2 <= graph.height, node.id + "纵向边界");
        if (!byLayer.has(node.depth)) byLayer.set(node.depth, []);
        byLayer.get(node.depth).push(node);
      }
      const layers = [...byLayer].sort(([left], [right]) => left - right);
      for (let layerIndex = 0; layerIndex < layers.length; layerIndex += 1) {
        const [, members] = layers[layerIndex];
        const leftToRight = [...members].sort((left, right) => left.x - right.x);
        for (let index = 1; index < leftToRight.length; index += 1) {
          assert.ok(leftToRight[index].x - leftToRight[index - 1].x >= 210, chapter.id + "同层横距");
        }
        if (layerIndex > 0) {
          assert.ok(members[0].y - layers[layerIndex - 1][1][0].y >= 110, chapter.id + "相邻实际层纵距");
        }
      }
      for (let index = 0; index < graph.nodes.length; index += 1) {
        for (const other of graph.nodes.slice(index + 1)) {
          const node = graph.nodes[index];
          assert.ok(Math.abs(node.x - other.x) >= nodeWidth || Math.abs(node.y - other.y) >= nodeHeight, node.id + "与" + other.id + "矩形重叠");
        }
      }
      for (const edge of graph.edges) assert.ok(edge.y1 < edge.y2, chapter.id + "教学基础应在上方");
    }
  }
});

test("全课程与搜索图谱也扩展画布保留节点间距", () => {
  for (const options of [{ width: 320, height: 240 }, { width: 320, height: 240, query: "Cache" }]) {
    const graph = k.layoutKnowledgeGraph(options);
    for (let index = 0; index < graph.nodes.length; index += 1) {
      const node = graph.nodes[index];
      assert.ok(node.x >= 88 && node.x <= graph.width - 88 && node.y >= 38 && node.y <= graph.height - 38);
      for (const other of graph.nodes.slice(index + 1)) {
        assert.ok(node.depth === other.depth ? Math.abs(node.x - other.x) >= 210 : Math.abs(node.y - other.y) >= 110);
      }
    }
  }
});

test("课件目录项在所属章节可检索，总线分类保留独立概念", () => {
  const cases = [
    ["外设分类", "concept-peripheral-classes", "ch8"],
    ["外部设备分类", "concept-peripheral-classes", "ch8"],
    ["输入设备", "concept-input-devices", "ch8"],
    ["输出设备", "concept-output-devices", "ch8"],
    ["无条件传送", "concept-unconditional-transfer", "ch8"],
    ["片内总线", "concept-bus-classification", "ch7"],
    ["系统总线", "concept-bus-classification", "ch7"],
    ["通信总线", "concept-bus-classification", "ch7"],
    ["段式", "concept-segmented-memory", "ch4"],
    ["段页式", "concept-segmented-paged-memory", "ch4"],
    ["页式", "concept-virtual-memory", "ch4"],
  ];
  for (const [query, id, chapterId] of cases) {
    const point = k.knowledgePointOf(id);
    assert.ok(point, id);
    assert.equal(point.chapterId, chapterId);
    assert.ok(k.searchKnowledgePoints(query, { chapterId }).some((match) => match.id === id), query);
  }
  const classification = k.knowledgePointOf("concept-bus-classification");
  assert.notEqual(classification.id, k.knowledgePointOf("concept-bus-functions").id);
  assert.match(classification.summary, /连接范围/);
  assert.deepEqual(k.prerequisitesOf("concept-segmented-paged-memory").map((point) => point.id), ["concept-virtual-memory", "concept-segmented-memory"]);
});
