import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
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
  try {
    await mkdir(path.join(root, "assets"));
    await writeFile(path.join(root, "assets", "overview.js"), "abc".repeat(500));
    const manifest = { overview: { file: "assets/overview.js" } };
    const [result] = await measureChunks({ root, manifest, keys: ["overview"] });
    assert.equal(result.file, "assets/overview.js");
    assert.ok(result.bytes > 20);
    assert.ok(result.gzipBytes > 0);
    assert.ok(result.gzipBytes < result.bytes);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
