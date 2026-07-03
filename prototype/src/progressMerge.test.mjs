import test from "node:test";
import assert from "node:assert/strict";

import {
  CHALLENGES,
  buildInitialProgress,
  mergeProgressWithChallenges,
} from "./platformLogic.js";

test("server progress missing a newly added challenge is filled with a default record", () => {
  const oldProgress = buildInitialProgress(CHALLENGES.filter((challenge) => challenge.id !== "machine-number"));
  const merged = mergeProgressWithChallenges(CHALLENGES, oldProgress);

  assert.equal(merged["machine-number"].status, "locked");
  assert.equal(merged["machine-number"].attempts, 0);
  assert.equal(merged["computer-components"].status, oldProgress["computer-components"].status);
});
