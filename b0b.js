/* B0B · linh vật B0DY — renderer v02 nhúng được (WebGL1 + OES_standard_derivatives), cùng shader và mô hình mắt
   "uốn vành, không cắt" của xưởng B0B v02, một đường cong cubic-bezier(.2,0,0,1).
   B0B.mount(host, {mood, track, floor, imgBase, markSide}) → b · b.mood(name) · b.look(x, y, ms) · b.lookAtPoint(cx, cy, ms)
   · b.react('nod'|'blink'|'glance', cx?, cy?) · b.pause() · b.resume() · b.setSize(px) · b.destroy()
   Tâm trạng: observe · greet · done · doubt · sleep · alert. Quả cầu lấp đầy host; canvas tràn ±25 % ngang, 42,5 % trên (dấu),
   20 % dưới (bóng sàn). Không WebGL / mất context → ảnh WebP. Style chỉ qua CSSOM (hợp CSP style-src 'self'). */
(function () {
  'use strict';
  if (window.B0B) return;

  /* ───────── toán */
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
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
  const EASE = bezier(.2, 0, 0, 1);

  /* ───────── màu + ánh sáng (đúng thiết lập các job đã xuất ảnh Figma) */
  const rgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const INK = rgb('#0A0A0A'), INK2 = rgb('#1A1A1A'), PAPER = rgb('#FAFAFA');
  const LOOKS = {
    light: { body: INK, lx: -.45, ly: -.55, lift: .22, gloss: .32, rim: .10 },
    dark: { body: INK2, lx: -.45, ly: -.55, lift: .22, gloss: .30, rim: .22 },
    top: { body: INK2, lx: 0, ly: -1.4, lift: .22, gloss: .36, rim: .26 }
  };
  const R = 100, EYE_Y = -10, EYE_S = .28, EYE_GAP = 72;
  /* khung (đơn vị file 0 có chấm, R = 100): canvas chỉ ôm quả cầu + bóng sàn; lớp SVG của dấu ✓ ! Z cao hơn, đè lên trên */
  const VB = { x: -150, y: -108, w: 300, h: 248 };
  const VM = { x: -150, y: -190, w: 300, h: 330 };
  const boxOf = v => ({ l: (v.x + R) / (2 * R), t: (v.y + R) / (2 * R), w: v.w / (2 * R), h: v.h / (2 * R) });
  const BOX = boxOf(VB), BOXM = boxOf(VM);

  /* ───────── shader: cầu ray-cast, mắt là phương trình dán trên mặt cầu, bóng sàn hai lớp (mềm + chạm) */
  const VS = 'attribute vec2 aP;void main(){gl_Position=vec4(aP,0.0,1.0);}';
  const FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec3 uView; uniform float uH; uniform vec2 uBreath; uniform float uTy;
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
  if (uFloor > 0.0 && p.y > 55.0) {
    float s1 = 0.09 * blob(p, vec2(0.0, 103.0), vec2(127.0, 16.0), 9.0);
    float s2 = 0.34 * blob(p, vec2(0.0, 100.5), vec2(66.0, 6.0), 2.7);
    sa = (1.0 - (1.0 - s1) * (1.0 - s2)) * uFloor;
  }
  vec2 q = vec2(p.x / (R * uBreath.x), (p.y - uTy) / (R * uBreath.y));
  float r2 = dot(q, q);
  vec3 N = normalize(vec3(q, sqrt(max(0.0, 1.0 - min(r2, 1.0)))));
  vec3 Lc = uMinv * N;
  vec2 dl = Lc.xy * R;
  /* mắt tính ở luồng ĐỒNG NHẤT (mọi điểm ảnh): cover() dùng fwidth — fwidth trong nhánh if không đồng nhất là không xác định,
     GPU thật trả rác ở các ô 2×2 vắt qua biên nhánh → chấm trắng dọc khung quanh mắt (SwiftShader không lộ). Khung chỉ còn là mặt nạ. */
  float rg0; float dt0; float rg1; float dt1;
  eye(dl, uEA[0], uEB[0], uEC[0], uED[0], rg0, dt0);
  eye(dl, uEA[1], uEB[1], uEC[1], uED[1], rg1, dt1);
  float em = smoothstep(0.0, 0.05, Lc.z) * step(abs(dl.x), 82.0) * step(abs(dl.y + 10.0), 64.0);
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
  const UNI = ['uView', 'uH', 'uBreath', 'uTy', 'uMinv', 'uEA', 'uEB', 'uEC', 'uED', 'uBody', 'uPaint', 'uDot', 'uLight', 'uMat', 'uRim', 'uFloor'];
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
  function draw(G, P, lk, floor, W, H) {
    const gl = G.gl, U = G.U;
    gl.viewport(0, 0, W, H);
    const sc = Math.min(W / VB.w, H / VB.h);
    gl.uniform3f(U.uView, VB.x - (W - VB.w * sc) / 2 / sc, VB.y - (H - VB.h * sc) / 2 / sc, 1 / sc);
    gl.uniform1f(U.uH, H);
    gl.uniform2f(U.uBreath, P.bx, P.by);
    gl.uniform1f(U.uTy, P.ty);
    MI.set(rotRows(P)); gl.uniformMatrix3fv(U.uMinv, false, MI);
    const gap = Math.max(EYE_GAP, 176 * EYE_S + 8), ey = EYE_Y + P.gy * 4;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, k = i ? 'r' : 'l', o = i * 4;
      EA[o] = P.gx * 5 + side * gap / 2; EA[o + 1] = ey; EA[o + 2] = EYE_S; EA[o + 3] = P[k + 'Rot'] * -side * D2R;
      EB[o] = clamp(P[k + 'Open']); EB[o + 1] = P[k + 'Sx']; EB[o + 2] = P[k + 'Sy']; EB[o + 3] = P.dot;
      EC[o] = clamp(P[k + 'LidT']); EC[o + 1] = clamp(P[k + 'LidB']); EC[o + 2] = P[k + 'Tilt']; EC[o + 3] = P[k + 'Bend'];
      ED[o] = clamp(P.gx, -1, 1); ED[o + 1] = clamp(P.gy, -1, 1); ED[o + 2] = side; ED[o + 3] = 1;
    }
    gl.uniform4fv(U.uEA, EA); gl.uniform4fv(U.uEB, EB); gl.uniform4fv(U.uEC, EC); gl.uniform4fv(U.uED, ED);
    gl.uniform3fv(U.uBody, lk.body); gl.uniform3fv(U.uPaint, PAPER); gl.uniform3fv(U.uDot, PAPER);
    const lx = lk.lx * 1.2, ly = lk.ly * 1.2, ln = Math.hypot(lx, ly, 1);
    gl.uniform3f(U.uLight, lx / ln, ly / ln, 1 / ln);
    gl.uniform4f(U.uMat, .62, lk.lift, 34, lk.gloss);
    gl.uniform1f(U.uRim, lk.rim);
    gl.uniform1f(U.uFloor, floor ? 1 : 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  /* ───────── tư thế */
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
      else if (k in NEUTRAL) o[k] = v;
    }
    return o;
  }
  /* L: vòng lặp (ms) hoặc thời điểm đứng yên nếu hold · rest: tau của khung tĩnh (giảm chuyển động) */
  const MOODS = {
    observe: { look: 'light', L: 8000, rest: 600, kf: [[0, 420, { gx: -.62, gy: .12, yaw: -8 }]],
      sacc: 1, micro: 1, track: 1, poke: 1, blink: [2600, 5200], drift: 1.4, breath: [5600, .012] },
    greet: { look: 'light', L: 2300, hold: 1, rest: 2300,
      kf: [[0, 400, { pitch: 3, gx: 0, gy: -.06 }], [520, 320, { open: .06, bend: .45 }], [1500, 300, { pitch: -6, ty: 2 }], [1850, 420, { pitch: -3, ty: 0 }]],
      poke: 1, drift: 1, breath: [5600, .012] },
    done: { look: 'light', L: 1100, hold: 1, rest: 1100, mark: 'check', markAt: 150,
      kf: [[0, 400, { gx: -.2, gy: .35 }], [150, 380, { open: .1, bend: .55 }], [180, 400, { pitch: -9, ty: 3 }], [620, 420, { pitch: -4, ty: 0 }]],
      drift: .8, breath: [5600, .012] },
    doubt: { look: 'dark', L: 6800, rest: 1200,
      kf: [[0, 420, { yaw: 9, roll: -3, gx: -.85, gy: -.05, lLidT: .78, lTilt: .55, lLidB: .25, rLidT: .12, rSx: 1.05, rSy: 1.05 }],
           [3000, 110, { open: 0 }], [3110, 220, { open: 1 }], [4200, 400, { gx: -.2 }], [5600, 400, { gx: -.85 }]],
      micro: 1, poke: 1, drift: .8, breath: [5600, .012] },
    sleep: { look: 'top', L: 6400, rest: 1200, mark: 'zz',
      kf: [[0, 600, { open: 0, bend: -.3, pitch: -6, roll: 4 }]], drift: .5, breath: [6400, .024] },
    alert: { look: 'light', L: 4700, hold: 1, rest: 4700, mark: 'bang', markAt: 100,
      kf: [[0, 140, { gx: 0, gy: 0 }], [0, 220, { s: 1.12, dot: .66, pitch: 2 }], [2800, 110, { open: 0 }], [2910, 200, { open: 1 }],
           [4300, 400, { s: 1.04, dot: .86, pitch: 0 }]],
      track: 1, poke: 1, blink: [3000, 6000], drift: .5, breath: [5600, .01] }
  };
  for (const id in MOODS) {
    const M = MOODS[id]; M.id = id; M.tracks = {};
    for (const [t, d, p] of M.kf) { const e = expand(p); for (const k in e) (M.tracks[k] || (M.tracks[k] = [])).push({ t, d: Math.max(1, d), v: e[k] }); }
    for (const k in M.tracks) M.tracks[k].sort((a, b) => a.t - b.t);
  }
  /* trước khoá đầu: vòng lặp lấy giá trị khoá cuối (liền mạch), tâm trạng giữ yên lấy tư thế trung tính */
  function evalTrack(tr, tau, n0) {
    let cur = null; const from0 = n0 === undefined ? tr[tr.length - 1].v : n0;
    for (let i = 0; i < tr.length; i++) {
      const k = tr[i]; if (k.t > tau) break;
      const v = cur ? lerp(cur.from, cur.k.v, EASE(clamp((k.t - cur.k.t) / cur.k.d))) : from0;
      cur = { from: v, k };
    }
    return cur ? lerp(cur.from, cur.k.v, EASE(clamp((tau - cur.k.t) / cur.k.d))) : from0;
  }
  function moodPose(M, tau) { const P = {}; for (const k of KEYS) P[k] = M.tracks[k] ? evalTrack(M.tracks[k], tau, M.hold ? NEUTRAL[k] : undefined) : NEUTRAL[k]; return P; }

  /* ───────── dấu trên đầu: SVG cùng hệ đơn vị với canvas (JetBrains Mono viết hoa · nét Mực) */
  const SVGNS = 'http://www.w3.org/2000/svg';
  const mk = (tag, at) => { const e = document.createElementNS(SVGNS, tag); for (const k in at) e.setAttribute(k, at[k]); return e; };
  function markNode(type) {
    const g = mk('g', { fill: 'none', stroke: '#0A0A0A' });
    if (type === 'check') g.appendChild(mk('path', { d: 'M-16 0L-5 11L16 -11', 'stroke-width': '3.2', 'stroke-linecap': 'butt', 'stroke-linejoin': 'miter' }));
    else if (type === 'bang') { g.appendChild(mk('path', { d: 'M0 -17V4', 'stroke-width': '3.6' })); g.appendChild(mk('rect', { x: '-1.8', y: '9', width: '3.6', height: '3.6', fill: '#0A0A0A', stroke: 'none' })); }
    else if (type === 'zz') {
      const t = (x, y, s, z) => { const e = mk('text', { x, y, 'font-size': s, 'font-family': 'JetBrains Mono, ui-monospace, Menlo, monospace', 'font-weight': '500', 'text-anchor': 'middle', fill: '#0A0A0A', stroke: 'none' }); e.textContent = z; return e; };
      g.appendChild(t('0', '-6', '24', 'Z')); g.appendChild(t('4', '20', '16', 'Z'));
    }
    return g;
  }
  /* độ hiện + độ trồi của dấu theo tau; null = không có dấu */
  function markState(M, tau, RM) {
    if (!M.mark) return null;
    if (M.mark === 'zz') {
      if (RM) return { a: 1, dy: 0 };
      const u = (tau % 6400) / 6400, a = u < .35 ? EASE(u / .35) : u < .8 ? 1 - EASE((u - .35) / .45) : 0;
      return { a, dy: 6 - 14 * u };
    }
    if (RM) return { a: 1, dy: 0 };
    const p = EASE(clamp((tau - M.markAt) / 200));
    return { a: p, dy: (1 - p) * 8 };
  }

  /* ───────── con trỏ dùng chung + danh sách thể hiện */
  const ALL = new Set();
  const PTR = { on: false, x: 0, y: 0, t: -1e9 };
  let bound = false;
  const RMq = window.matchMedia ? matchMedia('(prefers-reduced-motion: reduce)') : null;
  let RM = !!(RMq && RMq.matches);
  function onMove(e) {
    if (e.pointerType !== 'mouse' && e.pointerType !== 'pen') return;
    PTR.on = true; PTR.x = e.clientX; PTR.y = e.clientY; PTR.t = performance.now();
    for (const b of ALL) b._wake();
  }
  function onDown(e) {
    if (e.pointerType !== 'touch') return;
    for (const b of ALL) if (b._M.poke) b.lookAtPoint(e.clientX, e.clientY, 900);
  }
  function onOut(e) { if (!e.relatedTarget) PTR.on = false; }
  function onVis() { for (const b of ALL) b._sched(); }
  function bind() {
    if (bound) return; bound = true;
    addEventListener('pointermove', onMove, { passive: true });
    addEventListener('pointerdown', onDown, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    const rmc = () => { RM = !!(RMq && RMq.matches); for (const b of ALL) { b._rmChanged(); } };
    if (RMq) { if (RMq.addEventListener) RMq.addEventListener('change', rmc); else if (RMq.addListener) RMq.addListener(rmc); }
  }
  const IMG = { observe: 'quan-sat', greet: 'chao', done: 'chao', doubt: 'nghi', sleep: 'ngu', alert: 'quan-sat' };
  const css = (el, o) => { for (const k in o) el.style[k] = o[k]; return el; };
  const pct = v => (v * 100).toFixed(3) + '%';

  /* ───────── một thể hiện */
  function Bob(host, opts) {
    this.host = host; this.o = opts;
    this.paused = false; this.dead = false; this.vis = true; this.raf = 0; this.last = 0; this.lastDraw = -1e9; this.hot = 0;
    this.W = 0; this.H = 0; this.cssW = 0;
    const now = performance.now();
    this._M = MOODS[opts.mood] || MOODS.observe;
    this.t0 = now; this.prev = null; this.tSwitch = -1e9; this.raw = null;
    this.hot = now + (this._M.hold ? this._M.L + 300 : 600);
    const L0 = LOOKS[this._M.look];
    this.lk = { body: L0.body.slice(), lx: L0.lx, ly: L0.ly, lift: L0.lift, gloss: L0.gloss, rim: L0.rim }; this.lkFrom = null;
    this.w = { sacc: 0, micro: 0, track: 0, drift: 0, bA: 0 };
    this.bPhase = Math.random() * TAU;
    const rest = this._M.id === 'observe' ? { x: -.62, y: .12 } : { x: 0, y: 0 };
    this.sac = { x: rest.x, y: rest.y, fx: rest.x, fy: rest.y, tx: rest.x, ty: rest.y, at: -1e9, next: now + rand(900, 2200) };
    this.mic = { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, at: -1e9, next: now };
    this.bl = { at: -1e9, dur: 210, next: now + rand(1200, 2600) };
    this.ptr = { sx: rest.x, sy: rest.y };
    this.poke = { at: -1e9, hold: 0, gx: 0, gy: 0 };
    this.nod = { at: -1e9 };
    this.mk = { cur: null, curType: '', prev: null, prevAt: -1e9, prevA: 0 };
    this._stats = { draws: 0, ms: 0 };

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
    this._setMark(this._M);
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
        this.img.src = (this.o.imgBase == null ? 'img/' : this.o.imgBase) + 'b0b-' + IMG[this._M.id] + '.webp';
        this.host.insertBefore(this.img, this.cv); this.sh.forEach(s => this.host.insertBefore(s, this.img));
      } else if (!on && this.img) {
        this.img.remove(); this.sh.forEach(s => s.remove()); this.img = null; this.sh = null;
        this.cv.style.visibility = '';
      }
      if (on) this._markNow();
    },
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
      this.last = performance.now();
      this.raf = requestAnimationFrame(t => this._tick(t));
    },
    _wake() { if (!this.img && this._M.track && this.o.track !== false) { this.hot = Math.max(this.hot, performance.now() + 300); this._sched(); } },
    _rmChanged() { this.prev = null; this.lkFrom = null; this.lastDraw = -1e9; this._sched(); },
    _tick(now) {
      this.raf = 0;
      if (!this._active()) return;
      const hot = now < this.hot || (this.prev && now - this.tSwitch < 470) || this.w.track > .02;
      if (RM || hot || now - this.lastDraw >= 32) {
        const t0 = performance.now(), dt = Math.min(64, Math.max(0, now - (this.lastDraw > 0 ? this.lastDraw : now - 16)));
        const P = this._compose(now, dt);
        if (this.G && !this.img) draw(this.G, P, this.lk, this.o.floor !== false, this.W, this.H);
        this._markFrame(now, P);
        this.lastDraw = now;
        this._stats.draws++; this._stats.ms += performance.now() - t0;
      }
      if (RM) return;
      if (this.img && this._M.mark !== 'zz' && !hot) return;
      this.raf = requestAnimationFrame(t => this._tick(t));
    },
    _compose(now, dt) {
      const M = this._M;
      let tau = now - this.t0;
      tau = RM ? M.rest : M.hold ? Math.min(tau, M.L) : tau % M.L;
      this.tau = tau;
      const P = moodPose(M, tau);
      if (this.prev) {
        const p = RM ? 1 : EASE(clamp((now - this.tSwitch) / 450));
        if (p >= 1) this.prev = null; else for (const k of KEYS) P[k] = lerp(this.prev[k], P[k], p);
      }
      this.raw = Object.assign({}, P);
      if (this.lkFrom) {
        const p = RM ? 1 : EASE(clamp((now - this.tSwitch) / 450)), A = this.lkFrom, B = LOOKS[M.look], lk = this.lk;
        for (let i = 0; i < 3; i++) lk.body[i] = lerp(A.body[i], B.body[i], p);
        lk.lx = lerp(A.lx, B.lx, p); lk.ly = lerp(A.ly, B.ly, p); lk.lift = lerp(A.lift, B.lift, p); lk.gloss = lerp(A.gloss, B.gloss, p); lk.rim = lerp(A.rim, B.rim, p);
        if (p >= 1) this.lkFrom = null;
      }
      const w = this.w, live = !RM;
      const trackOn = live && M.track && this.o.track !== false && PTR.on && now - PTR.t < 2600;
      w.sacc = sm(w.sacc, live && M.sacc ? 1 : 0, dt, 250);
      w.micro = sm(w.micro, live && M.micro ? 1 : 0, dt, 250);
      w.track = sm(w.track, trackOn ? 1 : 0, dt, 220);
      w.drift = sm(w.drift, live ? M.drift : 0, dt, 600);
      w.bA = sm(w.bA, live ? M.breath[1] : 0, dt, 600);
      if (RM) { w.sacc = w.micro = w.track = w.drift = w.bA = 0; }
      const S = this.sac;
      if (live && M.sacc && now >= S.next) {
        S.fx = S.x; S.fy = S.y; S.at = now;
        if (Math.random() < .45) { S.tx = P.gx; S.ty = P.gy; } else { S.tx = rand(-.85, .45); S.ty = rand(-.35, .35); }
        S.next = now + rand(1400, 3600); this.hot = Math.max(this.hot, now + 220);
      }
      const sp = EASE(clamp((now - S.at) / 150));
      S.x = lerp(S.fx, S.tx, sp); S.y = lerp(S.fy, S.ty, sp);
      const m = this.mic;
      if (live && now >= m.next) { m.fx = m.x; m.fy = m.y; m.tx = rand(-.06, .06); m.ty = rand(-.05, .05); m.at = now; m.next = now + rand(260, 720); }
      const mp = EASE(clamp((now - m.at) / 70));
      m.x = lerp(m.fx, m.tx, mp); m.y = lerp(m.fy, m.ty, mp);
      let gx = lerp(P.gx, S.x, w.sacc) + w.micro * m.x;
      let gy = lerp(P.gy, S.y, w.sacc) + w.micro * m.y;
      if (w.track > .001) {
        const g = this._gazeOf(PTR.x, PTR.y);
        this.ptr.sx = sm(this.ptr.sx, g[0], dt, 90); this.ptr.sy = sm(this.ptr.sy, g[1], dt, 90);
        gx = lerp(gx, this.ptr.sx, w.track); gy = lerp(gy, this.ptr.sy, w.track);
      } else { this.ptr.sx = gx; this.ptr.sy = gy; }
      const pk = this.poke, pt = now - pk.at;
      let pw = 0;
      if (RM) pw = pt >= 0 && pt < pk.hold ? 1 : 0;
      else if (pt >= 0 && pt < pk.hold + 300) pw = pt < 120 ? EASE(pt / 120) : pt < pk.hold ? 1 : 1 - EASE((pt - pk.hold) / 300);
      gx = lerp(gx, pk.gx, pw); gy = lerp(gy, pk.gy, pw);
      gx = clamp(gx, -1, 1); gy = clamp(gy, -1, 1);
      let yaw = P.yaw + (gx - P.gx) * 10, pitch = P.pitch - (gy - P.gy) * 6, roll = P.roll, ty = P.ty;
      const A = w.drift;
      yaw += A * (.6 * Math.sin(now * .00061 + 1.3) + .4 * Math.sin(now * .00143 + .2));
      pitch += A * .6 * (.6 * Math.sin(now * .00053 + 2.1) + .4 * Math.sin(now * .00117 + 4));
      roll += A * .5 * (.6 * Math.sin(now * .00047 + .7) + .4 * Math.sin(now * .00131 + 3.3));
      const nu = (now - this.nod.at) / 760;
      if (!RM && nu >= 0 && nu <= 1) { const f = nu < .35 ? EASE(nu / .35) : 1 - EASE((nu - .35) / .65); pitch -= 7 * f; ty += 2.5 * f; }
      this.bPhase += dt / M.breath[0] * TAU;
      const b = w.bA * Math.sin(this.bPhase);
      const bl = this.bl;
      if (live && M.blink && now >= bl.next) { bl.at = now; bl.dur = 210; bl.next = now + (Math.random() < .14 ? 320 : rand(M.blink[0], M.blink[1])); this.hot = Math.max(this.hot, now + 260); }
      const bu = (now - bl.at) / bl.dur;
      const k = bu >= 0 && bu <= 1 ? (bu < .4 ? EASE(bu / .4) : bu < .5 ? 1 : 1 - EASE((bu - .5) / .5)) : 0;
      return Object.assign(P, {
        yaw: clamp(yaw, -70, 70), pitch: clamp(pitch, -40, 40), roll, gx, gy,
        lOpen: clamp(P.lOpen * (1 - k)), rOpen: clamp(P.rOpen * (1 - k)),
        bx: 1 - b * .45, by: 1 + b, ty: ty - b * 30
      });
    },
    _gazeOf(cx, cy) {
      const r = this.host.getBoundingClientRect();
      const dx = cx - (r.left + r.width / 2), dy = cy - (r.top + r.height / 2), D = Math.max(260, r.width * 4);
      return [clamp(dx / Math.hypot(dx, D) * 1.15, -1, 1), clamp((dy + r.height * .1) / Math.hypot(dy, D * .8) * 1.1, -1, 1)];
    },
    _markX(d) { const s = this.o.markSide; return s === 'left' ? -d : s === 'center' ? 0 : d; },
    _setMark(M) {
      const type = M.mark || '';
      if (type === this.mk.curType) return;
      if (this.mk.cur) {
        while (this.gB.firstChild) this.gB.removeChild(this.gB.firstChild);
        this.gB.appendChild(this.mk.cur); this.gB.setAttribute('transform', this.gA.getAttribute('transform') || '');
        this.mk.prevA = +(this.gA.getAttribute('opacity') || 0); this.mk.prevAt = performance.now();
        this.gB.setAttribute('opacity', String(this.mk.prevA));
      }
      this.mk.cur = type ? markNode(type) : null; this.mk.curType = type;
      if (this.mk.cur) this.gA.appendChild(this.mk.cur);
      this.gA.setAttribute('opacity', '0');
    },
    _markFrame(now, P) {
      const st = markState(this._M, this.tau, RM);
      if (st) {
        const zz = this._M.mark === 'zz', y = P.ty - R * P.by - (zz ? 30 : 62) + st.dy, x = this._markX(zz ? 62 : 42);
        this.gA.setAttribute('transform', 'translate(' + x + ' ' + y.toFixed(1) + ')');
        this.gA.setAttribute('opacity', st.a.toFixed(3));
      }
      if (this.gB.firstChild) {
        const p = RM ? 1 : clamp((now - this.mk.prevAt) / 200);
        if (p >= 1) { while (this.gB.firstChild) this.gB.removeChild(this.gB.firstChild); this.gB.setAttribute('opacity', '0'); }
        else this.gB.setAttribute('opacity', (this.mk.prevA * (1 - EASE(p))).toFixed(3));
      }
    },
    _markNow() { const P = Object.assign(moodPose(this._M, this._M.rest), { bx: 1, by: 1 }); this.tau = this._M.rest; this._markFrame(performance.now(), P); },

    /* ───────── API */
    mood(name) {
      if (name === undefined) return this._M.id;
      const M = MOODS[name];
      if (!M || M === this._M || this.dead) return this;
      const now = performance.now();
      if (this.raw && !RM) { this.prev = Object.assign({}, this.raw); }
      this.lkFrom = { body: this.lk.body.slice(), lx: this.lk.lx, ly: this.lk.ly, lift: this.lk.lift, gloss: this.lk.gloss, rim: this.lk.rim };
      this.tSwitch = now; this.t0 = now; this._M = M;
      if (M.sacc) { this.sac.next = now + rand(900, 1800); }
      this.bl.next = now + (M.blink ? rand(M.blink[0] * .5, M.blink[0]) : 1e9);
      if (!M.poke) this.poke.at = -1e9;
      this._setMark(M);
      if (this.img) { this.img.src = (this.o.imgBase == null ? 'img/' : this.o.imgBase) + 'b0b-' + IMG[M.id] + '.webp'; this._markNow(); }
      this.hot = Math.max(this.hot, now + (M.hold ? M.L + 300 : 600));
      this.lastDraw = -1e9; this._sched();
      return this;
    },
    look(x, y, ms) {
      if (this.dead || x == null) { this.poke.at = -1e9; return this; }
      const now = performance.now(), hold = ms == null ? 1400 : Math.max(0, ms);
      this.poke = { at: now, hold, gx: clamp(+x || 0, -1, 1), gy: clamp(+y || 0, -1, 1) };
      this.hot = Math.max(this.hot, now + hold + 320); this._sched();
      if (RM) { clearTimeout(this.rmT); this.rmT = setTimeout(() => { this.lastDraw = -1e9; this._sched(); }, hold + 20); }
      return this;
    },
    lookAtPoint(cx, cy, ms) { if (this.dead || !this.cssW) return this; const g = this._gazeOf(cx, cy); return this.look(g[0], g[1], ms); },
    react(kind, cx, cy) {
      if (this.dead) return this;
      const now = performance.now();
      if (kind === 'nod') { this.nod.at = now; this.hot = Math.max(this.hot, now + 800); }
      else if (kind === 'blink') { this.bl.at = now; this.bl.dur = 210; this.hot = Math.max(this.hot, now + 260); }
      else if (kind === 'glance') {
        if (cx != null && cy != null) return this.lookAtPoint(cx, cy, 560);
        return this.look(Math.random() < .5 ? -.75 : .55, rand(-.2, .25), 520);
      }
      this._sched();
      return this;
    },
    pause() { this.paused = true; return this; },
    resume() { this.paused = false; this.lastDraw = -1e9; this._sched(); return this; },
    setSize(px) { css(this.host, { width: px + 'px', height: px + 'px' }); this._resize(); return this; },
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

  let SUP = null;
  window.B0B = {
    version: '1.0.0',
    moods: Object.keys(MOODS),
    /* kiểm tra WebGL khi có người hỏi (không tạo context thừa lúc tải trang) */
    get supported() { if (SUP === null) { try { const c = document.createElement('canvas'), g = c.getContext('webgl'); SUP = !!(g && g.getExtension('OES_standard_derivatives')); if (g) { const x = g.getExtension('WEBGL_lose_context'); if (x) x.loseContext(); } } catch (e) { SUP = false; } } return SUP; },
    mount(host, opts) {
      if (!host || !host.appendChild) throw new Error('B0B.mount: cần một phần tử host');
      return new Bob(host, Object.assign({ mood: 'observe', track: true, floor: true, imgBase: 'img/', markSide: 'right' }, opts || {}));
    }
  };
})();
