/* Tia viền "border beam" (chủ studio 20/10: "y hệt như ví dụ, chỉ thay màu gradient — tương phản tốt với nền, hợp bảng màu B0DY").
   Sinh khối CSS cho app.css bằng CHÍNH hàm dựng CSS của gói border-beam 1.4.1 (libraries.dev/beam · npm border-beam · MIT ©2026 Jakub
   Antalik) — không viết tay lại: cùng hình học (cửa sổ conic quay quanh tâm), cùng lớp (viền ::after · quầng trong ::before · loé
   [data-beam-bloom]), cùng độ đậm, cùng nhịp (md 1,96 s / vòng · line 3,1 s / lượt), cùng mờ vào 0,6 s.
   Cấu hình = ví dụ trên libraries.dev (sân khấu luôn theme="dark"); chỉ đổi màu:
   · các đốm màu của bảng "colorful" (giữ nguyên vị trí · cỡ · độ trong) → B0DY theo sắc độ: đỏ / hồng / tím hồng → Acid #D4FF00 ·
     cam / vàng / lục → Acid đậm #B1EA00 · xanh ngọc, tím → Than #4A4A4A · xanh lam / chàm → Mực #0A0A0A
   · vệt sáng trắng của theme dark (trên nền tối) → Mực (trên nền sáng của trang trắng không thấy) — chỉ trong khai báo nền / bóng,
     không đụng mặt nạ (mặt nạ dùng trắng làm độ phủ) · đen tuyệt đối → Mực (thương hiệu: không #000)
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

/* bảng màu b0dy: chép bảng "colorful", đổi màu theo sắc độ */
const B0 = { acid: [212, 255, 0], acidg: [177, 234, 0], than: [74, 74, 74], muc: [10, 10, 10] };
function hue(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  if (!d) return -1;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60; return h < 0 ? h + 360 : h;
}
function role(h) { return h < 0 ? null : h >= 300 || h < 15 ? 'acid' : h < 160 ? 'acidg' : h < 200 ? 'than' : h < 250 ? 'muc' : 'than'; }
function mapColor(s) {
  const m = /^rgba?\(\s*(\d+),\s*(\d+),\s*(\d+)\s*(?:,+\s*([\d.]+))?\s*\)$/.exec(String(s).trim());
  if (!m) throw new Error('màu lạ trong bảng colorful: ' + s);
  const k = role(hue(+m[1], +m[2], +m[3])); if (!k) return s;
  const c = B0[k];
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
  css = css.replace(/rgba\(0, 0, 0,/g, 'rgba(10, 10, 10,');
  css = css.replace(/(\n\s*(?:background|background-image|box-shadow):)([\s\S]*?;)/g,
    (m, k, v) => k + v.replace(/rgba\(255, 255, 255,/g, 'rgba(10, 10, 10,').replace(/\bwhite\b/g, '#0A0A0A'));
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
