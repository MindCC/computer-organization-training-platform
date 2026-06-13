import test from "node:test";
import assert from "node:assert/strict";

import { CHALLENGES } from "./platformLogic.js";
import { buildPlacementBlueprint } from "./labPlacement.js";
import { buildComponentStudyCard } from "./componentStudy.js";

test("full-adder second xor exposes its role and internal stages", () => {
  const challenge = CHALLENGES.find((item) => item.id === "full-adder");
  const slot = buildPlacementBlueprint(challenge)[1];

  const card = buildComponentStudyCard(challenge, slot, challenge.components[1]);

  assert.equal(card.title, "异或门2");
  assert.equal(card.roleLabel, "第二层求和");
  assert.equal(card.stages.length >= 2, true);
  assert.equal(card.stages[0].includes("临时和"), true);
  assert.equal(card.watchPoints.some((item) => item.includes("Cin")), true);
});

test("carry logic card explains output carry responsibility", () => {
  const challenge = CHALLENGES.find((item) => item.id === "full-adder");
  const slot = buildPlacementBlueprint(challenge)[2];

  const card = buildComponentStudyCard(challenge, slot, challenge.components[2]);

  assert.equal(card.title, "进位逻辑");
  assert.equal(card.roleLabel, "进位输出");
  assert.equal(card.summary.includes("Cout"), true);
  assert.equal(card.watchPoints.length >= 2, true);
});
