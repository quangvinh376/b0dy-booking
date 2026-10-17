'use strict';
/* "Lưu về máy" = ảnh PNG của ĐÚNG vé đang hiện, vẽ bằng TK3D.snapshot() (canvas 2D, không cần WebGL). Giao diện thật + máy chủ giả,
   ?tk3d=0 (vé DOM phẳng). Kiểm:
   · desktop 1440×900 → ảnh vé ngang (#tkW) · mobile 393×764 @2x → ảnh vé dọc (#tkT); tên tệp giữ nguyên, 3× (cạnh ≤ 4096)
   · mobile: đi đường Web Share (navigator.share bị chặn để lấy tệp) · không có Web Share → tải về; desktop: tải về + toast
   · so ảnh tải về với ảnh chụp vé DOM CÙNG TỶ LỆ (đổi trang sang DPR 3 qua CDP, chụp đúng vùng ảnh, rồi trả lại DPR cũ):
     sai khác trung bình trên vé / trên vùng bóng, phân vị 99,9, sai khác sau làm mờ nhẹ (cấu trúc: thiếu / lệch chi tiết sẽ lộ ra),
     màu ô Acid, độ lệch dưới điểm ảnh từng vùng chữ / ô / mã vạch (Lucas–Kanade) → sai số vị trí chữ lớn nhất
   · các dạng phiếu: vừa đặt 3 buổi · thêm buổi (4 buổi) · đã đổi ("· MỚI") · 2 buổi + tên coach / hội viên rất dài
   · đổi desktop ↔ mobile rồi lưu → đúng loại vé (khoá ảnh có loại vé); quay lại → lại vé ngang
   · chụp lỗi → bản vẽ tay cũ (dự phòng); toBlob hỏng → toast lỗi cũ; 0 lỗi console / pageerror
   Ảnh so sánh (ảnh tải về | vé DOM | hiệu ×8 · phóng to các vùng) → PNG_CMP (mặc định SHOTS/png_cmp).
   node test/ui_png.js [desktop|mobile|switch|fallback|all] */
const R = require('./rv_common');
const fs = require('fs');
const path = require('path');
const { dateIn } = require('./gas_env');
const { vn } = R.H;
const OUT = process.env.PNG_CMP || path.join(process.env.SHOTS || path.join(require('os').tmpdir(), 'b0dy-rv-shots'), 'png_cmp');
const S3 = 3;   /* tỷ lệ ảnh lưu về máy (TK3D.snapshot mặc định) = tỷ lệ chụp vé DOM để so */
const r2 = x => Math.round(x * 100) / 100;
let ana, FAILS = 0;
const REPORT = [];
const ok = (label, cond, extra) => { if (!cond) FAILS++; R.ok(label, cond, extra); };

/* Web Share giả: giữ tệp lại để test đọc (mobile thật mở bảng chia sẻ) */
const SHARE = () => {
  window.__shared = [];
  Object.defineProperty(navigator, 'canShare', { configurable: true, value: d => !!(d && d.files && d.files.length) });
  Object.defineProperty(navigator, 'share', { configurable: true, value: d => new Promise((res, rej) => {
    const f = d.files[0], rd = new FileReader();
    rd.onload = () => { window.__shared.push({ name: f.name, type: f.type, size: f.size, title: d.title, data: String(rd.result).split(',')[1] }); res(); };
    rd.onerror = () => rej(rd.error); rd.readAsDataURL(f);
  }) });
};
/* hội viên tên dài + coach tên dài (dữ liệu bịa) */
function addLongMember(t) {
  const d = iso => dateIn('America/Los_Angeles', iso);
  t.files.BA.getSheetByName('MEMBERS').rows.push(['', '999', 'Nguyễn Hoàng Phương Bảo Ngọc', '48 buổi', 48, '1:2', 300000, 'Trương Nguyễn Thanh Phương', '0900000099', '', '', '', 0, 20,
    '', d('2026-07-01'), '', d('2027-03-01'), 'B999DY', 'Nguyễn Hoàng Phương Bảo Ngọc|2026-07-01']);
}
async function openPage(t, cfg, name, opt) {
  opt = opt || {};
  const page = await R.open(t, cfg, name, { noGoto: true, init: opt.share ? SHARE : undefined });
  await page.goto(R.server.url + '?tk3d=0');
  page._cfg = cfg;
  return page;
}
const isDesk = page => page.evaluate(() => innerWidth >= 960);
async function book(page, cells) {
  const desk = await isDesk(page);
  await page.waitForSelector('.pg-book');
  for (const [d, h] of cells) await R.cell(page, d, h);
  await R.tap(page, desk ? '#cta' : '#ctaM');
}
/* phiếu đã vào xong: trang phiếu đang hiện, hết nhịp vào (.in), số buổi đếm xong */
async function settled(page, re) {
  await page.waitForFunction(re => {
    const S = window.__lt && window.__lt.S, pg = S && S.page; if (!pg || !pg.classList.contains('pg-tk') || S.view !== 'ticket') return false;
    const h1 = pg.querySelector('h1'); if (re && !(h1 && new RegExp(re, 'i').test(h1.textContent))) return false;
    const tk = pg.querySelector(innerWidth >= 960 ? '#tkW' : '#tkT'), n = tk && tk.querySelector('.tk-big .num');
    return !!(tk && !tk.classList.contains('in') && n && n.textContent === n.getAttribute('data-n') && document.querySelectorAll('.page').length === 1);
  }, re || '', { timeout: 60000 });
  await R.sleep(300);
}
/* phiếu đứng yên trước khi đo / chụp: từ 1.0.5 vé nghiêng theo con trỏ + lắc gợi ý một lần (app.js · TILT). Ảnh lưu về là dáng NGHỈ
   → tắt lắc gợi ý, đưa con trỏ ra ngoài vé, chờ lò xo nghiêng về 0 (vé DOM hết class .tilt) rồi mới so. */
