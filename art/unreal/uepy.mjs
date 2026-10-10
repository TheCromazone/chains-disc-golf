#!/usr/bin/env node
// Run a Python file inside the running ChainsUnreal editor (game thread) via the project's job folder
// (~/Documents/ChainsUnreal/Saved/PyJobs, watched by ChainsUnreal/Content/Python/init_unreal.py).
//   node art/unreal/uepy.mjs <script.py> [--timeout 600]
// Prints the job's stdout and JSON result (set a global RESULT in the script); exits 1 on a Python error.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const file = process.argv[2];
if (!file) { console.error('usage: uepy.mjs <script.py> [--timeout s]'); process.exit(1); }
const ti = process.argv.indexOf('--timeout');
const timeout = (ti > 0 ? Number(process.argv[ti + 1]) : 900) * 1000;
const dir = path.join(os.homedir(), 'Documents/ChainsUnreal/Saved/PyJobs');
const name = `${Date.now()}_${path.basename(file, '.py').replace(/[^\w-]/g, '_')}`;
const out = path.join(dir, `${name}.out.json`);
fs.writeFileSync(path.join(dir, `${name}.py.tmp`), fs.readFileSync(file));
fs.renameSync(path.join(dir, `${name}.py.tmp`), path.join(dir, `${name}.py`));
const t0 = Date.now();
while (!fs.existsSync(out)) {
  if (Date.now() - t0 > timeout) { console.error(`timeout waiting for ${out}`); process.exit(3); }
  await new Promise((r) => setTimeout(r, 250));
}
const res = JSON.parse(fs.readFileSync(out, 'utf8'));
if (res.output) process.stdout.write(res.output);
if (res.result !== undefined) console.log(JSON.stringify(res.result, null, 1));
if (!res.ok) { console.error(res.error); process.exit(1); }
console.error(`[uepy] ${name} ok in ${(res.finished - res.started).toFixed(1)}s`);
