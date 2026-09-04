import test from "node:test";
import assert from "node:assert/strict";
import { canEditMilestoneSubmission, getActiveGuideForChallenge, nextGuideStep } from "./courseWorkbenchState.js";

const project = {
  guideChallengeId: "computer-components",
  guideScript: [
    { id: "cpu", action: { type: "highlightPart", partId: "cpu" }, completion: "acknowledge" },
    { id: "finish", action: { type: "setXray", enabled: true }, completion: "challengeComplete" },
  ],
};

test("selects only the guide for the opened 3D challenge", () => {
  assert.equal(getActiveGuideForChallenge([project], "computer-components"), project);
  assert.equal(getActiveGuideForChallenge([project], "full-adder"), null);
});

test("advances a guide only after its declared completion evidence", () => {
  assert.equal(nextGuideStep(project.guideScript, 0, { acknowledged: true, challengeCompleted: false }), 1);
  assert.equal(nextGuideStep(project.guideScript, 1, { acknowledged: true, challengeCompleted: false }), 1);
  assert.equal(nextGuideStep(project.guideScript, 1, { acknowledged: true, challengeCompleted: true }), 2);
});

test("locks reviewed milestone submissions", () => {
  assert.equal(canEditMilestoneSubmission(null), true);
  assert.equal(canEditMilestoneSubmission({ status: "submitted" }), true);
  assert.equal(canEditMilestoneSubmission({ status: "reviewed" }), false);
});