async function still(page) {
  await page.mouse.move(1, 1);
  await page.evaluate(() => { const L = window.__lt, T = L && L.tilt; if (T) { T.touched = true; T.hint = 0; T.hov = null; L.tiltKick(); } });
  await page.waitForFunction(() => { const T = window.__lt && window.__lt.tilt; return !T || (!T.raf && !T.drag && !document.querySelector('#tkfit.tilt')); }, null, { timeout: 15000 });
}
/* bấm "Lưu về máy" → { name, buf, via } (tải về / Web Share) */
async function save(page) {
  const shareOk = await page.evaluate(() => !!(window.__shared && navigator.canShare) && innerWidth < 960);
  if (shareOk) {
    const n0 = await page.evaluate(() => window.__shared.length);
    await R.tap(page, '[data-a="png"]');
    await page.waitForFunction(n0 => window.__shared.length > n0, n0, { timeout: 90000 });
    const s = await page.evaluate(() => window.__shared[window.__shared.length - 1]);
    return { name: s.name, buf: Buffer.from(s.data, 'base64'), via: 'share', type: s.type, title: s.title };
  }
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 90000 }), R.tap(page, '[data-a="png"]')]);
  return { name: dl.suggestedFilename(), buf: fs.readFileSync(await dl.path()), via: 'download' };
}
const pngWH = b => [b.readUInt32BE(16), b.readUInt32BE(20)];
const expName = page => page.evaluate(() => { const S = window.__lt.S; return 'b0dy-phieu-tuan-' + S.st.week.no + '-ban-' + S.st.mine.ver + '.png'; });

/* đọc hình học từ trang: vé DOM (3 điểm dò góc), ma trận ảnh (snapshot mới, cùng trạng thái), các vùng để dò lệch */
const geo = page => page.evaluate(() => {
  const desk = innerWidth >= 960, tk = window.__lt.S.page.querySelector(desk ? '#tkW' : '#tkT'), W = tk.offsetWidth, H = tk.offsetHeight;
  const pr = [[0, 0], [W, 0], [0, H]].map(q => {
    const i = document.createElement('i'); Object.assign(i.style, { position: 'absolute', left: q[0] + 'px', top: q[1] + 'px', width: '0px', height: '0px', margin: '0', padding: '0', border: '0' });
    tk.appendChild(i); const r = i.getBoundingClientRect(); i.remove(); return [r.left, r.top];
  });
  const t0 = performance.now(), cv = TK3D.snapshot(tk), ms = performance.now() - t0, meta = cv && cv.tkSnap, size = cv ? [cv.width, cv.height] : null;
  if (cv) cv.width = cv.height = 0;
  const sel = { num: '.tk-big .num', unit: '.tk-big .unit', wm: '.tk-wm', hdA: '.tk-name .a', hdB: '.tk-name .b', coach: '.tk-ppl .kv:nth-child(1) .v', member: '.tk-ppl .kv:nth-child(2) .v',
    pkgV: desk ? '.tk-pkg' : '.tk-ppl .kv:nth-child(3) .v', key: '.tk-ppl .kv .k', cellOn: '.mc.on', cellWas: '.mc.was', cellRing: '.mc:not(.on):not(.was):not(.off)', changes: '.tk-stat .v.big',
    h24: '.tk-stat .v.mid', statK: '.tk-stat .k', bc: '.bc', code: desk ? '.tk-code .lbl' : '.tkm-stub > .lbl', day: '.wk7 .d7 .b', dow: '.wk7 .d7 .a', hour: '.mg .hr', dowD: '.mg .hd7',
    list: '.tk-list span', listNew: '.tk-list span.new' };
  const win = {};
  for (const k in sel) { const e = tk.querySelector(sel[k]); if (!e) continue; const r = e.getBoundingClientRect(); if (r.width < 2) continue; win[k] = [r.left - 3, r.top - 3, r.right + 3, r.bottom + 3]; }
  const on = tk.querySelector('.mc.on'), ro = on && on.getBoundingClientRect();
  return { desk, id: tk.id, W, H, pr, ms, meta, size, win, acid: ro ? [ro.left + 2.5, ro.top + 3, ro.left + Math.min(9, ro.width / 6), ro.bottom - 3] : null, vw: innerWidth, vh: innerHeight,
    fontsOk: document.fonts.check('500 16px "SVN-Switzer"') && document.fonts.check('500 16px "JetBrains Mono"') };
});
const HIDE = '.tkp-top,.hd,.floor,.mbar,.bob,#bobD,.bob-m,#toast,.scrim';
const hideRest = (page, on) => page.evaluate(([sel, on]) => document.querySelectorAll(sel).forEach(e => on ? e.style.setProperty('visibility', 'hidden', 'important') : e.style.removeProperty('visibility')), [HIDE, on]);

