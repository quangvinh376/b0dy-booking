/* B0B · linh vật B0DY — renderer v02 (WebGL1 + OES_standard_derivatives, mắt "uốn vành, không cắt", một nguồn sáng)
   + HỆ THẦN KINH v03 (17/10/2026): B0B không chạy vòng lặp hoạt hình — B0B CHÚ Ý, CẢM, PHẢN ỨNG.
   Bảy lớp chồng nhau mỗi khung, mỗi lớp một nhịp sinh học riêng nên không bao giờ lặp lại y hệt:
     1 biểu cảm  — tâm trạng là đích, các thông số mắt / thân trôi tới bằng lò xo tới hạn (không vọt, không rung)
     2 chú ý     — ngăn xếp ưu tiên: điều trang báo · bàn phím · con trỏ · lang thang; đổi đích = giật mắt (saccade) theo biên độ,
                   bám đích đang chạy (pursuit), vi giật khi nhìn yên, hai mắt quy tụ khi vật ở rất gần
     3 đầu – mắt — mắt đi trước, đầu theo sau (lò xo), mắt lùi về giữa khi đầu đã quay tới (như phản xạ tiền đình)
     4 cử chỉ    — gật, lắc, nhảy, giật mình, co người, ngáp, vươn vai, thở dài, chóng mặt… có đà, có dư âm, lệch nhẹ mỗi lần
     5 chớp mắt  — phân phối lệch phải như người thật, chớp đôi, chớp khi liếc xa, chớp chậm khi hài lòng, nặng mi khi buồn ngủ
     6 hơi thở + trôi hữu cơ — nhịp thở theo tâm trạng, trôi nhiều tần số không lặp
     7 bộ não    — chán thì nhìn quanh / nghiêng đầu / vươn vai / ngáp, lâu không ai thì ngủ gật; bị đánh thức thì tỉnh dần
   Luật brand giữ nguyên: không miệng, không tay chân; hài lòng = nhắm ◠ + nhìn xuống (không cười vào người xem);
   Acid chỉ ở con ngươi, chỉ khi có dữ liệu sống (10 giây cuối trước giờ mở đặt); dấu trên đầu là dữ liệu thật hoặc dấu trạng thái.
   Giảm chuyển động: tư thế tĩnh y hệt bản v1.0.0, không vòng vẽ.

   B0B.mount(host, {mood, track, floor, imgBase, markSide, poi}) → b
   b.mood(name) · b.look(x, y, ms) · b.lookAtPoint(cx, cy, ms) · b.react(kind, cx?, cy?) · b.attend(elOrPoint, ms, pri)
   b.emit(type, data) · b.poi(selector) · b.pause() · b.resume() · b.setSize(px) · b.destroy() · b.debug()
   B0B.emit(type, data) phát cho mọi thể hiện. Tâm trạng: observe curious focus proud doubt worry sleepy sleep alert excited greet done.
   Quả cầu lấp đầy host; canvas tràn 25 % ngang, 38 % trên (nhảy), 20 % dưới (bóng sàn). Không WebGL / mất context → ảnh WebP.
   Style chỉ qua CSSOM (hợp CSP style-src 'self'). Mọi lỗi bên trong được nuốt: B0B không bao giờ được làm hỏng trang. */
(function () {
  'use strict';
  if (window.B0B) return;

  /* ───────── toán */
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const chance = p => Math.random() < p;
  const sm = (c, t, dt, tau) => c + (t - c) * (1 - Math.exp(-dt / tau));
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => {
      if (x <= 0) return 0; if (x >= 1) return 1;
      let t = x;
      for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-6) break; const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
      if (t < 0 || t > 1) { let lo = 0, hi = 1; t = x; for (let i = 0; i < 24; i++) { if (X(t) < x) lo = t; else hi = t; t = (lo + hi) / 2; } }
      return Y(t);
    };
  }
  const EASE = bezier(.2, 0, 0, 1);          /* đường cong của brand: mọi chuyển trạng thái */
  const EIN = bezier(.45, 0, .9, .6);         /* tăng tốc: nhắm mắt, rơi xuống */
  const EOUT = bezier(.1, .6, .3, 1);         /* bật lên, mở ra */
  const ESIN = t => .5 - .5 * Math.cos(Math.PI * clamp(t));
  const EASES = { e: EASE, i: EIN, o: EOUT, s: ESIN, l: t => clamp(t) };
  /* lò xo tới hạn — nghiệm đúng cho bước dt bất kỳ: tới đích êm, không bao giờ vọt quá hay rung (dt: giây, w: rad/s) */
  function spring(s, target, dt, w) {
    const x = s.x - target, e = Math.exp(-w * dt), a = s.v + w * x;
    s.x = target + (x + a * dt) * e; s.v = (s.v - w * a * dt) * e;
    return s.x;
  }
  /* nhịp sinh học lệch phải (log-chuẩn): trung vị m, độ trải k */
  function logn(m, k) { let u = 0; while (u === 0) u = Math.random(); return m * Math.exp(k * Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * Math.random())); }
  function wpick(list, w) { let s = 0; for (let i = 0; i < w.length; i++) s += w[i]; if (s <= 0) return null; let r = Math.random() * s; for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return list[i]; } return list[list.length - 1]; }

  /* ───────── màu + ánh sáng (đúng thiết lập các job đã xuất ảnh Figma) */
  const rgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const INK = rgb('#0A0A0A'), INK2 = rgb('#1A1A1A'), PAPER = rgb('#FAFAFA'), ACID = rgb('#D4FF00');
  const LOOKS = {
    light: { body: INK, lx: -.45, ly: -.55, lift: .22, gloss: .32, rim: .10 },
    dark: { body: INK2, lx: -.45, ly: -.55, lift: .22, gloss: .30, rim: .22 },
    top: { body: INK2, lx: 0, ly: -1.4, lift: .22, gloss: .36, rim: .26 }
  };
  const R = 100, EYE_Y = -10, EYE_S = .28, EYE_GAP = 72;
  /* khung (đơn vị file 0 có chấm, R = 100): canvas ôm quả cầu + khoảng nhảy phía trên + nghiêng hai bên + bóng sàn;
     lớp SVG của dấu ✓ ! Z ? và số cao hơn, đè lên trên */
  const VB = { x: -150, y: -176, w: 300, h: 316 };   /* ngang ±25 % như v1.0.0: B0B mobile nằm sát lề 16 px — rộng hơn là tràn ngang trang */
  const VM = { x: -150, y: -190, w: 300, h: 330 };
  const boxOf = v => ({ l: (v.x + R) / (2 * R), t: (v.y + R) / (2 * R), w: v.w / (2 * R), h: v.h / (2 * R) });
  const BOX = boxOf(VB), BOXM = boxOf(VM);

  /* ───────── shader: cầu ray-cast, mắt là phương trình dán trên mặt cầu, bóng sàn hai lớp co lại khi B0B nhấc khỏi sàn */
  const VS = 'attribute vec2 aP;void main(){gl_Position=vec4(aP,0.0,1.0);}';
  const FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec3 uView; uniform float uH; uniform vec2 uBreath; uniform float uTy; uniform float uTx; uniform vec3 uShd;
