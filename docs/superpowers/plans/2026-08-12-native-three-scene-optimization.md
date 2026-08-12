# Native Three.js Scene Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the React Three Fiber/Drei computer scene with a native Three.js controller while preserving teaching interactions and reducing the incremental 3D path below 220 KiB gzip with no JavaScript chunk above 500 KiB.

**Architecture:** React owns teaching state and renders controls/fallback content. A single native scene controller owns Three.js objects, DOM labels, input events, animation, resizing, and disposal; pure state helpers isolate calculations for unit tests. The production manifest supplies a separate, reproducible 3D budget gate.

**Tech Stack:** React 19, Three.js 0.185, Vite 6, Node test runner, Playwright.

## Global Constraints

- Remove `@react-three/fiber` and `@react-three/drei` from production dependencies.
- Preserve automatic explosion, three manual explosion distances, eight assembly steps, orbit rotation/zoom, part selection, X-ray, four bus categories, particles, fallback, and completion settlement.
- The incremental 3D JavaScript path must total less than `220 * 1024` gzip bytes.
- Every incremental 3D JavaScript chunk must be smaller than `500 * 1024` uncompressed bytes.
- Do not raise Vite's chunk warning threshold to hide a budget failure.
- Do not add external models, textures, CDNs, or runtime network dependencies.
- All resource cleanup must be idempotent and safe under React StrictMode remounting.

## File Map

- Create `prototype/scripts/build-budget-helpers.mjs`: manifest traversal and gzip measurement shared by budget checks.
- Create `prototype/scripts/build-budget-helpers.test.mjs`: fixture-based tests for dependency traversal and size accounting.
- Create `prototype/scripts/verify-3d-budget.mjs`: production 3D budget gate.
- Create `prototype/src/components/nativeComputerSceneState.js`: pure scene state, projection, and resource registry helpers.
- Create `prototype/src/components/nativeComputerSceneState.test.mjs`: unit tests for the pure helpers.
- Create `prototype/src/components/nativeComputerScene.js`: native Three.js scene controller.
- Create `prototype/src/components/NativeComputerScene.jsx`: React lifecycle/fallback boundary for the controller.
- Modify `prototype/src/components/computerParts.js`: remove its React hook and expose pure part instances.
- Modify `prototype/src/components/OverviewExplodedView.jsx`: replace Fiber JSX with a native scene view state.
- Delete `prototype/src/components/ComputerExplodedView.jsx`: obsolete Fiber/Drei wrapper.
- Modify `prototype/scripts/verify-3d.mjs`: assert native renderer, interactions, cleanup, and fallback.
- Modify `prototype/package.json` and `prototype/package-lock.json`: scripts, tests, and dependency removal.
- Modify `docs/remaining-work-prd.md`: mark P3-A complete only after all gates pass.

---

### Task 1: Add an Incremental 3D Build Budget Gate

**Files:**
- Create: `prototype/scripts/build-budget-helpers.mjs`
- Create: `prototype/scripts/build-budget-helpers.test.mjs`
- Create: `prototype/scripts/verify-3d-budget.mjs`
- Modify: `prototype/package.json`

**Interfaces:**
- Produces: `collectStaticChunkKeys(manifest, entryKey, { excludeEntries }) -> string[]`
- Produces: `measureChunks({ root, manifest, keys }) -> Promise<Array<{ key, file, bytes, gzipBytes }>>`
- Produces: `npm run qa:3d-budget`

- [ ] **Step 1: Write fixture tests for manifest traversal and gzip accounting**

Create `prototype/scripts/build-budget-helpers.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { collectStaticChunkKeys, measureChunks } from "./build-budget-helpers.mjs";

test("collects static 3D dependencies without counting the app entry", () => {
  const manifest = {
    "index.html": { file: "assets/index.js", isEntry: true },
    "src/components/OverviewExplodedView.jsx": {
      file: "assets/overview.js",
      imports: ["index.html", "_three.js"],
    },
    "_three.js": { file: "assets/three.js", imports: ["_orbit.js"] },
    "_orbit.js": { file: "assets/orbit.js", imports: ["_three.js"] },
  };

  assert.deepEqual(
    collectStaticChunkKeys(manifest, "src/components/OverviewExplodedView.jsx", { excludeEntries: true }),
    ["_orbit.js", "_three.js", "src/components/OverviewExplodedView.jsx"],
  );
});

test("measures raw and gzip bytes for every collected chunk", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "zcyl-3d-budget-"));
  await mkdir(path.join(root, "assets"));
  await writeFile(path.join(root, "assets/overview.js"), "abc".repeat(500));
  const manifest = {
    overview: { file: "assets/overview.js" },
  };

  const [result] = await measureChunks({ root, manifest, keys: ["overview"] });
  assert.equal(result.file, "assets/overview.js");
  assert.ok(result.bytes > 20);
  assert.ok(result.gzipBytes > 0);
  assert.ok(result.gzipBytes < result.bytes);
});
```