/* chụp vé DOM ở DPR 3 (CDP), đúng vùng ảnh tải về (cắt theo khung nhìn) */
async function domAt3(page, png, g) {
  const cfg = page._cfg, cdp = await page._ctx.newCDPSession(page), mob = !!cfg.isMobile, vw = cfg.viewport.width, vh = cfg.viewport.height;
  const metrics = dpr => ({ width: vw, height: vh, screenWidth: vw, screenHeight: vh, deviceScaleFactor: dpr, mobile: mob,
    screenOrientation: mob ? { angle: 0, type: 'portraitPrimary' } : { angle: 0, type: 'landscapePrimary' } });
  await still(page);
  await hideRest(page, true);
  await cdp.send('Emulation.setDeviceMetricsOverride', metrics(S3));
  try {
    await page.waitForFunction(d => devicePixelRatio === d, S3);
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 400)))));
    let G = await geo(page), T = G.meta.T;
    /* điểm ảnh (i, j) của ảnh ↔ điểm ảnh thiết bị (i + ox, j + oy) của màn — lệch lẻ (vé đặt ở nửa px) → dời vé DOM bù lại */
    let ox = G.pr[0][0] * S3 - T[4], oy = G.pr[0][1] * S3 - T[5], fr = [ox - Math.round(ox), oy - Math.round(oy)];
    if (Math.abs(fr[0]) > .02 || Math.abs(fr[1]) > .02) {
      await page.evaluate(([dx, dy]) => { const f = window.__lt.S.page.querySelector('#tkfit'); f.style.translate = dx + 'px ' + dy + 'px'; }, [-fr[0] / S3, -fr[1] / S3]);
      await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 300)))));
      G = await geo(page); T = G.meta.T; ox = G.pr[0][0] * S3 - T[4]; oy = G.pr[0][1] * S3 - T[5];
    }
    const fr2 = [ox - Math.round(ox), oy - Math.round(oy)]; ox = Math.round(ox); oy = Math.round(oy);
    const [pw, ph] = pngWH(png);
    const x0 = Math.max(0, ox), y0 = Math.max(0, oy), x1 = Math.min(vw * S3, ox + pw), y1 = Math.min(vh * S3, oy + ph);
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png', clip: { x: x0 / S3, y: y0 / S3, width: (x1 - x0) / S3, height: (y1 - y0) / S3, scale: 1 } });
    /* vùng dò lệch + ô Acid: toạ độ ảnh tải về */
    const win = {}; for (const k in G.win) win[k] = G.win[k].map((v, i) => v * S3 - (i % 2 ? oy : ox));
    const acid = G.acid && G.acid.map((v, i) => v * S3 - (i % 2 ? oy : ox));
    return { dom: Buffer.from(shot.data, 'base64'), bx: x0 - ox, by: y0 - oy, ox, oy, frac: fr2, win, acid, T, g: G };
  } finally {
    await cdp.send('Emulation.setDeviceMetricsOverride', metrics(cfg.deviceScaleFactor || 1));
    await page.evaluate(() => { const f = window.__lt.S.page.querySelector('#tkfit'); if (f) f.style.translate = ''; });
    await hideRest(page, false);
    await page.waitForFunction(d => devicePixelRatio === d, cfg.deviceScaleFactor || 1);
    await cdp.detach();
  }
}

