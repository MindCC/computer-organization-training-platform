import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifestPath = path.join(root, "dist/.vite/manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entryKey = Object.keys(manifest).find((key) => manifest[key].isEntry);

assert.ok(entryKey, "production entry was not found in the Vite manifest");

const initialFiles = new Set();
const visitedChunks = new Set();

function collectStaticJavaScript(key) {
  if (visitedChunks.has(key)) return;
  visitedChunks.add(key);
  const chunk = manifest[key];
  assert.ok(chunk, `manifest chunk ${key} was not found`);
  if (chunk.file.endsWith(".js")) initialFiles.add(chunk.file);
  for (const dependency of chunk.imports ?? []) collectStaticJavaScript(dependency);
}

collectStaticJavaScript(entryKey);

const fileSizes = await Promise.all([...initialFiles].map(async (file) => ({
  file,
  bytes: (await stat(path.join(root, "dist", file))).size,
})));
const initialBytes = fileSizes.reduce((total, item) => total + item.bytes, 0);
const maximumEntryBytes = 500 * 1024;

assert.ok(
  initialBytes <= maximumEntryBytes,
  `initial JavaScript is ${initialBytes} bytes across ${fileSizes.length} static files; budget is ${maximumEntryBytes} bytes`,
);

for (const item of fileSizes) console.log(`${item.file}: ${item.bytes} bytes`);
console.log(`initial JavaScript total: ${initialBytes} bytes`);
