import test from "node:test";
import assert from "node:assert/strict";

import { CHALLENGES } from "./platformLogic.js";
import {
  beginWireDrag,
  cancelWireDrag,
  buildConnectionBlueprint,
  completeWireDrag,
  inspectWireTarget,
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

test("从端点开始拖线时会生成待连接状态", () => {
  const state = beginWireDrag({
    key: "input-输入A",
    label: "输入A",
    x: 8,
    y: 26,
  });

  assert.deepEqual(state, {
    startEndpoint: {
      key: "input-输入A",
      label: "输入A",
      x: 8,
      y: 26,
    },
    pointer: {
      x: 8,
      y: 26,
    },
  });
});

test("拖线释放到合法端点时会创建规范化连接", () => {
  const challenge = CHALLENGES.find((item) => item.id === "data-flow");
  const state = beginWireDrag({
    key: "input-输入A",
    label: "输入A",
    x: 8,
    y: 26,
  });

  const result = completeWireDrag(challenge, [], state, {
    key: "component-数据通路",
    label: "数据通路",
    x: 50,
    y: 26,
  });

  assert.deepEqual(result.connections, ["输入A->数据通路"]);
  assert.equal(result.lastConnection, "输入A->数据通路");
  assert.equal(result.cancelled, false);
});

test("拖线释放到空白区域时不会改变已有连接", () => {
  const challenge = CHALLENGES.find((item) => item.id === "data-flow");
  const state = beginWireDrag({
    key: "input-输入A",
    label: "输入A",
    x: 8,
    y: 26,
  });

  const result = completeWireDrag(challenge, ["数据通路->结果S"], state, null);

  assert.deepEqual(result.connections, ["数据通路->结果S"]);
  assert.equal(result.lastConnection, null);
  assert.equal(result.cancelled, true);
});

test("拖回同一端点会取消而不会形成自连接", () => {
  const state = beginWireDrag({
    key: "input-输入A",
    label: "输入A",
    x: 8,
    y: 26,
  });

  const result = completeWireDrag(
    CHALLENGES.find((item) => item.id === "data-flow"),
    [],
    state,
    {
      key: "input-输入A",
      label: "输入A",
      x: 8,
      y: 26,
    },
  );

  assert.deepEqual(result.connections, []);
  assert.equal(result.lastConnection, null);
  assert.equal(result.cancelled, true);
  assert.equal(cancelWireDrag(), null);
});

test("拖线到非法目标时会返回 invalid 状态供界面即时提示", () => {
  const challenge = CHALLENGES.find((item) => item.id === "half-adder");

  const inspection = inspectWireTarget(
    challenge,
    { key: "input-输入A", label: "输入A" },
    { key: "output-进位C", label: "进位C" },
  );

  assert.deepEqual(inspection, {
    status: "invalid",
    connection: null,
  });
});

test("拖线到合法目标时会返回 valid 状态和规范化连接", () => {
  const challenge = CHALLENGES.find((item) => item.id === "full-adder");

  const inspection = inspectWireTarget(
    challenge,
    { key: "input-进位输入Cin", label: "进位输入Cin" },
    { key: "component-异或门2", label: "异或门2" },
  );

  assert.deepEqual(inspection, {
    status: "valid",
    connection: "进位输入Cin->异或门2",
  });
});