/* so trong trang trống: A = ảnh tải về, B = vé DOM (B(x − bx, y − by) ↔ A(x, y)) */
async function analyze(png, D, tag) {
  return ana.evaluate(async ({ a, b, bx, by, win, acid, T, W, H, tag }) => {
    async function load(s) {
      const im = new Image(); im.src = 'data:image/png;base64,' + s; await im.decode();
      const c = document.createElement('canvas'); c.width = im.width; c.height = im.height; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(im, 0, 0);
      const d = x.getImageData(0, 0, c.width, c.height).data, L = new Float32Array(c.width * c.height);
      for (let i = 0; i < L.length; i++) L[i] = .2126 * d[i * 4] + .7152 * d[i * 4 + 1] + .0722 * d[i * 4 + 2];
      return { w: c.width, h: c.height, d, L, c };
    }
    const A = await load(a), B = await load(b);
    const X0 = Math.max(0, bx), Y0 = Math.max(0, by), X1 = Math.min(A.w, bx + B.w), Y1 = Math.min(A.h, by + B.h), ow = X1 - X0, oh = Y1 - Y0;
    /* ảnh → toạ độ vé (nghịch đảo T) → trên giấy (± 4 px) hay vùng bóng / nền */
    const det = T[0] * T[3] - T[1] * T[2], I = [T[3] / det, -T[1] / det, -T[2] / det, T[0] / det];
    const onTk = (x, y) => { const u = x + .5 - T[4], v = y + .5 - T[5], lx = I[0] * u + I[2] * v, ly = I[1] * u + I[3] * v; return lx > -4 && ly > -4 && lx < W + 4 && ly < H + 4; };
    let st = 0, nt = 0, ss = 0, ns = 0, mx = 0, hist = new Uint32Array(256);
    const DL = new Float32Array(ow * oh), heat = new ImageData(ow, oh);
    for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
      const ia = (y * A.w + x) * 4, ib = ((y - by) * B.w + (x - bx)) * 4;
      const dd = Math.max(Math.abs(A.d[ia] - B.d[ib]), Math.abs(A.d[ia + 1] - B.d[ib + 1]), Math.abs(A.d[ia + 2] - B.d[ib + 2]));
      if (onTk(x, y)) { st += dd; nt++; } else { ss += dd; ns++; }
      if (dd > mx) mx = dd; hist[dd]++;
      const k = (y - Y0) * ow + (x - X0); DL[k] = A.L[y * A.w + x] - B.L[(y - by) * B.w + (x - bx)];
      const v = Math.min(255, dd * 8); heat.data[k * 4] = 255; heat.data[k * 4 + 1] = 255 - v; heat.data[k * 4 + 2] = 255 - v; heat.data[k * 4 + 3] = 255;
    }
    const N = nt + ns, pct = q => { let c = 0; for (let i = 0; i < 256; i++) { c += hist[i]; if (c >= q * N) return i; } return 255; };
    /* sai khác sau làm mờ Gauss σ = 1,5 điểm ảnh (bỏ khác biệt khử răng cưa, giữ khác biệt cấu trúc) */
    function blur(f, w, h, sg) {
      const R = Math.ceil(sg * 3), k = []; let t = 0; for (let i = -R; i <= R; i++) { k.push(Math.exp(-i * i / (2 * sg * sg))); t += k[k.length - 1]; } for (let i = 0; i < k.length; i++) k[i] /= t;
      const o1 = new Float32Array(w * h), o2 = new Float32Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let j = -R; j <= R; j++) { const xx = Math.min(w - 1, Math.max(0, x + j)); v += f[y * w + xx] * k[j + R]; } o1[y * w + x] = v; }
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = 0; for (let j = -R; j <= R; j++) { const yy = Math.min(h - 1, Math.max(0, y + j)); v += o1[yy * w + x] * k[j + R]; } o2[y * w + x] = v; }
      return o2;
    }
    const BD = blur(DL, ow, oh, 1.5); let bmx = 0, bat = null;
    for (let i = 0; i < BD.length; i++) if (Math.abs(BD[i]) > bmx) { bmx = Math.abs(BD[i]); bat = [X0 + i % ow, Y0 + Math.floor(i / ow)]; }
    /* lệch dưới điểm ảnh từng vùng (Lucas–Kanade lặp, nội suy song tuyến trên B) */
    const atB = (x, y) => { x -= bx; y -= by; x = Math.max(0, Math.min(B.w - 1.001, x)); y = Math.max(0, Math.min(B.h - 1.001, y)); const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, i = y0 * B.w + x0;
      return B.L[i] * (1 - fx) * (1 - fy) + B.L[i + 1] * fx * (1 - fy) + B.L[i + B.w] * (1 - fx) * fy + B.L[i + B.w + 1] * fx * fy; };
    function lk(r) {
      let dx = 0, dy = 0;
      for (let it = 0; it < 12; it++) {
        let a11 = 0, a12 = 0, a22 = 0, b1 = 0, b2 = 0;
        for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) {
          const gx = (atB(x + dx + 1, y + dy) - atB(x + dx - 1, y + dy)) / 2, gy = (atB(x + dx, y + dy + 1) - atB(x + dx, y + dy - 1)) / 2, e = atB(x + dx, y + dy) - A.L[y * A.w + x];
          a11 += gx * gx; a12 += gx * gy; a22 += gy * gy; b1 += gx * e; b2 += gy * e;
        }
        const dt = a11 * a22 - a12 * a12; if (Math.abs(dt) < 1e-6) break;
        const ux = -(a22 * b1 - a12 * b2) / dt, uy = -(a11 * b2 - a12 * b1) / dt; dx += ux; dy += uy;
        if (Math.abs(ux) < 1e-3 && Math.abs(uy) < 1e-3) break;
      }
      return [dx, dy];
    }
    const reg = {};
    for (const k in win) {
      const r = [Math.max(X0 + 2, Math.round(win[k][0])), Math.max(Y0 + 2, Math.round(win[k][1])), Math.min(X1 - 2, Math.round(win[k][2])), Math.min(Y1 - 2, Math.round(win[k][3]))];
      if (r[2] - r[0] < 4 || r[3] - r[1] < 4) continue;
      let m = 0, n = 0; for (let y = r[1]; y < r[3]; y++) for (let x = r[0]; x < r[2]; x++) { m += Math.abs(A.L[y * A.w + x] - atB(x, y)); n++; }
      reg[k] = { s: lk(r), mean: m / n, r };
    }
    /* màu ô Acid: trung bình RGB dải trái trong lòng ô (không chạm chữ giờ) */
    let col = null;
    if (acid) {
      const q = acid.map(Math.round), sa = [0, 0, 0], sb = [0, 0, 0]; let n = 0;
      for (let y = q[1]; y < q[3]; y++) for (let x = q[0]; x < q[2]; x++) { if (x < X0 || y < Y0 || x >= X1 || y >= Y1) continue; const ia = (y * A.w + x) * 4, ib = ((y - by) * B.w + (x - bx)) * 4; for (let c = 0; c < 3; c++) { sa[c] += A.d[ia + c]; sb[c] += B.d[ib + c]; } n++; }
      col = { png: sa.map(v => Math.round(v / n)), dom: sb.map(v => Math.round(v / n)), n };
    }
    /* ảnh so sánh: tổng thể (ảnh tải về | vé DOM | hiệu ×8, thu ½ nếu lớn) + phóng to 6 vùng (×2, điểm ảnh gốc) */
    const crop = (img, x, y, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, x, y, w, h, 0, 0, w, h); return c; };
    const hc = document.createElement('canvas'); hc.width = ow; hc.height = oh; hc.getContext('2d').putImageData(heat, 0, 0);
    const pa = crop(A.c, X0, Y0, ow, oh), pb = crop(B.c, X0 - bx, Y0 - by, ow, oh);
    const sc = ow * 3 > 4000 ? .5 : 1, gap = 12, wide = ow > oh;
    const side = document.createElement('canvas'), sw = Math.round(ow * sc), shh = Math.round(oh * sc);
    side.width = wide ? sw : sw * 3 + gap * 2; side.height = wide ? shh * 3 + gap * 2 : shh;
    const sx = side.getContext('2d'); sx.fillStyle = '#808080'; sx.fillRect(0, 0, side.width, side.height);
    [pa, pb, hc].forEach((c, i) => sx.drawImage(c, 0, 0, ow, oh, wide ? 0 : i * (sw + gap), wide ? i * (shh + gap) : 0, sw, shh));
    const zk = Object.keys(reg).filter(k => ['num', 'wm', 'member', 'cellOn', 'bc', 'listNew', 'day', 'code'].includes(k)).slice(0, 6), Z = 2, zs = [];
    zk.forEach(k => { const r = reg[k].r, w = Math.min(r[2] - r[0], 300), h = Math.min(r[3] - r[1], 120); zs.push({ k, x: r[0], y: r[1], w, h }); });
    const zoom = document.createElement('canvas'), zw = Math.max(1, ...zs.map(z => z.w)) * Z;
    zoom.width = zw * 3 + gap * 2; zoom.height = zs.reduce((s, z) => s + z.h * Z + gap, 0) || 1;
    const zx = zoom.getContext('2d'); zx.imageSmoothingEnabled = false; zx.fillStyle = '#808080'; zx.fillRect(0, 0, zoom.width, zoom.height);
    let zy = 0; zs.forEach(z => { [[A.c, z.x, z.y], [B.c, z.x - bx, z.y - by], [hc, z.x - X0, z.y - Y0]].forEach((s, i) => zx.drawImage(s[0], s[1], s[2], z.w, z.h, i * (zw + gap), zy, z.w * Z, z.h * Z)); zy += z.h * Z + gap; });
    return { size: [A.w, A.h], dom: [B.w, B.h], overlap: [ow, oh], meanTk: st / Math.max(1, nt), meanBg: ss / Math.max(1, ns), mean: (st + ss) / Math.max(1, N), max: mx, p99: pct(.99), p999: pct(.999),
      blurMax: bmx, blurAt: bat, reg: Object.fromEntries(Object.entries(reg).map(([k, v]) => [k, { dx: v.s[0], dy: v.s[1], mean: v.mean }])), col,
      side: side.toDataURL('image/png').split(',')[1], zoom: zoom.toDataURL('image/png').split(',')[1] };
  }, { a: png.toString('base64'), b: D.dom.toString('base64'), bx: D.bx, by: D.by, win: D.win, acid: D.acid, T: D.T, W: D.g.W, H: D.g.H, tag });
}