- [ ] **Step 2: Run the helper tests and verify RED**

Run: `node --test scripts/build-budget-helpers.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND` for `build-budget-helpers.mjs`.

- [ ] **Step 3: Implement manifest traversal and measurement**

Create `prototype/scripts/build-budget-helpers.mjs`:

```js
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { gzip } from "node:zlib";
import { promisify } from "node:util";

const gzipAsync = promisify(gzip);

export function collectStaticChunkKeys(manifest, entryKey, { excludeEntries = false } = {}) {
  const visited = new Set();
  function visit(key) {
    if (visited.has(key)) return;
    const chunk = manifest[key];
    assert.ok(chunk, `manifest chunk ${key} was not found`);
    visited.add(key);
    for (const dependency of chunk.imports ?? []) visit(dependency);
  }
  visit(entryKey);
  return [...visited]
    .filter((key) => !excludeEntries || !manifest[key].isEntry)
    .sort();
}

export async function measureChunks({ root, manifest, keys }) {
  return Promise.all(keys.map(async (key) => {
    const file = manifest[key].file;
    const absolutePath = path.join(root, file);
    const [metadata, content] = await Promise.all([stat(absolutePath), readFile(absolutePath)]);
    return {
      key,
      file,
      bytes: metadata.size,
      gzipBytes: (await gzipAsync(content)).length,
    };
  }));
}
```

- [ ] **Step 4: Run helper tests and verify GREEN**

Run: `node --test scripts/build-budget-helpers.test.mjs`

Expected: `2` tests pass and `0` fail.

- [ ] **Step 5: Add the production budget script and npm commands**

Create `prototype/scripts/verify-3d-budget.mjs`:

```js
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { collectStaticChunkKeys, measureChunks } from "./build-budget-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "dist/.vite/manifest.json"), "utf8"));
const entryKey = "src/components/OverviewExplodedView.jsx";
assert.ok(manifest[entryKey], `3D entry ${entryKey} was not found`);

const keys = collectStaticChunkKeys(manifest, entryKey, { excludeEntries: true });
const chunks = await measureChunks({ root: path.join(root, "dist"), manifest, keys });
const maximumChunkBytes = 500 * 1024;
const maximumGzipBytes = 220 * 1024;
const totalGzipBytes = chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);

for (const chunk of chunks) {
  assert.ok(chunk.bytes < maximumChunkBytes, `${chunk.file} is ${chunk.bytes} bytes`);
  console.log(`${chunk.file}: ${chunk.bytes} bytes, gzip ${chunk.gzipBytes} bytes`);
}
assert.ok(totalGzipBytes < maximumGzipBytes, `3D gzip total is ${totalGzipBytes} bytes`);
console.log(`incremental 3D gzip total: ${totalGzipBytes} bytes`);
```

Add these scripts to `prototype/package.json` and include script tests in the main test command:

```json
"test": "node --test src/*.test.mjs src/shared/*.test.mjs src/circuit/*.test.mjs server/*.test.mjs scripts/*.test.mjs",
"preqa:3d-budget": "npm run build -- --manifest",
"qa:3d-budget": "node scripts/verify-3d-budget.mjs"
```

- [ ] **Step 6: Run the current production budget and verify RED**

Run: `npm run qa:3d-budget`

Expected: FAIL because the existing Fiber/Drei path is approximately `277 KiB` gzip and its overview chunk is above `500 KiB`.

- [ ] **Step 7: Commit the budget gate**

```bash
git add prototype/package.json prototype/scripts/build-budget-helpers.mjs prototype/scripts/build-budget-helpers.test.mjs prototype/scripts/verify-3d-budget.mjs
git commit -m "test: enforce incremental 3D bundle budget"
```

