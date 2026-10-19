/* In ra đoạn script deploy Worker để dán vào Console của tab dash.cloudflare.com (đã đăng nhập).
   CHỈ deploy khi chủ studio đồng ý rõ ràng cho lần deploy đó. Commit phải đã nằm trên GitHub (script tải module từ raw ở đúng commit
   và so SHA-256 với bản tính ở đây từ git).
     node tools/worker_deploy_snippet.mjs <commit> > /tmp/deploy.js
   Sau deploy: kết quả 'OK etag=… | 5 binding | cron=* * * * *', rồi lt_ping ở tab booking.b0dy.studio (pending 0). */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
const commit = execFileSync('git', ['rev-parse', process.argv[2] || 'HEAD']).toString().trim();
const MODS = ['index.js', 'booking.js', 'core.js', 'crypto.js', 'http.js', 'sheets.js', 'live.js'];
const EXP = {};
for (const m of MODS) EXP[m] = crypto.createHash('sha256').update(execFileSync('git', ['show', commit + ':worker/src/' + m])).digest('hex');
const tpl = `/* Chạy trong tab dash.cloudflare.com (đã đăng nhập) — CHỈ sau khi chủ studio đồng ý deploy Worker.
   Commit __COMMIT__ · SHA-256 tính từ git (tools/worker_deploy_snippet.mjs).
   Trả về chuỗi tóm tắt, không in dữ liệu nhạy cảm. */
(async () => {
  const COMMIT = '__COMMIT__', ACCT = location.pathname.split('/')[1], NAME = 'b0dy-booking-api';
  const EXP = __EXP__;
  const hex = b => Array.from(new Uint8Array(b)).map(x => x.toString(16).padStart(2, '0')).join('');
  const mods = {};
  for (const m of Object.keys(EXP)) {
    const r = await fetch('https://raw.githubusercontent.com/quangvinh376/b0dy-booking/' + COMMIT + '/worker/src/' + m, { cache: 'no-store' });
    if (!r.ok) return 'TAI_LOI ' + m + ' ' + r.status;
    const buf = await r.arrayBuffer(), h = hex(await crypto.subtle.digest('SHA-256', buf));
    if (h !== EXP[m]) return 'SHA_LECH ' + m + ' ' + h.slice(0, 12);
    mods[m] = buf;
  }
  if (!/^[0-9a-f]{32}$/.test(ACCT)) return 'MO_TAB_DASH_CUA_ACCOUNT';
  const H = { 'x-atok': window.bootstrap.atok };
  const base = '/api/v4/accounts/' + ACCT + '/workers/scripts/' + NAME;
  const cur = await (await fetch(base + '/settings', { headers: H })).json();
  if (!cur.success) return 'DOC_SETTINGS_LOI';
  const keep = (cur.result.bindings || []).filter(b => b.type === 'plain_text' || b.type === 'durable_object_namespace')
    .map(b => b.type === 'plain_text' ? { type: 'plain_text', name: b.name, text: b.text } : { type: 'durable_object_namespace', name: b.name, class_name: b.class_name });
  const names = keep.map(b => b.type + ':' + b.name).sort().join(',');
  if (names !== 'durable_object_namespace:BOOK,plain_text:ALLOW_ORIGINS,plain_text:BA_ID,plain_text:OUT_ID') return 'BINDING_KHAC ' + names;
  const meta = { main_module: 'index.js', compatibility_date: '2026-09-15', bindings: keep, keep_bindings: ['secret_text'],
    observability: { enabled: true, head_sampling_rate: 1, logs: { enabled: true, head_sampling_rate: 1, persist: true, invocation_logs: true } } };
  const fd = new FormData();
  fd.append('metadata', new Blob([JSON.stringify(meta)], { type: 'application/json' }));
  for (const m of Object.keys(mods)) fd.append(m, new Blob([mods[m]], { type: 'application/javascript+module' }), m);
  const put = await (await fetch(base, { method: 'PUT', headers: H, body: fd })).json();
  if (!put.success) return 'PUT_LOI ' + JSON.stringify(put.errors).slice(0, 300);
  const st = await (await fetch(base + '/settings', { headers: H })).json();
  const sc = await (await fetch(base + '/schedules', { headers: H })).json();
  const bn = (st.result.bindings || []).map(b => b.type + ':' + b.name).sort().join(',');
  const cr = ((sc.result && sc.result.schedules) || []).map(s => s.cron).join(',');
  return 'OK etag=' + String(put.result && put.result.etag || '').slice(0, 10) + ' | ' + bn + ' | cron=' + cr;
})()
`;
process.stdout.write(tpl.replaceAll('__COMMIT__', commit).replace('__EXP__', JSON.stringify(EXP)));