/* một phiếu: lưu → kiểm tệp → so với vé DOM ở 3× */
async function checkSave(page, tag, opt) {
  opt = opt || {};
  await still(page);
  const g0 = await geo(page), want = await expName(page), s = await save(page), [pw, ph] = pngWH(s.buf);
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, tag + '-download.png'), s.buf);
  ok(tag + ': lưu qua ' + s.via + ' · tên tệp ' + s.name + ' · ' + pw + '×' + ph + ' (vé ' + g0.id + ' ' + g0.W + '×' + g0.H + ')',
    s.name === want && (opt.via ? s.via === opt.via : true) && (s.via !== 'share' || (s.type === 'image/png' && s.title === 'Phiếu tập B0DY')), { name: s.name, want, via: s.via, type: s.type, title: s.title });
  ok(tag + ': đúng loại vé đang hiện (' + (g0.desk ? 'ngang #tkW' : 'dọc #tkT') + '), cùng cỡ với ảnh chụp mới (' + (g0.size || []).join('×') + '), 3×, cạnh ≤ 4096, phông đã nạp',
    g0.meta && g0.meta.v === (g0.desk ? 'd' : 'm') && g0.size && g0.size[0] === pw && g0.size[1] === ph && Math.abs(g0.meta.s - S3) < 1e-9 && Math.max(pw, ph) <= 4096 && (g0.desk ? pw > ph : ph > pw) && g0.fontsOk,
    { meta: g0.meta, size: g0.size, png: [pw, ph] });
  if (s.via === 'download' && g0.desk) {
    const tt = await page.evaluate(() => { const t = document.querySelector('#toast'); return t ? t.textContent : ''; });
    ok(tag + ': toast "Đã lưu ảnh phiếu."', /Đã lưu ảnh phiếu\./.test(tt), tt);
  }
  if (opt.noCompare) return { s, g0 };
  const D = await domAt3(page, s.buf, g0);
  fs.writeFileSync(path.join(OUT, tag + '-dom3x.png'), D.dom);
  /* ma trận vé → ảnh đo lại ở DPR 3 phải trùng ma trận ở DPR gốc (ảnh tải về) → căn đúng điểm ảnh */
  const dT = Math.max.apply(null, D.T.map((v, i) => Math.abs(v - g0.meta.T[i])));
  ok(tag + ': ma trận vé → ảnh ở DPR 3 trùng DPR ' + (page._cfg.deviceScaleFactor || 1) + ' (lệch ' + dT.toExponential(1) + ')', dT < 1e-3, { a: g0.meta.T, b: D.T });
  const F = await analyze(s.buf, D, tag);
  fs.writeFileSync(path.join(OUT, tag + '-side.png'), Buffer.from(F.side, 'base64'));
  fs.writeFileSync(path.join(OUT, tag + '-zoom.png'), Buffer.from(F.zoom, 'base64'));
  const regs = Object.entries(F.reg).map(([k, v]) => [k, Math.hypot(v.dx, v.dy) / S3, v]);
  const worst = regs.reduce((a, b) => (b[1] > a[1] ? b : a), ['-', 0]);
  const txt = regs.filter(r => !/^cell/.test(r[0]) && r[0] !== 'bc');
  const txtMax = txt.reduce((a, b) => Math.max(a, b[1]), 0);
  REPORT.push({ tag, png: [pw, ph], meanTk: r2(F.meanTk), meanBg: r2(F.meanBg), p999: F.p999, max: F.max, blurMax: r2(F.blurMax), txtPosMaxCss: r2(txtMax), worst: worst[0] + ' ' + r2(worst[1]), regions: regs.length, acid: F.col, ms: Math.round(g0.ms) });
  R.info(tag + ': vùng so ' + F.overlap.join('×') + ' điểm ảnh (vé DOM chụp ở DPR 3, lệch lẻ ' + D.frac.map(r2).join('/') + ')', { ox: D.ox, oy: D.oy, bx: D.bx, by: D.by });
  R.info(tag + ': lệch từng vùng (px CSS)', Object.fromEntries(regs.map(r => [r[0], r2(r[1])])));
  ok(tag + ': sai khác trung bình trên vé ' + r2(F.meanTk) + ' mức (≤ 1,5) · vùng bóng / nền ' + r2(F.meanBg) + ' mức (≤ 0,8) · p99,9 = ' + F.p999 + ' (≤ 64)',
    F.meanTk <= 1.5 && F.meanBg <= .8 && F.p999 <= 64, { meanTk: F.meanTk, meanBg: F.meanBg, p99: F.p99, p999: F.p999, max: F.max });
  ok(tag + ': làm mờ σ 1,5 điểm ảnh → sai khác lớn nhất ' + r2(F.blurMax) + ' mức (≤ 32: không thiếu / lệch chi tiết nào, chỉ khác khử răng cưa — màu sai / thứ tự vẽ sai cho 85–95)', F.blurMax <= 32, { blurMax: F.blurMax, at: F.blurAt });
  ok(tag + ': vị trí chữ lệch tối đa ' + r2(txtMax) + ' px CSS trên ' + txt.length + ' vùng chữ; mọi vùng (cả ô, mã vạch) ≤ ' + r2(worst[1]) + ' px (≤ 0,2)', txt.length >= 8 && worst[1] <= .2 && txtMax <= .2,
    Object.fromEntries(regs.map(r => [r[0], [r2(r[2].dx), r2(r[2].dy)]])));
  if (F.col) ok(tag + ': màu ô Acid ' + F.col.png.join(',') + ' ↔ DOM ' + F.col.dom.join(',') + ' (lệch ≤ 2 mỗi kênh)', F.col.png.every((v, i) => Math.abs(v - F.col.dom[i]) <= 2), F.col);
  if (opt.mustHave) opt.mustHave.forEach(k => ok(tag + ': có vùng "' + k + '" và trùng vị trí', !!F.reg[k] && Math.hypot(F.reg[k].dx, F.reg[k].dy) / S3 <= .2, F.reg[k]));
  return { s, g0, F };
}