---

### Task 2: Extract Pure Scene State and Resource Lifecycle Helpers

**Files:**
- Create: `prototype/src/components/nativeComputerSceneState.js`
- Create: `prototype/src/components/nativeComputerSceneState.test.mjs`
- Modify: `prototype/src/components/computerParts.js`

**Interfaces:**
- Produces: `normalizeSceneViewState(input) -> SceneViewState`
- Produces: `partPosition(part, distance) -> [number, number, number]`
- Produces: `screenPointFromNdc(ndc, width, height) -> { left, top } | null`
- Produces: `createResourceRegistry() -> { add(resource), dispose() }`
- Produces: `getPartInstances(explodeDistance) -> PartInstance[]`

- [ ] **Step 1: Write state and disposal tests**

Create `prototype/src/components/nativeComputerSceneState.test.mjs`:

```js
import test from "node:test";
import assert from "node:assert/strict";
import {
  createResourceRegistry,
  normalizeSceneViewState,
  partPosition,
  screenPointFromNdc,
} from "./nativeComputerSceneState.js";

test("normalizes native scene state without leaking mutable sets", () => {
  const state = normalizeSceneViewState({
    visiblePartIds: ["cpu", "ram-0"],
    explodeDistance: 1.5,
    autoAnimating: false,
    selectedPartId: "cpu",
    xray: true,
    showConnections: true,
  });
  assert.deepEqual([...state.visiblePartIds], ["cpu", "ram-0"]);
  assert.equal(state.targetExplodeDistance, 1.5);
  assert.equal(state.selectedPartId, "cpu");
  assert.equal(state.xray, true);
});

test("auto animation targets the settled 1.3 explosion distance", () => {
  assert.equal(normalizeSceneViewState({ autoAnimating: true }).targetExplodeDistance, 1.3);
});

test("computes an exploded parent position", () => {
  assert.deepEqual(partPosition({ basePos: [1, 2, 3], explodeDir: [0.5, -1, 2] }, 2), [2, 0, 7]);
});

test("projects visible NDC points and hides points outside clip depth", () => {
  assert.deepEqual(screenPointFromNdc({ x: 0, y: 0, z: 0 }, 800, 600), { left: 400, top: 300 });
  assert.equal(screenPointFromNdc({ x: 0, y: 0, z: 2 }, 800, 600), null);
});

test("resource registry disposes unique resources once and is idempotent", () => {
  let disposed = 0;
  const resource = { dispose: () => { disposed += 1; } };
  const registry = createResourceRegistry();
  registry.add(resource);
  registry.add(resource);
  registry.dispose();
  registry.dispose();
  assert.equal(disposed, 1);
});
```

- [ ] **Step 2: Run the state tests and verify RED**

Run: `node --test src/components/nativeComputerSceneState.test.mjs`

Expected: FAIL with `ERR_MODULE_NOT_FOUND`.

- [ ] **Step 3: Implement the pure helpers**

Create `prototype/src/components/nativeComputerSceneState.js`:

```js
export function normalizeSceneViewState(input = {}) {
  return {
    visiblePartIds: new Set(input.visiblePartIds ?? []),
    targetExplodeDistance: input.autoAnimating ? 1.3 : Number(input.explodeDistance ?? 0),
    autoAnimating: Boolean(input.autoAnimating),
    selectedPartId: input.selectedPartId ?? null,
    xray: Boolean(input.xray),
    showConnections: Boolean(input.showConnections),
    reducedMotion: Boolean(input.reducedMotion),
  };
}

export function partPosition(part, distance) {
  return part.basePos.map((value, index) => value + part.explodeDir[index] * distance);
}

export function screenPointFromNdc(ndc, width, height) {
  if (ndc.z < -1 || ndc.z > 1) return null;
  return {
    left: (ndc.x * 0.5 + 0.5) * width,
    top: (-ndc.y * 0.5 + 0.5) * height,
  };
}

export function createResourceRegistry() {
  const resources = new Set();
  let disposed = false;
  return {
    add(resource) {
      if (resource?.dispose) resources.add(resource);
      return resource;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const resource of resources) resource.dispose();
      resources.clear();
    },
  };
}
```

- [ ] **Step 4: Remove React from `computerParts.js`**

