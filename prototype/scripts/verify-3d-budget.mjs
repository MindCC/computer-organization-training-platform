import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectStaticChunkKeys, measureChunks } from "./build-budget-helpers.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(root, "dist/.vite/manifest.json"), "utf8"));
const entryKey = "src/components/OverviewExplodedView.jsx";
assert.ok(manifest[entryKey], `3D entry ${entryKey} was not found`);

const chunks = await measureChunks({
  root: path.join(root, "dist"),
  manifest,
  keys: collectStaticChunkKeys(manifest, entryKey, { excludeEntries: true }),
});
const maxChunkBytes = 500 * 1024;
const maxGzipBytes = 220 * 1024;
const totalGzipBytes = chunks.reduce((total, chunk) => total + chunk.gzipBytes, 0);

for (const chunk of chunks) {
  console.log(`${chunk.file}: ${chunk.bytes} bytes, gzip ${chunk.gzipBytes} bytes`);
  assert.ok(chunk.bytes < maxChunkBytes, `${chunk.file} exceeds the 3D chunk budget`);
}
console.log(`incremental 3D gzip total: ${totalGzipBytes} bytes`);
assert.ok(totalGzipBytes < maxGzipBytes, `3D gzip total ${totalGzipBytes} exceeds ${maxGzipBytes}`);