async function deskFlow() {
  console.log('\n== desktop 1440×900 · ?tk3d=0 ==');
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await openPage(t, R.DESK, 'png-d');
  await R.login(page, 'duc nam', '0001', true);
  await book(page, [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]);
  await settled(page, 'đặt lịch');
  const fit = await page.evaluate(() => getComputedStyle(window.__lt.S.page.querySelector('#tkfit')).transform);
  ok('desktop 1440×900: vé ngang không bị thu cho vừa khung (--tks = 1) → so được đúng tỷ lệ', fit === 'none' || fit === 'matrix(1, 0, 0, 1, 0, 0)', fit);
  await checkSave(page, 'd-booked-3', { via: 'download', mustHave: ['num', 'wm', 'bc', 'cellOn', 'list', 'hour'] });
  /* thêm buổi → 4 buổi */
  await R.tap(page, '[data-a="tkdone"]');
  await settled(page, 'tuần');
  await R.tap(page, '[data-a="goadd"]');
  await book(page, [['2026-10-24', 10]]);
  await settled(page, 'thêm');
  await checkSave(page, 'd-added-4', { via: 'download' });
  /* giữa tuần: đổi T6 19:00 → T5 19:00 → phiếu "đã đổi" có "· MỚI" */
  t.clock.now = vn('2026-10-21', '09:30');
  await page.reload();
  await settled(page);
  await R.tap(page, '[data-a="gochg"]');
  await page.waitForSelector('.pg-chg');
  await R.cell(page, '2026-10-23', 19); await R.cell(page, '2026-10-22', 19);
  await R.tap(page, '#cta');
  await settled(page, 'đổi');
  await checkSave(page, 'd-changed', { via: 'download', mustHave: ['listNew', 'cellWas'] });
  await page._ctx.close();
}
async function deskLong() {
  console.log('\n== desktop · 2 buổi · tên coach / hội viên rất dài ==');
  const t = R.H.backend(vn('2026-10-18', '20:15')); addLongMember(t);
  const page = await openPage(t, R.DESK, 'png-dl');
  await R.login(page, 'phuong bao ngoc', '0099', true);
  await book(page, [['2026-10-20', 7], ['2026-10-24', 16]]);
  await settled(page, 'đặt lịch');
  const nm = await page.evaluate(() => [window.__lt.S.st.me.coach, window.__lt.S.st.me.short]);
  R.info('tên trên vé', nm);
  await checkSave(page, 'd-long-2', { via: 'download', mustHave: ['coach', 'member'] });
  await page._ctx.close();
}
async function mobFlow() {
  console.log('\n== mobile 393×764 @2x · ?tk3d=0 · Web Share ==');
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await openPage(t, R.MOB, 'png-m', { share: true });
  await R.login(page, 'duc nam', '0001', false);
  await book(page, [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]);
  await settled(page, 'đặt lịch');
  await checkSave(page, 'm-booked-3', { via: 'share', mustHave: ['num', 'wm', 'bc', 'cellOn', 'day', 'dow'] });
  await R.tap(page, '[data-a="tkdone"]');
  await settled(page, 'tuần');
  await R.tap(page, '[data-a="goadd"]');
  await book(page, [['2026-10-24', 10]]);
  await settled(page, 'thêm');
  await checkSave(page, 'm-added-4', { via: 'share' });
  t.clock.now = vn('2026-10-21', '09:30');
  await page.reload();
  await settled(page);
  await R.tap(page, '[data-a="gochg"]');
  await page.waitForSelector('.pg-chg');
  await R.cell(page, '2026-10-23', 19); await R.cell(page, '2026-10-22', 19);
  await R.tap(page, '#ctaM');
  await settled(page, 'đổi');
  await checkSave(page, 'm-changed', { via: 'share', mustHave: ['cellWas'] });
  await page._ctx.close();
}
async function mobLong() {
  console.log('\n== mobile · 2 buổi · tên rất dài · không có Web Share → tải về ==');
  const t = R.H.backend(vn('2026-10-18', '20:15')); addLongMember(t);
  const page = await openPage(t, R.MOB, 'png-ml');
  await R.login(page, 'phuong bao ngoc', '0099', false);
  await book(page, [['2026-10-20', 7], ['2026-10-24', 16]]);
  await settled(page, 'đặt lịch');
  await checkSave(page, 'm-long-2', { via: 'download', mustHave: ['coach', 'member'] });
  await page._ctx.close();
}
/* đổi desktop ↔ mobile rồi lưu: khoá ảnh có loại vé → đúng vé đang hiện */
async function switchFlow() {
  console.log('\n== đổi cỡ desktop → mobile → desktop rồi lưu ==');
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await openPage(t, R.DESK, 'png-sw');
  await R.login(page, 'duc nam', '0001', true);
  await book(page, [['2026-10-19', 18], ['2026-10-21', 18], ['2026-10-23', 19]]);
  await settled(page, 'đặt lịch');
  await R.sleep(4500);   /* để vòng chuẩn bị sẵn ảnh (4 s) vẽ xong ảnh desktop trước */
  const a = await checkSave(page, 'sw-desk', { noCompare: true, via: 'download' });
  await page.setViewportSize({ width: 393, height: 764 });
  await page.waitForFunction(() => { const tk = window.__lt.S.page.querySelector('#tkT'); return innerWidth < 960 && tk && tk.offsetWidth > 0 && tk.querySelector('.tk-paper path'); });
  await R.sleep(400);
  const b = await checkSave(page, 'sw-mob', { noCompare: true, via: 'download' });
  const [bw, bh] = pngWH(b.s.buf), [aw, ah] = pngWH(a.s.buf);
  ok('thu về 393 px rồi lưu → ảnh vé dọc ' + bw + '×' + bh + ' (không dùng lại ảnh vé ngang ' + aw + '×' + ah + ' đã có sẵn)', b.g0.id === 'tkT' && bh > bw && aw > ah && !a.s.buf.equals(b.s.buf), { a: [aw, ah], b: [bw, bh] });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => innerWidth >= 960 && window.__lt.S.page.querySelector('#tkW').offsetWidth > 0);
  await R.sleep(400);
  const c = await checkSave(page, 'sw-desk2', { noCompare: true, via: 'download' });
  const [cw, ch] = pngWH(c.s.buf);
  ok('mở lại 1440 px rồi lưu → lại ảnh vé ngang ' + cw + '×' + ch + ' (giống hệt lần đầu)', c.g0.id === 'tkW' && cw === aw && ch === ah && c.s.buf.equals(a.s.buf), { c: [cw, ch] });
  await page._ctx.close();
}
/* dự phòng: chụp lỗi → bản vẽ tay cũ; toBlob hỏng → toast lỗi cũ; trang không vỡ.
   Mỗi bước đổi loại vé (desktop ↔ mobile) để khoá ảnh đổi → buộc vẽ lại (ảnh chuẩn bị sẵn không che mất lỗi). */