Delete `import { useMemo } from "react";` and replace `usePartPositions` with:

```js
export function getPartInstances(explodeDistance = 0) {
  return COMPUTER_PARTS.flatMap((part) => flattenPart(part, explodeDistance));
}
```

- [ ] **Step 5: Run focused and full tests**

Run: `node --test src/components/nativeComputerSceneState.test.mjs src/*.test.mjs`

Expected: all selected tests pass with `0` failures.

- [ ] **Step 6: Commit the pure scene model**

```bash
git add prototype/src/components/nativeComputerSceneState.js prototype/src/components/nativeComputerSceneState.test.mjs prototype/src/components/computerParts.js
git commit -m "refactor: extract native 3D scene state"
```

---

### Task 3: Replace the Fiber Canvas with a Native Three.js Controller

**Files:**
- Create: `prototype/src/components/nativeComputerScene.js`
- Create: `prototype/src/components/NativeComputerScene.jsx`
- Modify: `prototype/src/components/OverviewExplodedView.jsx`
- Modify: `prototype/scripts/verify-3d.mjs`
- Delete: `prototype/src/components/ComputerExplodedView.jsx`

**Interfaces:**
- Consumes: `normalizeSceneViewState`, `partPosition`, `createResourceRegistry`
- Produces: `createNativeComputerScene(container, { cameraPosition, onPartSelect, onFailure })`
- Controller methods: `setViewState(viewState)`, `resize()`, `dispose()`
- Produces React component: `NativeComputerScene({ viewState, onPartSelect, fallback })`

- [ ] **Step 1: Add a native renderer assertion to browser QA**

After `.computer-exploded` appears in `prototype/scripts/verify-3d.mjs`, add:

```js
check(
  "Native Three.js renderer is active",
  await page.locator('.computer-exploded[data-renderer="native-three"]').count() === 1,
);
check("Exactly one scene canvas exists", await page.locator(".computer-exploded canvas").count() === 1);
```

The hardware builder was intentionally migrated to a WebP workbench before this plan. Replace its stale canvas assertion with the current product contract:

```js
const workbenchImage = page.locator(".hardware-workbench-image");
await workbenchImage.waitFor({ state: "visible", timeout: 20_000 });
check("Builder WebP workbench is visible", await workbenchImage.isVisible());
check("Builder does not recreate a 3D canvas", await page.locator(".hardware-workbench canvas").count() === 0);
```

Apply the same contract in the WebGL-disabled builder path: the workbench image and controls remain visible and no canvas is created.

- [ ] **Step 2: Run browser QA and verify RED**

Run: `npm run qa:3d`

Expected: FAIL at `Native Three.js renderer is active` because the current view is Fiber-based.

- [ ] **Step 3: Implement the controller foundation**

Create `prototype/src/components/nativeComputerScene.js` with direct imports only:

```js
import {
  AmbientLight,
  Color,
  DirectionalLight,
  GridHelper,
  Group,
  Mesh,
  PerspectiveCamera,
  Raycaster,
  Scene,
  Vector2,
  WebGLRenderer,
} from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { COMPUTER_PARTS, MOBO_DETAILS } from "./computerParts.js";
import { createResourceRegistry, normalizeSceneViewState, partPosition } from "./nativeComputerSceneState.js";

export function createNativeComputerScene(container, options = {}) {
  const registry = createResourceRegistry();
  const scene = new Scene();
  scene.background = new Color("#08090a");
  const camera = new PerspectiveCamera(45, 1, 0.1, 100);
  camera.position.fromArray(options.cameraPosition ?? [1.2, 0.8, 2]);
  const renderer = new WebGLRenderer({ antialias: true, powerPreference: "low-power" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  container.append(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = false;
  controls.minDistance = 0.8;
  controls.maxDistance = 4;
  controls.target.set(0, 0.05, 0);

  scene.add(new AmbientLight("#ffffff", 0.65));
  const keyLight = new DirectionalLight("#ffffff", 1.5);
  keyLight.position.set(3, 4, 2);
  scene.add(keyLight);
  const fillLight = new DirectionalLight("#ffd9a0", 0.45);
  fillLight.position.set(-2, 1, -1);
  scene.add(fillLight);
  scene.add(new GridHelper(3, 30, "#2a2a5e", "#1a1a3e").translateY(-0.45));

  const partGroups = new Map();
  for (const part of COMPUTER_PARTS) {
    const group = new Group();
    group.userData.partId = part.id;
    for (const subPart of part.subParts ?? []) {
      const material = registry.add(subPart.mat.clone());
      registry.add(subPart.geo);
      const mesh = new Mesh(subPart.geo, material);
      mesh.position.fromArray(subPart.pos ?? [0, 0, 0]);
      mesh.rotation.fromArray(subPart.rot ?? [0, 0, 0]);
      mesh.userData.partId = part.id;
      group.add(mesh);
    }
    scene.add(group);
    partGroups.set(part.id, { part, group });
  }
  const motherboard = partGroups.get("motherboard")?.group;
  for (const detail of MOBO_DETAILS) {
    registry.add(detail.geo);
    const mesh = new Mesh(detail.geo, registry.add(detail.mat.clone()));
    mesh.position.fromArray(detail.pos);
    mesh.userData.partId = "motherboard";
    motherboard?.add(mesh);
  }

  const pointer = new Vector2();
  const raycaster = new Raycaster();
  function onClick(event) {
    const bounds = renderer.domElement.getBoundingClientRect();
    pointer.set(
      ((event.clientX - bounds.left) / bounds.width) * 2 - 1,
      -((event.clientY - bounds.top) / bounds.height) * 2 + 1,
    );
    raycaster.setFromCamera(pointer, camera);
    const hit = raycaster.intersectObjects([...partGroups.values()].map(({ group }) => group), true)[0];
    const partId = hit?.object?.userData?.partId;
    if (partId) options.onPartSelect?.(partId);
  }
  renderer.domElement.addEventListener("click", onClick);

  let viewState = normalizeSceneViewState();
  let currentDistance = 0;
  let frameId = 0;
  function render() {
    currentDistance += (viewState.targetExplodeDistance - currentDistance)
      * (viewState.reducedMotion ? 1 : 0.08);
    for (const [partId, entry] of partGroups) {
      entry.group.visible = viewState.visiblePartIds.has(partId);
      entry.group.position.fromArray(partPosition(entry.part, currentDistance));
    }
    renderer.render(scene, camera);
    frameId = requestAnimationFrame(render);
  }

  function resize() {
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    renderer.setSize(width, height, false);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  render();

  let disposed = false;
  return {
    setViewState(nextState) { viewState = normalizeSceneViewState(nextState); },
    resize,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelAnimationFrame(frameId);
      observer.disconnect();
      renderer.domElement.removeEventListener("click", onClick);
      controls.dispose();
      registry.dispose();
      renderer.dispose();
      renderer.domElement.remove();
    },
  };
}
```

- [ ] **Step 4: Add the React lifecycle wrapper**

Create `prototype/src/components/NativeComputerScene.jsx`:

```jsx
import { useEffect, useRef, useState } from "react";
import { canUseWebGL } from "../webglSupport.js";
import { createNativeComputerScene } from "./nativeComputerScene.js";

export function NativeComputerScene({ viewState, onPartSelect, fallback }) {
  const containerRef = useRef(null);
  const controllerRef = useRef(null);
  const latestSelectRef = useRef(onPartSelect);
  const [failed, setFailed] = useState(() => !canUseWebGL());
  latestSelectRef.current = onPartSelect;

  useEffect(() => {
    if (failed || !containerRef.current) return undefined;
    try {
      controllerRef.current = createNativeComputerScene(containerRef.current, {
        onPartSelect: (partId) => latestSelectRef.current?.(partId),
        onFailure: () => setFailed(true),
      });
      controllerRef.current.setViewState(viewState);
    } catch {
      controllerRef.current?.dispose();
      controllerRef.current = null;
      setFailed(true);
    }
    return () => {
      controllerRef.current?.dispose();
      controllerRef.current = null;
    };
  }, [failed]);

  useEffect(() => controllerRef.current?.setViewState(viewState), [viewState]);
  if (failed) return fallback;
  return <div className="computer-exploded" data-renderer="native-three" ref={containerRef} />;
}
```

- [ ] **Step 5: Replace scene JSX in `OverviewExplodedView`**

Remove all imports from `three`, `@react-three/fiber`, `@react-three/drei`, and `ComputerExplodedView`. Build this memoized view state:

