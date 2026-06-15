import test from "node:test";
import assert from "node:assert/strict";

import { buildReferencePlacedComponents } from "./labPlacement.js";
import { CHALLENGES } from "./platformLogic.js";
import {
  beginWireDrag,
  buildComponentPinLayout,
  cancelWireDrag,
  buildConnectionBlueprint,
  buildOrthogonalWireRoute,
  buildRenderableConnections,
  completeWireDrag,
  formatWireRoutePoints,
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
    reason: "not-required",
  });
});

test("拖线落到组件输出脚时会按端口方向拒绝输入连接", () => {
  const challenge = CHALLENGES.find((item) => item.id === "half-adder");

  const inspection = inspectWireTarget(
    challenge,
    { key: "input-输入A", label: "输入A", side: "input" },
    { key: "xor-S", label: "异或门", pin: "S", pinRole: "output" },
  );

  assert.deepEqual(inspection, {
    status: "invalid",
    connection: null,
    reason: "direction",
  });
});

test("粗粒度组件端点没有引脚角色时仍保留标签级合法连接", () => {
  const challenge = CHALLENGES.find((item) => item.id === "data-flow");

  const result = completeWireDrag(
    challenge,
    [],
    beginWireDrag({ key: "component-数据通路", label: "数据通路" }),
    { key: "output-结果S", label: "结果S" },
  );

  assert.deepEqual(result.connections, ["数据通路->结果S"]);
  assert.equal(result.status, "valid");
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
    reason: null,
  });
});

test("半加器的引脚布局会把输入和输出分到元件两侧", () => {
  const layout = buildComponentPinLayout(["A", "B", "S"]);

  const pinA = layout.find((item) => item.pin === "A");
  const pinB = layout.find((item) => item.pin === "B");
  const pinS = layout.find((item) => item.pin === "S");

  assert.ok(pinA.offsetX < 50, "input pin A should sit on the left side");
  assert.ok(pinB.offsetX < 50, "input pin B should sit on the left side");
  assert.ok(pinS.offsetX > 50, "output pin S should sit on the right side");
  assert.notEqual(pinA.offsetY, pinB.offsetY, "stacked input pins should not overlap");
});

test("半加器的多条连线会落在不同引脚，而不是挤到同一个点", () => {
  const challenge = CHALLENGES.find((item) => item.id === "half-adder");
  const connectionBlueprint = buildConnectionBlueprint(challenge);
  const placedComponents = buildReferencePlacedComponents(challenge);

  const lines = buildRenderableConnections({
    challenge,
    connectionBlueprint,
    placedComponents,
    connections: challenge.requiredConnections,
  });

  const inputAToXor = lines.find((line) => line.id === "输入A->异或门");
  const inputBToXor = lines.find((line) => line.id === "输入B->异或门");
  const xorToSum = lines.find((line) => line.id === "异或门->和位S");

  assert.ok(inputAToXor && inputBToXor && xorToSum, "expected half-adder lines should exist");
  assert.notEqual(inputAToXor.to.y, inputBToXor.to.y, "different input lines should land on different target pins");
  assert.ok(inputAToXor.to.x < placedComponents[0].x, "input pins should be left of the xor gate");
  assert.ok(xorToSum.from.x > placedComponents[0].x, "output pin should leave from the right side of the xor gate");
});

test("非同一行导线会生成正交折线而不是斜线直连", () => {
  const route = buildOrthogonalWireRoute({
    from: { x: 8, y: 26 },
    to: { x: 54, y: 40 },
  }, 1);

  assert.equal(route.points.length, 4);
  assert.deepEqual(route.points[0], { x: 8, y: 26 });
  assert.deepEqual(route.points.at(-1), { x: 54, y: 40 });
  assert.equal(route.points[1].y, 26);
  assert.equal(route.points[2].x, route.points[1].x);
  assert.equal(route.points[2].y, 40);
  assert.equal(formatWireRoutePoints(route.points), "8,26 28.8,26 28.8,40 54,40");
});
