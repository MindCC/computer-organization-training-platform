import { readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { brotliCompress, gzip, constants } from 'node:zlib';
const br = promisify(brotliCompress), gz = promisify(gzip);
const root = path.resolve('dist');
let files = 0, original = 0, compressed = 0;
async function compress(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) { await compress(file); continue; }
    if (!/\.(js|css|html|svg|json|txt)$/.test(entry.name)) continue;
    const data = await readFile(file);
    if (data.length < 1024) continue;
    const [brotli, zipped] = await Promise.all([br(data, { params: { [constants.BROTLI_PARAM_QUALITY]: 9 } }), gz(data, { level: 9 })]);
    if (brotli.length >= data.length || zipped.length >= data.length) continue;
    await Promise.all([writeFile(`${file}.br`, brotli), writeFile(`${file}.gz`, zipped)]);
    files++; original += data.length; compressed += zipped.length;
  }
}
await compress(root);
console.log(`Precompressed ${files} text assets: ${original} → ${compressed} gzip bytes`);
