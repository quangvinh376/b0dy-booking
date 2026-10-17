/* Kiểm b0b.js trên Chromium (swiftshader, không mạng):
   1. Khung tĩnh (giảm chuyển động) của observe/greet/doubt/sleep đặt cạnh ảnh tham chiếu WebP, đo độ lệch điểm ảnh.
   2. Giảm chuyển động: không vẽ liên tục.
   3. Chuyển động sống: số khung idle (~30 fps), nhìn theo con trỏ (~60 fps), thời gian JS mỗi khung.
   4. Đổi tâm trạng, gật / chớp / liếc, ẩn host thì ngừng vẽ.
   5. Không WebGL → ảnh dự phòng đúng tâm trạng. Mất context → dự phòng, khôi phục → về WebGL.
   6. 0 lỗi console / pageerror.
   Ảnh ra thư mục OUT (scratchpad). Chạy: node test/b0b_check.js */
'use strict';
const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');
const { execFileSync } = require('child_process');

const OUT = process.env.B0B_OUT || '/tmp/claude-0/-home-claude/aacecc6b-f573-51ba-b532-f34e18112e07/scratchpad/b0b_check';
const DEMO = 'file://' + path.resolve(__dirname, 'b0b_demo.html');
const EXE = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const ARGS = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const MOODS = ['observe', 'greet', 'done', 'doubt', 'sleep', 'alert'];
const REF = ['observe', 'greet', 'doubt', 'sleep'];

