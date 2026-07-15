# Performance, Accessibility, and Release Quality Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

**Goal:** Make the approved dual-role prototype reliable on ordinary low-end Windows classroom computers by shrinking visible assets, providing a deterministic no-WebGL path, and measuring repeated 3D navigation and frame pacing.

**Architecture:** Keep React/Vite/Express unchanged. Add a pure WebGL capability boundary shared by both 3D surfaces, keep equivalent teaching content in HTML, and extend the isolated Playwright runner. A Node asset-budget verifier prevents raster regressions.

**Tech Stack:** React 19.2, Vite 6.4.2, Three.js 0.185.1, React Three Fiber 9.6.1, Node test runner, Playwright 1.61.1, Pillow for deterministic image conversion only.

## Global Constraints

- Target: Windows 10/11, four-core x86-64 CPU, 8 GB RAM, integrated graphics, 1366×768, supported Edge stable.
- Use standalone Playwright, one headless Chromium worker, dynamic ports, and temporary SQLite data.
- Common entry stays below 250 KB gzip and Three.js remains route-lazy.
- Avatar WebP is at most 40 KB; each teaching-image WebP is at most 220 KB.
- Preserve source crop, subject, palette, alt text, and existing layout slots.
- No-WebGL users retain five-part concepts, bus relationships, assembly order, completion, and builder controls in HTML.
- prefers-reduced-motion disables continuous animation by default.
- Follow red-green-refactor for every behavior change.

---

### Task 1: Enforce and Meet Raster Asset Budgets

**Files:**

- Create: prototype/scripts/verify-asset-budget.mjs
- Create: prototype/src/assets/alex-chen-avatar.webp
- Create: prototype/src/assets/lab-circuit-illustration.webp
- Create: prototype/src/assets/study-tip-carry-diagram.webp
- Modify: prototype/src/App.jsx
- Modify: prototype/src/components/NotesPage.jsx
- Modify: prototype/src/styles.css
- Modify: prototype/package.json

**Interfaces:**

- Produces npm run qa:assets, exiting non-zero for a missing or oversized production derivative.

- [ ] **Step 1: Write the failing verifier**

~~~javascript
import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgets = [
  ["src/assets/alex-chen-avatar.webp", 40 * 1024],
  ["src/assets/lab-circuit-illustration.webp", 220 * 1024],
  ["src/assets/study-tip-carry-diagram.webp", 220 * 1024],
];
for (const [relativePath, maximumBytes] of budgets) {
  const file = await stat(path.join(root, relativePath));
  assert.ok(file.size <= maximumBytes, relativePath + " exceeds budget");
  console.log(relativePath + ": " + file.size + " bytes");
}
~~~

- [ ] **Step 2: Confirm RED**

Run: node scripts/verify-asset-budget.mjs

Expected: ENOENT for alex-chen-avatar.webp.

- [ ] **Step 3: Produce deterministic derivatives**

~~~powershell
@'
from pathlib import Path
from PIL import Image
assets = Path("src/assets")
jobs = [
    ("alex-chen-avatar.png", "alex-chen-avatar.webp", (128, 128), 82),
    ("lab-circuit-illustration.png", "lab-circuit-illustration.webp", (768, 512), 78),
    ("study-tip-carry-diagram.png", "study-tip-carry-diagram.webp", (960, 640), 80),
]
for source_name, target_name, size, quality in jobs:
    with Image.open(assets / source_name) as image:
        image = image.convert("RGB")
        image.thumbnail(size, Image.Resampling.LANCZOS)
        image.save(assets / target_name, "WEBP", quality=quality, method=6)
'@ | python -
~~~

- [ ] **Step 4: Switch imports and CSS**

~~~javascript
import avatarImage from "./assets/alex-chen-avatar.webp";
import labIllustration from "./assets/lab-circuit-illustration.webp";
import studyDiagram from "../assets/study-tip-carry-diagram.webp";
~~~

Change the login CSS URL to lab-circuit-illustration.webp and add:

~~~json
"qa:assets": "node scripts/verify-asset-budget.mjs"
~~~

- [ ] **Step 5: Confirm GREEN**

Run npm run qa:assets and npm run build.

Expected: both exit 0; dist emits the three WebP files and no imported copies of the three PNG sources.

- [ ] **Step 6: Commit**

Commit message: perf: optimize classroom image assets

---

### Task 2: Add a Deterministic WebGL Boundary

**Files:**

- Create: prototype/src/webglSupport.js
- Create: prototype/src/webglSupport.test.mjs
- Create: prototype/src/components/ThreeSceneFallback.jsx
- Modify: prototype/src/components/ComputerExplodedView.jsx
- Modify: prototype/src/components/OverviewExplodedView.jsx
- Modify: prototype/src/components/HardwareBuilderView.jsx
- Modify: prototype/src/styles.css

**Interfaces:**

- Produces canUseWebGL(createCanvas = defaultCreateCanvas): boolean.
- ComputerExplodedView accepts fallback as a React node.

- [ ] **Step 1: Write failing tests**

~~~javascript
import test from "node:test";
import assert from "node:assert/strict";
import { canUseWebGL } from "./webglSupport.js";

test("returns false when canvas or context creation fails", () => {
  assert.equal(canUseWebGL(() => null), false);
  assert.equal(canUseWebGL(() => ({ getContext: () => null })), false);
  assert.equal(canUseWebGL(() => { throw new Error("blocked"); }), false);
});