uniform mat3 uMinv;
uniform vec4 uEA[2]; uniform vec4 uEB[2]; uniform vec4 uEC[2]; uniform vec4 uED[2];
uniform vec3 uBody; uniform vec3 uPaint; uniform vec3 uDot;
uniform vec3 uLight; uniform vec4 uMat; uniform float uRim; uniform float uFloor;
const float R = 100.0;
float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x + s * p.y, -s * p.x + c * p.y); }
float field(vec2 q, float rx, float ryT, float ryB, float n, float tilt, float side){
  float xn = q.x / max(rx, 0.001);
  float ry = q.y < 0.0 ? ryT * clamp(1.0 + tilt * xn * side, 0.2, 1.8) : ryB;
  vec2 a = min(abs(vec2(xn, q.y / max(ry, 0.001))), vec2(48.0));
  return pow(pow(a.x, n) + pow(a.y, n), 1.0 / n);
}
float cover(float f){ float w = max(fwidth(f), 0.0001); return clamp((1.0 - f) / w + 0.5, 0.0, 1.0); }
void eye(vec2 L, vec4 A, vec4 B, vec4 C, vec4 D, out float ring, out float dotm){
  vec2 q = rot2((L - A.xy) / A.z, A.w);
  float open = B.x, sx = B.y, sy = B.z;
  float rxO = 88.0 * sx * (1.0 + 0.06 * (1.0 - open));
  float xr = q.x / rxO;
  q.y += C.w * 46.0 * max(0.0, 1.0 - xr * xr);
  float ryO = mix(19.0, 115.0 * sy, open);
  float ryT = ryO * (1.0 - 0.62 * C.x);
  float ryB = ryO * (1.0 - 0.62 * C.y);
  float n = 2.0 + 2.8 * (1.0 - open) * (1.0 - open);
  float outer = cover(field(q, rxO, ryT, ryB, n, C.z, D.z));
  float rxI = max(rxO - 48.0 * sx, 0.0);
  float ryTI = max(ryT - 48.0 * sy, 0.0);
  float ryBI = max(ryB - 48.0 * sy, 0.0);
  float hole = 0.0; float inset = 0.0;
  if (rxI > 0.5 && ryTI + ryBI > 0.5) {
    hole = cover(field(q, rxI, ryTI, ryBI, n, C.z, D.z));
    inset = cover(field(q, max(rxI - 6.0, 0.5), max(ryTI - 6.0, 0.0), max(ryBI - 6.0, 0.0), n, C.z, D.z));
  }
  ring = outer * (1.0 - hole);
  float r = 20.0 * B.w;
  float mx = max(0.0, rxI - r - 6.0);
  float hc = (ryBI - ryTI) * 0.5;
  float hr = max(0.0, (ryTI + ryBI) * 0.5 - r - 6.0);
  vec2 pc = vec2(D.x * mx, hc + D.y * hr);
  dotm = cover(length(q - pc) / max(r, 0.001)) * inset;
}
vec3 shade(vec3 base, vec3 N){
  vec3 L = uLight;
  float d = clamp(dot(N, L) * 0.5 + 0.5, 0.0, 1.0);
  float lum = dot(base, vec3(0.2126, 0.7152, 0.0722));
  vec3 c = base * (0.62 + 0.38 * pow(d, 1.25));
  c += (1.0 - lum) * uMat.y * pow(d, 2.4);
  vec3 H = normalize(L + vec3(0.0, 0.0, 1.0));
  float sp = pow(max(dot(N, H), 0.0), uMat.z) * uMat.w;
  vec2 lxy = normalize(L.xy + vec2(0.0001, 0.0));
  vec2 nxy = normalize(N.xy + vec2(0.0001, 0.0));
  float rim = pow(1.0 - clamp(N.z, 0.0, 1.0), 3.0) * uRim * smoothstep(-0.35, 0.9, dot(nxy, -lxy));
  float ao = 1.0 - 0.30 * smoothstep(0.2, 1.0, N.y);
  return c * ao + vec3(sp) + vec3(rim);
}
/* elip đặc làm nhoè Gauss: khoảng cách xấp xỉ tới biên, che phủ = Φ(−d/σ) */
float blob(vec2 p, vec2 c, vec2 r, float sg){
  vec2 q = p - c;
  float k0 = length(q / r);
  float d = k0 < 1.0 ? (k0 - 1.0) * r.y : k0 * (k0 - 1.0) / max(length(q / (r * r)), 1e-5);
  return 1.0 / (1.0 + exp(1.702 * d / sg));
}
void main(){
  vec2 p = uView.xy + vec2(gl_FragCoord.x, uH - gl_FragCoord.y) * uView.z;
  float sa = 0.0;
  if (uFloor > 0.0 && p.y > 50.0) {
    float k = uShd.x;
    float s1 = 0.09 * blob(p, vec2(uShd.z, 103.0), vec2(127.0, 16.0) * k, 9.0 + 8.0 * (1.0 - k));
    float s2 = 0.34 * blob(p, vec2(uShd.z * 0.9, 100.5), vec2(66.0, 6.0) * k, 2.7 + 6.0 * (1.0 - k));
    sa = (1.0 - (1.0 - s1) * (1.0 - s2)) * uFloor * uShd.y;
  }
  vec2 q = vec2((p.x - uTx) / (R * uBreath.x), (p.y - uTy) / (R * uBreath.y));
  float r2 = dot(q, q);
  vec3 N = normalize(vec3(q, sqrt(max(0.0, 1.0 - min(r2, 1.0)))));
  vec3 Lc = uMinv * N;
  vec2 dl = Lc.xy * R;
  /* mắt tính ở luồng ĐỒNG NHẤT (mọi điểm ảnh): cover() dùng fwidth — fwidth trong nhánh if không đồng nhất là không xác định,
     GPU thật trả rác ở các ô 2×2 vắt qua biên nhánh → chấm trắng dọc khung quanh mắt (SwiftShader không lộ). Khung chỉ còn là mặt nạ. */
  float rg0; float dt0; float rg1; float dt1;
  eye(dl, uEA[0], uEB[0], uEC[0], uED[0], rg0, dt0);
  eye(dl, uEA[1], uEB[1], uEC[1], uED[1], rg1, dt1);
  float em = smoothstep(0.0, 0.05, Lc.z) * step(abs(dl.x), 86.0) * step(abs(dl.y + 10.0), 68.0);
  vec3 col = vec3(0.0); float a = 0.0;
  if (r2 < 1.21) {
    a = clamp((1.0 - sqrt(r2)) * R * min(uBreath.x, uBreath.y) / uView.z + 0.5, 0.0, 1.0);
    vec3 base = uBody;
    base = mix(base, uPaint, rg0 * em); base = mix(base, uDot, dt0 * em);
    base = mix(base, uPaint, rg1 * em); base = mix(base, uDot, dt1 * em);
    col = shade(base, N);
  }
  vec3 outc = col * a + vec3(0.0392) * sa * (1.0 - a);
  float outa = a + sa * (1.0 - a);
  outc += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * outa;
  gl_FragColor = vec4(outc, outa);
}`;
  const UNI = ['uView', 'uH', 'uBreath', 'uTy', 'uTx', 'uShd', 'uMinv', 'uEA', 'uEB', 'uEC', 'uED', 'uBody', 'uPaint', 'uDot', 'uLight', 'uMat', 'uRim', 'uFloor'];
  function makeGL(canvas) {
    let gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' }); } catch (e) { gl = null; }
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS);
    if (!vs || !fs) return null;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const al = gl.getAttribLocation(pr, 'aP'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    const U = {}; for (const n of UNI) U[n] = gl.getUniformLocation(pr, n);
    return { gl, U };
  }
  function rotRows(P) {
    const cy = Math.cos(P.yaw * D2R), sy = Math.sin(P.yaw * D2R), cp = Math.cos(P.pitch * D2R), sp = Math.sin(P.pitch * D2R), cr = Math.cos(P.roll * D2R), sr = Math.sin(P.roll * D2R);
    const mul = (A, B) => { const o = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return o; };
    const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
    return mul(Ry, mul(Rx, Rz));
  }
  const EA = new Float32Array(8), EB = new Float32Array(8), EC = new Float32Array(8), ED = new Float32Array(8), MI = new Float32Array(9);
  /* P: tư thế đã trộn — yaw pitch roll (độ) · tx ty (đv) · bx by (giãn thân) · fx fy (mắt trượt trên mặt) · lgx lgy rgx rgy (con ngươi)
     · dot · l/r Open Sx Sy LidT LidB Tilt Bend Rot · shk sha (bóng sàn: cỡ, độ đậm) · acid (con ngươi Acid 0–1) */
  function draw(G, P, lk, floor, W, H) {
    const gl = G.gl, U = G.U;
    gl.viewport(0, 0, W, H);
    const sc = Math.min(W / VB.w, H / VB.h);
    gl.uniform3f(U.uView, VB.x - (W - VB.w * sc) / 2 / sc, VB.y - (H - VB.h * sc) / 2 / sc, 1 / sc);
    gl.uniform1f(U.uH, H);
    gl.uniform2f(U.uBreath, P.bx, P.by);
    gl.uniform1f(U.uTy, P.ty); gl.uniform1f(U.uTx, P.tx);
    gl.uniform3f(U.uShd, P.shk, P.sha, P.tx * .6);
    MI.set(rotRows(P)); gl.uniformMatrix3fv(U.uMinv, false, MI);
    const gap = Math.max(EYE_GAP, 176 * EYE_S + 8), ey = EYE_Y + P.fy * 4;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, k = i ? 'r' : 'l', o = i * 4;
      EA[o] = P.fx * 5 + side * gap / 2; EA[o + 1] = ey; EA[o + 2] = EYE_S; EA[o + 3] = P[k + 'Rot'] * -side * D2R;
      EB[o] = clamp(P[k + 'Open'], 0, 1.2); EB[o + 1] = P[k + 'Sx']; EB[o + 2] = P[k + 'Sy']; EB[o + 3] = P.dot;
      EC[o] = clamp(P[k + 'LidT']); EC[o + 1] = clamp(P[k + 'LidB']); EC[o + 2] = P[k + 'Tilt']; EC[o + 3] = P[k + 'Bend'];
      ED[o] = clamp(i ? P.rgx : P.lgx, -1, 1); ED[o + 1] = clamp(i ? P.rgy : P.lgy, -1, 1); ED[o + 2] = side; ED[o + 3] = 1;
    }
    gl.uniform4fv(U.uEA, EA); gl.uniform4fv(U.uEB, EB); gl.uniform4fv(U.uEC, EC); gl.uniform4fv(U.uED, ED);
    gl.uniform3fv(U.uBody, lk.body); gl.uniform3fv(U.uPaint, PAPER);
    const ac = clamp(P.acid);
    gl.uniform3f(U.uDot, lerp(PAPER[0], ACID[0], ac), lerp(PAPER[1], ACID[1], ac), lerp(PAPER[2], ACID[2], ac));
    const lx = lk.lx * 1.2, ly = lk.ly * 1.2, ln = Math.hypot(lx, ly, 1);
    gl.uniform3f(U.uLight, lx / ln, ly / ln, 1 / ln);
    gl.uniform4f(U.uMat, .62, lk.lift, 34, lk.gloss);
    gl.uniform1f(U.uRim, lk.rim);
    gl.uniform1f(U.uFloor, floor ? 1 : 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ───────── tư thế gốc + TƯ THẾ TĨNH (giảm chuyển động · ảnh tham chiếu): giữ y hệt v1.0.0 */
  const NEUTRAL = { yaw: 0, pitch: 0, roll: 0, ty: 0, gx: 0, gy: 0, dot: 1,
    lOpen: 1, rOpen: 1, lSx: 1, lSy: 1, rSx: 1, rSy: 1, lLidT: 0, rLidT: 0, lLidB: 0, rLidB: 0,
    lTilt: 0, rTilt: 0, lBend: 0, rBend: 0, lRot: 0, rRot: 0 };
  const KEYS = Object.keys(NEUTRAL);
  const BOTH = { open: 'Open', lidT: 'LidT', lidB: 'LidB', tilt: 'Tilt', bend: 'Bend', rot: 'Rot' };
  function expand(p) {
    const o = {};
    for (const k in p) {
      const v = p[k];
      if (BOTH[k]) { o['l' + BOTH[k]] = v; o['r' + BOTH[k]] = v; }
      else if (k === 's') { o.lSx = v; o.lSy = v; o.rSx = v; o.rSy = v; }
      else o[k] = v;
    }
    return o;
  }
  const REST = {
    observe: { look: 'light', L: 8000, rest: 600, kf: [[0, 420, { gx: -.62, gy: .12, yaw: -8 }]] },
    greet: { look: 'light', L: 2300, hold: 1, rest: 2300,
      kf: [[0, 400, { pitch: 3, gx: 0, gy: -.06 }], [520, 320, { open: .06, bend: .45 }], [1500, 300, { pitch: -6, ty: 2 }], [1850, 420, { pitch: -3, ty: 0 }]] },
    done: { look: 'light', L: 1100, hold: 1, rest: 1100, mark: 'check',
      kf: [[0, 400, { gx: -.2, gy: .35 }], [150, 380, { open: .1, bend: .55 }], [180, 400, { pitch: -9, ty: 3 }], [620, 420, { pitch: -4, ty: 0 }]] },
    doubt: { look: 'dark', L: 6800, rest: 1200,
      kf: [[0, 420, { yaw: 9, roll: -3, gx: -.85, gy: -.05, lLidT: .78, lTilt: .55, lLidB: .25, rLidT: .12, rSx: 1.05, rSy: 1.05 }],
           [3000, 110, { open: 0 }], [3110, 220, { open: 1 }], [4200, 400, { gx: -.2 }], [5600, 400, { gx: -.85 }]] },
    sleep: { look: 'top', L: 6400, rest: 1200, mark: 'zz', kf: [[0, 600, { open: 0, bend: -.3, pitch: -6, roll: 4 }]] },
    alert: { look: 'light', L: 4700, hold: 1, rest: 4700, mark: 'bang',
      kf: [[0, 140, { gx: 0, gy: 0 }], [0, 220, { s: 1.12, dot: .66, pitch: 2 }], [2800, 110, { open: 0 }], [2910, 200, { open: 1 }],
           [4300, 400, { s: 1.04, dot: .86, pitch: 0 }]] }
  };
  /* bộ đánh giá rãnh khoá: mỗi khoá {t, d, v, e}; trước khoá đầu = n0 (mặc định khoá cuối cho vòng lặp) */
  function prepTracks(kf, tscale, ascale) {
    const tr = {};
    for (const f of kf) {
      const t = f[0] * tscale, d = Math.max(1, f[1] * tscale), e = EASES[f[3] || 'e'], p = expand(f[2]);
      for (const k in p) (tr[k] || (tr[k] = [])).push({ t, d, v: p[k] * (ascale || 1), e });
    }
    for (const k in tr) tr[k].sort((a, b) => a.t - b.t);
    return tr;
  }
  for (const id in REST) { const M = REST[id]; M.id = id; M.tracks = prepTracks(M.kf, 1); }
  function evalTrack(tr, tau, n0) {
    let cur = null; const from0 = n0 === undefined ? tr[tr.length - 1].v : n0;
    for (let i = 0; i < tr.length; i++) {
      const k = tr[i]; if (k.t > tau) break;
      const v = cur ? lerp(cur.from, cur.k.v, cur.k.e(clamp((k.t - cur.k.t) / cur.k.d))) : from0;
      cur = { from: v, k };
    }
    return cur ? lerp(cur.from, cur.k.v, cur.k.e(clamp((tau - cur.k.t) / cur.k.d))) : from0;
  }
  function restPose(id) {
    const M = REST[id] || REST.observe, P = {};
    for (const k of KEYS) P[k] = M.tracks[k] ? evalTrack(M.tracks[k], M.rest, M.hold ? NEUTRAL[k] : undefined) : NEUTRAL[k];
    return Object.assign(P, { tx: 0, bx: 1, by: 1, fx: P.gx, fy: P.gy, lgx: P.gx, lgy: P.gy, rgx: P.gx, rgy: P.gy, shk: 1, sha: 1, acid: 0 });
  }
  const RM_OF = { observe: 'observe', curious: 'observe', focus: 'observe', proud: 'greet', doubt: 'doubt', worry: 'doubt', sleepy: 'observe',
    sleep: 'sleep', alert: 'alert', excited: 'observe', greet: 'greet', done: 'done' };

  /* ───────── TÂM TRẠNG SỐNG: đích biểu cảm + tính khí (nhịp thở, chớp, lang thang, trôi) */
  const EX0 = { lOpen: 1, rOpen: 1, lLidT: 0, rLidT: 0, lLidB: 0, rLidB: 0, lTilt: 0, rTilt: 0, lBend: 0, rBend: 0,
    lSx: 1, lSy: 1, rSx: 1, rSy: 1, dot: 1, yaw: 0, pitch: 0, roll: 0, ty: 0, acid: 0 };
  const EXK = Object.keys(EX0);
  const LIVE = {
    observe: { look: 'light', ex: {}, br: [5600, .012], bl: 3.8, wander: 1, drift: 1.2 },
    curious: { look: 'light', ex: { open: 1.05, s: 1.04, roll: -3, dot: 1.07 }, br: [4800, .012], bl: 3.2, wander: 1.5, drift: 1.4 },
    focus: { look: 'light', ex: { lidB: .16, lidT: .05, dot: .94 }, br: [5000, .010], bl: 6.4, wander: .15, drift: .6 },
    proud: { look: 'light', ex: { lidB: .06, pitch: -2, dot: 1.04 }, br: [5600, .012], bl: 4.2, wander: .9, drift: 1 },
    doubt: { look: 'dark', ex: { yaw: 9, roll: -3, lLidT: .78, lTilt: .55, lLidB: .25, rLidT: .12, rSx: 1.05, rSy: 1.05 }, side: [-.85, -.05], br: [5600, .012], bl: 4.6, wander: .25, drift: .8 },
    worry: { look: 'light', ex: { lidT: .22, tilt: -.34, dot: .9, pitch: -3 }, br: [4200, .012], bl: 3.0, wander: .5, drift: .7 },
    sleepy: { look: 'top', ex: { lidT: .52, dot: .92, pitch: -3 }, br: [6000, .016], bl: 2.6, slow: 1, wander: .3, drift: .6 },
    sleep: { look: 'top', ex: { open: 0, bend: -.3, pitch: -6, roll: 4 }, br: [6400, .024], bl: 0, wander: 0, drift: .5, mark: 'zz', asleep: 1 },
    alert: { look: 'light', ex: { s: 1.12, dot: .66, pitch: 2 }, br: [3800, .010], bl: 4.5, wander: 0, drift: .5, mark: 'bang' },
    excited: { look: 'light', ex: { open: 1.07, dot: .82, acid: 1 }, br: [2600, .014], bl: 3.0, wander: 0, drift: .9 },
    greet: { look: 'light', ex: { open: .06, bend: .45, pitch: -3 }, br: [5600, .012], bl: 0, wander: 0, drift: 1, enter: 'greet' },
    done: { look: 'light', ex: { open: .1, bend: .55, pitch: -4 }, gaze: [-.2, .35], br: [5600, .012], bl: 0, wander: 0, drift: .8, mark: 'check', enter: 'nod' }
  };
  for (const id in LIVE) { LIVE[id].id = id; LIVE[id].exx = expand(LIVE[id].ex); }
  const AWAKE = { observe: 1, curious: 1, focus: 1, proud: 1 };

  /* ───────── CỬ CHỈ: rãnh khoá CỘNG THÊM lên tư thế (về 0 ở cuối) — [ms bắt đầu, ms chuyển, {khoá: độ lệch}, đường cong]
     sq = giãn dọc (giữ thể tích: ngang co theo 1/√), ty dương = xuống, tx = dịch ngang; mỗi lần chạy lệch ngẫu nhiên ±10 % nhịp / biên */
  const GEST = {
    nod: { d: 780, k: [[0, 90, { pitch: 2.5 }], [90, 200, { pitch: -8, ty: 2.5, lidB: .12 }, 'o'], [290, 230, { pitch: 1.2, ty: 0, lidB: 0 }], [520, 260, { pitch: 0 }]] },
    nod2: { d: 1180, k: [[0, 80, { pitch: 2 }], [80, 170, { pitch: -7, ty: 2, lidB: .12 }, 'o'], [250, 160, { pitch: .5, ty: 0 }], [410, 170, { pitch: -6, ty: 2 }, 'o'], [580, 260, { pitch: .8, ty: 0, lidB: 0 }], [840, 340, { pitch: 0 }]] },
    count: { d: 470, k: [[0, 150, { pitch: -4.5, ty: 1.2 }, 'o'], [150, 320, { pitch: 0, ty: 0 }]] },
    shake: { d: 1100, k: [[0, 110, { yaw: -9, gx: .1, lidT: .18 }, 'o'], [110, 170, { yaw: 8, gx: -.08 }, 's'], [280, 160, { yaw: -5, gx: .05 }, 's'], [440, 150, { yaw: 2.5, gx: -.02 }, 's'], [590, 240, { yaw: 0, gx: 0 }], [830, 270, { lidT: 0 }]] },
    shakeLite: { d: 620, k: [[0, 100, { yaw: -5, lidT: .14 }, 'o'], [100, 150, { yaw: 4 }, 's'], [250, 160, { yaw: -1.5 }, 's'], [410, 210, { yaw: 0, lidT: 0 }]] },
    hop: { d: 1000, mark: [250, 'check', 1500], cancels: ['nod', 'nod2', 'count'], k: [
      [0, 130, { sq: -.1, ty: 5, bend: .25, lidB: .1 }, 'i'],
      [130, 120, { sq: .1, ty: -36, bend: .55, open: -.88 }, 'o'],
      [250, 220, { sq: .02, ty: -41, roll: 3 }, 's'],
      [470, 150, { sq: .04, ty: 0, roll: 0 }, 'i'],
      [620, 90, { sq: -.08, ty: 2.5 }, 'o'],
      [710, 290, { sq: 0, ty: 0, bend: 0, open: 0, lidB: 0 }]] },
    hello: { d: 640, k: [[0, 90, { sq: -.05, ty: 2 }, 'i'], [90, 140, { sq: .05, ty: -12 }, 'o'], [230, 150, { sq: -.02, ty: 0 }, 'i'], [380, 260, { sq: 0 }]] },
    startle: { d: 980, k: [[0, 80, { open: .16, s: .07, dot: -.32, sq: .05, ty: -6 }, 'o'], [460, 520, { open: 0, s: 0, dot: 0, sq: 0, ty: 0 }]] },
    flinch: { d: 720, k: [[0, 70, { sq: -.1, ty: 3, open: -.93, bend: -.16, pitch: 4 }, 'o'], [70, 260, { sq: .02, ty: 0 }], [330, 390, { sq: 0, open: 0, bend: 0, pitch: 0 }]] },
    wiggle: { d: 900, k: [[0, 140, { roll: -5, bend: .4, open: -.85 }, 's'], [140, 190, { roll: 4.5 }, 's'], [330, 180, { roll: -2.5 }, 's'], [510, 390, { roll: 0, bend: 0, open: 0 }]] },
    yawn: { d: 2700, k: [[0, 650, { sq: .075, ty: -3, pitch: -5, open: -.96, bend: -.3 }, 's'], [1550, 700, { sq: -.02, ty: 0, pitch: 1, open: -.55, bend: 0 }, 's'], [2250, 450, { sq: 0, pitch: 0, open: 0 }]] },
    stretch: { d: 2000, k: [[0, 520, { roll: -7, tx: -5, sq: .035, open: -.9, bend: -.22 }, 's'], [520, 720, { roll: 6.5, tx: 5 }, 's'], [1240, 760, { roll: 0, tx: 0, sq: 0, open: 0, bend: 0 }]] },
    sigh: { d: 1800, k: [[0, 520, { sq: .03, ty: -2, lidT: .12 }, 's'], [520, 720, { sq: -.05, ty: 2, lidT: .36, pitch: -4 }, 's'], [1240, 560, { sq: 0, ty: 0, lidT: 0, pitch: 0 }]] },
    tilt: { d: 1800, k: [[0, 320, { roll: -8, yaw: -3, rSx: .05, rSy: .05 }], [1350, 450, { roll: 0, yaw: 0, rSx: 0, rSy: 0 }]] },
    halfwake: { d: 1800, k: [[0, 380, { lOpen: .36, lBend: .3, roll: -1 }, 'o'], [1250, 550, { lOpen: 0, lBend: 0, roll: 0 }, 's']] },
    stir: { d: 1000, k: [[0, 220, { roll: -3.2, ty: 1.6, sq: -.02 }, 's'], [220, 780, { roll: 0, ty: 0, sq: 0 }, 's']] },
    nodoff: { d: 1500, k: [[0, 900, { pitch: -9, ty: 2.5, lidT: .3 }, 's'], [900, 130, { pitch: 2, ty: -2, lidT: -.4, open: .08 }, 'o'], [1030, 470, { pitch: 0, ty: 0, lidT: 0, open: 0 }]] },
    greet: { d: 2300, k: [[0, 400, { pitch: 3, gy: -.06 }], [1500, 300, { pitch: -3, ty: 2 }], [1850, 420, { pitch: 0, ty: 0, gy: 0 }]] },
    dizzy: { d: 1900, fn: true }
  };
  for (const id in GEST) GEST[id].id = id;

  /* ───────── dấu trên đầu: SVG cùng hệ đơn vị với canvas (JetBrains Mono viết hoa · nét Mực) */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const mk = (tag, at) => { const e = document.createElementNS(SVGNS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
  const mono = (x, y, s, z) => { const e = mk('text', { x, y, 'font-size': s, 'font-family': 'JetBrains Mono, ui-monospace, Menlo, monospace', 'font-weight': '500', 'text-anchor': 'middle', fill: '#0A0A0A', stroke: 'none' }); e.textContent = z; return e; };
  function markNode(type, text) {
    const g = mk('g', { fill: 'none', stroke: '#0A0A0A' });
    if (type === 'check') g.appendChild(mk('path', { d: 'M-16 0L-5 11L16 -11', 'stroke-width': '3.2', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter' }));
    else if (type === 'bang') { g.appendChild(mk('path', { d: 'M0 -17V4', 'stroke-width': '3.6' })); g.appendChild(mk('rect', { x: '-1.8', y: '9', width: '3.6', height: '3.6', fill: '#0A0A0A', stroke: 'none' })); }
    else if (type === 'zz') { g.appendChild(mono('0', '-6', '24', 'Z')); g.appendChild(mono('4', '20', '16', 'Z')); }
    else if (type === 'q') g.appendChild(mono('0', '10', '30', '?'));
    else if (type === 'txt') g.appendChild(mono('0', '9', String(text).length > 3 ? '20' : '26', String(text).toUpperCase()));
    return g;
  }

  /* ───────── giác quan dùng chung: con trỏ, lần cuối người dùng làm gì, tốc độ, rung chuột */
  const ALL = new Set();
  const PTR = { on: false, x: 0, y: 0, t: -1e9, vx: 0, vy: 0, rev: [], lastSign: 0, down: -1e9 };
  const USER = { input: performance.now(), hidden: -1, kbd: -1e9 };
  let bound = false;
  const RMq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let RM = !!(RMq && RMq.matches);
  const safe = f => function (e) { try { f(e); } catch (x) { /* B0B không bao giờ được làm hỏng trang */ } };
  const onMove = safe(e => {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    const now = performance.now(), dt = Math.max(1, now - PTR.t);
    if (PTR.on && dt < 120) {
      PTR.vx = sm(PTR.vx, (e.clientX - PTR.x) / dt, dt, 40); PTR.vy = sm(PTR.vy, (e.clientY - PTR.y) / dt, dt, 40);
      /* rung chuột: hướng ngang đổi chiều liên tục với tốc độ lớn */
      const s = Math.abs(PTR.vx) > 1.1 ? Math.sign(PTR.vx) : 0;
      if (s && s !== PTR.lastSign) { if (PTR.lastSign) PTR.rev.push(now); PTR.lastSign = s; }
      while (PTR.rev.length && now - PTR.rev[0] > 900) PTR.rev.shift();
      if (PTR.rev.length >= 6) { PTR.rev.length = 0; for (const b of ALL) b._shook(now); }
    } else { PTR.vx = PTR.vy = 0; }
    PTR.on = true; PTR.x = e.clientX; PTR.y = e.clientY; PTR.t = now; USER.input = now;
    for (const b of ALL) b._wake();
  });
  const onDown = safe(e => {
    const now = performance.now(); USER.input = now; PTR.down = now;
    for (const b of ALL) b._down(e.clientX, e.clientY, e.pointerType, now);
  });
  const onOut = safe(e => { if (!e.relatedTarget) PTR.on = false; });
  const onKey = safe(e => { USER.input = performance.now(); if (e.key === 'Tab') USER.kbd = USER.input; for (const b of ALL) b._wake(); });
  const onScroll = safe(e => { const now = performance.now(); USER.input = now; for (const b of ALL) b._scrolled(e, now); });
  const onFocus = safe(e => {
    const now = performance.now(), el = e.target;
    /* chỉ khi tiêu điểm đi bằng bàn phím (không phải vừa chạm / bấm chuột) */
    if (now - PTR.down < 400 || !el || !el.getBoundingClientRect) return;
    for (const b of ALL) b._focusEl(el, now);
  });
  const onVis = safe(() => {
    const now = performance.now();
    if (document.hidden) USER.hidden = now;
    else { const away = USER.hidden > 0 ? now - USER.hidden : 0; USER.hidden = -1; USER.input = now; for (const b of ALL) b._back(away, now); }
    for (const b of ALL) b._sched();
  });
  function bind() {
    if (bound) return; bound = true;
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true, capture: true });
    addEventListener('keydown', onKey, { passive: true, capture: true });
    addEventListener('scroll', onScroll, { passive: true, capture: true });
    document.addEventListener('focusin', onFocus, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    const rmc = () => { RM = !!(RMq && RMq.matches); for (const b of ALL) { b._rmChanged(); } };
    if (RMq) { if (RMq.addEventListener) RMq.addEventListener('change', rmc); else if (RMq.addListener) RMq.addListener(rmc); }
  }
  const IMG = { observe: 'quan-sat', curious: 'quan-sat', focus: 'quan-sat', proud: 'chao', greet: 'chao', done: 'chao', doubt: 'nghi',
    worry: 'nghi', sleepy: 'quan-sat', sleep: 'ngu', alert: 'quan-sat', excited: 'quan-sat' };
  const css = (el, o) => { for (const k in o) el.style[k] = o[k]; return el; };
  const pct = v => (v * 100).toFixed(3) + '%';
  /* năng lượng theo giờ trong ngày (máy người dùng): sáng sớm và đêm khuya B0B chậm, chớp nặng, hay ngáp */
  function energy() { const d = new Date(), h = d.getHours() + d.getMinutes() / 60; return h < 5 ? .5 : h < 6.5 ? .62 : h < 21.5 ? 1 : h < 23 ? .72 : .55; }
  const SEL_POI = 'h1, h2, input:not([type=hidden]), button:not([disabled]), [data-poi]';

  /* ───────── một thể hiện */
  function Bob(host, opts) {
    this.host = host; this.o = opts;
    this.paused = false; this.dead = false; this.vis = true; this.raf = 0; this.lastDraw = -1e9; this.hot = 0;
    this.W = 0; this.H = 0; this.cssW = 0;
    const now = performance.now();
    this.base = LIVE[opts.mood] ? opts.mood : 'observe';
    this.poiSel = opts.poi || SEL_POI;
    const M = LIVE[this.base];
    this.E = {}; const ex0 = Object.assign({}, EX0, M.exx);
    for (const k of EXK) this.E[k] = { x: ex0[k], v: 0 };
    this.xo = [];                                   /* biểu cảm tạm (ghi đè đích theo khoá), {ex, until} */
    this.gs = [];                                   /* cử chỉ đang chạy */
    this.att = new Array(7).fill(null); this.aid = 0;
    this.g = { x: -.55, y: .1, vg: 0, key: '', sx: 0, sy: 0, fx: 0, fy: 0, tx: -.55, ty: .1, at: -1e9, d: 1, mic: { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, at: -1e9, next: now + 600 } };
    this.hy = { x: 0, v: 0 }; this.hp = { x: 0, v: 0 }; this.lean = { x: 0, v: 0 }; this.vgS = { x: 0, v: 0 };
    this.bl = { at: -1e9, kind: 'n', next: now + rand(900, 2400), dbl: false };
    this.bPhase = Math.random() * TAU; this.bAmp = M.br[1]; this.bPer = M.br[0];
    this.lk = Object.assign({}, LOOKS[M.look], { body: LOOKS[M.look].body.slice() }); this.lkFrom = null; this.tLook = -1e9; this.lookId = M.look;
    this.mkS = { cur: null, key: '', prevAt: -1e9, prevA: 0, born: now };
    this.tmark = null;
    this.brain = { next: now + rand(1500, 3200), hist: [], cd: {}, doze: 0, dozeAt: 0, wakeUntil: -1e9, dist: [], lastHalf: -1e9, cd60: false, cdSec: 1e9,
      petAt: -1e9, petting: false, pokes: [], lastPoke: -1e9, dizzyAt: -1e9, think: false, privacy: false, force: null, lastIdle: '' };
    this.scr = { v: 0, t: -1e9 };
    this._stats = { draws: 0, ms: 0 };
    this.tSwitch = now;

    if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
    if (opts.size && !host.clientWidth) css(host, { width: opts.size + 'px', height: opts.size + 'px' });
    const box = b => ({ position: 'absolute', left: pct(b.l), top: pct(b.t), width: pct(b.w), height: pct(b.h), pointerEvents: 'none' });
    this.cv = css(document.createElement('canvas'), Object.assign({ display: 'block' }, box(BOX)));
    this.cv.setAttribute('aria-hidden', 'true');
    this.svg = mk('svg', { viewBox: VM.x + ' ' + VM.y + ' ' + VM.w + ' ' + VM.h, preserveAspectRatio: 'none', 'aria-hidden': 'true', focusable: 'false' });
    css(this.svg, Object.assign({ overflow: 'visible' }, box(BOXM)));
    this.gA = mk('g', { opacity: '0' }); this.gB = mk('g', { opacity: '0' });
    this.svg.appendChild(this.gB); this.svg.appendChild(this.gA);
    host.appendChild(this.cv); host.appendChild(this.svg);

    this.G = makeGL(this.cv);
    if (!this.G) this._fallback(true);
    this.cv.addEventListener('webglcontextlost', e => { e.preventDefault(); if (this.dead) return; this.G = null; this._fallback(true); this._sched(); }, false);
    this.cv.addEventListener('webglcontextrestored', () => { if (this.dead) return; this.G = makeGL(this.cv); if (this.G) { this._fallback(false); this.lastDraw = -1e9; this._sched(); } }, false);

    const resize = () => this._resize();
    this.ro = 'ResizeObserver' in window ? new ResizeObserver(resize) : null;
    if (this.ro) this.ro.observe(host); else addEventListener('resize', resize);
    this.io = 'IntersectionObserver' in window ? new IntersectionObserver(es => { this.vis = es[es.length - 1].isIntersecting; this._sched(); }) : null;
    if (this.io) this.io.observe(host);
    this._resize();
    if (this.o.track !== false) bind(); else if (!bound) { document.addEventListener('visibilitychange', onVis); }
    ALL.add(this);
    if (M.enter) this._gesture(M.enter, now);
    this._markSync(now, true);
    this._sched();
  }
  Bob.prototype = {
    _fallback(on) {
      if (on && !this.img) {
        this.cv.style.visibility = 'hidden';
        const sh = (w, h, cy, a) => css(document.createElement('div'), { position: 'absolute', left: '50%', top: pct(.5 + cy / (2 * R)), width: pct(w / (2 * R)), height: pct(h / (2 * R)),
          transform: 'translate(-50%,-50%)', borderRadius: '50%', pointerEvents: 'none', background: 'radial-gradient(closest-side, rgba(10,10,10,' + a + '), rgba(10,10,10,' + (a * .35).toFixed(3) + ') 62%, rgba(10,10,10,0))' });
        this.sh = [sh(290, 52, 103, .09), sh(78, 14, 100.5, .30)];
        if (this.o.floor === false) this.sh.forEach(s => { s.style.display = 'none'; });
        this.img = css(document.createElement('img'), { position: 'absolute', left: '0', top: '0', width: '100%', height: '100%', pointerEvents: 'none', userSelect: 'none' });
        this.img.alt = ''; this.img.decoding = 'async'; this.img.draggable = false;
        this.img.src = this._imgSrc();
        this.host.insertBefore(this.img, this.cv); this.sh.forEach(s => this.host.insertBefore(s, this.img));
      } else if (!on && this.img) {
        this.img.remove(); this.sh.forEach(s => s.remove()); this.img = null; this.sh = null;
        this.cv.style.visibility = '';
      }
      if (on) this._markStatic();
    },
    _imgSrc() { return (this.o.imgBase == null ? 'img/' : this.o.imgBase) + 'b0b-' + IMG[this.base] + '.webp'; },
    _resize() {
      const w = this.host.clientWidth || 0;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      this.cssW = w;
      const W = Math.max(1, Math.round(w * BOX.w * dpr)), H = Math.max(1, Math.round(w * BOX.h * dpr));
      if (W !== this.W || H !== this.H) { this.W = W; this.H = H; this.cv.width = W; this.cv.height = H; this.lastDraw = -1e9; }
      this._sched();
    },
    _active() { return !this.dead && !this.paused && this.vis && !document.hidden && this.cssW > 0; },
    _sched() {
      if (this.raf || !this._active()) return;
      this.raf = requestAnimationFrame(t => this._tick(t));
    },
    _heat(ms) { this.hot = Math.max(this.hot, performance.now() + ms); this._sched(); },
    _wake() { if (!this.img) { this.hot = Math.max(this.hot, performance.now() + 300); this._sched(); } },
    _rmChanged() { this.lkFrom = null; this.lastDraw = -1e9; this._markSync(performance.now(), true); this._sched(); },
    _tick(now) {
      this.raf = -1;                                /* đang vẽ: _sched() trong khung (từ _heat) không xin thêm khung */
      if (!this._active()) { this.raf = 0; return; }
      try {
        const busy = now < this.hot || this.gs.length > 0 || now - this.g.at < 260 || this.lkFrom || this.brain.petting;
        if (RM || busy || now - this.lastDraw >= 32) {
          /* dt thật (tối đa 250 ms): máy chậm / bị bóp khung vẫn chuyển động đúng nhịp, không thành quay chậm — lò xo giải đúng mọi dt */
          const t0 = performance.now(), dt = Math.min(250, Math.max(0, now - (this.lastDraw > 0 ? this.lastDraw : now - 16)));
          const P = RM ? this._rmPose(now) : this._compose(now, dt);
          if (this.G && !this.img) draw(this.G, P, this.lk, this.o.floor !== false, this.W, this.H);
          this._markFrame(now, P);
          this.lastDraw = now;
          this._stats.draws++; this._stats.ms += performance.now() - t0;
        }
      } catch (e) { /* một khung lỗi không được dừng B0B */ }
      this.raf = 0;
      if (RM) return;
      if (this.img && this._live().mark !== 'zz' && !(now < this.hot)) return;
      this.raf = requestAnimationFrame(t => this._tick(t));
    },

    /* ───────── giảm chuyển động: tư thế tĩnh v1.0.0, liếc (look) vẫn đổi tư thế tĩnh */
    _rmPose(now) {
      const id = RM_OF[this._effId(now)] || 'observe', P = restPose(id);
      const L = LOOKS[REST[id].look]; this.lk = Object.assign({}, L, { body: L.body.slice() });
      const a = this._curAtt(now);
      if (a && a.pri >= 4) {
        const g = this._gazeFor(a.t, now);
        if (g) { P.yaw += (g.x - P.gx) * 10; P.pitch -= (g.y - P.gy) * 6; P.gx = P.fx = P.lgx = P.rgx = g.x; P.gy = P.fy = P.lgy = P.rgy = g.y; }
        clearTimeout(this.rmT); this.rmT = setTimeout(() => { this.lastDraw = -1e9; this._sched(); }, Math.max(20, a.until - now + 20));
      }
      return P;
    },

    /* ───────── tâm trạng hiệu lực: ép tạm (bộ não) › tỉnh tạm trên nền ngủ › ngủ gật › nền do trang đặt */
    _effId(now) {
      const B = this.brain;
      if (B.force && B.force.until > now) return B.force.id;
      if (this.base === 'sleep' && B.wakeUntil > now) return 'observe';
      /* xong / chào là khoảnh khắc, không phải trạng thái: mừng xong thì ngắm thành quả (mắt mở, hơi cúi) — giảm chuyển động giữ dáng tĩnh */
      if (!RM && this.base === 'done' && now - this.tSwitch > 2800) return 'proud';
      if (!RM && this.base === 'greet' && now - this.tSwitch > 2600) return 'observe';
      if (B.doze === 2) return 'sleep';
      if (B.doze === 1) return 'sleepy';
      return this.base;
    },
    _live() { return LIVE[this._effId(performance.now())] || LIVE.observe; },

    /* ───────── lớp 2: chú ý — ngăn ưu tiên 0…6 */
    _setAtt(pri, t, ms) { this.att[pri] = { t, until: performance.now() + ms, pri, id: ++this.aid }; this._heat(260); },
    _clrAtt(pri) { this.att[pri] = null; },
    _valid(t, now) {
      if (!t) return false;
      if (t.k === 'el' || t.k === 'tilt') { if (!t.el || !t.el.isConnected) return false; const r = t.el.getBoundingClientRect(); return r.width > 0 || r.height > 0; }
      if (t.k === 'ptr') return PTR.on && now - PTR.t < 4000;
      return true;
    },
    _curAtt(now) { for (let p = 6; p >= 0; p--) { const a = this.att[p]; if (a && a.until > now && this._valid(a.t, now)) return a; } return null; },
    _gazePt(cx, cy) {
      const r = this.host.getBoundingClientRect();
      const ox = r.left + r.width / 2, oy = r.top + r.height / 2, dx = cx - ox, dy = cy - oy, D = Math.max(260, r.width * 4);
      const dist = Math.hypot(dx, dy) / Math.max(1, r.width);
      return { x: clamp(dx / Math.hypot(dx, D) * 1.15, -1, 1), y: clamp((dy + r.height * .1) / Math.hypot(dy, D * .8) * 1.1, -1, 1),
        vg: .26 * clamp(1.5 - dist, 0, 1), dist };
    },
    _gazeFor(t, now) {
      if (t.k === 'el') { const r = t.el.getBoundingClientRect(); return this._gazePt(r.left + r.width * (t.ax == null ? .5 : t.ax), r.top + r.height * (t.ay == null ? .5 : t.ay)); }
      if (t.k === 'pt') return this._gazePt(t.x, t.y);
      if (t.k === 'ptr') { const g = this._gazePt(PTR.x, PTR.y); g.pursuit = true; return g; }
      if (t.k === 'user') return { x: 0, y: .02, vg: 0 };
      if (t.k === 'think') return { x: .34 + .05 * Math.cos(now * .0047), y: -.5 + .045 * Math.sin(now * .0047), vg: 0, pursuit: true };
      if (t.k === 'tilt') { const r = t.el.getBoundingClientRect(), g = this._gazePt(r.left + r.width / 2, r.top + r.height / 2); g.x = clamp(g.x + t.ox * .32, -1, 1); g.y = clamp(g.y + t.oy * .22, -1, 1); g.pursuit = true; return g; }
      return { x: t.x || 0, y: t.y || 0, vg: 0 };
    },
    _restGaze(M) {
      if (M.side) return { x: M.side[0], y: M.side[1], vg: 0 };
      if (M.gaze) return { x: M.gaze[0], y: M.gaze[1], vg: 0 };
      if (M.asleep) return { x: 0, y: .25, vg: 0 };
      /* không có gì để nhìn: nhìn về phía nội dung trang */
      return this._gazePt(innerWidth * .42, innerHeight * .45);
    },
    /* đổi đích → giật mắt theo biên độ; đích đang chạy → bám; nhìn yên → vi giật */
    _gaze(now, dt, M) {
      const g = this.g, a = this._curAtt(now);
      let tg = a ? this._gazeFor(a.t, now) : null;
      if (!tg) tg = this._restGaze(M);
      const key = a ? 'a' + a.id : 'rest:' + M.id;
      const amp = Math.hypot(tg.x - g.x, tg.y - g.y);
      if (key !== g.key || (!tg.pursuit && Math.hypot(tg.x - g.tx, tg.y - g.ty) > .12) || (tg.pursuit && amp > .5 && now - g.at > 240)) {
        g.key = key; g.fx = g.x; g.fy = g.y; g.at = now; g.d = 25 + 90 * Math.min(1.6, amp);
        if ((amp > .8 && chance(.7)) || (amp > .55 && chance(.3))) { this._blink(now, 'n'); g.d *= 1.25; }
      }
      g.tx = tg.x; g.ty = tg.y;
      const p = (now - g.at) / g.d;
      if (p < 1) { const e = EASE(p); g.x = lerp(g.fx, g.tx, e); g.y = lerp(g.fy, g.ty, e); }
      else if (tg.pursuit) { g.x = sm(g.x, g.tx, dt, 64); g.y = sm(g.y, g.ty, dt, 64); }
      else { g.x = g.tx; g.y = g.ty; }
      /* vi giật khi nhìn yên (không khi đang bám hay đang giật) */
      const m = g.mic;
      if (now >= m.next) { m.fx = m.x; m.fy = m.y; m.tx = rand(-.032, .032); m.ty = rand(-.028, .028); m.at = now; m.next = now + logn(650, .4); }
      const mp = EASE(clamp((now - m.at) / 24));
      m.x = lerp(m.fx, m.tx, mp); m.y = lerp(m.fy, m.ty, mp);
      const still = p >= 1 && !tg.pursuit ? 1 : .25;
      spring(this.vgS, tg.vg || 0, dt / 1000, 12);
      return { x: clamp(g.x + m.x * still, -1, 1), y: clamp(g.y + m.y * still, -1, 1), vg: this.vgS.x, dist: tg.dist };
    },

    /* ───────── lớp 5: chớp mắt */
    _blink(now, kind) { if (now - this.bl.at < 260) return; this.bl.at = now; this.bl.kind = kind || 'n'; this._heat(kind === 'slow' ? 900 : 300); },
    _blinkVal(now, M) {
      const bl = this.bl, en = energy();
      if (M.bl > 0 && now >= bl.next) {
        this._blink(now, M.slow ? (chance(.5) ? 'slow' : 'half') : en < .7 && chance(.3) ? 'slow' : 'n');
        bl.dbl = chance(.12);
        bl.next = now + clamp(logn(M.bl * 1000 * (en < .7 ? .85 : 1), .45), 700, M.bl * 2600);
      }
      const u = now - bl.at, f = en < .7 ? 1.35 : 1;
      let c = 0;
      if (bl.kind === 'slow') c = u < 0 ? 0 : u < 230 ? EIN(u / 230) : u < 500 ? 1 : u < 880 ? 1 - EASE((u - 500) / 380) : 0;
      else if (bl.kind === 'half') c = u < 0 ? 0 : u < 150 ? .55 * EIN(u / 150) : u < 340 ? .55 : u < 640 ? .55 * (1 - EASE((u - 340) / 300)) : 0;
      else { const a = 76 * f, h = 45 * f, o = 190 * f; c = u < 0 ? 0 : u < a ? EIN(u / a) : u < a + h ? 1 : u < a + h + o ? 1 - EASE((u - a - h) / o) : 0;
        if (bl.dbl && u > a + h + o + 70) { bl.dbl = false; bl.at = now; } }
      return c;
    },

    /* ───────── lớp 4: cử chỉ */
    _gesture(id, now, o) {
      const G = GEST[id]; if (!G || this.dead) return;
      o = o || {};
      const ts = o.exact ? 1 : rand(.9, 1.1), as = o.exact ? 1 : rand(.88, 1.12) * (o.amp || 1);
      if (this.gs.some(x => x.G.cancels && x.G.cancels.indexOf(id) >= 0)) return;      /* đang nhảy mừng thì không gật vụn */
      this.gs = this.gs.filter(x => x.G.id !== id && !(G.cancels && G.cancels.indexOf(x.G.id) >= 0));
      const run = { G, t0: now, ts, as, tr: G.fn ? null : prepTracks(G.k, ts, as), d: G.d * ts, markDone: !!o.noMark };
      this.gs.push(run);
      this._heat(run.d + 120);
    },
    _gestureOffsets(now) {
      const O = {};
      for (let i = this.gs.length - 1; i >= 0; i--) {
        const r = this.gs[i], t = now - r.t0;
        if (t > r.d) { this.gs.splice(i, 1); continue; }
        if (r.G.mark && !r.markDone && t >= r.G.mark[0] * r.ts) { r.markDone = true; this._tmark(r.G.mark[1], '', r.G.mark[2]); }
        if (r.G.fn) { this._dizzy(t / r.d, t, O, r.as); continue; }
        for (const k in r.tr) O[k] = (O[k] || 0) + evalTrack(r.tr[k], t, 0);
      }
      return O;
    },
    /* chóng mặt: hai con ngươi quay vòng NGƯỢC chiều nhau, thân lắc lư, rồi chớp lấy lại tỉnh táo */
    _dizzy(u, t, O, as) {
      const env = Math.sin(Math.PI * clamp(u * 1.08)) * as, th = t * .0118;
      O.lgx = (O.lgx || 0) + .78 * env * Math.cos(th); O.lgy = (O.lgy || 0) + .7 * env * Math.sin(th);
      O.rgx = (O.rgx || 0) + .78 * env * Math.cos(-th + Math.PI); O.rgy = (O.rgy || 0) + .7 * env * Math.sin(-th + Math.PI);
      O.roll = (O.roll || 0) + 8 * env * Math.sin(t * .0066); O.yaw = (O.yaw || 0) + 6 * env * Math.sin(t * .0049 + 1.1);
      O.tx = (O.tx || 0) + 5 * env * Math.sin(t * .0066 + .6); O.sq = (O.sq || 0) + .025 * env * Math.sin(t * .0132);
      O.lidT = (O.lidT || 0) + .16 * env;
      if (u > .93 && !this._dzB) { this._dzB = true; this._blink(performance.now(), 'n'); }
      if (u < .5) this._dzB = false;
    },

    /* ───────── lớp 1: biểu cảm tạm */
    _xo(ex, ms) { const now = performance.now(); this.xo.push({ ex: expand(ex), until: now + ms }); this._heat(Math.min(ms, 3000) + 300); },
    _tmark(type, text, ms) { this.tmark = { type, text: text == null ? '' : String(text), until: performance.now() + ms }; this._heat(260); },

    /* ───────── lớp 7: bộ não — chán, ngủ gật, tỉnh dậy, thói quen lúc rảnh */
    _brain(now, M) {
      const B = this.brain, idle = now - USER.input, effId = M.id;
      if (B.force && B.force.until <= now) B.force = null;
      /* ngủ gật khi lâu không ai (chỉ ở các tâm trạng thức) */
      if (!B.doze && AWAKE[this.base] && !B.force && idle > 95000 && !this.o.static) { B.doze = 1; B.dozeAt = now; this._gesture('nodoff', now); }
      if (B.doze === 1) {
        if (idle < 2000) { B.doze = 0; this._blink(now, 'n'); }
        else if (now - B.dozeAt > 7200) { B.doze = 2; B.dozeAt = now; }
        else if (now - B.dozeAt > 3300 && !this.gs.length && chance(.02)) this._gesture('nodoff', now);
      }
      if (B.doze === 2 && idle < 1500) { B.doze = 0; this._gesture('startle', now); this._setAtt(5, { k: 'user' }, 900); if (chance(.6)) setTimeout(() => { if (!this.dead) this._gesture('yawn', performance.now()); }, 1100); }
      /* đang ngủ thật (nền ngủ): thở sâu, thỉnh thoảng trở mình */
      if (this.base === 'sleep') {
        if (B.wakeUntil > now) B.wasAwake = true;
        else if (B.wasAwake) { B.wasAwake = false; B.force = { id: 'sleepy', until: now + 3200 }; this._gesture('nodoff', now); }
      }
      if (M.asleep) {
        const nr = this._near(now);
        if (nr > 0 && nr < 2.2 && Math.hypot(PTR.vx, PTR.vy) > .6 && now - (B.lastNear || 0) > 700) { B.lastNear = now; this._disturb(now, false); }
        if (now >= B.next) { B.next = now + rand(9000, 22000); if (!this.gs.length) this._gesture('stir', now); }
        return;
      }
      /* thói quen lúc rảnh */
      if (now < B.next || this.gs.length || B.think || B.privacy) return;
      const hi = this._curAtt(now);
      if (hi && hi.pri >= 3) { B.next = now + rand(600, 1400); return; }
      const bored = clamp((idle - 14000) / 60000), en = energy(), wf = M.wander || 0;
      const C = B.cd, ok = (k, ms) => !(C[k] > now) || false;
      const acts = ['poi', 'user', 'around', 'tilt', 'stretch', 'yawn', 'sigh'];
      const w = [3.6 * wf, 2.0 + bored, ok('around') ? 1.1 * wf : 0, ok('tilt') ? .8 : 0, ok('stretch') && bored > .4 ? 1 : 0,
        ok('yawn') && (bored > .6 || en < .7) ? .9 : 0, ok('sigh') && bored > .5 ? .5 : 0];
      if (effId === 'doubt' || effId === 'worry') { w[3] = 0; w[4] = 0; w[5] = 0; }
      if (effId === 'focus') { w[2] = 0; w[3] = 0; w[4] = 0; w[5] = 0; w[6] = 0; }
      for (let i = 0; i < acts.length; i++) if (B.hist.indexOf(acts[i]) >= 0) w[i] *= acts[i] === 'poi' ? .55 : .18;
      const act = wpick(acts, w);
      B.next = now + logn((effId === 'curious' ? 1900 : 2700) / Math.max(.4, en), .35);
      if (!act) return;
      B.hist.unshift(act); B.hist.length = Math.min(B.hist.length, 2); B.lastIdle = act;
      if (act === 'poi') { const el = this._poiPick(); if (el) this._setAtt(1, { k: 'el', el, ax: rand(.2, .8), ay: rand(.3, .7) }, logn(1500, .45)); }
      else if (act === 'user') { this._setAtt(1, { k: 'user' }, logn(1500, .35)); if (chance(.45)) setTimeout(() => { if (!this.dead) this._blink(performance.now(), 'slow'); }, 420); }
      else if (act === 'around') { C.around = now + 14000; this._around(now); }
      else if (act === 'tilt') { C.tilt = now + 18000; this._gesture('tilt', now); this._setAtt(1, { k: 'user' }, 1600); }
      else if (act === 'stretch') { C.stretch = now + 50000; this._gesture('stretch', now); }
      else if (act === 'yawn') { C.yawn = now + 70000; this._gesture('yawn', now); }
      else if (act === 'sigh') { C.sigh = now + 45000; this._gesture('sigh', now); }
    },
    _around(now) {
      const pts = [[-.8, -.3], [.6, -.35], [-.5, .3], [.7, .25], [0, -.6]].sort(() => Math.random() - .5).slice(0, 3);
      pts.forEach((p, i) => setTimeout(() => { if (!this.dead) this._setAtt(1, { k: 'dir', x: p[0] + rand(-.1, .1), y: p[1] + rand(-.1, .1) }, 700); }, i * rand(520, 760)));
    },
    _poiPick() {
      let list = [];
      try { list = Array.prototype.slice.call(document.querySelectorAll(this.poiSel)); } catch (e) { list = []; }
      const H = innerHeight, Wd = innerWidth;
      list = list.filter(el => { if (el === this._lastPoi) return false; const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < H && r.right > 0 && r.left < Wd; });
      if (!list.length) return null;
      const el = list[Math.floor(Math.random() * list.length)]; this._lastPoi = el; return el;
    },

    /* ───────── giác quan → phản ứng */
    _near(now) {
      if (!PTR.on || now - PTR.t > 2500) return 0;
      const r = this.host.getBoundingClientRect(), d = Math.hypot(PTR.x - (r.left + r.width / 2), PTR.y - (r.top + r.height / 2)) / Math.max(1, r.width);
      return d;
    },
    _down(x, y, type, now) {
      if (this.dead || !this.cssW) return;
      const r = this.host.getBoundingClientRect(), d = Math.hypot(x - (r.left + r.width / 2), y - (r.top + r.height / 2));
      if (d < r.width * .52) { this._poke(now); return; }
      if (type === 'touch') { if (this._live().asleep) this._disturb(now, true); else this._setAtt(4, { k: 'pt', x, y }, 900); }
      else if (this._live().asleep) this._disturb(now, true);
    },
    /* chạm vào B0B: co người → lắc lư; chọc liên tục 5 lần → chóng mặt rồi nheo mắt "đủ rồi" */
    _poke(now) {
      const B = this.brain;
      if (this._live().asleep && this.base === 'sleep') { this._disturb(now, true); this._disturb(now, true); return; }
      if (B.doze) { B.doze = 0; this._gesture('startle', now); return; }
      B.pokes.push(now); while (B.pokes.length && now - B.pokes[0] > 2600) B.pokes.shift();
      if (B.pokes.length >= 5 && now - B.dizzyAt > 6000) { B.pokes.length = 0; B.dizzyAt = now; this._gesture('dizzy', now);
        setTimeout(() => { if (!this.dead) { this._xo({ lidT: .3, lidB: .22 }, 1300); this._gesture('shakeLite', performance.now()); } }, 1950); return; }
      this._gesture('flinch', now); setTimeout(() => { if (!this.dead) this._gesture('wiggle', performance.now()); }, 300);
      this._setAtt(5, { k: 'user' }, 1300);
    },
    _shook(now) { const B = this.brain; if (this._live().asleep || now - B.dizzyAt < 9000 || RM) return; B.dizzyAt = now; this._gesture('dizzy', now, { amp: .85 }); },
    _scrolled(e, now) {
      if (this.dead) return;
      const el = e.target === document ? document.scrollingElement : e.target, y = el && el.scrollTop || 0;
      const dt = Math.max(16, now - this.scr.t), v = this.scr.t > 0 && now - this.scr.t < 200 ? (y - (this.scr.y || 0)) / dt : 0;
      this.scr.y = y; this.scr.t = now; this.scr.v = clamp(v, -3, 3);
      if (Math.abs(v) > .4 && !this._live().asleep) this._setAtt(2, { k: 'dir', x: this.g.x * .5, y: clamp(v * .35, -.55, .55) }, 380);
      if (this._live().asleep) this._disturb(now, false);
    },
    _focusEl(el, now) { if (this._live().asleep) { this._disturb(now, true); return; } this._setAtt(3, { k: 'el', el }, 900); },
    _back(away, now) {
      if (this.dead || away < 20000) return;
      if (this._live().asleep) return;
      this.brain.doze = 0;
      this._setAtt(5, { k: 'user' }, 1600); this._gesture('hello', now + 0);
      setTimeout(() => { if (!this.dead) { const t = performance.now(); this._blink(t, 'n'); this.bl.dbl = true; } }, 260);
    },
    /* bị quấy khi đang ngủ: hé một mắt nhìn rồi ngủ tiếp; quấy nhiều thì tỉnh hẳn (rồi ngủ lại khi yên) */
    _disturb(now, strong) {
      const B = this.brain;
      if (this.base !== 'sleep' || RM) return;
      B.dist.push(now); while (B.dist.length && now - B.dist[0] > 6000) B.dist.shift();
      const n = B.dist.length + (strong ? 1 : 0);
      if (B.wakeUntil > now) { B.wakeUntil = Math.max(B.wakeUntil, now + 12000); return; }
      if (n >= 4) {
        B.wakeUntil = now + 12000; B.dist.length = 0;
        this._gesture('startle', now); this._setAtt(5, { k: 'ptr' }, 1200);
        setTimeout(() => { if (!this.dead && this.brain.wakeUntil > performance.now()) this._gesture('yawn', performance.now()); }, 1300);
        return;
      }
      if (now - B.lastHalf > 2600 && (strong || n >= 2)) { B.lastHalf = now; this._gesture('halfwake', now); this._setAtt(5, PTR.on ? { k: 'ptr' } : { k: 'user' }, 1500); }
    },

    /* ───────── trộn mọi lớp thành một tư thế */
    _compose(now, dt) {
      const s = dt / 1000, effId = this._effId(now), M = LIVE[effId] || LIVE.observe;
      if (M.look !== this.lookId) { this.lkFrom = Object.assign({}, this.lk, { body: this.lk.body.slice() }); this.lookId = M.look; this.tLook = now; }
      if (this.lkFrom) {
        const p = EASE(clamp((now - this.tLook) / 450)), A = this.lkFrom, B2 = LOOKS[M.look], lk = this.lk;
        for (let i = 0; i < 3; i++) lk.body[i] = lerp(A.body[i], B2.body[i], p);
        lk.lx = lerp(A.lx, B2.lx, p); lk.ly = lerp(A.ly, B2.ly, p); lk.lift = lerp(A.lift, B2.lift, p); lk.gloss = lerp(A.gloss, B2.gloss, p); lk.rim = lerp(A.rim, B2.rim, p);
        if (p >= 1) this.lkFrom = null;
      }
      this._brain(now, M);
      /* 1 · biểu cảm: đích = trung tính ⊕ tâm trạng ⊕ biểu cảm tạm (mới nhất thắng) → lò xo tới hạn */
      const T = Object.assign({}, EX0, M.exx);
      this.xo = this.xo.filter(x => x.until > now);
      for (const x of this.xo) Object.assign(T, x.ex);
      const near = this._near(now), B = this.brain;
      /* con trỏ: ở gần thì luôn dõi theo; ở xa thì dõi từng đợt (≈ 1,6 s) rồi thôi một lúc — có lúc nhìn việc khác, không nhìn chằm chằm.
         Con trỏ lao nhanh (vật chuyển động lớn) thì chú ý dù đang nghỉ dõi. */
      if (PTR.on && now - PTR.t < 260 && !M.asleep && !B.privacy && !B.think) {
        const fast = Math.hypot(PTR.vx, PTR.vy) > 1.3;
        if (near > 0 && near < 2.6) this._setAtt(3, { k: 'ptr' }, 700);
        else if (now >= (B.ptrNext || 0) || (fast && now >= (B.ptrFast || 0))) {
          const hold = logn(1600, .35); B.ptrNext = now + hold + logn(2600, .5); B.ptrFast = now + 3500;
          this._setAtt(3, { k: 'ptr' }, hold);
        }
      }
      /* được vuốt ve: con trỏ nằm yên trên người B0B → nhắm ◠ thư thái */
      const onBody = near > 0 && near < .42 && Math.hypot(PTR.vx, PTR.vy) < .25 && !M.asleep;
      if (onBody) { if (B.petAt < 0) B.petAt = now; } else B.petAt = -1;
      B.petting = onBody && now - B.petAt > 750;
      if (B.petting) Object.assign(T, { lOpen: .12, rOpen: .12, lBend: .42, rBend: .42, lLidT: 0, rLidT: 0, pitch: -3 });   /* hài lòng = nhắm ◠ + nhìn xuống (luật 5) */
      const w = M.asleep || effId === 'sleepy' ? 7 : 11;
      for (const k of EXK) spring(this.E[k], T[k], s, k === 'dot' ? 4.6 : k === 'acid' ? 9 : w);   /* đồng tử giãn chậm (≈ 0,8 s) */
      const E = {}; for (const k of EXK) E[k] = this.E[k].x;
      /* 2 · chú ý → ánh mắt */
      if (B.petting) this._setAtt(5, { k: 'ptr' }, 300);
      const gz = this._gaze(now, dt, M);
      /* 4 · cử chỉ */
      const O = this._gestureOffsets(now), o = k => O[k] || 0;
      /* 3 · đầu theo mắt (mắt đi trước), lại gần con trỏ thì nghiêng người về phía nó */
      const HY = 13, HP = 8;
      const ln = near > 0 && near < 1.8 && !M.asleep ? (1.8 - near) / 1.8 : 0, ptrDx = PTR.on ? clamp((PTR.x - (this.host.getBoundingClientRect().left + this.cssW / 2)) / Math.max(1, this.cssW), -1, 1) : 0;
      spring(this.lean, ln * ptrDx, s, 7);
      const hd = v => v * .55 + Math.sign(v) * Math.max(0, Math.abs(v) - .3) * .95;
      spring(this.hy, hd(gz.x) * HY, s, 8.5); spring(this.hp, -hd(gz.y) * HP, s, 8.5);
      const pupX = gz.x - .3 * (this.hy.x / HY), pupY = gz.y - .26 * (-this.hp.x / HP);
      /* 6 · trôi hữu cơ (nhiều tần số, không lặp) + hơi thở theo tâm trạng */
      const A = (M.drift || 1) * (B.petting ? .4 : 1);
      let yaw = E.yaw + this.hy.x + o('yaw') + this.lean.x * 4, pitch = E.pitch + this.hp.x + o('pitch'), roll = E.roll + o('roll');
      yaw += A * (.6 * Math.sin(now * .00061 + 1.3) + .4 * Math.sin(now * .00143 + .2));
      pitch += A * .6 * (.6 * Math.sin(now * .00053 + 2.1) + .4 * Math.sin(now * .00117 + 4));
      roll += A * .5 * (.6 * Math.sin(now * .00047 + .7) + .4 * Math.sin(now * .00131 + 3.3));
      if (B.petting) roll += 2.6 * Math.sin(now * .0052);
      this.bPer = sm(this.bPer, M.br[0], dt, 900); this.bAmp = sm(this.bAmp, M.br[1], dt, 600);
      this.bPhase += dt / this.bPer * TAU;
      const b = this.bAmp * Math.sin(this.bPhase);
      /* 5 · chớp */
      const bk = this._blinkVal(now, M);
      const sq = clamp(o('sq'), -.25, .25), byG = 1 + sq;
      const tyG = o('ty') + E.ty, lift = Math.max(0, -tyG);
      const P = {
        yaw: clamp(yaw, -70, 70), pitch: clamp(pitch, -40, 40), roll,
        tx: o('tx') + this.lean.x * 7, ty: tyG - b * 30 + R * (1 - byG),
        bx: (1 - b * .45) / Math.sqrt(byG), by: (1 + b) * byG,
        fx: pupX, fy: pupY,
        lgx: clamp(pupX + gz.vg + o('gx') + o('lgx'), -1, 1), lgy: clamp(pupY + o('gy') + o('lgy'), -1, 1),
        rgx: clamp(pupX - gz.vg + o('gx') + o('rgx'), -1, 1), rgy: clamp(pupY + o('gy') + o('rgy'), -1, 1),
        dot: clamp(E.dot + o('dot'), .4, 1.4), acid: E.acid,
        shk: 1 - .38 * clamp(lift / 42), sha: 1 - .5 * clamp(lift / 42)
      };
      for (const sd of ['l', 'r']) {
        const op = E[sd + 'Open'] + o('open') + o(sd + 'Open');
        P[sd + 'Open'] = clamp(op * (1 - bk), 0, 1.2);
        P[sd + 'LidT'] = clamp(E[sd + 'LidT'] + o('lidT') + o(sd + 'LidT'), -.4, 1);
        P[sd + 'LidB'] = clamp(E[sd + 'LidB'] + o('lidB'), 0, 1);
        P[sd + 'Tilt'] = E[sd + 'Tilt'] + o('tilt');
        P[sd + 'Bend'] = E[sd + 'Bend'] + o('bend') + o(sd + 'Bend');
        P[sd + 'Sx'] = E[sd + 'Sx'] + o('s') + o(sd + 'Sx'); P[sd + 'Sy'] = E[sd + 'Sy'] + o('s') + o(sd + 'Sy');
        P[sd + 'Rot'] = 0;
      }
      P.gx = P.fx; P.gy = P.fy;
      this._markSync(now, false);
      return P;
    },

    /* ───────── dấu trên đầu: dấu tạm (dữ liệu) › dấu của tâm trạng */
    _markWant(now) {
      if (this.tmark && this.tmark.until > now) return this.tmark;
      const M = RM ? REST[RM_OF[this._effId(now)] || 'observe'] : this._live();
      return M.mark ? { type: M.mark, text: '' } : null;
    },
    _markSync(now, force) {
      const w = this._markWant(now), key = w ? w.type + ':' + w.text : '';
      if (key === this.mkS.key) return;
      if (this.mkS.cur) {
        while (this.gB.firstChild) this.gB.removeChild(this.gB.firstChild);
        this.gB.appendChild(this.mkS.cur); this.gB.setAttribute('transform', this.gA.getAttribute('transform') || '');
        this.mkS.prevA = +(this.gA.getAttribute('opacity') || 0); this.mkS.prevAt = now;
        this.gB.setAttribute('opacity', String(this.mkS.prevA));
      }
      this.mkS.cur = w ? markNode(w.type, w.text) : null; this.mkS.key = key; this.mkS.type = w ? w.type : ''; this.mkS.born = now;
      if (this.mkS.cur) this.gA.appendChild(this.mkS.cur);
      this.gA.setAttribute('opacity', '0');
      this._heat(300);
    },
    _markFrame(now, P) {
      if (RM) this._markSync(now, false);
      const type = this.mkS.type;
      if (type) {
        let a = 1, dy = 0;
        if (type === 'zz' && !RM) { const u = ((now - this.mkS.born) % 6400) / 6400; a = u < .35 ? EASE(u / .35) : u < .8 ? 1 - EASE((u - .35) / .45) : 0; dy = 6 - 14 * u; }
        else if (!RM) { const p = EASE(clamp((now - this.mkS.born) / 220)); a = p; dy = (1 - p) * 8; }
        const zz = type === 'zz', y = P.ty - R * P.by - (zz ? 30 : 62) + dy, x = this._markX(zz ? 62 : 42) + (P.tx || 0);
        this.gA.setAttribute('transform', 'translate(' + x.toFixed(1) + ' ' + y.toFixed(1) + ')');
        this.gA.setAttribute('opacity', a.toFixed(3));
      }
      if (this.gB.firstChild) {
        const p = RM ? 1 : clamp((now - this.mkS.prevAt) / 200);
        if (p >= 1) { while (this.gB.firstChild) this.gB.removeChild(this.gB.firstChild); this.gB.setAttribute('opacity', '0'); }
        else this.gB.setAttribute('opacity', (this.mkS.prevA * (1 - EASE(p))).toFixed(3));
      }
    },
    _markX(d) { const s = this.o.markSide; return s === 'left' ? -d : s === 'center' ? 0 : d; },
    _markStatic() { const now = performance.now(); this._markSync(now, false); const P = RM ? this._rmPose(now) : restPose(RM_OF[this._effId(now)] || 'observe'); this._markFrame(now, P); },

    /* ───────── SỰ KIỆN TỪ TRANG: trang kể điều đang xảy ra, B0B tự quyết định cảm thế nào */
    emit(type, d) {
      if (this.dead) return this;
      try { this._on(type, d || {}, performance.now()); } catch (e) { /* bỏ qua */ }
      return this;
    },
    _on(type, d, now) {
      const B = this.brain, el = d.el && d.el.getBoundingClientRect ? d.el : null;
      if (type !== 'countdown' && type !== 'tilt') { USER.input = Math.max(USER.input, now - 1); if (B.doze) { B.doze = 0; } }
      switch (type) {
        case 'screen':
          for (let p = 0; p <= 6; p++) this._clrAtt(p);
          B.think = false; B.privacy = false; B.force = null; this.tmark = null; this.xo = [];
          if (d.poi) this.poiSel = d.poi;
          if (el) this._setAtt(2, { k: 'el', el, ay: .5 }, d.ms || 1600);
          if (d.view !== 'closed') { B.cd60 = false; B.cdSec = 1e9; }
          this.bl.next = now + rand(160, 300);          /* chớp ở chỗ chuyển cảnh, như người ngắt câu */
          break;
        /* tìm tên: đọc theo con trỏ chữ, có kết quả thì mắt sáng lên, không có thì ngờ vực */
        case 'type':
          if (el) this._setAtt(4, { k: 'el', el, ax: clamp(d.ax == null ? .5 : d.ax, .05, .95), ay: .5 }, 1400);
          this._xo({ lidB: .14, dot: .95 }, 1300);
          this.bl.next = now + rand(520, 780);          /* đang đọc thì không chớp — chớp ngay khi người gõ ngừng tay */
          if (d.space) this._gesture('count', now, { amp: .6 });
          break;
        case 'results':
          if (el) this._setAtt(5, { k: 'el', el, ax: .25 }, 1100);
          this._xo({ open: 1.06 }, 520); this._xo({ dot: 1.13 }, 1700);
          if (d.more) setTimeout(() => { if (!this.dead && d.last && d.last.isConnected) this._setAtt(4, { k: 'el', el: d.last, ax: .25 }, 700); }, 650);
          break;
        case 'none':
          this._gesture('tilt', now, { amp: .7 }); this._tmark('q', '', 1600);
          if (el) this._setAtt(4, { k: 'el', el }, 1200);
          break;
        case 'hover': if (el && !M_ASLEEP(this)) this._setAtt(3, { k: 'el', el, ax: d.ax, ay: d.ay }, d.ms || 650); break;
        case 'choose': this._gesture('nod', now); if (el) this._setAtt(5, { k: 'el', el }, 600); break;
        /* xác minh: B0B quay đi, nhắm mắt khi bạn gõ mã — không nhìn trộm */
        case 'pin':
          if (d.n > 0 && d.n < 4) {
            if (!B.privacy) { B.privacy = true; this._gesture('count', now, { amp: .5 }); }
            this._setAtt(6, { k: 'dir', x: d.side === 'left' ? -.95 : .95, y: -.35 }, 6000);
            this._xo({ open: .02, bend: -.24, lidT: 0, dot: .9 }, 6000);
          } else if (B.privacy) { B.privacy = false; this._clrAtt(6); this.xo = []; this._blink(now, 'n'); if (el) this._setAtt(4, { k: 'el', el }, 900); }
          break;
        case 'pinok':
          B.privacy = false; this._clrAtt(6); this.xo = [];
          this._xo({ open: .1, bend: .5, pitch: -3 }, 900); this._gesture('nod', now);
          break;
        case 'pinbad':
          B.privacy = false; this._clrAtt(6); this.xo = [];
          this._gesture('shake', now); this._setAtt(5, { k: 'user' }, 1100);
          break;
        case 'lock': B.privacy = false; this._clrAtt(6); this.xo = []; this._gesture('sigh', now); B.force = { id: 'worry', until: now + 4000 }; break;
        /* bảng tuần: liếc ô đang trỏ, gật đếm từng buổi chọn (dấu n / tối đa trên đầu), báo khi đủ để bấm */
        case 'pick':
          if (el) this._setAtt(5, { k: 'el', el }, 700);
          this._gesture('count', now);
          if (d.n) this._tmark('txt', d.n + '/' + (d.max || 4), 1500);
          if (d.n && d.max && d.n >= d.max) { this._xo({ open: .12, bend: .45, pitch: -3 }, 650); }
          break;
        case 'unpick': if (el) this._setAtt(5, { k: 'el', el }, 600); this._gesture('tilt', now, { amp: .5 }); break;
        case 'nope': if (el) this._setAtt(5, { k: 'el', el }, 900); this._xo({ lidT: .22, lidB: .3 }, 900); this._gesture('shakeLite', now); break;
        case 'ready': if (el) setTimeout(() => { if (!this.dead && el.isConnected) this._setAtt(5, { k: 'el', el }, 1400); }, 420); this._xo({ open: 1.06 }, 900); break;
        case 'send':
          B.think = true; this._setAtt(5, { k: 'think' }, 25000); B.force = { id: 'focus', until: now + 25000 };
          break;
        case 'sent': case 'idle':
          if (B.think) { B.think = false; this._clrAtt(5); B.force = null; }
          break;
        case 'booked':
          B.think = false; this._clrAtt(5); B.force = null;
          this._gesture('hop', now, { exact: false });
          if (el) setTimeout(() => { if (!this.dead && el.isConnected) this._setAtt(4, { k: 'el', el }, 2600); }, 520);
          this._xo({ lidB: .1 }, 2600);
          break;
        case 'error':
          B.think = false; this._clrAtt(5); B.force = { id: 'worry', until: now + 3500 }; this._gesture('sigh', now);
          if (el) this._setAtt(4, { k: 'el', el }, 1500);
          break;
        case 'ticket': if (el) this._setAtt(2, { k: 'el', el }, d.ms || 4000); break;
        case 'save': this._gesture('nod2', now); this._tmark('check', '', 1300); break;
        /* phiếu 3D đang xoay: mắt dõi theo phiếu; xoay mạnh quá thì B0B chóng mặt theo */
        case 'tilt':
          if (el) this._setAtt(4, { k: 'tilt', el, ox: clamp(d.x || 0, -1, 1), oy: clamp(d.y || 0, -1, 1) }, 900);
          if (Math.abs(d.v || 0) > 2.2 && now - B.dizzyAt > 9000) { B.dizzyAt = now; this._gesture('dizzy', now, { amp: .7 }); }
          break;
        case 'countdown': this._countdown(d.sec, el, now); break;
        case 'open': this._gesture('hop', now, { noMark: true }); this._tmark('bang', '', 1600); B.force = { id: 'curious', until: now + 2600 }; break;
        case 'offline': B.force = { id: 'worry', until: now + 6000 }; if (el) this._setAtt(4, { k: 'el', el }, 1500); this._gesture('sigh', now); break;
        case 'online': B.force = null; this._gesture('sigh', now, { amp: .6 }); setTimeout(() => { if (!this.dead) this._blink(performance.now(), 'slow'); }, 900); break;
        case 'sheet': case 'toast': if (el) this._setAtt(4, { k: 'el', el }, 1200); break;
        default: break;
      }
      this._heat(300);
    },
    /* đếm ngược tới giờ mở đặt: còn 60 giây thì tỉnh dậy, vươn vai; 10 giây cuối con ngươi Acid (dữ liệu sống) và đếm theo */
    _countdown(sec, el, now) {
      const B = this.brain;
      if (sec == null || sec < 0) return;
      if (sec <= 60 && !B.cd60) {
        B.cd60 = true; B.wakeUntil = now + 120000;
        this._gesture('startle', now);
        setTimeout(() => { if (!this.dead) this._gesture('yawn', performance.now()); }, 1100);
        setTimeout(() => { if (!this.dead) this._gesture('stretch', performance.now()); }, 3900);
      }
      if (sec <= 60) { B.wakeUntil = Math.max(B.wakeUntil, now + 4000); if (el) this._setAtt(2, { k: 'el', el, ax: .7 }, 3000); }
      if (sec <= 10) { B.force = { id: 'excited', until: now + 2500 }; if (el) this._setAtt(4, { k: 'el', el, ax: .85 }, 1600); }
      if (sec <= 5 && sec >= 1 && sec !== B.cdSec) { this._tmark('txt', String(sec), 900); this._gesture('count', now); }
      B.cdSec = sec;
    },

    /* ───────── API cũ (giữ nguyên hợp đồng) */
    mood(name) {
      if (name === undefined) return this.base;
      if (!LIVE[name] || this.dead) return this;
      if (name === this.base) return this;
      const now = performance.now();
      this.base = name; this.tSwitch = now;
      const M = LIVE[name];
      if (M.enter) this._gesture(M.enter, now);
      if (name !== 'sleep') this.brain.wakeUntil = -1e9;
      if (!AWAKE[name]) this.brain.doze = 0;
      this.bl.next = now + (M.bl ? rand(M.bl * 300, M.bl * 900) : 1e9);
      if (this.img) { this.img.src = this._imgSrc(); }
      this._markSync(now, false);
      if (this.img) this._markStatic();
      this._heat(600);
      return this;
    },
    look(x, y, ms) {
      if (this.dead) return this;
      if (x == null) { this._clrAtt(4); return this; }
      this._setAtt(4, { k: 'dir', x: clamp(+x || 0, -1, 1), y: clamp(+y || 0, -1, 1) }, ms == null ? 1400 : Math.max(0, ms));
      if (RM) { this.lastDraw = -1e9; this._sched(); }
      return this;
    },
    lookAtPoint(cx, cy, ms) { if (this.dead || !this.cssW) return this; this._setAtt(4, { k: 'pt', x: cx, y: cy }, ms == null ? 1400 : ms); if (RM) { this.lastDraw = -1e9; this._sched(); } return this; },
    attend(t, ms, pri) {
      if (this.dead || !t) return this;
      const tg = t.getBoundingClientRect ? { k: 'el', el: t } : t.k ? t : { k: 'pt', x: t.x, y: t.y };
      this._setAtt(clamp(pri == null ? 4 : pri, 0, 6), tg, ms == null ? 1400 : ms);
      return this;
    },
    react(kind, cx, cy) {
      if (this.dead) return this;
      const now = performance.now();
      if (kind === 'blink') this._blink(now, 'n');
      else if (kind === 'glance') {
        if (cx != null && cy != null) return this.lookAtPoint(cx, cy, 560);
        return this.look(Math.random() < .5 ? -.75 : .55, rand(-.2, .25), 520);
      } else if (kind === 'poke') this._poke(now);
      else if (GEST[kind]) this._gesture(kind, now);
      this._sched();
      return this;
    },
    poi(sel) { if (sel) this.poiSel = sel; return this; },
    pause() { this.paused = true; return this; },
    resume() { this.paused = false; this.lastDraw = -1e9; this._sched(); return this; },
    setSize(px) { css(this.host, { width: px + 'px', height: px + 'px' }); this._resize(); return this; },
    debug() {
      const now = performance.now(), a = this._curAtt(now);
      return { base: this.base, eff: this._effId(now), att: a ? a.pri + ':' + a.t.k : 'rest', gestures: this.gs.map(g => g.G.id), doze: this.brain.doze,
        wake: Math.max(0, this.brain.wakeUntil - now) | 0, idle: this.brain.lastIdle, mark: this.mkS.key, petting: this.brain.petting, draws: this._stats.draws };
    },
    destroy() {
      if (this.dead) return;
      this.dead = true; ALL.delete(this);
      if (this.raf) cancelAnimationFrame(this.raf);
      clearTimeout(this.rmT);
      if (this.ro) this.ro.disconnect(); if (this.io) this.io.disconnect();
      try { const x = this.G && this.G.gl.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } catch (e) { /* bỏ qua */ }
      [this.cv, this.svg, this.img].concat(this.sh || []).forEach(e => { if (e && e.parentNode) e.parentNode.removeChild(e); });
      this.G = null;
    }
  };
  function M_ASLEEP(b) { return !!b._live().asleep; }

  let SUP = null;
  window.B0B = {
    version: '1.1.0',
    moods: ['observe', 'greet', 'done', 'doubt', 'sleep', 'alert', 'curious', 'focus', 'proud', 'worry', 'sleepy', 'excited'],
    gestures: Object.keys(GEST),
    /* kiểm tra WebGL khi có người hỏi (không tạo context thừa lúc tải trang) */
    get supported() { if (SUP === null) { try { const c = document.createElement('canvas'), g = c.getContext('webgl'); SUP = !!(g && g.getExtension('OES_standard_derivatives')); if (g) { const x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } } catch (e) { SUP = false; } } return SUP; },
    mount(host, opts) {
      if (!host || !host.appendChild) throw new Error('B0B.mount: cần một phần tử host');
      return new Bob(host, Object.assign({ mood: 'observe', track: true, floor: true, imgBase: 'img/', markSide: 'right' }, opts || {}));
    },
    emit(type, data) { for (const b of ALL) b.emit(type, data); },
    get all() { return Array.from(ALL); }
  };
})();