```js
const sceneViewState = useMemo(() => ({
  visiblePartIds: uniqueParts.map((part) => part.parentId ?? part.id),
  explodeDistance,
  autoAnimating: mode === "auto" && autoAnimating,
  selectedPartId: selectedPart?.parentId ?? selectedPart?.id ?? null,
  xray,
  showConnections: showConnections || mode === "auto" || xray,
  reducedMotion: prefersReducedMotion,
}), [uniqueParts, explodeDistance, mode, autoAnimating, selectedPart, xray, showConnections, prefersReducedMotion]);
```

Replace `<ComputerExplodedView>...</ComputerExplodedView>` with:

```jsx
<NativeComputerScene
  fallback={<ThreeSceneFallback completed={completed} context="overview" onComplete={onComplete} />}
  onPartSelect={(partId) => {
    const part = COMPUTER_PARTS.find((item) => item.id === partId) ?? null;
    setSelectedPart((current) => current?.id === partId ? null : part);
  }}
  viewState={sceneViewState}
/>
```

Use `getPartInstances` instead of `usePartPositions` when computing the list displayed by React.

- [ ] **Step 6: Delete the obsolete wrapper and verify the native canvas**

Delete `prototype/src/components/ComputerExplodedView.jsx`.

Run: `npm run qa:3d`

Expected: native renderer and one-canvas checks pass; any missing X-ray/bus checks added in Task 4 may still fail.

- [ ] **Step 7: Commit the native renderer foundation**

```bash
git add prototype/src/components/nativeComputerScene.js prototype/src/components/NativeComputerScene.jsx prototype/src/components/OverviewExplodedView.jsx prototype/src/components/ComputerExplodedView.jsx prototype/scripts/verify-3d.mjs
git commit -m "refactor: render computer scene with native Three.js"
```

---

### Task 4: Restore X-ray, Bus Labels, Part Highlighting, and Context Loss Handling

**Files:**
- Modify: `prototype/src/components/nativeComputerScene.js`
- Modify: `prototype/src/components/NativeComputerScene.jsx`
- Modify: `prototype/scripts/verify-3d.mjs`
- Modify: `prototype/src/styles.css`

**Interfaces:**
- Extends controller behavior; public controller signature stays unchanged.
- Produces DOM labels: `.native-bus-label[data-bus-label="..."]`
- Produces failure callback on `webglcontextlost`.

- [ ] **Step 1: Add interaction assertions to `verify-3d.mjs`**

After switching to automatic mode, add:

```js
await page.getByRole("button", { name: "X-ray" }).click();
check("X-ray toggles on", await page.getByRole("button", { name: /X-ray/ }).getAttribute("aria-pressed") === "true");
check("Native bus labels exist", await page.locator(".native-bus-label").count() >= 4);
check("Canvas exposes native part picking", await canvas.getAttribute("data-part-picking") === "enabled");

const bounds = await canvas.boundingBox();
await page.mouse.move(bounds.x + bounds.width * 0.55, bounds.y + bounds.height * 0.45);
await page.mouse.down();
await page.mouse.move(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.45, { steps: 8 });
await page.mouse.up();
await page.mouse.wheel(0, -240);
check("Orbit rotation and zoom update the camera", await canvas.getAttribute("data-camera-changed") === "true");

const beforeCanvas = await page.locator(".computer-exploded canvas").count();
await page.getByRole("button", { name: /返回课程首页/ }).click();
await page.getByRole("button").filter({ hasText: "认识计算机五大部件" }).last().click();
await page.waitForSelector('.computer-exploded[data-renderer="native-three"]');
check("Re-entry creates one canvas", beforeCanvas === 1 && await page.locator(".computer-exploded canvas").count() === 1);

await page.locator(".computer-exploded canvas").evaluate((element) => {
  element.dispatchEvent(new Event("webglcontextlost", { cancelable: true }));
});
await page.locator(".computer-exploded-fallback").waitFor({ state: "visible", timeout: 10_000 });
check("Context loss switches to fallback", await page.locator(".computer-exploded-fallback").isVisible());
```

- [ ] **Step 2: Run browser QA and verify RED**

Run: `npm run qa:3d`

Expected: FAIL because native labels and picking metadata do not exist yet.

- [ ] **Step 3: Add buses, shared particles, labels, and material state**

