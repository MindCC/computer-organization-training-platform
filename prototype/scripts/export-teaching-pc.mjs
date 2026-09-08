import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const bundled = path.join(root, 'qa-artifacts/blender-tools/blender-4.5.9-windows-x64/blender.exe');
const executable = process.env.BLENDER_BIN || (existsSync(bundled) ? bundled : 'blender');
const source = path.resolve(root, process.argv[2] || 'art-source/computer/teaching-pc-v2.blend');
if (!existsSync(source)) throw new Error(`Blender source does not exist: ${source}`);
const result = spawnSync(executable, ['--background', source, '--python-exit-code', '1', '--python', path.join(root, 'art-source/computer/export_teaching_pc.py')], { cwd: root, stdio: 'inherit', windowsHide: true });
if (result.error) console.error('Cannot run Blender. Set BLENDER_BIN to the Blender executable.', result.error.message);
process.exitCode = result.status ?? 1;
