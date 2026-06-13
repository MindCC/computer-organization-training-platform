import test from "node:test";
import assert from "node:assert/strict";

import { CHALLENGES } from "./platformLogic.js";
import {
  buildConnectionBlueprint,
  normalizeConnectionLabels,
  toggleConnectionByLabels,
} from "./labWiring.js";

test("全加器蓝图会区分外部端点和元件实例", () => {
  const challenge = CHALLENGES.find((item) => item.id === "full-adder");
  const blueprint = buildConnectionBlueprint(challenge);

  assert.equal(blueprint.components.some((item) => item.name === "异或门1"), true);
  assert.equal(blueprint.externalInputs.some((item) => item.label === "输入A"), true);
  assert.equal(blueprint.externalInputs.some((item) => item.label === "进位输入Cin"), true);
  assert.equal(blueprint.externalOutputs.some((item) => item.label === "和位S"), true);
  assert.equal(blueprint.externalOutputs.some((item) => item.label === "输出Cout"), true);
});

test("点击顺序相反时也能规范成关卡定义的连接", () => {
  const challenge = CHALLENGES.find((item) => item.id === "data-flow");

  assert.equal(
    normalizeConnectionLabels(challenge, "数据通路", "输入A"),
    "输入A->数据通路",
  );
  assert.equal(
    normalizeConnectionLabels(challenge, "结果S", "数据通路"),
    "数据通路->结果S",
  );
});

test("选择同一条合法连接两次会先添加再移除", () => {
  const challenge = CHALLENGES.find((item) => item.id === "mux");

  const first = toggleConnectionByLabels(challenge, [], "数据源0", "选择器");
  assert.deepEqual(first.connections, ["数据源0->选择器"]);
  assert.equal(first.lastConnection, "数据源0->选择器");

  const second = toggleConnectionByLabels(challenge, first.connections, "选择器", "数据源0");
  assert.deepEqual(second.connections, []);
  assert.equal(second.lastConnection, "数据源0->选择器");
});

test("不在关卡要求里的组合不会生成连接", () => {
  const challenge = CHALLENGES.find((item) => item.id === "half-adder");
  const result = toggleConnectionByLabels(challenge, [], "异或门", "进位C");

  assert.deepEqual(result.connections, []);
  assert.equal(result.lastConnection, null);
});