let pass = 0, fail = 0;
function ok(label, cond, extra) {
  if (cond) { pass++; console.log('  PASS  ' + label); }
  else { fail++; console.log('  FAIL  ' + label + (extra !== undefined ? '  ' + JSON.stringify(extra).slice(0, 400) : '')); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: EXE, args: ARGS });
  const errors = [];
  async function open(opts, init, q) {
    const ctx = await browser.newContext(Object.assign({ viewport: { width: 1200, height: 1500 }, deviceScaleFactor: 2 }, opts || {}));
    if (init) await ctx.addInitScript(init);
    const page = await ctx.newPage();
    await page.route(/^https?:/, r => r.abort());
    page.on('pageerror', e => errors.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
    await page.goto(DEMO + (q || ''));
    await page.evaluate(() => document.fonts.ready);
    return { ctx, page };
  }
  const stats = (page, expr) => page.evaluate(expr);

  console.log('\n== 1–2. Khung tĩnh so ảnh tham chiếu · giảm chuyển động ==');
  {
    const { ctx, page } = await open({ reducedMotion: 'reduce' }, null, '?lite');
    ok('B0B.supported (WebGL1 + OES_standard_derivatives)', await page.evaluate(() => B0B.supported === true));
    ok('B0B.moods đủ 6 tâm trạng', JSON.stringify(await page.evaluate(() => B0B.moods)) === JSON.stringify(MOODS));
    await page.evaluate(refs => { window.CMP = DEMO.compare(refs); }, REF);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#cmp img')).every(i => i.complete && i.naturalWidth > 0));
    await sleep(500);
    for (const m of REF) {
      await (await page.$('#pair-' + m)).screenshot({ path: OUT + '/pair_' + m + '.png' });
      await (await page.$('#live-' + m)).screenshot({ path: OUT + '/live_' + m + '.png' });
      await (await page.$('#ref-' + m)).screenshot({ path: OUT + '/ref_' + m + '.png' });
    }
    const d1 = await stats(page, () => Object.values(CMP).map(b => b._stats.draws));
    await sleep(1500);
    const d2 = await stats(page, () => Object.values(CMP).map(b => b._stats.draws));
    ok('Giảm chuyển động: vẽ 1–3 khung rồi đứng yên', d1.every((v, i) => d2[i] === v && v >= 1 && v <= 3), { d1, d2 });
    await page.evaluate(() => { const b = CMP.observe; b.look(1, 0, 400); });
    await sleep(120);
    const d3 = await stats(page, () => CMP.observe._stats.draws);
    await sleep(700);
    const d4 = await stats(page, () => CMP.observe._stats.draws);
    ok('Giảm chuyển động: look() vẽ ngay một khung + một khung khi hết giữ', d3 === d2[0] + 1 && d4 === d2[0] + 2, { before: d2[0], d3, d4 });
    await ctx.close();
    const g = await open({ reducedMotion: 'reduce' });
    await sleep(500);
    await g.page.screenshot({ path: OUT + '/grid_rm.png', fullPage: true });
    await (await g.page.$('#grid')).screenshot({ path: OUT + '/grid_rm_moods.png' });
    await g.ctx.close();
  }
  try {
    const r = execFileSync('python3', ['-I', '-c', `
import sys, json
from PIL import Image, ImageChops, ImageStat
out = sys.argv[1]; res = {}
for m in ${JSON.stringify(REF)}:
    a = Image.open(f'{out}/live_{m}.png').convert('RGB'); b = Image.open(f'{out}/ref_{m}.png').convert('RGB').resize(a.size)
    d = ImageChops.difference(a, b).convert('L')
    st = ImageStat.Stat(d); hist = d.histogram(); n = sum(hist)
    big = sum(hist[40:]) / n
    res[m] = {'mean': round(st.mean[0], 2), 'px_over_40': round(big * 100, 2)}
    W = a.size[0]; sheet = Image.new('RGB', (W * 3 + 16, W), (250, 250, 250))
    sheet.paste(a, (0, 0)); sheet.paste(b, (W + 8, 0)); sheet.paste(d.point(lambda v: min(255, v * 4)).convert('RGB'), (2 * W + 16, 0))
    sheet.save(f'{out}/cmp_{m}.png')
print(json.dumps(res))
`, OUT]).toString().trim();
    const diff = JSON.parse(r);
    console.log('  diff vs ref:', r);
    for (const m of REF) ok('Khớp ảnh tham chiếu · ' + m + ' (lệch TB < 6/255, < 3% điểm lệch > 40)', diff[m].mean < 6 && diff[m].px_over_40 < 3, diff[m]);
  } catch (e) { ok('So ảnh tham chiếu chạy được', false, String(e).slice(0, 300)); }

  console.log('\n== 3–4. Chuyển động sống · thời gian khung · đổi tâm trạng ==');
  {
    /* DPR 1: swiftshader dựng phần mềm cả trang; ở DPR 2 chính khâu ghép trang kéo rAF của Chromium headless xuống ~24/s */
    const { ctx, page } = await open({ deviceScaleFactor: 1 }, null, '?lite');
    await page.mouse.move(5, 5);
    await sleep(600);
    /* đo trong trang: số khung B0B vẽ so với số nhịp rAF của chính trình duyệt trong cùng cửa sổ 2,5 s */
    const measure = track => page.evaluate(track => new Promise(res => {
      for (const b of DEMO.live) b._stats = { draws: 0, ms: 0 };
      let n = 0, i = 0; const t0 = performance.now();
      const f = () => { n++; if (performance.now() - t0 < 2500) requestAnimationFrame(f); }; requestAnimationFrame(f);
      const iv = track ? setInterval(() => { i++; dispatchEvent(new PointerEvent('pointermove', { pointerType: 'mouse', clientX: 80 + (i * 37) % 1000, clientY: 60 + (i * 23) % 700 })); }, 30) : 0;
      setTimeout(() => { clearInterval(iv); res({ raf: n / 2.5, s: DEMO.live.map(b => ({ fps: b._stats.draws / 2.5, ms: b._stats.ms / Math.max(1, b._stats.draws), w: b.w.track })) }); }, 2500);
    }), track);
    await sleep(2800);   /* hết hạn nhìn theo con trỏ (2,6 s) */
    const idle = await measure(false);
    console.log('  idle:', JSON.stringify(idle));
    ok('Idle: ~30 fps (≤ 36) và không vượt nhịp rAF', idle.s.every(x => x.fps >= 20 && x.fps <= 36 && x.fps <= idle.raf + .5), idle);
    const trk = await measure(true);
    console.log('  nhìn theo con trỏ:', JSON.stringify(trk));
    ok('Nhìn theo con trỏ: trọng số > 0,9 và vẽ mỗi nhịp rAF (60 fps khi máy cho)', trk.s.every(x => x.w > .9 && x.fps >= trk.raf * .9), trk);
    const all = idle.s.concat(trk.s), avgMs = all.reduce((a, x) => a + x.ms, 0) / all.length;
    ok('Thời gian JS trung bình mỗi khung < 1,5 ms', avgMs < 1.5, avgMs);
    const live = await page.$('.live');
    for (const m of MOODS.slice(1).concat(['observe'])) {
      await page.click('#btns button[data-mood="' + m + '"]');
      await sleep(220);
      await live.screenshot({ path: OUT + '/mood_' + m + '_mid.png' });
      await sleep(m === 'alert' ? 4900 : 1600);
      await live.screenshot({ path: OUT + '/mood_' + m + '_rest.png' });
      ok('Đổi tâm trạng → ' + m, await page.evaluate(x => DEMO.live.every(b => b.mood() === x), m));
    }
    const mk = await page.evaluate(() => {
      const b = DEMO.live[0]; const o = {};
      b.mood('done'); return new Promise(r => setTimeout(() => { o.done = +b.gA.getAttribute('opacity'); b.mood('observe'); setTimeout(() => { o.after = +b.gA.getAttribute('opacity'); o.prevGone = !b.gB.firstChild; r(o); }, 450); }, 1500));
    });
    ok('Dấu ✓ hiện đủ ở Xong, rồi tắt dần khi đổi tâm trạng', mk.done > .99 && mk.after === 0 && mk.prevGone, mk);
    await page.click('#nod'); await sleep(300); await live.screenshot({ path: OUT + '/react_nod.png' });
    await page.click('#blink'); await sleep(90); await live.screenshot({ path: OUT + '/react_blink.png' });
    await page.click('#glance'); await sleep(200); await live.screenshot({ path: OUT + '/react_glance.png' });
    const lk = await page.evaluate(() => { const b = DEMO.live[0], r = b.host.getBoundingClientRect(); b.lookAtPoint(r.left - 600, r.top - 120, 800); const a = { gx: b.poke.gx, gy: b.poke.gy }; b.lookAtPoint(r.left + r.width / 2, r.top + 900, 800); return { a, down: { gx: b.poke.gx, gy: b.poke.gy } }; });
    ok('lookAtPoint: trái-hơi-lên → gx < −0,8, gy âm nhẹ · thẳng xuống → gy > 0,8', lk.a.gx < -.8 && lk.a.gy < 0 && lk.a.gy > -.6 && Math.abs(lk.down.gx) < .05 && lk.down.gy > .8, lk);
    await page.evaluate(() => { document.getElementById('live100').style.display = 'none'; });
    await sleep(400);
    const h1 = await stats(page, () => DEMO.live[0]._stats.draws);
    await sleep(1200);
    const h2 = await stats(page, () => DEMO.live[0]._stats.draws);
    ok('Host bị ẩn → ngừng vẽ', h1 === h2, { h1, h2 });
    await page.evaluate(() => { document.getElementById('live100').style.display = ''; });
    await sleep(400);
    const h3 = await stats(page, () => DEMO.live[0]._stats.draws);
    ok('Hiện lại → vẽ tiếp', h3 > h2, { h2, h3 });
    await page.evaluate(() => { DEMO.live[1].pause(); });
    const p1 = await stats(page, () => DEMO.live[1]._stats.draws); await sleep(500);
    const p2 = await stats(page, () => DEMO.live[1]._stats.draws);
    await page.evaluate(() => { DEMO.live[1].resume(); }); await sleep(300);
    const p3 = await stats(page, () => DEMO.live[1]._stats.draws);
    ok('pause() / resume()', p1 === p2 && p3 > p2, { p1, p2, p3 });
    await page.screenshot({ path: OUT + '/grid_live.png', fullPage: true });

    /* mất context → dự phòng → khôi phục */
    await page.evaluate(() => { const b = DEMO.live[0]; window.__lc = b.G.gl.getExtension('WEBGL_lose_context'); window.__lc.loseContext(); });
    await sleep(300);
    const lost = await page.evaluate(() => { const b = DEMO.live[0]; return { img: !!b.img, src: b.img && b.img.getAttribute('src'), hidden: b.cv.style.visibility }; });
    ok('Mất context → ảnh dự phòng', lost.img && /b0b-quan-sat\.webp$/.test(lost.src) && lost.hidden === 'hidden', lost);
    await page.evaluate(() => { window.__lc.restoreContext(); });
    await sleep(500);
    const back = await page.evaluate(() => { const b = DEMO.live[0]; return { img: !!b.img, gl: !!b.G, vis: b.cv.style.visibility }; });
    ok('Khôi phục context → về WebGL', !back.img && back.gl && back.vis === '', back);
    const sz = await page.evaluate(() => { const b = DEMO.live[1]; b.setSize(72); return new Promise(r => setTimeout(() => r({ w: b.host.clientWidth, cw: b.cv.width, css: b.cssW }), 200)); });
    ok('setSize(72) → canvas theo cỡ mới (DPR 1: 72×1,5)', sz.w === 72 && sz.cw === 108 && sz.css === 72, sz);
    const ds = await page.evaluate(() => { const b = DEMO.live[1]; const host = b.host; b.destroy(); return { kids: host.childElementCount, dead: b.dead }; });
    ok('destroy() dọn sạch canvas/svg', ds.kids === 0 && ds.dead, ds);
    await ctx.close();
  }

  console.log('\n== 5. Không có WebGL → ảnh dự phòng ==');
  {
    const stub = () => {
      const g = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (t, o) { return /webgl/i.test(String(t)) ? null : g.call(this, t, o); };
    };
    const { ctx, page } = await open({}, stub);
    ok('B0B.supported = false', await page.evaluate(() => B0B.supported === false));
    const imgs = await page.evaluate(() => B0B.moods.map(m => { const h = document.querySelector('#cell-' + m + ' .h100'); const i = h.querySelector('img'); return [m, i ? i.getAttribute('src') : null, h.querySelectorAll('div').length]; }));
    const want = { observe: 'quan-sat', greet: 'chao', done: 'chao', doubt: 'nghi', sleep: 'ngu', alert: 'quan-sat' };
    ok('Mỗi tâm trạng đúng ảnh + 2 lớp bóng sàn CSS', imgs.every(([m, s, n]) => s === '../img/b0b-' + want[m] + '.webp' && n === 2), imgs);
    await page.waitForFunction(() => Array.from(document.querySelectorAll('#grid img')).every(i => i.complete && i.naturalWidth > 0));
    await sleep(1500);
    const mk = await page.evaluate(() => ['done', 'alert', 'sleep'].map(m => +DEMO.cells[m][0].gA.getAttribute('opacity')));
    ok('Dự phòng vẫn hiện dấu ✓ ! Z', mk.every(v => v > .2), mk);
    await page.evaluate(() => { DEMO.live[0].mood('doubt'); });
    await sleep(100);
    ok('Dự phòng đổi ảnh theo tâm trạng', /b0b-nghi\.webp$/.test(await page.evaluate(() => DEMO.live[0].img.getAttribute('src'))));
    await page.screenshot({ path: OUT + '/grid_fallback.png', fullPage: true });
    await ctx.close();
  }

  ok('0 lỗi console / pageerror', errors.length === 0, errors);
  await browser.close();
  console.log('\n' + pass + ' PASS, ' + fail + ' FAIL  ·  ảnh: ' + OUT);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