Add the required imports in `nativeComputerScene.js`:

```js
import {
  CylinderGeometry,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Quaternion,
  SphereGeometry,
  Vector3,
} from "three";
import { CONNECTIONS, getConnectionEndpoint } from "./computerParts.js";
import { screenPointFromNdc } from "./nativeComputerSceneState.js";
```

Then implement these behaviors in the controller:

- Create one shared unit `CylinderGeometry` for all buses and one shared `SphereGeometry` for all particles.
- Create bus meshes from `CONNECTIONS`; orient them with `Quaternion.setFromUnitVectors(new Vector3(0, 1, 0), direction)` and scale Y to length.
- Clone per-part materials once and retain `{ base, xray, highlighted }` variants in mesh user data.
- In `setViewState`, select the correct material variant and set bus material `depthTest=false` while X-ray is enabled.
- Add one absolutely positioned `.native-bus-label` element per unique bus label to a `.native-bus-label-layer` child of the container.
- Project each visible label midpoint using `Vector3.project(camera)` and `screenPointFromNdc`; hide it when outside clip depth.
- Update particle positions with `(elapsed * speed + index / count) % 1`; do not allocate vectors inside the frame loop.

Use these material constructors:

```js
const xrayMaterial = new MeshStandardMaterial({
  color: baseMaterial.color,
  metalness: baseMaterial.metalness,
  roughness: baseMaterial.roughness,
  transparent: true,
  opacity: 0.22,
  depthWrite: false,
});
const highlightMaterial = baseMaterial.clone();
highlightMaterial.emissive.set("#ffa726");
highlightMaterial.emissiveIntensity = 0.5;
```

Mark the renderer canvas after handlers are installed:

```js
renderer.domElement.dataset.partPicking = "enabled";
controls.addEventListener("change", () => {
  renderer.domElement.dataset.cameraChanged = "true";
});
```

- [ ] **Step 4: Add context loss and resize fallbacks**

In `nativeComputerScene.js`:

```js
function onContextLost(event) {
  event.preventDefault();
  options.onFailure?.(new Error("WebGL context lost"));
}
renderer.domElement.addEventListener("webglcontextlost", onContextLost);

const resizeObserver = typeof ResizeObserver === "function"
  ? new ResizeObserver(resize)
  : null;
resizeObserver?.observe(container);
if (!resizeObserver) window.addEventListener("resize", resize);
```

Remove both listeners in the idempotent `dispose()` path.

Register Task 4 resources at creation time so the existing registry owns them:

```js
const busGeometry = registry.add(new CylinderGeometry(1, 1, 1, 8));
const particleGeometry = registry.add(new SphereGeometry(0.035, 8, 8));
const busMaterials = CONNECTIONS.map((connection) => registry.add(new MeshBasicMaterial({
  color: connection.color,
})));
const particleMaterials = [...new Set(CONNECTIONS.map((connection) => connection.color))]
  .map((color) => registry.add(new MeshBasicMaterial({ color })));
```

Add the label layer to the container and remove it during `dispose()`:

```js
const labelLayer = document.createElement("div");
labelLayer.className = "native-bus-label-layer";
container.append(labelLayer);

// inside dispose()
labelLayer.remove();
```

- [ ] **Step 5: Style the native label layer**

Add to `prototype/src/styles.css`:

```css
.native-bus-label-layer {
  inset: 0;
  pointer-events: none;
  position: absolute;
  z-index: 3;
}

.native-bus-label {
  background: rgba(8, 9, 10, 0.86);
  border: 1px solid currentColor;
  border-radius: 999px;
  font-size: 0.7rem;
  padding: 0.2rem 0.45rem;
  position: absolute;
  transform: translate(-50%, -50%);
  white-space: nowrap;
}
```

- [ ] **Step 6: Run unit and browser tests**

Run: `node --test src/components/nativeComputerSceneState.test.mjs`

Expected: all state tests pass.

Run: `npm run qa:3d`

Expected: all native scene, interaction, re-entry, and fallback checks pass; `pageErrors` and `fallbackPageErrors` remain empty.

- [ ] **Step 7: Commit complete native interactions**

```bash
git add prototype/src/components/nativeComputerScene.js prototype/src/components/NativeComputerScene.jsx prototype/scripts/verify-3d.mjs prototype/src/styles.css
git commit -m "feat: restore native 3D teaching interactions"
```

