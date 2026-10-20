/* Tia viền "border beam" (chủ studio 20/10: "y hệt như ví dụ, chỉ thay màu gradient — tương phản tốt với nền, hợp bảng màu B0DY").
   Sinh khối CSS cho app.css bằng CHÍNH hàm dựng CSS của gói border-beam 1.4.1 (libraries.dev/beam · npm border-beam · MIT ©2026 Jakub
   Antalik) — không viết tay lại: cùng hình học (cửa sổ conic quay quanh tâm), cùng lớp (viền ::after · quầng trong ::before · loé
   [data-beam-bloom]), cùng độ đậm, cùng nhịp (md 1,96 s / vòng · line 3,1 s / lượt), cùng mờ vào 0,6 s.
   Cấu hình = ví dụ trên libraries.dev (sân khấu luôn theme="dark"); chỉ đổi màu:
   · 9 đốm màu của bảng "colorful" giữ y hệt (vị trí · cỡ · độ trong · sắc độ), chỉ hạ độ sáng màu nào chưa đạt ≥ 4,5:1 trên nền thẻ
     #F2F2F2 (chủ studio 20/10: cấm Than / Mực) · vệt sáng trắng giữ như ví dụ
   · không trôi sắc độ (hueRange 0: Acid luôn là Acid), vẫn giữ bộ lọc brightness / saturate của gói
   Hai tia: "b0" (kiểu md — thẻ, bo 4 px) · "b0l" (kiểu line — dải sàn desktop, bo 0; gói chạy ở viền dưới → app.css lật lên viền trên).
   node tools/beam_css.mjs <thư mục gói border-beam 1.4.1>            → thay khối giữa hai mốc beam:start … beam:end trong app.css
   node tools/beam_css.mjs <thư mục gói border-beam 1.4.1> --check    → chỉ so, khác thì thoát mã 1
   Lấy gói (không đưa vào repo): npm pack border-beam@1.4.1 && tar xzf border-beam-1.4.1.tgz → thư mục package/ */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const PKG = process.argv[2], CHECK = process.argv.includes('--check');
if (!PKG) { console.error('cần thư mục gói border-beam'); process.exit(2); }
const ver = JSON.parse(fs.readFileSync(path.join(PKG, 'package.json'), 'utf8')).version;
if (ver !== '1.4.1') { console.error('cần border-beam 1.4.1, đang có ' + ver + ' — bản khác có thể đổi hàm nội bộ'); process.exit(2); }

/* mở hàm nội bộ của gói: bỏ 2 dòng import React (chỉ cần phần sinh CSS), xuất no() + các bảng màu + preset */
const src = fs.readFileSync(path.join(PKG, 'dist/index.es.js'), 'utf8').split('\n');
if (!/^import .*react\/jsx-runtime/.test(src[0]) || !/^import .*"react"/.test(src[1])) throw new Error('đầu tệp gói khác 1.4.1');
const EXP = 'export {\n  Wo as BorderBeam,';
let body = 'const ve=()=>null,Ie=null,We=()=>null,Le=f=>f,Be=()=>"",Pe=()=>({}),E=v=>[v,()=>{}],A=()=>{},He=f=>f,Xe=f=>f();\n' + src.slice(2).join('\n');
if (body.split(EXP).length !== 2) throw new Error('không thấy khối export của gói');
body = body.replace(EXP, 'export { no, G, Se, Ve, Ue, Qe, pe, Ee };\n' + EXP);
const tmp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'beam-')), 'bb.mjs');
fs.writeFileSync(tmp, body);
const { no, G, Se, Ve, Ue, Qe, pe, Ee } = await import(pathToFileURL(tmp).href);

/* bảng màu b0dy (chủ studio 20/10: "y hệt 9 đốm màu của ví dụ, chỉ tinh chỉnh cho tương phản tốt hơn, cấm Than và Mực"): chép bảng
   "colorful", mỗi màu giữ sắc độ (OKLCH: giữ h, giữ độ rực tối đa trong gam sRGB, chỉ hạ độ sáng) tới khi đạt ≥ 4,5:1 trên nền thẻ
   Giấy 2 #F2F2F2; màu đã đủ thì giữ nguyên. Độ trong của từng đốm giữ nguyên. */
