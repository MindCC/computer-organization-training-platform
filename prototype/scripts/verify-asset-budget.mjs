import assert from "node:assert/strict";
import { stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgets = [
  ["src/assets/alex-chen-avatar.webp", 40 * 1024],
  ["src/assets/hardware-assembly-workbench.webp", 150 * 1024],
  ["src/assets/lab-circuit-illustration.webp", 220 * 1024],
  ["src/assets/study-tip-carry-diagram.webp", 220 * 1024],
];

for (const [relativePath, maximumBytes] of budgets) {
  const file = await stat(path.join(root, relativePath));
  assert.ok(
    file.size <= maximumBytes,
    `${relativePath} exceeds ${maximumBytes} bytes`,
  );
  console.log(`${relativePath}: ${file.size} bytes`);
}
