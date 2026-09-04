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