/* Chỉnh màu giữ sắc độ (OKLCH: giữ h, giữ C tối đa trong gam sRGB, hạ L) tới khi đạt tỉ lệ tương phản đích trên nền */
const lin = c => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const gam = c => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055; return v * 255; };
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function toOklch([r, g, b]) {
  r = lin(r); g = lin(g); b = lin(b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.7936177850 * m - 0.0040720468 * s, A = 1.9779984951 * l - 2.4285922050 * m + 0.4505937099 * s, B = 0.0259040371 * l + 0.7827717662 * m - 0.8086757660 * s;
  return [L, Math.hypot(A, B), Math.atan2(B, A)];
}
function fromOklch([L, C, h]) {
  const A = C * Math.cos(h), B = C * Math.sin(h);
  const l = Math.pow(L + 0.3963377774 * A + 0.2158037573 * B, 3), m = Math.pow(L - 0.1055613458 * A - 0.0638541728 * B, 3), s = Math.pow(L - 0.0894841775 * A - 1.2914855480 * B, 3);
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
}
const inGamut = v => v.every(x => x >= -1e-6 && x <= 1 + 1e-6);
function tune(rgb, bg, target) {
  if (ratio(rgb, bg) >= target) return rgb;
  let [L, C, h] = toOklch(rgb);
  for (let i = 0; i < 400; i++) {
    L -= 0.002;
    let c = C, v = fromOklch([L, c, h]);
    while (!inGamut(v) && c > 0) { c -= 0.002; v = fromOklch([L, c, h]); }
    const out = v.map(x => Math.round(gam(Math.min(1, Math.max(0, x)))));
    if (ratio(out, bg) >= target) return out;
  }
  throw new Error('không đạt đích');
}

const BG = [242, 242, 242], TARGET = 4.5;
function mapColor(s) {
  const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)\s*(?:,+\s*([\d.]+))?\s*\)$/.exec(String(s).trim());
  if (!m) throw new Error('màu lạ trong bảng colorful: ' + s);
  const c = tune([+m[1], +m[2], +m[3]], BG, TARGET);
  return m[4] != null ? `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${m[4]})` : `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
function deepMap(o) {
  if (Array.isArray(o)) return o.map(deepMap);
  if (o && typeof o === 'object') { const r = {}; for (const k in o) r[k] = /color|primary|secondary/.test(k) ? mapColor(o[k]) : deepMap(o[k]); return r; }
  return o;
}
for (const T of [G, Se, Ve, Ue, Qe]) T.b0dy = deepMap(T.colorful);

/* cấu hình y như component BorderBeam tự tính cho theme "dark" (ví dụ), size md / line */
function beam(id, size, radius) {
  const F = pe[size].dark, se = Ee[size];
  let css = no({ id, borderRadius: radius, borderWidth: se.borderWidth, duration: size === 'line' ? 3.1 : 1.96,
    strokeOpacity: F.strokeOpacity, innerOpacity: F.innerOpacity, bloomOpacity: F.bloomOpacity, innerShadow: F.innerShadow,
    size, colorVariant: 'b0dy', staticColors: false, brightness: F.brightness ?? 1.3, saturation: F.saturation, hueRange: 0,
    theme: 'dark', hairlineOpacity: F.hairlineOpacity, glowSize: 1 });
  return css.replace(/\n{3,}/g, '\n\n').trim();
}
const block = '/* beam:start — SINH BẰNG tools/beam_css.mjs từ border-beam 1.4.1 (MIT ©2026 Jakub Antalik — licenses/border-beam.txt), ĐỪNG SỬA TAY */\n' +
  beam('b0', 'md', 4) + '\n\n' + beam('b0l', 'line', 0) + '\n/* beam:end */';

const CSS = path.join(ROOT, 'app.css'), cur = fs.readFileSync(CSS, 'utf8');
const a = cur.indexOf('/* beam:start'), b = cur.indexOf('/* beam:end */');
if (a < 0 || b < a) { console.error('app.css chưa có khối /* beam:start */ … /* beam:end */'); process.exit(2); }
const next = cur.slice(0, a) + block + cur.slice(b + '/* beam:end */'.length);
if (CHECK) { const same = next === cur; console.log(same ? 'khớp: khối tia viền trong app.css = bản sinh từ gói' : 'KHÁC: chạy lại không có --check'); process.exit(same ? 0 : 1); }
fs.writeFileSync(CSS, next);
console.log('app.css: khối tia viền ' + block.length + ' ký tự (b0 · b0l)');
