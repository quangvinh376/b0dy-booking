/* Chạy mọi test của Worker: node test/run_all.mjs */
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
const dir = path.dirname(fileURLToPath(import.meta.url));
let bad = 0;
for (const f of ['parity.mjs', 'concurrency.mjs', 'robust.mjs', 'http.mjs', 'realdata.mjs']) {
  const r = spawnSync(process.execPath, [path.join(dir, f)], { encoding: 'utf8' });
  const last = (r.stdout || '').trim().split('\n').slice(-2).join(' | ');
  console.log((r.status === 0 ? 'OK   ' : 'LỖI  ') + f.padEnd(16) + last);
  if (r.status !== 0) { bad++; console.log(r.stdout.split('\n').filter(l => /FAIL|DIFF|Error/.test(l)).join('\n')); console.log(r.stderr); }
}
process.exit(bad ? 1 : 0);