test("accepts WebGL2 or WebGL", () => {
  const context = {};
  assert.equal(canUseWebGL(() => ({ getContext: (kind) => kind === "webgl2" ? context : null })), true);
  assert.equal(canUseWebGL(() => ({ getContext: (kind) => kind === "webgl" ? context : null })), true);
});
~~~

- [ ] **Step 2: Confirm RED**

Run node --test src/webglSupport.test.mjs.

Expected: module-not-found for webglSupport.js.

- [ ] **Step 3: Implement the probe**

~~~javascript
function defaultCreateCanvas() {
  return typeof document === "undefined" ? null : document.createElement("canvas");
}
export function canUseWebGL(createCanvas = defaultCreateCanvas) {
  try {
    const canvas = createCanvas();
    return Boolean(canvas?.getContext?.("webgl2") || canvas?.getContext?.("webgl"));
  } catch {
    return false;
  }
}
~~~

- [ ] **Step 4: Add semantic fallback and Canvas gate**

Fallback must contain:

~~~jsx
<section className="computer-exploded-fallback" role="status">
  <strong>当前电脑无法启动 3D，已切换到静态教学视图</strong>
  <ol aria-label="计算机组装顺序">
    <li>机箱与电源</li><li>主板</li><li>CPU</li><li>内存</li><li>显卡</li><li>硬盘</li>
  </ol>
  <p>数据总线传数据，地址总线选位置，控制总线协调读写。</p>
</section>
~~~

ComputerExplodedView calls canUseWebGL before Canvas and renders fallback when false. Keep dpr=1, antialias=false, and powerPreference=low-power when true.

- [ ] **Step 5: Suppress reduced-motion particles**

Render DataFlowParticle only when prefersReducedMotion is false.

- [ ] **Step 6: Verify**

Run node --test src/webglSupport.test.mjs, npm test, and npm run build.

Expected: all exit 0; Three.js remains outside the common entry.

- [ ] **Step 7: Commit**

Commit message: feat: add static fallback for unavailable WebGL

---

### Task 3: Verify Fallback, Navigation Lifecycle, and Frame Pacing

**Files:**

- Create: prototype/scripts/verify-performance.mjs
- Modify: prototype/scripts/verify-3d.mjs
- Modify: prototype/scripts/run-browser-qa.mjs
- Modify: prototype/package.json

**Interfaces:**

- Produces npm run qa:performance.
- Consumes QA_PERF_DURATION_MS, default 10000.

- [ ] **Step 1: Add failing no-WebGL assertions**

Launch a second Chromium with --disable-webgl and --disable-gpu, log in with the isolated student, and assert:

~~~javascript
assert.equal(await fallbackPage.locator(".computer-exploded-fallback").isVisible(), true);
assert.equal(await fallbackPage.locator(".computer-exploded canvas").count(), 0);
assert.equal(await fallbackPage.getByText("数据总线传数据", { exact: false }).isVisible(), true);
~~~

- [ ] **Step 2: Confirm RED**

Run npm run qa:3d.

Expected: fallback selector missing before Task 2.

- [ ] **Step 3: Finish fallback cleanup and confirm GREEN**

Close both browsers independently in finally and include both pages' errors in the final assertion.

- [ ] **Step 4: Write performance verifier**

The verifier creates an isolated student, enters and leaves overview 10 times, asserts one canvas inside and zero after exit, collects garbage through CDP before and after, requires heap growth at most 24 MB, then samples requestAnimationFrame for the configured duration and requires at least 20 FPS.

~~~javascript
const metrics = await page.evaluate(async (durationMs) => {
  let frames = 0;
  const start = performance.now();
  await new Promise((resolve) => {
    function tick(now) {
      frames += 1;
      if (now - start >= durationMs) resolve();
      else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  });
  const elapsedMs = performance.now() - start;
  return { frames, elapsedMs, fps: frames / (elapsedMs / 1000) };
}, durationMs);
~~~

- [ ] **Step 5: Register command**

Allow scripts/verify-performance.mjs in run-browser-qa.mjs, forward QA_PERF_DURATION_MS, and add:

~~~json
"qa:performance": "node scripts/run-browser-qa.mjs scripts/verify-performance.mjs"
~~~

- [ ] **Step 6: Run both durations**

Run npm run qa:performance, then set QA_PERF_DURATION_MS to 60000 and run it again.

Expected: 10 clean cycles, heap delta at most 24 MB, and FPS at least 20 in both runs.

- [ ] **Step 7: Commit**

Commit message: test: add low-end 3d performance gates

---

### Task 4: Run Release Matrix and Record Evidence

**Files:**

- Modify: this plan.

- [ ] **Step 1: Run full matrix**

Run npm test, npm run qa:assets, npm run build, npm run qa:ui, npm run qa:3d, npm run qa:performance, and git diff --check.

Expected: every command exits 0 using temporary QA data.

- [ ] **Step 2: Inspect release scope**

List the twelve largest dist assets and inspect Git status.

Expected: WebP files meet budget and no PNG production copy, SQLite, .hermes, test-artifacts, dist, or browser cache enters scope.

- [ ] **Step 3: Append exact evidence**

Record test count, common-entry gzip size, each WebP size, normal and fallback 3D checks, 10-cycle heap delta, 10-second FPS, and 60-second FPS.

- [ ] **Step 4: Commit**

Commit message: docs: record low-end classroom quality evidence