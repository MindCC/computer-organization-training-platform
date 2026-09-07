import test from "node:test";
import assert from "node:assert/strict";
import { createLegacyCourseSpec, normalizeCourseSpec } from "./courseSpec.js";

const validSpec = {
  schemaVersion: 1,
  courseKey: "instruction-addition",
  revision: 1,
  title: "追踪一次加法",
  objectives: ["区分取指地址与操作数地址"],
  requirements: { cpuModel: "edu16-acc@1" },
  steps: [
    { id: "focus-acc", kind: "prediction", workspace: "cpu", instruction: "预测 ACC。", entryActions: [{ type: "cpu.focus", target: "ACC" }], checkpointKey: "prediction-1" },
    { id: "run-program", kind: "experiment", workspace: "cpu", instruction: "执行程序。", entryActions: [{ type: "cpu.loadPreset", presetId: "addition-demo@1" }], checkpointKey: "execution-1" },
  ],
};

test("normalizes a bounded versioned course specification", () => {
  const spec = normalizeCourseSpec(validSpec);
  assert.equal(spec.courseKey, "instruction-addition");
  assert.equal(spec.steps[0].entryActions[0].type, "cpu.focus");
  assert.equal(spec.steps[1].entryActions[0].presetId, "addition-demo@1");
});

test("rejects unregistered actions and a workspace mismatch", () => {
  assert.throws(() => normalizeCourseSpec({ ...validSpec, steps: [{ ...validSpec.steps[0], entryActions: [{ type: "runJavaScript", code: "alert(1)" }] }] }), /动作/);
  assert.throws(() => normalizeCourseSpec({ ...validSpec, steps: [{ ...validSpec.steps[0], workspace: "circuit", entryActions: [{ type: "cpu.focus", target: "ACC" }] }] }), /工作区/);
});

test("rejects duplicate steps and invalid revisions", () => {
  assert.throws(() => normalizeCourseSpec({ ...validSpec, revision: 0 }), /版本/);
  assert.throws(() => normalizeCourseSpec({ ...validSpec, steps: [validSpec.steps[0], { ...validSpec.steps[0] }] }), /重复/);
});

test("adapts an existing guide draft into a frozen v1 course specification", () => {
  const spec = createLegacyCourseSpec({ id: 12, title: "旧课程", learningObjectives: ["识别 CPU"], guideScript: [{ id: "cpu-focus", instruction: "观察 CPU", action: { type: "highlightPart", partId: "cpu" }, completion: "acknowledge" }] });
  assert.equal(spec.courseKey, "legacy-course-12");
  assert.equal(spec.steps[0].workspace, "guide");
});
