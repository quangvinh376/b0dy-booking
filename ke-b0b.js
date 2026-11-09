/* B0B cho trang ke.html ("Để B0DY kể về bạn") — đúng mã renderer của bản artifact 3.3 (proto/src/b0b.js); chỉ thêm dòng cuối gắn window.B0B.
   Trang đặt lịch dùng b0b.js (B0B 1.1, cảm xúc theo sự kiện); hành trình cần mount(slot data-mood) + snapshot() cho thẻ chia sẻ. */
/* B0B · renderer chuẩn v02 (xưởng nhân vật 14.10.2026), rút gọn cho hành trình "Để B0DY kể về bạn".
   Một canvas WebGL duy nhất, gắn vào khoảnh khắc đang mở. Mắt là hai "0 có chấm": vành 88 × 115, nét 48, chấm r20. */
const B0B = (() => {
  'use strict';
  const TAU = Math.PI * 2, D2R = Math.PI / 180;
  const clamp = (v, a = 0, b = 1) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const sm = (c, t, dt, tau) => c + (t - c) * (1 - Math.exp(-dt / tau));
  const r1 = v => Math.round(v * 10) / 10;
  function bezier(x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx, cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    const X = t => ((ax * t + bx) * t + cx) * t, Y = t => ((ay * t + by) * t + cy) * t, dX = t => (3 * ax * t + 2 * bx) * t + cx;
    return x => { if (x <= 0) return 0; if (x >= 1) return 1; let t = x;
      for (let i = 0; i < 8; i++) { const e = X(t) - x; if (Math.abs(e) < 1e-6) break; const d = dX(t); if (Math.abs(d) < 1e-6) break; t -= e / d; }
      return Y(clamp(t)); };
  }
  const EASE = bezier(.2, 0, 0, 1);
  const HEX = { paper: '#FAFAFA', mist: '#EFEFEF', ink: '#0A0A0A', ink2: '#1A1A1A', acid: '#D4FF00' };
  const rgb = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const R = 100, EYE_Y = -10;
  const VS = 'attribute vec2 aP;void main(){gl_Position=vec4(aP,0.0,1.0);}';
  const FS = `#extension GL_OES_standard_derivatives : enable
precision highp float;
uniform vec3 uView; uniform float uH; uniform float uR; uniform vec2 uBreath; uniform float uTy;
uniform mat3 uMinv;
uniform vec4 uEA[2]; uniform vec4 uEB[2]; uniform vec4 uEC[2]; uniform vec4 uED[2];
uniform vec3 uBody; uniform vec3 uPaint; uniform vec3 uDot;
uniform vec3 uLight; uniform vec4 uMat; uniform float uRim; uniform float uShade;
uniform vec4 uShadow; uniform vec3 uShadowCol;
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
void main(){
  vec2 p = uView.xy + vec2(gl_FragCoord.x, uH - gl_FragCoord.y) * uView.z;
  vec2 ds = (p - vec2(0.0, uShadow.x)) / uShadow.yz;
  float sd = dot(ds, ds);
  float sa = uShadow.w * exp(-sd * 1.7);
  vec2 q = vec2(p.x / (uR * uBreath.x), (p.y - uTy) / (uR * uBreath.y));
  float r2 = dot(q, q);
  vec3 col = vec3(0.0); float a = 0.0;
  if (r2 < 1.21) {
    a = clamp((1.0 - sqrt(r2)) * uR * min(uBreath.x, uBreath.y) / uView.z + 0.5, 0.0, 1.0);
    vec3 N = normalize(vec3(q, sqrt(max(0.0, 1.0 - min(r2, 1.0)))));
    vec3 Lc = uMinv * N;
    vec2 dl = Lc.xy * uR;
    float front = smoothstep(0.0, 0.05, Lc.z);
    vec3 base = uBody;
    float rg; float dt;
    eye(dl, uEA[0], uEB[0], uEC[0], uED[0], rg, dt);
    base = mix(base, uPaint, rg * front); base = mix(base, uDot, dt * front);
    eye(dl, uEA[1], uEB[1], uEC[1], uED[1], rg, dt);
    base = mix(base, uPaint, rg * front); base = mix(base, uDot, dt * front);
    col = shade(base, N);
  }
  vec3 outc = col * a + uShadowCol * sa * (1.0 - a);
  float outa = a + sa * (1.0 - a);
  outc += (hash(gl_FragCoord.xy) - 0.5) / 255.0 * outa;
  gl_FragColor = vec4(outc, outa);
}`;
  const UNI = ['uView', 'uH', 'uR', 'uBreath', 'uTy', 'uMinv', 'uEA', 'uEB', 'uEC', 'uED', 'uBody', 'uPaint', 'uDot', 'uLight', 'uMat', 'uRim', 'uShade', 'uShadow', 'uShadowCol'];
  function makeRenderer(canvas, keep) {
    let gl = null;
    try { gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, preserveDrawingBuffer: !!keep }); } catch (e) { gl = null; }
    if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; };
    const vs = sh(gl.VERTEX_SHADER, VS), fs = sh(gl.FRAGMENT_SHADER, FS); if (!vs || !fs) return null;
    const pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return null;
    gl.useProgram(pr);
    const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const al = gl.getAttribLocation(pr, 'aP'); gl.enableVertexAttribArray(al); gl.vertexAttribPointer(al, 2, gl.FLOAT, false, 0, 0);
    const U = {}; for (const n of UNI) U[n] = gl.getUniformLocation(pr, n);
    return { gl, canvas, U };
  }
  function rotRows(P) {
    const cy = Math.cos(P.yaw * D2R), sy = Math.sin(P.yaw * D2R), cp = Math.cos(P.pitch * D2R), sp = Math.sin(P.pitch * D2R), cr = Math.cos(P.roll * D2R), sr = Math.sin(P.roll * D2R);
    const mul = (A, B) => { const o = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]); return o; };
    const Rz = [cr, -sr, 0, sr, cr, 0, 0, 0, 1], Rx = [1, 0, 0, 0, cp, -sp, 0, sp, cp], Ry = [cy, 0, sy, 0, 1, 0, -sy, 0, cy];
    return mul(Ry, mul(Rx, Rz));
  }
  /* thân Ink trên nền sáng/màu; thân Paper trên nền tối. Nền tối: không bóng sàn. */
  function palette(c) {
    const dark = c.stage === 'ink', inkBody = c.body === 'ink';
    return { body: inkBody ? (dark ? HEX.ink2 : HEX.ink) : HEX.paper, paint: inkBody ? HEX.paper : HEX.ink, shadowCol: HEX.ink, shadowA: dark || c.shadow === 'off' ? 0 : .16 };
  }
  const EA = new Float32Array(8), EB = new Float32Array(8), EC = new Float32Array(8), ED = new Float32Array(8);
  const VB = { x: -240, y: -232, w: 480, h: 444 };
  function render(Rd, P, c, W, H) {
    const gl = Rd.gl, U = Rd.U, pal = palette(c);
    if (Rd.canvas.width !== W) Rd.canvas.width = W;
    if (Rd.canvas.height !== H) Rd.canvas.height = H;
    gl.viewport(0, 0, W, H);
    const sc = Math.min(W / VB.w, H / VB.h);
    gl.uniform3f(U.uView, VB.x - (W - VB.w * sc) / 2 / sc, VB.y - (H - VB.h * sc) / 2 / sc, 1 / sc);
    gl.uniform1f(U.uH, H); gl.uniform1f(U.uR, R);
    gl.uniform2f(U.uBreath, P.bx, P.by); gl.uniform1f(U.uTy, P.ty);
    gl.uniformMatrix3fv(U.uMinv, false, new Float32Array(rotRows(P)));
    const s = .28, gap = 72, ey = EYE_Y + P.gy * 4;
    for (let i = 0; i < 2; i++) {
      const side = i ? 1 : -1, k = i ? 'r' : 'l', o = i * 4;
      EA[o] = P.gx * 5 + side * gap / 2; EA[o + 1] = ey; EA[o + 2] = s; EA[o + 3] = (P[k + 'Rot'] || 0) * -side * D2R;
      EB[o] = clamp(P[k + 'Open']); EB[o + 1] = P[k + 'Sx']; EB[o + 2] = P[k + 'Sy']; EB[o + 3] = P.dot;
      EC[o] = clamp(P[k + 'LidT']); EC[o + 1] = clamp(P[k + 'LidB']); EC[o + 2] = P[k + 'Tilt']; EC[o + 3] = P[k + 'Bend'];
      ED[o] = clamp(P.gx, -1, 1); ED[o + 1] = clamp(P.gy, -1, 1); ED[o + 2] = side; ED[o + 3] = 1;
    }
    gl.uniform4fv(U.uEA, EA); gl.uniform4fv(U.uEB, EB); gl.uniform4fv(U.uEC, EC); gl.uniform4fv(U.uED, ED);
    gl.uniform3fv(U.uBody, rgb(pal.body)); gl.uniform3fv(U.uPaint, rgb(pal.paint)); gl.uniform3fv(U.uDot, rgb(pal.paint));
    const lx = -.45 * 1.2, ly = -.55 * 1.2, ln = Math.hypot(lx, ly, 1);
    gl.uniform3f(U.uLight, lx / ln, ly / ln, 1 / ln);
    gl.uniform4f(U.uMat, .62, .22, 34, .26); gl.uniform1f(U.uRim, .14); gl.uniform1f(U.uShade, 1);
    gl.uniform4f(U.uShadow, R + 40, 64, 9, pal.shadowA); gl.uniform3fv(U.uShadowCol, rgb(pal.shadowCol));
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  /* tư thế: lấy nguyên từ bản chuẩn */
  const NEUTRAL = { yaw: 0, pitch: 0, roll: 0, ty: 0, gx: 0, gy: 0, dot: 1, lOpen: 1, rOpen: 1, lSx: 1, lSy: 1, rSx: 1, rSy: 1, lLidT: 0, rLidT: 0, lLidB: 0, rLidB: 0, lTilt: 0, rTilt: 0, lBend: 0, rBend: 0, lRot: 0, rRot: 0 };
  const KEYS = Object.keys(NEUTRAL);
  const BOTH = { open: 'Open', lidT: 'LidT', lidB: 'LidB', tilt: 'Tilt', bend: 'Bend', rot: 'Rot' };
  function expand(p) { const o = {}; for (const [k, v] of Object.entries(p)) { if (BOTH[k]) { o['l' + BOTH[k]] = v; o['r' + BOTH[k]] = v; } else if (k === 's') { o.lSx = o.lSy = o.rSx = o.rSy = v; } else if (k === 'esy') { o.lSy = o.rSy = v; } else if (!/Brow/.test(k) && k !== 'browY' && k !== 'browA') o[k] = v; } return o; }
  const MOODS = {
    observe: { L: 8000, key: 600, kf: [], sacc: 1, micro: 1, blink: [2600, 5200], drift: 1.4, breath: [5600, .012] },
    greet: { L: 6400, key: 300, kf: [[0, 400, { pitch: 3, gx: 0, gy: -.06 }], [520, 320, { open: .06, bend: .45 }], [900, 420, { open: 1, bend: 0 }], [1500, 300, { pitch: -6, ty: 2 }], [1850, 420, { pitch: 3, ty: 0 }], [4200, 400, { gx: -.3, gy: .1 }], [5500, 400, { gx: 0, gy: -.06 }]], micro: 1, blink: [3800, 6200], drift: 1, breath: [5600, .012] },
    sleep: { L: 6400, key: 1200, kf: [[0, 600, { open: 0, bend: -.3, pitch: -6, roll: 4, ty: 4 }]], drift: .5, breath: [6400, .024], z: 1 },
    doubt: { L: 6800, key: 1200, kf: [[0, 420, { yaw: 9, roll: -3, gx: -.85, gy: -.05, lLidT: .78, lTilt: .55, lLidB: .25, rLidT: .12, rSx: 1.05, rSy: 1.05 }], [3000, 110, { open: 0 }], [3110, 220, { open: 1 }], [4200, 400, { gx: -.2 }], [5600, 400, { gx: -.85 }]], micro: 1, drift: .8, breath: [5600, .012] },
    done: { L: 5200, key: 700, kf: [[0, 400, { gx: -.2, gy: .35 }], [150, 380, { open: .12, bend: .55 }], [180, 400, { pitch: -9, ty: 3 }], [620, 420, { pitch: 0, ty: 0 }], [1700, 420, { open: 1, bend: 0 }], [3600, 400, { gx: 0, gy: 0 }]], drift: .8, breath: [5600, .012] }
  };
  for (const M of Object.values(MOODS)) { M.tracks = {}; for (const [t, d, p] of M.kf) for (const [k, v] of Object.entries(expand(p))) (M.tracks[k] || (M.tracks[k] = [])).push({ t, d: Math.max(1, d), v }); for (const k in M.tracks) M.tracks[k].sort((a, b) => a.t - b.t); }
  function evalTrack(tr, tau) { let cur = null; const from0 = tr[tr.length - 1].v; for (let i = 0; i < tr.length; i++) { const k = tr[i]; if (k.t > tau) break; const v = cur ? lerp(cur.from, cur.k.v, EASE(clamp((k.t - cur.k.t) / cur.k.d))) : from0; cur = { from: v, k }; } return cur ? lerp(cur.from, cur.k.v, EASE(clamp((tau - cur.k.t) / cur.k.d))) : from0; }
  function moodPose(M, tau) { const P = {}; for (const k of KEYS) P[k] = M.tracks[k] ? evalTrack(M.tracks[k], tau) : NEUTRAL[k]; return P; }

  const RM = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cv = document.createElement('canvas'); cv.className = 'b0b-cv'; cv.setAttribute('aria-hidden', 'true');
  const ov = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); ov.setAttribute('viewBox', '-240 -232 480 444'); ov.setAttribute('class', 'b0b-ov'); ov.setAttribute('aria-hidden', 'true');
  const imp = document.createElementNS('http://www.w3.org/2000/svg', 'g'); ov.appendChild(imp);
  imp.innerHTML = '<text x="0" y="8" text-anchor="middle" font-family="JetBrains Mono, ui-monospace, monospace" font-weight="500" font-size="26" letter-spacing="1.8" fill="currentColor">Z</text>';
  const RS = makeRenderer(cv, false);
  const now0 = performance.now();
  const S = { M: MOODS.observe, c: { body: 'paper', stage: 'ink' }, t0: now0, W: 1, H: 1, slot: null, raf: 0, last: now0,
    w: { sacc: 0, micro: 0, drift: 0, bA: 0 }, bPhase: 0,
    sac: { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, at: 0, next: now0 + 900 }, mic: { x: 0, y: 0, fx: 0, fy: 0, tx: 0, ty: 0, at: 0, next: now0 }, bl: { at: -1e9, dur: 210, next: now0 + 1800 } };
  function compose(now, dt) {
    const M = S.M, tau = RM ? M.key : (now - S.t0) % M.L; S.tau = tau;
    const P = moodPose(M, tau), w = S.w;
    w.sacc = sm(w.sacc, M.sacc && !RM ? 1 : 0, dt, 250); w.micro = sm(w.micro, M.micro && !RM ? 1 : 0, dt, 250);
    w.drift = sm(w.drift, RM ? 0 : M.drift, dt, 600); w.bA = sm(w.bA, RM ? 0 : M.breath[1], dt, 600);
    if (M.sacc && now >= S.sac.next) { S.sac.fx = S.sac.x; S.sac.fy = S.sac.y; S.sac.at = now; if (Math.random() < .35) { S.sac.tx = 0; S.sac.ty = 0; } else { S.sac.tx = rand(-.75, .75); S.sac.ty = rand(-.45, .45); } S.sac.next = now + rand(1400, 3600); }
    const sp = EASE(clamp((now - S.sac.at) / 150)); S.sac.x = lerp(S.sac.fx, S.sac.tx, sp); S.sac.y = lerp(S.sac.fy, S.sac.ty, sp);
    if (now >= S.mic.next) { S.mic.fx = S.mic.x; S.mic.fy = S.mic.y; S.mic.tx = rand(-.06, .06); S.mic.ty = rand(-.05, .05); S.mic.at = now; S.mic.next = now + rand(260, 720); }
    const mp = EASE(clamp((now - S.mic.at) / 70)); S.mic.x = lerp(S.mic.fx, S.mic.tx, mp); S.mic.y = lerp(S.mic.fy, S.mic.ty, mp);
    const gx = P.gx + w.sacc * S.sac.x + w.micro * S.mic.x, gy = P.gy + w.sacc * S.sac.y + w.micro * S.mic.y;
    const A = w.drift;
    const yaw = P.yaw + A * (.6 * Math.sin(now * .00061 + 1.3) + .4 * Math.sin(now * .00143 + .2));
    const pitch = P.pitch + A * .6 * (.6 * Math.sin(now * .00053 + 2.1) + .4 * Math.sin(now * .00117 + 4));
    const roll = P.roll + A * .5 * (.6 * Math.sin(now * .00047 + .7) + .4 * Math.sin(now * .00131 + 3.3));
    S.bPhase += dt / M.breath[0] * TAU; const b = w.bA * Math.sin(S.bPhase);
    if (M.blink && !RM && now >= S.bl.next) { S.bl.at = now; S.bl.dur = 210; S.bl.next = now + (Math.random() < .14 ? 320 : rand(M.blink[0], M.blink[1])); }
    const bu = (now - S.bl.at) / S.bl.dur, bl = bu >= 0 && bu <= 1 ? (bu < .4 ? EASE(bu / .4) : bu < .5 ? 1 : 1 - EASE((bu - .5) / .5)) : 0;
    return Object.assign(P, { yaw, pitch, roll, gx: clamp(gx, -1, 1), gy: clamp(gy, -1, 1), lOpen: clamp(P.lOpen * (1 - bl)), rOpen: clamp(P.rOpen * (1 - bl)), bx: 1 - b * .45, by: 1 + b, ty: P.ty - b * 30 });
  }
  function size() { if (!S.slot) return; const r = S.slot.getBoundingClientRect(), dpr = Math.min(2, window.devicePixelRatio || 1); S.W = Math.max(1, Math.round(r.width * dpr)); S.H = Math.max(1, Math.round(r.height * dpr)); }
  function tick(now) {
    const dt = Math.min(64, Math.max(0, now - S.last)); S.last = now;
    const P = compose(now, dt);
    if (RS) render(RS, P, S.c, S.W, S.H);
    if (S.M.z) { const u = S.tau / 6400, a = u < .35 ? EASE(u / .35) : u < .8 ? 1 - EASE((u - .35) / .45) : 0; imp.setAttribute('opacity', Math.max(.45, a).toFixed(2)); imp.setAttribute('transform', 'translate(78 ' + r1(P.ty - R * P.by + 4 - 14 * u) + ')'); }
    else imp.setAttribute('opacity', '0');
    S.raf = S.slot ? requestAnimationFrame(tick) : 0;
  }
  let RO = null;
  function mount(slot) {
    if (!slot) { S.slot = null; return; }
    S.slot = slot; slot.appendChild(cv); slot.appendChild(ov); if (RO) { RO.disconnect(); RO.observe(slot); }
    S.M = MOODS[slot.dataset.mood] || MOODS.observe; S.t0 = performance.now();
    S.c = { body: slot.dataset.body || 'ink', stage: slot.dataset.stage || 'paper', shadow: slot.dataset.shadow || 'on' };
    ov.style.color = S.c.stage === 'ink' ? HEX.paper : HEX.ink;
    S.bl.next = S.t0 + 1400; size();
    if (!S.raf) { S.last = performance.now(); S.raf = requestAnimationFrame(tick); }
  }
  RO = 'ResizeObserver' in window ? new ResizeObserver(size) : null; if (!RO) addEventListener('resize', size);
  /* ảnh tĩnh cho thẻ chia sẻ */
  function snapshot(mood, c, px, over) {
    const k = document.createElement('canvas'), Rd = makeRenderer(k, true); if (!Rd) return null;
    const M = MOODS[mood]; const P = Object.assign(moodPose(M, M.key), { bx: 1, by: 1 }, over || {});
    render(Rd, P, c, px, Math.round(px * VB.h / VB.w)); return k.toDataURL('image/png');
  }
  return { mount, snapshot, ok: !!RS };
})();
/* trang hành trình đọc B0B qua window (const ở cấp cao nhất không gắn vào window) */
window.B0B = B0B;