async function fallbackFlow() {
  console.log('\n== dự phòng ==');
  const t = R.H.backend(vn('2026-10-18', '20:15'));
  const page = await openPage(t, R.DESK, 'png-fb');
  await R.login(page, 'duc nam', '0001', true);
  await book(page, [['2026-10-19', 18], ['2026-10-21', 18]]);
  await settled(page, 'đặt lịch');
  await page.evaluate(() => { window.__snap0 = TK3D.snapshot; TK3D.snapshot = () => { throw new Error('thử lỗi chụp'); }; });
  await page.setViewportSize({ width: 393, height: 764 });
  await page.waitForFunction(() => innerWidth < 960 && window.__lt.S.page.querySelector('#tkT').offsetWidth > 0);
  const s = await save(page), [w, h] = pngWH(s.buf);
  fs.mkdirSync(OUT, { recursive: true }); fs.writeFileSync(path.join(OUT, 'fallback-drawTicket.png'), s.buf);
  ok('TK3D.snapshot lỗi → vẫn lưu được ảnh (bản vẽ tay cũ ' + w + '×' + h + '), tên tệp giữ nguyên', s.via === 'download' && w === 1251 && h === 1608 && s.name === await expName(page), { w, h, name: s.name });
  await page.evaluate(() => { TK3D.snapshot = window.__snap0; HTMLCanvasElement.prototype.toBlob = function (cb) { setTimeout(() => cb(null), 0); }; });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => innerWidth >= 960 && window.__lt.S.page.querySelector('#tkW').offsetWidth > 0);
  await R.tap(page, '[data-a="png"]');
  await page.waitForFunction(() => { const t = document.querySelector('#toast'); return t && /Chưa tạo được ảnh\. Thử lại sau\./.test(t.textContent); }, null, { timeout: 30000 });
  ok('toBlob không ra ảnh → toast "Chưa tạo được ảnh. Thử lại sau.", trang vẫn chạy', await page.evaluate(() => !!document.querySelector('[data-a="png"]') && window.__lt.S.view === 'ticket'));
  await page._ctx.close();
}

