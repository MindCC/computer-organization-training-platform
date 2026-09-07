import test from "node:test";
import assert from "node:assert/strict";
import { canEditMilestoneSubmission, createEditableMilestoneDraft, getActiveGuideForChallenge, nextGuideStep } from "./courseWorkbenchState.js";

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

test("starts each editable revision with a fresh idempotency key but preserves an in-flight draft", () => {
  const submission = { reflection: "初稿", evidenceUrl: "https://example.edu/old", clientSubmissionId: "saved-request" };
  const revision = createEditableMilestoneDraft(null, submission, () => "new-request");
  assert.deepEqual(revision, { reflection: "初稿", evidenceUrl: "https://example.edu/old", clientSubmissionId: "new-request" });
  assert.equal(createEditableMilestoneDraft(revision, submission, () => "another-request"), revision);
});

test("uses a new idempotency key after a saved draft is cleared", () => {
  const submission = { reflection: "已保存", evidenceUrl: "", clientSubmissionId: "saved-request" };
  const nextRevision = createEditableMilestoneDraft(undefined, submission, () => "next-request");
  assert.equal(nextRevision.clientSubmissionId, "next-request");
});
