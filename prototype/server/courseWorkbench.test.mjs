import test from "node:test";
import assert from "node:assert/strict";
import { createFallbackCourseDraft, normalizeCourseDraftPayload, normalizeEvidenceUrl } from "./courseWorkbench.js";

const validDraft = {
  title: "  认识计算机组成  ",
  summary: "  在三维场景中认识 CPU、内存与总线。  ",
  learningObjectives: ["  能指出 CPU 的职责  "],
  guideChallengeId: "computer-components",
  guideScript: [
    {
      id: "cpu-focus",
      title: "观察 CPU",
      instruction: "点击 CPU，观察它和内存的位置。",
      action: { type: "highlightPart", partId: "cpu" },
      completion: "acknowledge",
    },
    {
      id: "xray",
      title: "观察总线",
      instruction: "打开 X-ray 查看总线。",
      action: { type: "setXray", enabled: true },
      completion: "challengeComplete",
    },
  ],
  assignmentOutline: { title: "组件观察记录", description: "记录一个部件职责。" },
  projectOutline: {
    title: "组装方案说明",
    description: "小组说明一台主机的部件协作。",
    milestones: [{ id: "draft", title: "方案草稿", description: "完成职责分工。" }],
  },
};

test("normalizes a valid course draft into inert guide data", () => {
  const draft = normalizeCourseDraftPayload(validDraft);

  assert.equal(draft.title, "认识计算机组成");
  assert.deepEqual(draft.learningObjectives, ["能指出 CPU 的职责"]);
  assert.deepEqual(draft.guideScript[0].action, { type: "highlightPart", partId: "cpu" });
  assert.equal(draft.projectOutline.milestones[0].id, "draft");
});

test("rejects an unknown guide action and computer part", () => {
  assert.throws(
    () => normalizeCourseDraftPayload({
      ...validDraft,
      guideScript: [{ ...validDraft.guideScript[0], action: { type: "runJavaScript", code: "alert(1)" } }],
    }),
    /引导动作/,
  );
  assert.throws(
    () => normalizeCourseDraftPayload({
      ...validDraft,
      guideScript: [{ ...validDraft.guideScript[0], action: { type: "highlightPart", partId: "not-a-part" } }],
    }),
    /部件/,
  );
});

test("rejects a draft without a usable objective, 3D target, or project milestone", () => {
  assert.throws(() => normalizeCourseDraftPayload({ ...validDraft, learningObjectives: [] }), /学习目标/);
  assert.throws(() => normalizeCourseDraftPayload({ ...validDraft, guideChallengeId: "full-adder" }), /3D 概述/);
  assert.throws(
    () => normalizeCourseDraftPayload({ ...validDraft, projectOutline: { ...validDraft.projectOutline, milestones: [] } }),
    /里程碑/,
  );
});

test("normalizes optional submission evidence to an HTTPS URL", () => {
  assert.equal(normalizeEvidenceUrl("  https://example.edu/evidence  "), "https://example.edu/evidence");
  assert.equal(normalizeEvidenceUrl(""), "");
  assert.throws(() => normalizeEvidenceUrl("http://example.edu/evidence"), /HTTPS/);
});

test("creates a complete manual template when AI is unavailable", () => {
  const draft = createFallbackCourseDraft({ title: "总线基础", summary: "观察数据路径", learningObjectives: ["区分数据与控制总线"] });
  assert.equal(normalizeCourseDraftPayload(draft).title, "总线基础");
  assert.equal(draft.projectOutline.milestones.length, 2);
});