(async () => {
  await R.start();
  ana = await R.browser.newPage();
  const only = process.argv[2] || 'all';
  const all = { desktop: async () => { await deskFlow(); await deskLong(); }, mobile: async () => { await mobFlow(); await mobLong(); }, switch: switchFlow, fallback: fallbackFlow };
  process.on('unhandledRejection', e => { console.error(e); process.exit(2); });
  for (const k of Object.keys(all)) if (only === 'all' || only.split(',').indexOf(k) >= 0) await all[k]();
  if (REPORT.length) {
    console.log('\n  ẢNH TẢI VỀ ↔ VÉ DOM (3×): sai khác trung bình trên vé / nền-bóng (mức 0–255), p99,9, lớn nhất, sau làm mờ, lệch chữ lớn nhất (px CSS)');
    REPORT.forEach(r => console.log('  ' + r.tag.padEnd(12) + ' ' + r.png.join('×').padEnd(10) + ' vé ' + String(r.meanTk).padEnd(5) + ' nền ' + String(r.meanBg).padEnd(5) + ' p99.9 ' + String(r.p999).padEnd(4) +
      ' max ' + String(r.max).padEnd(4) + ' mờ ' + String(r.blurMax).padEnd(6) + ' chữ ' + String(r.txtPosMaxCss).padEnd(5) + ' (vùng tệ nhất ' + r.worst + ', ' + r.regions + ' vùng) · Acid ' + (r.acid ? r.acid.png.join(',') + '/' + r.acid.dom.join(',') : '-') + ' · chụp ' + r.ms + ' ms'));
    console.log('  ảnh so sánh: ' + OUT);
  }
  console.log('\n  console/pageerror:', R.ERRS.length ? R.ERRS : 'none');
  ok('0 lỗi console / pageerror', R.ERRS.length === 0, R.ERRS);
  await R.stop();
  process.exit(FAILS ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
