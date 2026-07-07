# Lab Game UI Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the React Flow lab feedback gaps and upgrade the storage, hardware challenge, and core UI into a more classroom-usable interactive training experience.

**Architecture:** Keep the existing React/Vite/Express prototype structure. Add focused pure modules for geometry, memory simulation, and hardware game scoring so behavior is testable outside React. Keep UI changes inside existing React components and CSS without introducing new UI frameworks.

**Tech Stack:** React 19, Vite, @xyflow/react, Node.js test runner, Express, better-sqlite3, CSS via the existing global stylesheet.

## Global Constraints

- Do not add a new frontend framework or design system dependency.
- Keep backend persistence unchanged; new game/simulator results continue through existing `student_progress` and `challenge_attempts` paths.
- Preserve existing login, teacher dashboard, CSV import, AI assistant, notes, and progress APIs.
- Maintain classroom scale: 1-3 classes and about 150 students.
- Keep experiments suitable for introductory Computer Organization students; no full cache coherence, virtual memory, or complex CPU pipeline in this slice.
- Use TDD for behavior changes: write a failing test, run it, implement, run passing tests.
- Verify with `npm.cmd test`, `npm.cmd run build`, and `node scripts/verify-ui.mjs` after implementation.

---

## File Structure

- `prototype/src/circuit/wireIntersections.js`: new pure geometry helper for detecting visual line crossings and producing bridge marker positions.
- `prototype/src/circuit/wireIntersections.test.mjs`: tests for crossing, shared endpoint, and parallel lines.
- `prototype/src/components/CircuitBridgeEdge.jsx`: new custom React Flow edge that draws the path plus non-connection bridge markers.
- `prototype/src/components/CircuitFlowCanvas.jsx`: consume bridge markers, use the custom edge type, and keep React Flow report behavior.
- `prototype/src/App.jsx`: fix React Flow feedback state, render memory simulator panel, enhance hardware game screen, and apply consistent shell classes.
- `prototype/src/memorySystem.js`: new pure simplified memory access simulator.
- `prototype/src/memorySystem.test.mjs`: tests for read, write, address decode, MAR/MDR/control/data bus state.
- `prototype/src/hardwareGame.js`: extend parts, scoring, customer satisfaction, quote/profit, and game-style feedback.
- `prototype/src/hardwareGame.test.mjs`: extend existing tests for game-style scoring and bottleneck feedback.
- `prototype/src/styles.css`: unified visual polish for app shell, lab panels, memory simulator, wire bridge, and hardware game.
- `prototype/scripts/verify-ui.mjs`: add smoke checks for updated feedback, memory simulator, hardware game metrics, and no visible mojibake.

---

### Task 1: React Flow Feedback and Wire Crossing Markers

**Files:**
- Create: `prototype/src/circuit/wireIntersections.js`
- Create: `prototype/src/circuit/wireIntersections.test.mjs`
- Create: `prototype/src/components/CircuitBridgeEdge.jsx`
- Modify: `prototype/src/components/CircuitFlowCanvas.jsx`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`

**Interfaces:**
- Consumes: existing React Flow edges/nodes from `CircuitFlowCanvas`.
- Produces: `findWireBridgeMarkers(edges, nodes) -> Array<{edgeId:string,x:number,y:number}>`.
- Produces: `CircuitBridgeEdge(props)`, reading `props.data.bridgeMarkers`.

- [ ] **Step 1: Write failing geometry tests**

Create `prototype/src/circuit/wireIntersections.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { findWireBridgeMarkers } from "./wireIntersections.js";

const nodes = [
  { id: "a", position: { x: 0, y: 0 } },
  { id: "b", position: { x: 100, y: 100 } },
  { id: "c", position: { x: 0, y: 100 } },
  { id: "d", position: { x: 100, y: 0 } },
  { id: "e", position: { x: 180, y: 0 } },
];

test("marks visual crossings between unrelated wires", () => {
  const markers = findWireBridgeMarkers([
    { id: "ab", source: "a", target: "b" },
    { id: "cd", source: "c", target: "d" },
  ], nodes);

  assert.equal(markers.length, 2);
  assert.deepEqual(markers.map((item) => item.edgeId).sort(), ["ab", "cd"]);
  assert.ok(Math.abs(markers[0].x - 50) <= 1);
  assert.ok(Math.abs(markers[0].y - 50) <= 1);
});

test("does not mark wires that share an endpoint as a crossing", () => {
  const markers = findWireBridgeMarkers([
    { id: "ab", source: "a", target: "b" },
    { id: "ae", source: "a", target: "e" },
  ], nodes);

  assert.equal(markers.length, 0);
});