---

### Task 5: Remove Fiber/Drei and Make the 3D Budget Green

**Files:**
- Modify: `prototype/package.json`
- Modify: `prototype/package-lock.json`
- Create only if required by measured output: `prototype/vite.config.js`
- Modify: `prototype/scripts/verify-3d-budget.mjs`

**Interfaces:**
- Removes packages: `@react-three/fiber`, `@react-three/drei`
- Keeps package: `three`
- Produces a passing `npm run qa:3d-budget`

- [ ] **Step 1: Remove obsolete dependencies through npm**

Run: `npm uninstall @react-three/fiber @react-three/drei`

Expected: `package.json` and `package-lock.json` no longer contain root dependencies for Fiber/Drei.

- [ ] **Step 2: Confirm there are no source imports**

Run: `rg -n '@react-three/(fiber|drei)' src package.json package-lock.json`

Expected: no source or root dependency matches. Transitive lockfile matches are also expected to be absent after uninstall.

- [ ] **Step 3: Run the 3D budget**

Run: `npm run qa:3d-budget`

Expected: incremental gzip total is below `225280` bytes and every listed chunk is below `512000` bytes.

- [ ] **Step 4: Split Three.js only if a measured chunk remains above 500 KiB**

If Step 3 reports a Three.js chunk above `512000` bytes, create `prototype/vite.config.js`:

```js
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three/examples/")) return "three-controls";
          if (id.includes("node_modules/three/")) return "three-core";
          return undefined;
        },
      },
    },
  },
});
```

Run: `npm run qa:3d-budget`

Expected: each resulting chunk is below `512000` bytes and combined gzip remains below `225280` bytes. If `three-core` is still too large, do not raise limits; inspect imports with the manifest before changing architecture.

- [ ] **Step 5: Run production build and dependency tests**

Run: `npm test`

Expected: all tests pass with `0` failures.

Run: `npm run build`

Expected: build exits `0` without a `Some chunks are larger than 500 kB` warning.

- [ ] **Step 6: Commit dependency cleanup and budget result**

```bash
git add prototype/package.json prototype/package-lock.json prototype/vite.config.js prototype/scripts/verify-3d-budget.mjs
git commit -m "perf: remove Fiber and Drei from 3D runtime"
```

If `vite.config.js` was not required, omit it from `git add`.

---

### Task 6: Full Regression, Documentation, and Review

**Files:**
- Modify: `docs/remaining-work-prd.md`
- Modify only if verification reveals a real mismatch: files from Tasks 1-5

**Interfaces:**
- Produces a verified release candidate and updates P3-A status.

- [ ] **Step 1: Update the remaining-work status with measured numbers**

In `docs/remaining-work-prd.md`, replace P3-A with a completed entry containing the exact final uncompressed and gzip values printed by `qa:3d-budget`. Keep P3-B and release verification guidance intact.

- [ ] **Step 2: Run all unit and build gates**

Run in `prototype/`:

```powershell
npm test
npm run qa:assets
npm run qa:build-budget
npm run qa:3d-budget
```

Expected: every command exits `0`; tests report `0` failures; both build budgets print totals below their limits.

- [ ] **Step 3: Run browser regression gates**

Run in `prototype/`:

```powershell
npm run qa:3d
npm run qa:ui
```

Expected: both commands exit `0`, browser checks report no page errors, fallback remains usable, and only one canvas exists after re-entry.

- [ ] **Step 4: Inspect final production output and diff**

Run:

```powershell
git diff --check
git status --short
git diff --stat f5affa0..HEAD
```

Expected: no whitespace errors; only planned source, test, package, config, and documentation files are changed.

- [ ] **Step 5: Request independent code review**

Ask the reviewer to inspect controller lifecycle, resource ownership, pointer picking, context loss, manifest accounting, dependency removal, and all requirements in the approved design. Fix every Critical or Important finding with a focused failing test before proceeding.

- [ ] **Step 6: Commit final documentation or review fixes**

```bash
git add docs/remaining-work-prd.md
git commit -m "docs: record native 3D optimization results"
```

- [ ] **Step 7: Verify the final commit and clean worktree**

Run:

```powershell
git status --short
git log -1 --oneline
```

Expected: empty status output and the final optimization commit shown.
