'use strict';
/* Phiếu xoay (app.js · TILT, từ 1.0.5) — các lỗi bản rà soát độc lập 17/10 tìm ra:
   · kéo / hất thật mạnh không bao giờ quá giới hạn + 22° (trước: kéo 900 px → ~113°, vé dựng cạnh rồi lộ mặt ngược)
   · nhả chuột mà mất pointerup (đổi cửa sổ, hộp thoại) → không kẹt ở trạng thái kéo
   · lắc gợi ý đúng một lần khi chưa chạm, rồi về dáng nghỉ
   Chạy cả WebGL (?tk3d=1) lẫn vé DOM nghiêng CSS (?tk3d=0), desktop + mobile.  node test/rv_tilt.js */
const R = require('./rv_common');
const { vn } = R.H;

async function ticket(q, desk) {
  const t = R.H.backend(vn('2026-10-18', '08:15'));
  const page = await R.open(t, desk ? R.DESK : R.MOB, 'tilt-' + q + (desk ? 'd' : 'm'), { noGoto: true });
  await page.goto(R.server.url + '?tk3d=' + q);
  await R.login(page, 'duc nam', '0001', desk);
  await page.waitForSelector('.pg-book');
  for (const [d, h] of [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]) { await R.cell(page, d, h); await R.sleep(250); }
  await R.tap(page, desk ? '#cta' : '#ctaM');
  await page.waitForSelector('.pg-tk');
  return page;
}
/* theo dõi góc mỗi khung trong ms mili giây → {maxY, maxP} */
const watch = (page, ms) => page.evaluate(ms => new Promise(res => {
  const T = window.__lt.tilt, t0 = performance.now(); let mY = 0, mP = 0;
  (function f() { mY = Math.max(mY, Math.abs(T.y)); mP = Math.max(mP, Math.abs(T.p)); if (performance.now() - t0 < ms) requestAnimationFrame(f); else res({ maxY: mY, maxP: mP }); })();
}), ms);
const box = (page, desk) => page.evaluate(d => { const r = document.querySelector(d ? '#tkW' : '#tkT').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }, desk);
const lim = (page) => page.evaluate(() => innerWidth >= 960 ? { dy: 38, dp: 24 } : { dy: 34, dp: 26 });

(async () => {
  await R.start();
  for (const q of ['1', '0']) {
    /* ── desktop: hint, kéo cực mạnh, hất, mất pointerup */
    {
      const page = await ticket(q, true), L = await lim(page);
      await page.mouse.move(2, 2);
      const h = await watch(page, 6500);   /* lắc gợi ý ~3,6 s sau khi vào phiếu */
      R.ok('[tk3d=' + q + '] desktop: chưa chạm → lắc gợi ý một lần (≈ 9°), không quá giới hạn', h.maxY > 2 && h.maxY < 12, h);
      const st0 = await page.evaluate(() => ({ y: window.__lt.tilt.y, raf: window.__lt.tilt.raf }));
      R.ok('[tk3d=' + q + '] … rồi về dáng nghỉ', Math.abs(st0.y) < .05, st0);
      const b = await box(page, true), cx = b.x + b.w / 2, cy = b.y + b.h / 2;
      await page.mouse.move(cx, cy); await page.mouse.down();
      const w1 = watch(page, 1600);
      await page.mouse.move(cx + 900, cy - 500, { steps: 12 });
      await page.mouse.move(cx - 900, cy + 500, { steps: 6 });
      await page.mouse.up();
      const m1 = await w1;
      R.ok('[tk3d=' + q + '] desktop: kéo ±900 px rồi hất → góc tối đa ' + m1.maxY.toFixed(1) + '° / ' + m1.maxP.toFixed(1) + '° (≤ ' + (L.dy + 22) + '° / ' + (L.dp + 22) + '°: không dựng cạnh, không lật)',
        m1.maxY <= L.dy + 22 + .01 && m1.maxP <= L.dp + 22 + .01, m1);
      await page.mouse.move(2, 2);
      await page.waitForFunction(() => { const T = window.__lt.tilt; return !T.raf && Math.abs(T.y) < .05 && Math.abs(T.p) < .05; }, null, { timeout: 8000 }).catch(() => {});
      const st1 = await page.evaluate(() => ({ y: window.__lt.tilt.y, p: window.__lt.tilt.p, raf: window.__lt.tilt.raf, cls: document.querySelector('#tkfit').className }));
      R.ok('[tk3d=' + q + '] … thả ra thì lò xo về dáng nghỉ, hết vòng vẽ, vé DOM hết class .tilt', !st1.raf && Math.abs(st1.y) < .05 && !/\btilt\b/.test(st1.cls), st1);
      /* mất pointerup: nhấn trên vé, kéo, rồi di chuột với nút đã nhả (buttons = 0) */
      await page.mouse.move(cx, cy); await page.mouse.down(); await page.mouse.move(cx + 60, cy, { steps: 4 });
      await page.evaluate(([x, y]) => { const st = document.querySelector('.pg-tk .tk-stage'); st.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y, buttons: 0 })); }, [cx + 80, cy]);
      const dr = await page.evaluate(() => !!window.__lt.tilt.drag);
      R.ok('[tk3d=' + q + '] desktop: nút chuột đã nhả mà mất pointerup → thôi kéo (không kẹt)', !dr, { drag: dr });
      await page.mouse.up();
      await page.close();
    }
    /* ── mobile: vuốt ngang mạnh */
    {
      const page = await ticket(q, false), L = await lim(page);
      const b = await box(page, false), cx = b.x + b.w / 2, cy = b.y + b.h / 3;
      const w = watch(page, 1600);
      await page.evaluate(([cx, cy]) => {
        const st = document.querySelector('.pg-tk .tk-stage'), ev = (type, x, y) => st.dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: 7, pointerType: 'touch', isPrimary: true, clientX: x, clientY: y, buttons: type === 'pointerup' ? 0 : 1 }));
        ev('pointerdown', cx, cy); let i = 0;
        return new Promise(res => { (function f() { i++; ev('pointermove', cx + i * 40, cy); if (i < 12) requestAnimationFrame(f); else { ev('pointerup', cx + i * 40, cy); res(); } })(); });
      }, [cx, cy]);
      const m = await w;
      R.ok('[tk3d=' + q + '] mobile: vuốt ngang 480 px rồi hất → góc tối đa ' + m.maxY.toFixed(1) + '° (≤ ' + (L.dy + 22) + '°)', m.maxY <= L.dy + 22 + .01 && m.maxY > 20, m);
      await page.waitForFunction(() => { const T = window.__lt.tilt; return !T.raf && Math.abs(T.y) < .05; }, null, { timeout: 8000 }).catch(() => {});
      const s = await page.evaluate(() => ({ y: window.__lt.tilt.y, raf: window.__lt.tilt.raf, over: document.documentElement.scrollWidth - innerWidth }));
      R.ok('[tk3d=' + q + '] mobile: về dáng nghỉ, không tràn ngang', !s.raf && Math.abs(s.y) < .05 && s.over <= 0, s);
      await page.close();
    }
  }
  R.ok('0 lỗi console / pageerror', R.ERRS.length === 0, R.ERRS);
  await R.stop();
})().catch(e => { console.error(e); process.exit(2); });