test("does not mark parallel or separated wires", () => {
  const markers = findWireBridgeMarkers([
    { id: "ae", source: "a", target: "e" },
    { id: "cd", source: "c", target: "d" },
  ], nodes);

  assert.equal(markers.length, 0);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm.cmd test -- src/circuit/wireIntersections.test.mjs`

Expected: FAIL because `wireIntersections.js` does not exist.

- [ ] **Step 3: Implement minimal geometry helper**

Create `prototype/src/circuit/wireIntersections.js`:

```js
const EPSILON = 0.001;

function centerForNode(nodesById, id) {
  const node = nodesById.get(id);
  if (!node) return null;
  return { x: Number(node.position?.x ?? 0), y: Number(node.position?.y ?? 0) };
}

function between(value, start, end) {
  return value >= Math.min(start, end) + 8 && value <= Math.max(start, end) - 8;
}

function segmentIntersection(a, b, c, d) {
  const denominator = (a.x - b.x) * (c.y - d.y) - (a.y - b.y) * (c.x - d.x);
  if (Math.abs(denominator) < EPSILON) return null;
  const px = ((a.x * b.y - a.y * b.x) * (c.x - d.x) - (a.x - b.x) * (c.x * d.y - c.y * d.x)) / denominator;
  const py = ((a.x * b.y - a.y * b.x) * (c.y - d.y) - (a.y - b.y) * (c.x * d.y - c.y * d.x)) / denominator;
  if (!between(px, a.x, b.x) || !between(py, a.y, b.y) || !between(px, c.x, d.x) || !between(py, c.y, d.y)) return null;
  return { x: px, y: py };
}

function sharesEndpoint(first, second) {
  return first.source === second.source || first.source === second.target || first.target === second.source || first.target === second.target;
}

export function findWireBridgeMarkers(edges = [], nodes = []) {
  const nodesById = new Map(nodes.map((node) => [node.id, node]));
  const segments = edges.map((edge) => ({ edge, start: centerForNode(nodesById, edge.source), end: centerForNode(nodesById, edge.target) })).filter((item) => item.start && item.end);
  const markers = [];
  for (let i = 0; i < segments.length; i += 1) {
    for (let j = i + 1; j < segments.length; j += 1) {
      if (sharesEndpoint(segments[i].edge, segments[j].edge)) continue;
      const crossing = segmentIntersection(segments[i].start, segments[i].end, segments[j].start, segments[j].end);
      if (!crossing) continue;
      markers.push({ edgeId: segments[i].edge.id, ...crossing });
      markers.push({ edgeId: segments[j].edge.id, ...crossing });
    }
  }
  return markers;
}
```

- [ ] **Step 4: Run geometry tests passing**

Run: `npm.cmd test -- src/circuit/wireIntersections.test.mjs`

Expected: PASS.

- [ ] **Step 5: Fix React Flow feedback state**

In `prototype/src/App.jsx`, inside `handleCircuitFlowResult`, replace:

```js
setFeedback(null);
```

with:

```js
setFeedback(normalizedResult);
```

- [ ] **Step 6: Add custom edge renderer**

Create `prototype/src/components/CircuitBridgeEdge.jsx`:

```jsx
import { BaseEdge, EdgeLabelRenderer, getBezierPath } from "@xyflow/react";

export function CircuitBridgeEdge(props) {
  const { id, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, markerEnd, style, data } = props;
  const [edgePath] = getBezierPath({ sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition });
  const markers = data?.bridgeMarkers ?? [];

  return (
    <>
      <BaseEdge id={id} path={edgePath} markerEnd={markerEnd} style={style} />
      <EdgeLabelRenderer>
        {markers.map((marker, index) => (
          <span
            aria-label="导线相交但不连接"
            className="wire-bridge-marker"
            key={id + "-" + index}
            style={{ transform: "translate(-50%, -50%) translate(" + marker.x + "px, " + marker.y + "px)" }}
            title="导线相交但不连接"
          />
        ))}
      </EdgeLabelRenderer>
    </>
  );
}
```

- [ ] **Step 7: Wire custom edge into canvas**

Modify `CircuitFlowCanvas.jsx` to import `CircuitBridgeEdge` and `findWireBridgeMarkers`, define `const edgeTypes = { bridge: CircuitBridgeEdge };`, pass `edgeTypes={edgeTypes}` into `<ReactFlow>`, and add `type: "bridge"` plus `data.bridgeMarkers` in `displayEdges`.

- [ ] **Step 8: Add marker CSS**

Add to `prototype/src/styles.css`:

```css
.wire-bridge-marker {
  position: absolute;
  width: 18px;
  height: 10px;
  border-top: 3px solid #f8fbff;
  border-radius: 999px 999px 0 0;
  pointer-events: none;
  z-index: 12;
  filter: drop-shadow(0 1px 2px rgba(15, 23, 42, 0.28));
}
```

---

### Task 2: Storage System Simulator

**Files:**
- Create: `prototype/src/memorySystem.js`
- Create: `prototype/src/memorySystem.test.mjs`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Produces: `buildMemoryAccessState({ address, operation, writeValue })` with MAR, MDR, address bus, data bus, control bus, decoded row/column, selected cell, and 16 memory cells.

- [ ] **Step 1: Write failing memory simulator tests**

Create `prototype/src/memorySystem.test.mjs` with tests for read and write access.

- [ ] **Step 2: Run failing memory tests**

Run: `npm.cmd test -- src/memorySystem.test.mjs`

Expected: FAIL because `memorySystem.js` does not exist.

- [ ] **Step 3: Implement `buildMemoryAccessState`**

Create a 16-cell memory grid, 4-bit address normalization, row/column decode, MAR/MDR/control/data bus values, and an explanation string.

- [ ] **Step 4: Render `MemorySystemPanel` for `memory-address`**

Add controls for address, read/write mode, write value, bus strip, and 4x4 memory matrix.

- [ ] **Step 5: Add UI smoke assertions**

In `verify-ui.mjs`, for `memory-address`, assert visible text: `简化存储系统`, `地址译码`, `控制总线`.

---

### Task 3: Hardware Challenge Game-Style Upgrade

**Files:**
- Modify: `prototype/src/hardwareGame.js`
- Modify: `prototype/src/hardwareGame.test.mjs`
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- Extend `gradeHardwareBuild(caseId, selection)` with `quotePrice`, `profit`, `satisfaction`, `marketTags`, and `recommendation` while preserving existing fields.

- [ ] **Step 1: Add failing hardware game test**

Assert `gradeHardwareBuild("game-office-pc", selection)` returns numeric quote/profit/satisfaction, array `marketTags`, and string `recommendation`.

- [ ] **Step 2: Implement business result fields**

Calculate quote as parts cost plus margin, profit as quote minus cost, satisfaction from score/budget/bottlenecks, market tags from strengths and weaknesses.

- [ ] **Step 3: Upgrade hardware game UI**

Rename the page to `电脑装机店经营挑战`, add customer satisfaction,经营利润,报价, market tags, and a configuration order visual.

- [ ] **Step 4: Add UI smoke assertions**

Assert visible text: `电脑装机店经营挑战`, `客户满意度`, `经营利润`.

---

### Task 4: Core UI Unification Pass

**Files:**
- Modify: `prototype/src/App.jsx`
- Modify: `prototype/src/styles.css`
- Modify: `prototype/scripts/verify-ui.mjs`

**Interfaces:**
- No new JavaScript API. Preserve current navigation and test selectors.

- [ ] **Step 1: Normalize visual tokens**

Add shared lab surface, border, shadow, and panel styles to align homepage, teacher dashboard, lab screen, and hardware game.

- [ ] **Step 2: Improve panel hierarchy**

Use consistent surface treatment for route cards, teacher panels, lab inspector, memory simulator, and hardware builder. Avoid nested-card feel.

- [ ] **Step 3: Run UI smoke**

Run: `node scripts/verify-ui.mjs` against a local server.

Expected: PASS.

---

### Task 5: Final Verification and Commit

**Files:**
- All planned files above.

**Interfaces:**
- Produces one verified commit.

- [ ] **Step 1: Run full unit tests**

Run: `npm.cmd test`

Expected: all tests pass.

- [ ] **Step 2: Run production build**

Run: `npm.cmd run build`

Expected: build succeeds.

- [ ] **Step 3: Run UI smoke**

Run local server and then `node scripts/verify-ui.mjs`.

Expected: `UI smoke check passed`.

- [ ] **Step 4: Inspect diff**

Run: `git diff --stat` and `git status --short`.

Expected: only planned files are modified.

- [ ] **Step 5: Commit**

Commit message: `Upgrade lab simulator and hardware game UI`.

---

## Self-Review

- Spec coverage: all five user issues map to tasks: wire crossing marker Task 1, detection feedback Task 1, storage simulator Task 2, hardware game upgrade Task 3, UI consistency Task 4.
- Placeholder scan: no TBD/TODO placeholders; each task has exact files, interfaces, and commands.
- Type consistency: `findWireBridgeMarkers`, `buildMemoryAccessState`, and extended `gradeHardwareBuild` names are consistent.
- Scope control: this plan intentionally avoids full cache, full market simulation, multiplayer, new dependencies, and backend schema changes.
