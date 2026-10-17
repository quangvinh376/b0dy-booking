/* =====================================================================
   B0DY · Lịch tập tuần — PHIẾU GIẤY THẬT (WebGL2) · tk3d.js v1.0.0 · 17/10/2026
   Chủ studio 14:57: "phiếu lịch tập cũng sử dụng WebGL và tạo hiệu ứng 3D giống với phiếu đề xuất ở trong app coach".
   Cùng cách làm với ve.js của app coach (v2.18): vé DOM vẫn là MÔ HÌNH (bố cục, chữ, test, trợ năng role="img" + aria-label);
   một canvas WebGL2 vẽ lại đúng vé đó như một tờ giấy trong không gian 3D:
   · desktop (#tkW, vé ngang): đầu trái cong lùi ra sau, cuống gập ra sau ở đường lỗ kim dọc
   · mobile (#tkT, vé dọc): đầu trên cong lùi ra sau, cuống gập ra sau ở đường lỗ kim ngang
   · phối cảnh thật (phần lùi xa nhỏ lại), giấy gợn rất nhẹ; chữ in nằm TRÊN mặt giấy nên cong, co, nhận sáng cùng giấy
   · một đèn (trên, hơi trái, chếch về phía người xem) + bầu trời; thớ giấy, bóng mờ giấy in nhiệt, vai sáng như phim
   · răng cưa, khía, lỗ kim là mép / lỗ thật (thấy nền + bóng qua lỗ); bóng đổ mềm lớn dần theo độ nhấc
   Dáng phẳng (pose 0) trùng vé DOM tới từng điểm ảnh (cùng ma trận, cùng mép, cùng bóng đổ) → app.js đổi chỗ không lộ:
   vé DOM vào xong → bản WebGL phẳng thay chỗ (vé DOM trong suốt) → thả lỏng thành giấy 3D (0,6 s --eo, đồng hồ MT của app).
   Chỉ vẽ khi dáng / khung đổi (không có vòng rAF riêng). Rời trang phiếu → trả texture + khung vẽ, giữ ngữ cảnh + shader.
   Không có WebGL2 / WebGL chạy bằng CPU / mất ngữ cảnh / lỗi khung → vé DOM như cũ.
   Tắt / bật tay: localStorage 'tk3d' = '0' / '1' hoặc ?tk3d=0 / ?tk3d=1 (1 = bật cả khi WebGL chạy bằng CPU — để test).
   ===================================================================== */
var TK3D = (function () {
  'use strict';
  if (typeof window === 'undefined' || typeof document === 'undefined') return null;

  /* ---------- tham số (đơn vị: px CSS của vé chưa biến đổi) ---------- */
  var V = {
    curlD: .07, curlM: .085,   /* đầu xa lùi ra sau, tỉ lệ theo chiều dài thân vé: desktop 800 → 56 px · mobile ~300 → 26 px */
    bend: .095,                /* cuống gập ra sau ở đường lỗ kim (rad ≈ 5,4°) */
    cs: 5,                     /* cuống cong thêm về đuôi (px) */
    wave: 1.5,                 /* giấy không phẳng tuyệt đối: gợn rất nhẹ (px), sóng dài ≈ 300 px */
    flex: .12,                 /* quán tính lúc thả lỏng: giữa nhịp cong / gập quá một chút rồi về */
    eyeD: 1600, eyeM: 1150,    /* khoảng cách mắt (px): màn bàn nhìn xa hơn điện thoại */
    eyeY: [.5, .42],           /* tâm phối cảnh theo chiều cao vé (desktop · mobile) */
    lp: [-.25, -.45, .86], ld: 1800,   /* đèn: hướng từ tâm vé (trái · trên · về phía người xem) × khoảng cách (px) */
    att: .35,                  /* giảm sáng theo khoảng cách (mũ) */
    ka: .4, kd: .6, kh: .1, ks: .05, sh: 18,   /* nền · khuếch tán · bầu trời · bóng mờ giấy in nhiệt · độ bóng */
    exp: .99,                  /* phơi sáng: giấy phẳng giữa vé ≈ #F9 (nền trang #FA) — chừa chỗ cho phần cong đón đèn */
    knee: .97,                 /* vai sáng (tuyến tính): chỗ sáng nhất không cháy trắng */
    grain: .045,               /* thớ giấy (lệch pháp tuyến) */
    s1: [20, 22, .1],          /* bóng đổ lớn y hệt vé DOM: drop-shadow(0 20px 22px rgba(10,10,10,.1)) — số thứ ba là σ */
    s2: [1, 1.5, .08],         /* bóng sát mép: drop-shadow(0 1px 1.5px rgba(10,10,10,.08)) */
    l1: [6, 6, .015],          /* dáng 3D: giấy nhấc lên → bóng lớn lệch thêm · nhoè thêm · đậm thêm */
    l2: [1, 1, 0],             /* … bóng sát mép lệch thêm · nhoè thêm */
    pad: [70, 34, 92],         /* lề khung vẽ quanh vé cho bóng (trái/phải · trên · dưới) */
    m: 2                       /* lề lưới quanh mép (px) cho khử răng cưa */
  };

  var OK = null, NB = 0, ERR = '', SOFT = '', LOST = false, FR = 0, BUILDS = 0;
  var cv = null, gl = null, PP = null, PS = null, QB = null, NZ = null, T0 = null, TXI = null, TXS = '';
  var CUR = null, MO = null, RF = 0, WMP = null, SEG = null;

  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  var IDM = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  function each(l, f) { Array.prototype.forEach.call(l, f); }
  function flag() {
    try {
      var m = /[?&]tk3d=([01])(?:&|$)/.exec(location.search); if (m) return m[1];
      var v = localStorage.getItem('tk3d'); return v === '0' || v === '1' ? v : '';
    } catch (e) { return ''; }
  }
  /* việc nền: lúc trình duyệt rảnh (Safari chưa có requestIdleCallback → tác vụ kế tiếp) */
  function later(f) { if (window.requestIdleCallback) window.requestIdleCallback(f, { timeout: 80 }); else setTimeout(f, 1); }
  /* WebGL chạy bằng CPU (SwiftShader / llvmpipe — máy không GPU, trình duyệt kiểm thử) → vẽ giấy thật sẽ chậm → vé DOM */
  function soft(g) {
    try {
      var r = String(g.getParameter(g.RENDERER) || '');
      /* Chrome / Safari che tên GPU ("WebKit WebGL") → hỏi phần mở rộng; Firefox đã trả tên thật (hỏi phần mở rộng ở đó chỉ sinh cảnh báo) */
      if (/^\s*(webkit webgl|mozilla)\s*$/i.test(r)) { var x = g.getExtension('WEBGL_debug_renderer_info'); if (x) r = String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)); }
      return /swiftshader|llvmpipe|software|microsoft basic/i.test(r) ? r : '';
    } catch (e) { return ''; }
  }

  /* =================== shader =================== */
  /* hình tờ giấy trong toạ độ (A, C): A dọc theo vé từ đầu xa tới đuôi cuống, C ngang vé. Desktop A = x, C = y · mobile A = y, C = x.
     Mép (dương = trong giấy): hai cạnh thẳng · răng cưa đầu xa · răng cưa đuôi cuống · hai khía tròn + hàng lỗ kim ở đường xé.
     Răng cưa dựng y hệt teeth() của app.js: n đoạn, điểm lẻ (trừ điểm cuối) lệch uD; khoảng cách tính vuông góc với mép. */
  var COM = [
    'uniform float uLA, uLC, uPf;',
    'uniform vec4 uZ0, uZ1;',            /* răng cưa: C đầu, C cuối, số đoạn, A gốc — đầu xa · đuôi cuống */
    'uniform vec2 uD, uRad;',            /* độ lệch răng (đầu xa, đuôi) · bán kính khía, lỗ kim */
    'uniform vec3 uHo;',                 /* lỗ kim: C đầu, bước, số lỗ */
    'float zz(float c, vec4 z, out float sl){',
    '  float L=z.y-z.x, t=clamp((c-z.x)/L,0.0,1.0)*z.z, i=min(floor(t),z.z-1.0), f=t-i;',
    '  float a=mod(i,2.0)>0.5?1.0:0.0, b=(mod(i+1.0,2.0)>0.5 && i+1.0<z.z-0.5)?1.0:0.0;',
    '  sl=(b-a)*z.z/L; return mix(a,b,f); }',
    'float dSide(vec2 p){ return min(p.y, uLC-p.y); }',
    'float dFar(vec2 p){ float sl; float pr=zz(p.y,uZ0,sl); float k=uD.x*sl; return (p.x-uZ0.w-uD.x*pr)*inversesqrt(1.0+k*k); }',
    'float dTail(vec2 p){ float sl; float pr=zz(p.y,uZ1,sl); float k=uD.y*sl; return (uZ1.w+uD.y*pr-p.x)*inversesqrt(1.0+k*k); }',
    'float dNotch(vec2 p){ return min(length(p-vec2(uPf,0.0)), length(p-vec2(uPf,uLC)))-uRad.x; }',
    'float dHole(vec2 p){ if(uHo.z<0.5) return 1e3; float j=clamp(floor((p.y-uHo.x)/uHo.y+0.5),0.0,uHo.z-1.0); return length(p-vec2(uPf,uHo.x+uHo.y*j))-uRad.y; }'
  ].join('\n');

  /* giấy: thân (0) cong z = −C(1 − A/Pf)² — đầu xa lùi, phẳng ở đường lỗ kim · cuống (1) gập ra sau quanh đường lỗ kim + cong thêm về
     đuôi. Gợn giấy chỉ theo z (hai mảnh chung đỉnh ở đường lỗ kim → khít, không hở). Rồi ma trận vé (DOM) + phối cảnh. */
  var VS_P = [
    '#version 300 es',
    'precision highp float;',
    'layout(location=0) in vec2 aP;',
    'uniform int uPc, uVert;',
    'uniform float uLA, uPf, uCurl, uBend, uCs, uK, uWave;',
    'uniform mat3 uTk;',
    'uniform vec3 uEye; uniform vec2 uCv;',
    'uniform mat3 uRot; uniform vec3 uRc; uniform float uLift;',   /* cầm phiếu lên xoay: quay quanh tâm vé + nhấc về phía người xem */
    'out vec2 vP; out vec2 vT; out vec3 vN; out vec3 vW;',
    'vec3 wave(vec2 p){ float a=p.x*0.021+p.y*0.006+1.3, b=p.y*0.017-0.4, c=p.x*0.009-p.y*0.013+2.1;',
    '  float z=0.6*sin(a)*sin(b)+0.4*sin(c);',
    '  float zx=0.6*0.021*cos(a)*sin(b)+0.4*0.009*cos(c), zy=0.6*(0.006*cos(a)*sin(b)+0.017*sin(a)*cos(b))-0.4*0.013*cos(c);',
    '  return vec3(z,zx,zy)*uWave; }',
    'void main(){',
    '  vec3 w=wave(aP), L, N;',
    '  if(uPc==0){',
    '    float t=1.0-clamp(aP.x/uPf,0.0,1.0), dz=2.0*uCurl*t/uPf;',
    '    L=vec3(aP.x, aP.y, -uCurl*t*t+w.x); N=vec3(-dz-w.y, -w.z, 1.0);',
    '  } else {',
    '    float sl=uLA-uPf, s=aP.x-uPf, q=clamp(s/sl,0.0,1.2), cb=cos(uBend), sb=sin(uBend), dz=-sb-2.0*uCs*q/sl;',
    '    L=vec3(uPf+s*cb, aP.y, -s*sb-uCs*q*q+w.x); N=vec3(-dz-w.y, -w.z, cb);',
    '  }',
    '  vec2 lp=uVert==0 ? L.xy : L.yx, ln=uVert==0 ? N.xy : N.yx;',
    '  vec3 w3=uRc+uRot*(vec3((uTk*vec3(lp,1.0)).xy, L.z*uK)-uRc); w3.z+=uLift;',
    '  vec2 r=w3.xy; float z=w3.z;',
    '  vec3 n=normalize(uRot*vec3(mat2(uTk)*ln/uK, N.z));',
    '  float q=uEye.z/(uEye.z-z); vec2 s=uEye.xy+(r-uEye.xy)*q; float ww=1.0/q;',
    '  vP=aP; vT=lp; vN=n; vW=vec3(r,z);',
    '  gl_Position=vec4((s.x/uCv.x*2.0-1.0)*ww, (1.0-s.y/uCv.y*2.0)*ww, 0.0, ww);',
    '}'].join('\n');

  /* mặt giấy: phủ mép bằng hàm khoảng cách (khử răng cưa giải tích) · mực (texture chữ vẽ từ bố cục DOM, premultiplied) · ánh sáng.
     uFx = 0 (dáng phẳng): đúng màu DOM, không sáng tối / thớ / bóng → trùng vé DOM. uSs = 1: texture dày gấp ≥ 1,6 lần điểm ảnh →
     lấy mẫu 4 điểm trong một điểm ảnh (chữ sắc như DOM, không mờ vì nội suy lần hai). */
  var FS_P = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vP; in vec2 vT; in vec3 vN; in vec3 vW;',
    'uniform int uSs;',
    'uniform vec2 uWH, uAtt;',
    'uniform float uFx, uGrain, uIref, uShin, uKnee, uExp;',
    'uniform sampler2D uInk, uNoise;',
    'uniform vec3 uPaper, uLp, uEp;',
    'uniform vec4 uLt;',
    'out vec4 o;',
    COM,
    'float cA(float d){ float w=length(vec2(dFdx(d),dFdy(d))); return clamp(d/max(w,1e-4)+0.5,0.0,1.0); }',
    'vec3 lin(vec3 c){ return pow(max(c,vec3(0.0)),vec3(2.2)); }',
    'vec3 srgb(vec3 c){ return pow(max(c,vec3(0.0)),vec3(1.0/2.2)); }',
    'vec3 tone(vec3 x){ vec3 k=vec3(uKnee); return mix(x, k+(1.0-k)*(1.0-exp(-(x-k)/(1.0-k))), step(k,x)); }',
    'void main(){',
    '  vec2 p=vP, uv=vT/uWH, ux=dFdx(uv)*0.25, uy=dFdy(uv)*0.25;',
    '  float cov=cA(dSide(p))*cA(dFar(p))*cA(dTail(p))*cA(dNotch(p))*cA(dHole(p));',
    '  vec4 ink=uSs==1 ? 0.25*(texture(uInk,uv-ux-uy)+texture(uInk,uv+ux-uy)+texture(uInk,uv-ux+uy)+texture(uInk,uv+ux+uy)) : texture(uInk,uv);',
    '  vec4 g=texture(uNoise,vT*0.0066), m=texture(uNoise,vT*0.0011+vec2(0.37,0.11));',   /* thớ ~0,6 px · loang chậm */
    '  if(cov<=0.002) discard;',
    '  float fx=uFx;',
    '  vec3 paper=uPaper*(1.0+fx*((m.a-0.5)*0.012+(g.a-0.5)*0.01));',
    '  float dn=1.0-fx*(0.025*(1.0-m.r)+0.015*(1.0-g.a));',                               /* mực in nhiệt đậm nhạt không đều — rất nhẹ */
    '  vec3 alb=paper*(1.0-ink.a*dn)+ink.rgb*dn; float ik=ink.a*dn;',
    '  vec3 c=alb;',
    '  if(fx>0.0){',
    '    vec3 N=normalize(vN+vec3((g.g-0.5)*uGrain,(g.b-0.5)*uGrain,0.0)*fx);',
    '    vec3 Lv=uLp-vW; float dl=length(Lv); vec3 L=Lv/dl, Vv=normalize(uEp-vW), H=normalize(L+Vv);',
    '    float at=pow(uAtt.x/dl,uAtt.y);',
    '    float I=(uLt.x+uLt.y*max(dot(N,L),0.0)*at+uLt.z*(0.5-0.5*N.y))/uIref;',
    '    float sp=uLt.w*pow(max(dot(N,H),0.0),uShin)*at;',
    '    c=mix(alb, srgb(tone((lin(alb)*I+vec3(sp*(1.0-0.9*ik)))*uExp)), fx);',
    '  }',
    '  o=vec4(c*cov,cov);',
    '}'].join('\n');

  /* bóng đổ lên nền: hai lớp như filter của vé DOM (lớn σ 22 lệch 20 · sát mép σ 1,5 lệch 1), tính trong toạ độ của từng mảnh giấy
     (ánh xạ ngược phối cảnh từ 4 góc đã chiếu) → dáng phẳng trùng bóng DOM; dáng 3D bóng theo đúng hình đã cong / gập. */
  var VS_S = ['#version 300 es', 'layout(location=0) in vec2 aP;', 'uniform vec2 uCv; out vec2 vC;',
    'void main(){ vC=aP*uCv; gl_Position=vec4(aP.x*2.0-1.0, 1.0-aP.y*2.0, 0.0, 1.0); }'].join('\n');
  var FS_S = [
    '#version 300 es',
    'precision highp float;',
    'in vec2 vC;',
    'uniform mat3 uHm, uHs;',
    'uniform vec2 uO1, uO2, uSg, uAl;',
    'uniform vec4 uB0, uB1;',
    'out vec4 o;',
    COM,
    'float Ph(float x){ float z=abs(x)*0.70710678, t=1.0/(1.0+0.3275911*z);',
    '  float y=1.0-(((((1.061405429*t-1.453152027)*t)+1.421413741)*t-0.284496736)*t+0.254829592)*t*exp(-z*z);',
    '  return 0.5+0.5*(x<0.0?-y:y); }',
    'float box(vec2 p, vec4 b, float s){ return (Ph((p.x-b.x)/s)-Ph((p.x-b.y)/s))*(Ph((p.y-b.z)/s)-Ph((p.y-b.w)/s)); }',
    'float sil(vec2 p, float s){ return Ph(dSide(p)/s)*Ph(dFar(p)/s)*Ph(dTail(p)/s)*Ph(dNotch(p)/s)*Ph(dHole(p)/s); }',
    'void main(){',
    '  vec3 hm=uHm*vec3(vC,1.0), hs=uHs*vec3(vC,1.0); vec2 pm=hm.xy/hm.z, ps=hs.xy/hs.z;',
    /* trong lòng giấy (giấy phủ kín, xa lỗ / khía) → giấy che hết, khỏi tính */
    '  bool inM=pm.x>uB0.x+6.0 && pm.x<uPf-5.0 && pm.y>6.0 && pm.y<uLC-6.0 && dNotch(pm)>5.0;',
    '  bool inS=ps.x>uPf+5.0 && ps.x<uB1.y-6.0 && ps.y>6.0 && ps.y<uLC-6.0 && dNotch(ps)>5.0;',
    '  if(inM || inS) discard;',
    '  float a1=uAl.x*min(1.0, box(pm-uO1,uB0,uSg.x)+box(ps-uO1,uB1,uSg.x));',
    '  vec2 qm=pm-uO2, qs=ps-uO2;',
    '  float k2=min(1.0, sil(qm,uSg.y)*Ph((uPf-qm.x)/uSg.y)+sil(qs,uSg.y)*Ph((qs.x-uPf)/uSg.y));',
    '  float a2=uAl.y*(k2+a1*(1.0-k2));',                 /* lớp thứ hai đổ bóng cả vé lẫn bóng lớp một (như filter nối tiếp) */
    '  float A=1.0-(1.0-a1)*(1.0-a2);',
    '  o=vec4(vec3(10.0/255.0)*A, A);',
    '}'].join('\n');

  function sh(type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS) && !gl.isContextLost()) { var e = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error('tk3d shader: ' + e); }
    return s;
  }
  function prog(vs, fs, names) {
    var p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS) && !gl.isContextLost()) throw new Error('tk3d link: ' + gl.getProgramInfoLog(p));
    var u = { p: p }; names.forEach(function (n) { u[n] = gl.getUniformLocation(p, n); }); return u;
  }
  var UCOM = ['uLA', 'uLC', 'uPf', 'uZ0', 'uZ1', 'uD', 'uRad', 'uHo'];

  /* nhiễu lặp 256² (seed cố định): R loang mực · G, B đạo hàm thớ giấy · A loang giấy. Có mipmap: màn dpr 1 thớ tự mịn đi */
  function noiseTex() {
    var N = 256, a = new Uint8Array(N * N * 4), s = 0xB0D1;
    function rnd() { s |= 0; s = s + 0x6D2B79F5 | 0; var t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }
    function lattice(n) { var g = new Float32Array(n * n); for (var i = 0; i < n * n; i++) g[i] = rnd(); return g; }
    function layer(g, n) {
      var i0 = new Int32Array(N), i1 = new Int32Array(N), t = new Float64Array(N), o = new Float64Array(N * N), x, y;
      for (x = 0; x < N; x++) { var f = x * n / N, x0 = Math.floor(f), tx = f - x0; t[x] = tx * tx * (3 - 2 * tx); i1[x] = (x0 + 1) % n; i0[x] = x0 % n; }
      for (y = 0; y < N; y++) {
        var r0 = i0[y] * n, r1 = i1[y] * n, ty = t[y], k = y * N;
        for (x = 0; x < N; x++) { var c0 = i0[x], c1 = i1[x], tx2 = t[x], a0 = g[r0 + c0] + (g[r0 + c1] - g[r0 + c0]) * tx2, a1 = g[r1 + c0] + (g[r1 + c1] - g[r1 + c0]) * tx2; o[k + x] = a0 + (a1 - a0) * ty; }
      }
      return o;
    }
    var g4 = layer(lattice(64), 64), g16 = layer(lattice(16), 16), h1 = layer(lattice(128), 128), h2 = layer(lattice(64), 64), m8 = layer(lattice(8), 8), m32 = layer(lattice(32), 32), hf = new Float32Array(N * N), x, y, j;
    for (j = 0; j < N * N; j++) hf[j] = .65 * h1[j] + .35 * h2[j];
    for (y = 0; y < N; y++) for (x = 0; x < N; x++) {
      j = y * N + x; var i = j * 4, xr = (x + 1) % N, yd = (y + 1) % N;
      a[i] = Math.round(255 * clamp(.7 * g4[j] + .3 * g16[j], 0, 1));
      a[i + 1] = Math.round(255 * clamp(.5 + (hf[y * N + xr] - hf[j]) * 1.6, 0, 1));
      a[i + 2] = Math.round(255 * clamp(.5 + (hf[yd * N + x] - hf[j]) * 1.6, 0, 1));
      a[i + 3] = Math.round(255 * clamp(.6 * m8[j] + .4 * m32[j], 0, 1));
    }
    var t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, N, N, 0, gl.RGBA, gl.UNSIGNED_BYTE, a);
    gl.generateMipmap(gl.TEXTURE_2D);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
    return t;
  }

  /* =================== khởi động theo bước (lúc rảnh): ngữ cảnh · shader giấy · shader bóng · nhiễu · vẽ thử =================== */
  function boot1() {
    try {
      if (!NB) {
        var f = flag(); if (f === '0') { OK = false; ERR = 'off'; return; }
        cv = document.createElement('canvas'); cv.className = 'tk3d'; cv.setAttribute('aria-hidden', 'true');
        gl = cv.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, failIfMajorPerformanceCaveat: f !== '1' });
        if (!gl) { cv = null; OK = false; ERR = 'no webgl2'; return; }
        SOFT = soft(gl);
        if (SOFT && f !== '1') { ERR = 'soft: ' + SOFT; var lx = gl.getExtension('WEBGL_lose_context'); if (lx) lx.loseContext(); gl = null; cv = null; OK = false; return; }
        cv.addEventListener('webglcontextlost', onLost, false);
        cv.addEventListener('webglcontextrestored', onRestored, false);
        NB = 1; return;
      }
      [initP, initS, initN, warmDraw][NB - 1](); NB++;
      if (NB > 4) OK = true;
    } catch (e) { ERR = String(e && e.message || e); gl = null; cv = null; OK = false; }
  }
  function setup() { while (OK === null) boot1(); return OK === true && !LOST; }
  function initP() {
    TXI = null; TXS = '';   /* ngữ cảnh mới (lần đầu / có lại sau khi mất) → texture cũ không còn */
    PP = prog(VS_P, FS_P, ['uPc', 'uVert', 'uCurl', 'uBend', 'uCs', 'uK', 'uWave', 'uTk', 'uEye', 'uCv', 'uRot', 'uRc', 'uLift', 'uSs', 'uWH', 'uAtt', 'uFx', 'uGrain', 'uIref', 'uShin',
      'uKnee', 'uExp', 'uInk', 'uNoise', 'uPaper', 'uLp', 'uEp', 'uLt'].concat(UCOM));
    PP.bufs = {};
  }
  function initS() {
    PS = prog(VS_S, FS_S, ['uCv', 'uHm', 'uHs', 'uO1', 'uO2', 'uSg', 'uAl', 'uB0', 'uB1'].concat(UCOM));
    QB = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, QB); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), gl.STATIC_DRAW);
  }
  function initN() {
    NZ = noiseTex();
    T0 = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, T0); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  function init() { initP(); initS(); initN(); }
  /* vẽ thử 1 điểm ảnh mỗi chương trình: trình điều khiển dựng pipeline ngay lúc rảnh, không phải ở khung đầu tiên của vé */
  function warmDraw() {
    if (cv.width !== 1) { cv.width = 1; cv.height = 1; } gl.viewport(0, 0, 1, 1);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, T0); gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, NZ);
    gl.bindBuffer(gl.ARRAY_BUFFER, QB); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.useProgram(PS.p); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.useProgram(PP.p); gl.uniform1i(PP.uInk, 0); gl.uniform1i(PP.uNoise, 1);
    mesh('w', grid(0, 1, 1, 0, 1, 1)); var b = PP.bufs.w; gl.bindBuffer(gl.ARRAY_BUFFER, b.b); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.e);
    gl.drawElements(gl.TRIANGLES, b.n, gl.UNSIGNED_SHORT, 0);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.flush();
  }
  function warm() { if (OK !== null) return; boot1(); if (OK === null) later(warm); }

  /* lưới một mảnh giấy (A, C): na × nc ô; hai đầu đặt đúng giá trị (đỉnh chung ở đường lỗ kim trùng từng bit) */
  function grid(a0, a1, na, c0, c1, nc) {
    var d = [], ix = [], i, j;
    for (j = 0; j <= nc; j++) for (i = 0; i <= na; i++) d.push(i === na ? a1 : a0 + (a1 - a0) * i / na, j === nc ? c1 : c0 + (c1 - c0) * j / nc);
    for (j = 0; j < nc; j++) for (i = 0; i < na; i++) { var k = j * (na + 1) + i; ix.push(k, k + 1, k + na + 1, k + 1, k + na + 2, k + na + 1); }
    return { d: new Float32Array(d), ix: new Uint16Array(ix) };
  }
  function mesh(key, m) {
    var b = PP.bufs[key]; if (!b) b = PP.bufs[key] = { b: gl.createBuffer(), e: gl.createBuffer() };
    gl.bindBuffer(gl.ARRAY_BUFFER, b.b); gl.bufferData(gl.ARRAY_BUFFER, m.d, gl.STATIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.e); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, m.ix, gl.STATIC_DRAW); b.n = m.ix.length;
  }
  /* cùng kích thước như lần trước → giữ nguyên bộ đệm GPU */
  function meshG(key, a0, a1, na, c0, c1, nc) { var g = [a0, a1, na, c0, c1, nc].join(','), b = PP.bufs[key]; if (b && b.g === g) return; mesh(key, grid(a0, a1, na, c0, c1, nc)); PP.bufs[key].g = g; }

  /* =================== đọc bố cục vé (bản sao không biến đổi) =================== */
  function graphemes(s) {
    if (window.Intl && Intl.Segmenter) { if (!SEG) SEG = new Intl.Segmenter('vi', { granularity: 'grapheme' }); var a = []; each(Array.from(SEG.segment(s)), function (x) { a.push(x.segment); }); return a; }
    var b = []; Array.from(s).forEach(function (c) { if (/[\u0300-\u036f]/.test(c) && b.length) b[b.length - 1] += c; else b.push(c); }); return b;
  }
  function rgbaA(c) { var m = /rgba?\(([^)]+)\)/.exec(c || ''); if (!m) return 0; var p = m[1].split(/[\s,/]+/).filter(Boolean); return p.length > 3 ? parseFloat(p[3]) : 1; }
  function unq(s) { var m = /^["'](.*)["']$/.exec(String(s || '').trim()); return m ? m[1].replace(/\\(.)/g, '$1') : ''; }
  function wmPaths() {
    if (WMP) return WMP;
    var s = document.getElementById('wordmark'), vb = s && s.getAttribute('viewBox');
    WMP = { vb: (vb || '0 0 359 115').split(/[\s,]+/).map(Number), p: [] };
    if (s && window.Path2D) each(s.querySelectorAll('path'), function (p) { WMP.p.push([new Path2D(p.getAttribute('d')), p.getAttribute('fill-rule') === 'evenodd' ? 'evenodd' : 'nonzero']); });
    return WMP;
  }
  function measure(c) {
    var tk = c.tk, st = c.stage, W = tk.offsetWidth, H = tk.offsetHeight;
    var cl = tk.cloneNode(true), s = cl.style;
    ['id', 'role', 'aria-label', 'style'].forEach(function (a) { cl.removeAttribute(a); });
    cl.classList.remove('in', 'gl');
    each(cl.querySelectorAll('[id]'), function (e) { e.removeAttribute('id'); });
    each(cl.querySelectorAll('[style]'), function (e) { e.removeAttribute('style'); });
    var num = cl.querySelector('.tk-big .num'); if (num && num.getAttribute('data-n') != null) num.textContent = num.getAttribute('data-n');   /* số buổi đang đếm lên → số cuối */
    s.position = 'absolute'; s.left = '0px'; s.top = '0px'; s.width = W + 'px'; s.margin = '0'; s.transform = 'none'; s.animation = 'none'; s.filter = 'none';
    s.opacity = '1'; s.visibility = 'hidden'; s.pointerEvents = 'none';
    st.appendChild(cl);
    try {
      /* "· MỚI" (::after) → chữ thật để đo + vẽ */
      each(cl.querySelectorAll('.tk-list .new'), function (e) { var t = unq(getComputedStyle(e, '::after').content); e.classList.remove('new'); if (t) e.appendChild(document.createTextNode(t)); });
      /* bọc từng đoạn chữ + điểm dò 0 × 0 ở chân chữ (trong phần tử inline thường → đúng đường chân chữ, kể cả khi cha là flex).
         Vỏ bọc là thẻ tự đặt (tk-t), KHÔNG phải span: luật CSS theo thẻ span (".tk-list span{color:…}") sẽ áp lên vỏ bọc
         → chữ buổi đã qua trong danh sách (span.was, xám) bị đọc thành màu mực đen. */
      var tn = [], twk = document.createTreeWalker(cl, NodeFilter.SHOW_TEXT, null), n;
      while ((n = twk.nextNode())) if (/\S/.test(n.data) && !(n.parentNode && n.parentNode.closest && n.parentNode.closest('svg'))) tn.push(n);
      var wr = tn.map(function (t) {
        var sp = document.createElement('tk-t'), pr = document.createElement('i'), ps = pr.style;
        ps.display = 'inline-block'; ps.width = '0px'; ps.height = '0px'; ps.margin = '0'; ps.padding = '0'; ps.border = '0'; ps.verticalAlign = 'baseline';
        t.parentNode.insertBefore(sp, t); sp.appendChild(pr); sp.appendChild(t); return { n: t, sp: sp, pr: pr };
      });
      var b0 = cl.getBoundingClientRect(), ox = b0.left, oy = b0.top, rg = document.createRange(), items = [], texts = [], ord = new Map();

      /* nền ô, viền trong, nét đứt, mã vạch, chữ B0DY — theo thứ tự DOM. o = thứ tự cây (= thứ tự trình duyệt vẽ: mọi thứ trong vé
         là phần tử flex / grid, vẽ trọn từng phần tử) — snapshot() xếp theo o để chữ tràn nằm dưới hộp vẽ sau nó (nét đứt, ô) */
      each(cl.querySelectorAll('*'), function (e, oi) {
        ord.set(e, oi);
        if (e.tagName.toLowerCase() !== 'svg' && e.closest('svg')) return;
        var r = e.getBoundingClientRect(); if (!r.width || !r.height) return;
        var x = r.left - ox, y = r.top - oy, cs = getComputedStyle(e);
        if (e.tagName.toLowerCase() === 'svg') {
          if (e.classList.contains('bc')) {
            var vb = e.viewBox && e.viewBox.baseVal, d = (e.querySelector('path') || { getAttribute: function () { return ''; } }).getAttribute('d') || '', bars = [], m, re = /M([\d.]+)[ ,]0h([\d.]+)/g;
            while ((m = re.exec(d))) bars.push([+m[1], +m[2]]);
            items.push({ k: 'bc', x: x, y: y, w: r.width, h: r.height, vw: vb && vb.width || 1, bars: bars, c: cs.color, o: oi });
          }
          return;
        }
        if (e.classList.contains('tk-wm')) { items.push({ k: 'wm', x: x, y: y, w: r.width, h: r.height, c: cs.color, o: oi }); return; }
        if (e.classList.contains('tk-dash')) {
          var bi = cs.backgroundImage, col = /rgba?\([^)]*\)/.exec(bi), nums = (bi.match(/([\d.]+)px/g) || []).map(parseFloat);
          items.push({ k: 'dash', x: x, y: y, w: r.width, h: r.height, c: col ? col[0] : '#E5E5E5', on: nums[1] || 2, p: nums[3] || 5, o: oi });
          return;
        }
        var rad = parseFloat(cs.borderTopLeftRadius) || 0;
        if (rgbaA(cs.backgroundColor) > 0 && cs.backgroundColor !== c.paperCss) items.push({ k: 'b', x: x, y: y, w: r.width, h: r.height, r: rad, c: cs.backgroundColor, o: oi });
        var ins = /inset/.test(cs.boxShadow) && /(rgba?\([^)]*\))\s+0px\s+0px\s+0px\s+([\d.]+)px\s+inset/.exec(cs.boxShadow);
        if (ins) items.push({ k: 'ring', x: x, y: y, w: r.width, h: r.height, r: rad, c: ins[1], bw: parseFloat(ins[2]), o: oi });
      });
      /* chữ: từng cụm ký tự (dấu tiếng Việt đi cùng chữ) đúng vị trí trình duyệt đã dàn (giãn chữ, căn lề có sẵn) */
      wr.forEach(function (w) {
        /* trình duyệt vẽ chữ ở đường chân chữ đã làm tròn tới px CSS (trong toạ độ của vé) → làm tròn y hệt (chữ trong ô căn giữa lệch .5) */
        var cs = getComputedStyle(w.sp), up = cs.textTransform === 'uppercase', bl = w.pr.getBoundingClientRect().top - oy, top0 = null, g = [], k = 0, t = w.n;
        graphemes(t.data).forEach(function (x) {
          if (/\S/.test(x)) {
            rg.setStart(t, k); rg.setEnd(t, k + x.length); var r = rg.getBoundingClientRect();
            if (r.width > 0 || r.height > 0) { if (top0 === null) top0 = r.top; g.push([up ? x.toUpperCase() : x, r.left - ox, Math.floor(bl + r.top - top0 + .5)]); }
          }
          k += x.length;
        });
        if (g.length) texts.push({ k: 't', font: cs.fontStyle + ' ' + cs.fontWeight + ' ' + cs.fontSize + ' ' + cs.fontFamily, c: cs.color, g: g, o: ord.get(w.sp) });
      });
      var M = { W: W, H: cl.offsetHeight || H, items: items.concat(texts) };
      M.n = M.items.length; M.sig = JSON.stringify(M.items) + '|' + M.W + 'x' + M.H;
      return M;
    } finally { st.removeChild(cl); }
  }

  /* =================== vẽ chữ lên texture: từng lượt ~5 ms, cần ngay thì vẽ một mạch =================== */
  function rr(x, X, Y, w, h, r) {
    r = Math.max(0, Math.min(r, w / 2, h / 2));
    x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r); x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }
  function paintItem(x, o) {
    x.fillStyle = o.c;
    if (o.k === 'b') { x.beginPath(); rr(x, o.x, o.y, o.w, o.h, o.r); x.fill(); }
    else if (o.k === 'ring') { x.beginPath(); rr(x, o.x, o.y, o.w, o.h, o.r); rr(x, o.x + o.bw, o.y + o.bw, o.w - 2 * o.bw, o.h - 2 * o.bw, o.r - o.bw); x.fill('evenodd'); }
    else if (o.k === 'dash') { for (var y = 0; y < o.h; y += o.p) x.fillRect(o.x, o.y + y, o.w, Math.min(o.on, o.h - y)); }
    else if (o.k === 'bc') { var sx = o.w / o.vw; o.bars.forEach(function (b) { x.fillRect(o.x + b[0] * sx, o.y, b[1] * sx, o.h); }); }
    else if (o.k === 'wm') {
      var P = wmPaths(), vb = P.vb, s = Math.min(o.w / vb[2], o.h / vb[3]);
      x.save(); x.translate(o.x + (o.w - vb[2] * s) / 2 - vb[0] * s, o.y + (o.h - vb[3] * s) / 2 - vb[1] * s); x.scale(s, s); P.p.forEach(function (p) { x.fill(p[0], p[1]); }); x.restore();
    } else if (o.k === 't') { x.font = o.font; o.g.forEach(function (g) { x.fillText(g[0], g[1], g[2]); }); }
  }
  function texScale(c) { var d = window.devicePixelRatio || 1, mx = gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : 4096, t = c.geo.v ? clamp(Math.round(d), 2, 3) : (d < 1.5 ? 2 : 3);
    while (t > 1 && Math.max(c.geo.W, c.geo.H + 64) * t > mx) t--; return t; }

  function stMeasure(c) {
    if (c.ci) { c.ci.width = c.ci.height = 0; } c.ci = c.cx = null;   /* lượt vẽ dở (đo lại giữa chừng / mất ngữ cảnh) → bỏ */
    var M = measure(c); c.M = M; c.ts = texScale(c); c.sig = M.sig + '|' + c.ts;
    var g = c.geo, m = V.m, sl = g.LA - g.P;
    meshG(c.geo.v ? 'mm' : 'dm', -m, g.P, clamp(Math.round(g.P / 12), 24, 64), -m, g.LC + m, clamp(Math.round(g.LC / 32), 6, 16));
    meshG(c.geo.v ? 'ms' : 'ds', g.P, g.LA + m, clamp(Math.round(sl / 12), 8, 24), -m, g.LC + m, clamp(Math.round(g.LC / 32), 6, 16));
    if (TXI && TXS === c.sig) { c.q.length = 0; c.rdy = true; return false; }   /* cùng nội dung + cùng độ nét (làm mới ngầm) → dùng lại texture */
    return true;
  }
  function stPaint(c, all) {
    var M = c.M, s = c.ts, t0 = performance.now();
    if (!c.cx) {
      var ci = c.ci = document.createElement('canvas'); ci.width = Math.ceil(M.W * s); ci.height = Math.ceil(M.H * s);
      c.cx = ci.getContext('2d', { willReadFrequently: true });   /* canvas CPU: nạp texture là chép bộ nhớ, không đọc ngược từ GPU */
      c.cx.setTransform(s, 0, 0, s, 0, 0); c.cx.textBaseline = 'alphabetic'; c.cx.textAlign = 'left'; c.pi = 0;
    }
    while (c.pi < M.items.length) { paintItem(c.cx, M.items[c.pi++]); if (!all && performance.now() - t0 > 5) break; }
    return c.pi >= M.items.length;
  }
  function stUpload(c) {
    if (!TXI) TXI = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, TXI); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c.ci);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    c.ci.width = c.ci.height = 0; c.ci = c.cx = null; TXS = c.sig; BUILDS++;
    return true;
  }
  /* chạy các bước dựng: nền thì ≤ 5 ms mỗi lượt (lúc rảnh), cần ngay (all) thì làm hết */
  function run(all) {
    var c = CUR; if (!c || c.dead) return;
    if (OK === null) { if (all) setup(); else { boot1(); if (OK === null) { later(function () { run(false); }); return; } } }
    if (OK === false) { release(); return; }   /* không có WebGL2 / WebGL bằng CPU / lỗi dựng → bỏ gắn, vé DOM giữ nguyên */
    if (LOST) return;
    if (!all && document.fonts && document.fonts.status === 'loading' && !c.fw) { c.fw = 1; document.fonts.ready.then(function () { c.fw = 0; if (CUR === c && !c.dead) later(function () { run(false); }); }); return; }
    if (c.fw && !all) return;
    var t0 = performance.now();
    try {
      while (c.q.length) {
        if (!c.tk.isConnected || !c.tk.offsetWidth) return;   /* vé đang ẩn (đổi desktop ↔ mobile) → chờ */
        var f = c.q[0], done = f === stPaint ? f(c, all) : f(c);
        if (done && c.q[0] === f) c.q.shift();
        if (!all && performance.now() - t0 > 5) break;
      }
    } catch (e) { fail(e); return; }
    if (c.q.length) { if (!all) later(function () { run(false); }); return; }
    c.rdy = true;
  }

  /* =================== đặt khung vẽ + ma trận vé =================== */
  function place(c) {
    var tk = c.tk, st = c.stage, g = c.geo, W = g.W, H = g.H, d = Math.min(g.v ? 3 : 2, window.devicePixelRatio || 1);
    /* ba điểm dò 0 × 0 ở góc vé: vị trí sau mọi biến đổi (thu nhỏ cho vừa khung, nghiêng 1° / 0,8°) — chính xác tới phần điểm ảnh */
    var pr = [[0, 0], [W, 0], [0, H]].map(function (q) {
      var i = document.createElement('i'), s = i.style;
      s.position = 'absolute'; s.left = q[0] + 'px'; s.top = q[1] + 'px'; s.width = '0px'; s.height = '0px'; s.margin = '0'; s.padding = '0'; s.border = '0';
      tk.appendChild(i); return i;
    });
    /* vé DOM đang được nghiêng bằng CSS (app.js · .tk-fit.tilt, khi WebGL vừa mất rồi có lại) → đo ở dáng nghỉ, trả nghiêng ngay trong cùng tác vụ */
    var fit = tk.closest ? tk.closest('.tk-fit') : null, tl = !!(fit && fit.classList.contains('tilt'));
    if (tl) fit.classList.remove('tilt');
    var sr = st.getBoundingClientRect(), P = pr.map(function (i) { var r = i.getBoundingClientRect(); return [r.left - sr.left, r.top - sr.top]; });
    if (tl) fit.classList.add('tilt');
    pr.forEach(function (i) { tk.removeChild(i); });
    var ax = [(P[1][0] - P[0][0]) / W, (P[1][1] - P[0][1]) / W], ay = [(P[2][0] - P[0][0]) / H, (P[2][1] - P[0][1]) / H], K = Math.hypot(ax[0], ax[1]) || 1;
    var xs = [P[0][0], P[1][0], P[2][0], P[1][0] + P[2][0] - P[0][0]], ys = [P[0][1], P[1][1], P[2][1], P[1][1] + P[2][1] - P[0][1]];
    /* khung vẽ = hộp vé + lề cho bóng; không vượt khỏi trang phiếu (không tạo cuộn ngang / cuộn thêm). Mobile: được tràn xuống phần
       đệm đáy của khung chính (chỗ thanh nút) — đúng như bóng của vé DOM */
    var tp = c.tkp.getBoundingClientRect(), pg = c.page.getBoundingClientRect(), lim = g.v ? Math.max(pg.bottom, c.main.getBoundingClientRect().bottom) : pg.bottom;
    var x0 = Math.max(Math.min.apply(null, xs) - V.pad[0] * K, tp.left - sr.left), x1 = Math.min(Math.max.apply(null, xs) + V.pad[0] * K, tp.right - sr.left);
    var y0 = Math.max(Math.min.apply(null, ys) - V.pad[1] * K, tp.top - sr.top), y1 = Math.min(Math.max.apply(null, ys) + V.pad[2] * K, lim - sr.top);
    /* gốc khung vẽ ở điểm ảnh CSS nguyên (cũng là điểm ảnh thiết bị nguyên ở DPR 1 · 2 · 3): Chromium vẽ phần tử thay thế (canvas) ở vị trí
       làm tròn theo px CSS — gốc lẻ nửa px (DPR 2, vé dọc gọn) làm giấy 3D lệch nửa px so với vé DOM. Ma trận T bù đúng phần lẻ của vé */
    x0 = Math.ceil(sr.left + x0 - 1e-6) - sr.left; y0 = Math.ceil(sr.top + y0 - 1e-6) - sr.top;
    var Wd = Math.max(1, Math.floor((x1 - x0) * d + 1e-6)), Hd = Math.max(1, Math.floor((y1 - y0) * d + 1e-6));
    var cs = cv.style; cs.left = x0 + 'px'; cs.top = y0 + 'px'; cs.width = (Wd / d) + 'px'; cs.height = (Hd / d) + 'px';
    if (cv.width !== Wd) cv.width = Wd; if (cv.height !== Hd) cv.height = Hd;
    if (cv.parentNode !== st) st.appendChild(cv);
    c.d = d; c.cw = Wd / d; c.ch = Hd / d; c.K = K; c.box = [x0, y0, Wd / d, Hd / d];
    c.T = [ax[0], ax[1], 0, ay[0], ay[1], 0, P[0][0] - x0, P[0][1] - y0, 1];
    var T = c.T, ctr = [T[0] * W / 2 + T[3] * H / 2 + T[6], T[1] * W / 2 + T[4] * H / 2 + T[7]], ey = H * V.eyeY[g.v];
    c.rc = [ctr[0], ctr[1], 0];
    c.eye = [T[0] * W / 2 + T[3] * ey + T[6], T[1] * W / 2 + T[4] * ey + T[7], (g.v ? V.eyeM : V.eyeD) * K];
    c.lp = [ctr[0] + V.lp[0] * V.ld * K, ctr[1] + V.lp[1] * V.ld * K, V.lp[2] * V.ld * K];
    var dv = [c.lp[0] - ctr[0], c.lp[1] - ctr[1], c.lp[2]], dl = Math.hypot(dv[0], dv[1], dv[2]);
    c.ad = dl; c.iref = V.ka + V.kd * Math.max(dv[2] / dl, 0) + V.kh * .5;
  }

  /* =================== dáng → vẽ một khung =================== */
  function params(c, p) {
    var k = 1 + V.flex * Math.sin(Math.PI * clamp(p, 0, 1)), r = c.rot || R0, fl = 1 + .3 * clamp(r.flex, -1, 1), lf = clamp(r.lift, 0, 1.2);
    /* cầm lên: giấy võng thêm theo đà xoay (fl), bóng xa ra, nhoè và nhạt đi (lf) */
    return { curl: (c.geo.v ? V.curlM : V.curlD) * c.geo.P * p * k * fl, bend: V.bend * p * k * fl, cs: V.cs * p * fl, wave: V.wave * p, fx: clamp(p, 0, 1),
      s1: [V.s1[0] + V.l1[0] * p + 16 * lf, V.s1[1] + V.l1[1] * p + 12 * lf, V.s1[2] + V.l1[2] * p - .025 * lf], s2: [V.s2[0] + V.l2[0] * p + 3 * lf, V.s2[1] + V.l2[1] * p + 2.5 * lf, V.s2[2] + V.l2[2] * p - .03 * lf] };
  }
  /* quay phiếu: yaw quanh trục dọc (dương → mép phải lùi vào), pitch quanh trục ngang (dương → mép trên lùi vào) — ma trận cột cho GLSL */
  var R0 = { yaw: 0, pitch: 0, lift: 0, flex: 0 };
  function rotM(r) {
    var y = (r ? r.yaw : 0) * Math.PI / 180, p = (r ? r.pitch : 0) * Math.PI / 180, cy = Math.cos(y), sy = Math.sin(y), cp = Math.cos(p), sp = Math.sin(p);
    return [cy, 0, -sy, sy * sp, cp, cy * sp, sy * cp, -sp, cy * cp];
  }
  /* điểm (A, C) của mảnh pc sau cong / gập + ma trận vé + phối cảnh (bản JS của shader, không gợn) */
  function prj(c, P, A, C, pc) {
    var g = c.geo, a = A, z = 0;
    if (pc === 0) { var t = 1 - clamp(A / g.P, 0, 1); z = -P.curl * t * t; }
    else { var sl = g.LA - g.P, s = A - g.P, q = clamp(s / sl, 0, 1.2); a = g.P + s * Math.cos(P.bend); z = -s * Math.sin(P.bend) - P.cs * q * q; }
    var lx = g.v ? C : a, ly = g.v ? a : C, T = c.T, X = T[0] * lx + T[3] * ly + T[6], Y = T[1] * lx + T[4] * ly + T[7], Z = z * c.K, e = c.eye;
    var M = c.rm || IDM, o = c.rc || [0, 0, 0], dx = X - o[0], dy = Y - o[1], dz = Z - o[2];
    X = o[0] + M[0] * dx + M[3] * dy + M[6] * dz; Y = o[1] + M[1] * dx + M[4] * dy + M[7] * dz; Z = o[2] + M[2] * dx + M[5] * dy + M[8] * dz + (c.lift || 0);
    var k = e[2] / (e[2] - Z);
    return [e[0] + (X - e[0]) * k, e[1] + (Y - e[1]) * k];
  }
  /* ô vuông đơn vị → tứ giác (ma trận chiếu 3×3 theo cột) · nghịch đảo · nhân */
  function sq2q(q) {
    var x0 = q[0][0], y0 = q[0][1], x1 = q[1][0], y1 = q[1][1], x2 = q[2][0], y2 = q[2][1], x3 = q[3][0], y3 = q[3][1], sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3, g = 0, h = 0;
    if (Math.abs(sx) > 1e-7 || Math.abs(sy) > 1e-7) { var dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2, den = dx1 * dy2 - dx2 * dy1; g = (sx * dy2 - dx2 * sy) / den; h = (dx1 * sy - sx * dy1) / den; }
    return [x1 - x0 + g * x1, y1 - y0 + g * y1, g, x3 - x0 + h * x3, y3 - y0 + h * y3, h, x0, y0, 1];
  }
  function inv3(m) {
    var a = m[0], b = m[3], c = m[6], d = m[1], e = m[4], f = m[7], g = m[2], h = m[5], i = m[8];
    var A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g, det = a * A + b * B + c * C;
    return [A / det, B / det, C / det, -(b * i - c * h) / det, (a * i - c * g) / det, -(a * h - b * g) / det, (b * f - c * e) / det, -(a * f - c * d) / det, (a * e - b * d) / det];
  }
  function mul3(a, b) { var o = []; for (var j = 0; j < 3; j++) for (var r = 0; r < 3; r++) o[j * 3 + r] = a[r] * b[j * 3] + a[3 + r] * b[j * 3 + 1] + a[6 + r] * b[j * 3 + 2]; return o; }
  /* canvas → (A, C) của một mảnh: [a0, a1] × [0, LC] */
  function hinv(c, P, pc, a0, a1) {
    var LC = c.geo.LC, Q = [prj(c, P, a0, 0, pc), prj(c, P, a1, 0, pc), prj(c, P, a1, LC, pc), prj(c, P, a0, LC, pc)];
    return mul3([a1 - a0, 0, 0, 0, LC, 0, a0, 0, 1], inv3(sq2q(Q)));
  }
  function setCom(u, g) {
    gl.uniform1f(u.uLA, g.LA); gl.uniform1f(u.uLC, g.LC); gl.uniform1f(u.uPf, g.P);
    gl.uniform4f(u.uZ0, g.z0[0], g.z0[1], g.z0[2], g.z0[3]); gl.uniform4f(u.uZ1, g.z1[0], g.z1[1], g.z1[2], g.z1[3]);
    gl.uniform2f(u.uD, g.d0, g.d1); gl.uniform2f(u.uRad, g.rn, g.rh); gl.uniform3f(u.uHo, g.h0, g.hp, g.hn);
  }
  function draw(c) {
    c.rm = rotM(c.rot); c.lift = (c.rot ? clamp(c.rot.lift, 0, 1.2) : 0) * 30 * c.K;
    var g = c.geo, P = params(c, c.p), o1 = g.v ? [P.s1[0], 0] : [0, P.s1[0]], o2 = g.v ? [P.s2[0], 0] : [0, P.s2[0]];
    gl.viewport(0, 0, cv.width, cv.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    /* 1 · bóng đổ lên nền */
    var u = PS; gl.useProgram(u.p); setCom(u, g);
    gl.bindBuffer(gl.ARRAY_BUFFER, QB); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(u.uCv, c.cw, c.ch);
    gl.uniformMatrix3fv(u.uHm, false, hinv(c, P, 0, 0, g.P)); gl.uniformMatrix3fv(u.uHs, false, hinv(c, P, 1, g.P, g.LA));
    gl.uniform2f(u.uO1, o1[0], o1[1]); gl.uniform2f(u.uO2, o2[0], o2[1]); gl.uniform2f(u.uSg, P.s1[1], P.s2[1]); gl.uniform2f(u.uAl, P.s1[2], P.s2[2]);
    gl.uniform4f(u.uB0, g.z0[3] + g.d0 / 2, g.P, 0, g.LC); gl.uniform4f(u.uB1, g.P, g.z1[3] + g.d1 / 2, 0, g.LC);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    /* 2 · giấy: thân · cuống */
    u = PP; gl.useProgram(u.p); setCom(u, g);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, TXI && TXS === c.sig ? TXI : T0); gl.uniform1i(u.uInk, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, NZ); gl.uniform1i(u.uNoise, 1);
    gl.uniform1i(u.uVert, g.v); gl.uniform1i(u.uSs, c.ts / c.d >= 1.6 ? 1 : 0);
    gl.uniform1f(u.uCurl, P.curl); gl.uniform1f(u.uBend, P.bend); gl.uniform1f(u.uCs, P.cs); gl.uniform1f(u.uK, c.K); gl.uniform1f(u.uWave, P.wave);
    gl.uniformMatrix3fv(u.uTk, false, c.T); gl.uniform3f(u.uEye, c.eye[0], c.eye[1], c.eye[2]); gl.uniform2f(u.uCv, c.cw, c.ch);
    gl.uniformMatrix3fv(u.uRot, false, c.rm); gl.uniform3f(u.uRc, c.rc[0], c.rc[1], c.rc[2]); gl.uniform1f(u.uLift, c.lift);
    gl.uniform2f(u.uWH, c.M.W, c.M.H); gl.uniform1f(u.uFx, P.fx); gl.uniform1f(u.uGrain, V.grain); gl.uniform1f(u.uIref, c.iref); gl.uniform1f(u.uShin, V.sh); gl.uniform1f(u.uKnee, V.knee); gl.uniform1f(u.uExp, V.exp);
    gl.uniform3f(u.uPaper, c.paper[0], c.paper[1], c.paper[2]); gl.uniform3f(u.uLp, c.lp[0], c.lp[1], c.lp[2]); gl.uniform3f(u.uEp, c.eye[0], c.eye[1], c.eye[2]);
    gl.uniform2f(u.uAtt, c.ad, V.att); gl.uniform4f(u.uLt, V.ka, V.kd, V.kh, V.ks);
    [[g.v ? 'mm' : 'dm', 0], [g.v ? 'ms' : 'ds', 1]].forEach(function (x) {
      var b = u.bufs[x[0]]; gl.bindBuffer(gl.ARRAY_BUFFER, b.b); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, b.e);
      gl.uniform1i(u.uPc, x[1]); gl.drawElements(gl.TRIANGLES, b.n, gl.UNSIGNED_SHORT, 0);
    });
    FR++; c.drawn = c.p;
  }

  /* =================== gắn / hiện / dáng / đo lại / trả =================== */
  /* hình giấy do tkPaper() (app.js) tính → một nguồn duy nhất cho cả SVG lẫn WebGL */
  function geoOf(tk) {
    var svg = tk.querySelector('.tk-paper'), t = svg && svg._tk; if (!t || !t.W || !t.H) return null;
    if (!t.v) return { v: 0, W: t.W, H: t.H, LA: t.W, LC: t.H, P: t.P, z0: [t.H, 0, t.n, t.e0], z1: [0, t.H, t.n, t.W], d0: t.amp, d1: -t.amp, rn: t.rn, rh: t.rh, h0: t.h0, hp: t.hp, hn: t.hn };
    return { v: 1, W: t.W, H: t.H, LA: t.H, LC: t.W, P: t.P, z0: [0, t.W, t.n, t.e0], z1: [t.W, 0, t.n, t.H - t.e0], d0: -t.amp, d1: t.amp, rn: t.rn, rh: t.rh, h0: t.h0, hp: t.hp, hn: t.hn };
  }
  function paperCss(tk) { var p = tk.querySelector('.tk-paper path'), f = p && getComputedStyle(p).fill; return f && /^rgb/.test(f) ? f : 'rgb(250, 250, 250)'; }
  function rgb01(s) { var a = (/rgba?\(([^)]+)\)/.exec(s) || [0, '250,250,250'])[1].split(/[\s,/]+/).filter(Boolean).map(parseFloat); return [a[0] / 255, a[1] / 255, a[2] / 255]; }
  function attach(tk) {
    if (!tk || !tk.isConnected || OK === false || LOST || flag() === '0') return false;
    if (CUR && CUR.tk === tk && !CUR.dead) return true;
    var geo = geoOf(tk), stage = tk.closest('.tk-stage'), page = tk.closest('.page');
    if (!geo || !stage || !page) return false;
    var old = CUR;
    if (old) { old.dead = 1; if (old.page === page) old.tk.classList.remove('gl'); }   /* trang cũ đang rời: để nguyên khung cuối cho tới khi trang đi hẳn */
    var pc = paperCss(tk);
    var c = CUR = { tk: tk, stage: stage, tkp: stage.parentNode, page: page, main: page.parentNode || document.body, geo: geo, paperCss: pc, paper: rgb01(pc),
      q: [stMeasure, stPaint, stUpload], rdy: false, shown: false, p: 0, dead: 0, drawn: -1 };
    watch(c);
    later(function () { run(false); });
    return true;
  }
  /* hiện bản WebGL ở dáng p, vé DOM trong suốt (giữ role="img" + aria-label). sync: dựng nốt ngay (giảm chuyển động / vẽ lại tức thì) */
  function show(p, sync) {
    var c = CUR; if (!c || c.dead || OK === false || LOST) return false;
    if (!c.rdy) { if (!sync) return false; run(true); if (!c.rdy || c.dead) return false; }
    try {
      place(c); c.p = clamp(p, 0, 1); draw(c);
      if (!c.shown) { c.shown = true; c.tk.classList.add('gl'); }
    } catch (e) { fail(e); return false; }
    return true;
  }
  function pose(p) {
    var c = CUR; if (!c || c.dead || !c.shown || LOST) return;
    p = clamp(p, 0, 1); if (Math.abs(p - c.p) < 1e-5 && c.drawn === p) return;
    c.p = p; try { draw(c); } catch (e) { fail(e); }
  }
  /* cầm phiếu (app.js điều khiển vật lý): góc quay (độ), độ nhấc 0–1, độ võng theo đà. Chỉ vẽ khi đã hiện 3D. */
  function rot(yaw, pitch, lift, flex) {
    var c = CUR; if (!c || c.dead || !c.shown || LOST || !c.rc) return false;
    var r = c.rot || (c.rot = { yaw: 0, pitch: 0, lift: 0, flex: 0 });
    if (Math.abs(r.yaw - yaw) < 1e-4 && Math.abs(r.pitch - pitch) < 1e-4 && Math.abs(r.lift - lift) < 1e-4 && Math.abs(r.flex - flex) < 1e-4) return true;
    r.yaw = yaw; r.pitch = pitch; r.lift = lift; r.flex = flex;
    try { draw(c); } catch (e) { fail(e); return false; }
    return true;
  }
  /* khung đổi (thu nhỏ cho vừa, xoay màn, phông về muộn): đo lại ở khung kế; bố cục / độ nét đổi → vẽ chữ lại */
  function refit() { if (!CUR || RF) return; RF = requestAnimationFrame(function () { RF = 0; refit0(); }); }
  function refit0() {
    var c = CUR; if (!c || c.dead || OK !== true || LOST || !c.tk.isConnected || !c.tk.offsetWidth) return;
    try {
      var geo = geoOf(c.tk); if (!geo) return;
      var ch = JSON.stringify(geo) !== JSON.stringify(c.geo) || !c.M || c.M.W !== c.tk.offsetWidth || c.M.H !== c.tk.offsetHeight || texScale(c) !== c.ts || c.rb;
      c.geo = geo; c.rb = 0;
      if (ch) { c.rdy = false; c.q = [stMeasure, stPaint, stUpload]; if (c.shown) run(true); else { later(function () { run(false); }); return; } }
      if (c.shown && c.rdy) { place(c); draw(c); }
    } catch (e) { fail(e); }
  }
  function release() {
    var c = CUR; CUR = null;
    if (c) { c.dead = 1; c.tk.classList.remove('gl'); if (c.ci) { c.ci.width = c.ci.height = 0; c.ci = c.cx = null; } }
    if (MO) { MO.disconnect(); MO = null; }
    if (cv) { if (cv.parentNode) cv.parentNode.removeChild(cv); if (gl && !LOST) { cv.width = cv.height = 1; } }
    if (gl && !LOST && TXI) { gl.deleteTexture(TXI); } TXI = null; TXS = '';
  }
  function fail(e) { ERR = String(e && e.message || e); release(); OK = false; }
  /* rời trang phiếu (trang bị gỡ khỏi khung chính) → trả bộ nhớ */
  function watch(c) {
    if (MO) MO.disconnect(); MO = null;
    if (!window.MutationObserver || !c.main) return;
    MO = new MutationObserver(function () { if (CUR === c && !c.page.isConnected) release(); });
    MO.observe(c.main, { childList: true });
  }
  function onLost(e) {
    e.preventDefault(); LOST = true;
    var c = CUR; if (c) { c.tk.classList.remove('gl'); c.ws = c.shown; c.shown = false; c.rdy = false; c.q = [stMeasure, stPaint, stUpload]; }
    if (cv && cv.parentNode) cv.parentNode.removeChild(cv);
  }
  /* có lại ngữ cảnh: dựng lại shader + texture; đang hiện trước khi mất → hiện lại ngay ở dáng cũ (chưa hiện → giữ vé DOM) */
  function onRestored() {
    try {
      init(); LOST = false; TXI = null; TXS = '';
      var c = CUR; if (c && !c.dead && c.tk.isConnected && c.ws) { var p = c.p; c.q = [stMeasure, stPaint, stUpload]; run(true); if (c.rdy) show(p, true); }
    } catch (e) { fail(e); }
  }
  if (document.fonts && document.fonts.addEventListener) document.fonts.addEventListener('loadingdone', function () { if (CUR && !CUR.dead) { CUR.rb = 1; refit(); } });

  /* =================== chẩn đoán / test =================== */
  function dbg() {
    var c = CUR;
    return { ok: OK, err: ERR, soft: SOFT, gl: !!gl, lost: LOST, flag: flag(), on: !!(c && !c.dead), rdy: !!(c && c.rdy), shown: !!(c && c.shown), cls: !!(c && c.tk.classList.contains('gl')),
      p: c ? c.p : -1, frames: FR, builds: BUILDS, q: c ? c.q.length : -1, ts: c ? c.ts : 0, d: c ? c.d : 0, cv: cv ? [cv.width, cv.height] : null, inDom: !!(cv && cv.isConnected),
      box: c && c.box ? c.box.slice() : null, el: c ? c.tk.id : '', M: c && c.M ? { W: c.M.W, H: c.M.H, n: c.M.n } : null, geo: c ? c.geo : null, V: V };
  }
  /* test: 'dom' → hiện vé DOM (ẩn canvas) · số → hiện bản WebGL ở dáng đó */
  function view(x) {
    var c = CUR; if (!c || c.dead) return false;
    if (x === 'dom') { c.tk.classList.remove('gl'); if (cv) cv.style.visibility = 'hidden'; return true; }
    if (cv) cv.style.visibility = '';
    if (!c.shown) return show(+x, true);
    c.tk.classList.add('gl'); pose(+x); return true;
  }
  function lose() { var x = gl && gl.getExtension('WEBGL_lose_context'); if (!x) return false; x.loseContext(); window._tk3dLx = x; return true; }
  function restore() { var x = window._tk3dLx; if (!x) return false; x.restoreContext(); return true; }

  /* =================== ảnh phẳng 2D cho "Lưu về máy" (không cần WebGL) ===================
     snapshot(vé) → canvas: vẽ lại ĐÚNG vé DOM được truyền vào (app.js truyền vé đang hiện: desktop #tkW ngang · mobile #tkT dọc)
     ở dáng phẳng (pose 0), như vé DOM lúc đứng yên — ảnh lưu về máy trùng thiết kế trên màn:
     · bố cục + mực: cùng measure() + paintItem() với texture của bản 3D (từng cụm ký tự đúng chỗ trình duyệt đã dàn, giãn chữ, chữ hoa,
       "· MỚI", ô Acid, viền ô, nét đứt, mã vạch, chữ B0DY) → không còn bản vẽ tay thứ hai lệch dần với vé
     · giấy: đúng path của .tk-paper (răng cưa, khía, lỗ kim — số do tkPaper() của app.js tính, cũng là nguồn mép của bản 3D)
     · nghiêng: đúng transform lúc đứng yên của vé (rotate 1° / 0,8° quanh tâm); KHÔNG lấy tỉ lệ thu cho vừa khung (--tks)
     · bóng: đúng chuỗi filter drop-shadow của vé (đọc từ CSS): mỗi lớp = mặt nạ alpha (giấy + mực tràn ra ngoài giấy) làm mờ Gauss
       σ = độ nhoè CSS (Chrome · Safari · Firefox đều coi số thứ ba là σ), dời, tô màu; lớp sau đổ bóng cả lớp trước (filter nối tiếp).
       Tự tính bằng JS trên lưới thưa (σ lớn) / lưới 1 px (σ nhỏ) rồi phóng lên — không dùng shadowBlur của canvas (Chrome σ = blur / 2,
       Safari ≈ blur / 3 → lệch bóng DOM). Đọc mặt nạ không tin được (trình duyệt chống dò vân tay) → shadowBlur làm dự phòng.
     Mặc định 3× (tự hạ nếu cạnh > 4096 px hoặc > 16 triệu điểm ảnh — giới hạn canvas của iOS), nền giấy của trang (#FAFAFA), lề đủ
     cho bóng tắt hẳn. Chỉ canvas 2D: chạy cả khi không có WebGL / tk3d tắt. Không đụng bản 3D (CUR, texture, khung vẽ, V).
     Vé chưa sẵn sàng (chưa có path giấy, đang ẩn) → null. Chờ phông (document.fonts) là việc của nơi gọi.
     canvas.tkSnap = { s, T (ma trận vé → ảnh, điểm ảnh), W, H, el, v } — để test so với vé DOM. */
  /* transform + filter của vé lúc đứng yên: bản sao nông không có .in / .gl / animation, cùng cỡ vé */
  function snapPose(tk, st, W, H) {
    var e = tk.cloneNode(false), s = e.style, r = { m: [1, 0, 0, 1, 0, 0], o: [W / 2, H / 2], f: 'none' };
    ['id', 'role', 'aria-label', 'style'].forEach(function (a) { e.removeAttribute(a); });
    e.classList.remove('in', 'gl');
    s.position = 'absolute'; s.left = '0px'; s.top = '0px'; s.width = W + 'px'; s.height = H + 'px'; s.margin = '0'; s.animation = 'none'; s.transition = 'none';
    s.visibility = 'hidden'; s.pointerEvents = 'none';
    st.appendChild(e);
    try {
      var cs = getComputedStyle(e), m = /matrix(3d)?\(([^)]+)\)/.exec(cs.transform || ''), o = String(cs.transformOrigin || '').split(/\s+/).map(parseFloat);
      if (m) { var v = m[2].split(',').map(parseFloat); r.m = m[1] ? [v[0], v[1], v[4], v[5], v[12], v[13]] : v.slice(0, 6); }
      if (r.m.some(function (x) { return !isFinite(x); })) r.m = [1, 0, 0, 1, 0, 0];
      if (o.length > 1 && isFinite(o[0]) && isFinite(o[1])) r.o = [o[0], o[1]];
      r.f = cs.filter || 'none';
    } finally { st.removeChild(e); }
    return r;
  }
  /* "drop-shadow(rgba(10, 10, 10, 0.1) 0px 20px 22px) drop-shadow(…)" → [{ x, y, s (σ), a, c: [r, g, b] }] theo thứ tự áp */
  function snapShadows(f) {
    var out = [], re = /drop-shadow\(((?:[^()]|\([^()]*\))*)\)/g, m;
    while ((m = re.exec(f || ''))) {
      var cm = /rgba?\([^)]*\)/.exec(m[1]), col = cm ? cm[0] : 'rgb(0, 0, 0)', L = (m[1].replace(col, ' ').match(/-?[\d.]+(?=px)/g) || []).map(parseFloat), c = rgb01(col);
      if (L.length > 1) out.push({ x: L[0], y: L[1], s: L[2] || 0, a: rgbaA(col), c: [c[0] * 255, c[1] * 255, c[2] * 255] });
    }
    /* trình duyệt viết filter kiểu khác → số của V (đã ghi y hệt vé DOM) */
    if (!out.length && /drop-shadow/.test(f || '')) out = [V.s1, V.s2].map(function (q) { return { x: 0, y: q[0], s: q[1], a: q[2], c: [10, 10, 10] }; });
    return out;
  }
  /* làm mờ Gauss tách trục, ngoài lưới = 0 (σ tính bằng ô lưới) */
  function snapBlur(a, w, h, sg) {
    var R = Math.max(1, Math.ceil(sg * 3)), n = 2 * R + 1, k = new Float32Array(n), t = 0, i, x, y, j;
    for (i = 0; i < n; i++) { k[i] = Math.exp(-(i - R) * (i - R) / (2 * sg * sg)); t += k[i]; }
    for (i = 0; i < n; i++) k[i] /= t;
    var b = new Float32Array(w * h), o = new Float32Array(w * h);
    for (y = 0; y < h; y++) {   /* ngang: cộng từng nhịp nhân của cả hàng (vòng trong không rẽ nhánh) */
      var r0 = y * w;
      for (j = 0; j < n; j++) { var kj = k[j], dd = j - R, x0 = dd < 0 ? -dd : 0, x1 = dd > 0 ? w - dd : w; for (x = x0; x < x1; x++) b[r0 + x] += a[r0 + x + dd] * kj; }
    }
    for (y = 0; y < h; y++) {   /* dọc: cộng cả hàng lân cận */
      var r1 = y * w;
      for (j = 0; j < n; j++) { var yy = y + j - R; if (yy < 0 || yy >= h) continue; var kv = k[j], rs = yy * w; for (x = 0; x < w; x++) o[r1 + x] += b[rs + x] * kv; }
    }
    return o;
  }
  /* lấy mẫu song tuyến lưới f (w × h, tâm ô = số nguyên, ngoài lưới = 0) lên lưới gw × gh: ô (i, j) ← f(au·i + bu, av·j + bv) */
  function snapRes(f, w, h, gw, gh, au, bu, av, bv) {
    var o = new Float32Array(gw * gh), X = new Int32Array(gw), F = new Float32Array(gw), i, j;
    for (i = 0; i < gw; i++) { var u = au * i + bu, x0 = Math.floor(u); X[i] = x0; F[i] = u - x0; }
    for (j = 0; j < gh; j++) {
      var v = av * j + bv, y0 = Math.floor(v), fy = v - y0, r0 = y0 * w, r1 = r0 + w, k0 = y0 >= 0 && y0 < h, k1 = y0 + 1 >= 0 && y0 + 1 < h, oj = j * gw;
      if (!k0 && !k1) continue;
      for (i = 0; i < gw; i++) {
        var x = X[i], fx = F[i], a = 0, b = 0;
        if (x >= 0 && x < w) { if (k0) a = f[r0 + x] * (1 - fx); if (k1) b = f[r1 + x] * (1 - fx); }
        if (x + 1 >= 0 && x + 1 < w) { if (k0) a += f[r0 + x + 1] * fx; if (k1) b += f[r1 + x + 1] * fx; }
        o[oj + i] = a * (1 - fy) + b * fy;
      }
    }
    return o;
  }
  /* mặt nạ alpha trên lưới (gốc gx, gy · bước h px CSS): giấy + mực tràn — vẽ bằng canvas 2D rồi đọc kênh alpha */
  function snapMask(paint, gx, gy, gw, gh, h) {
    var cv = document.createElement('canvas'); cv.width = gw; cv.height = gh;
    var x = cv.getContext('2d', { willReadFrequently: true }); if (!x) return null;
    try {
      x.setTransform(1 / h, 0, 0, 1 / h, -gx / h, -gy / h); paint(x, '#000');
      var d = x.getImageData(0, 0, gw, gh).data, a = new Float32Array(gw * gh);
      for (var i = 0; i < a.length; i++) a[i] = d[i * 4 + 3] / 255;
      return a;
    } finally { cv.width = cv.height = 0; }
  }
  /* các lớp bóng: lưới riêng mỗi lớp (bước ≈ σ / 3, mịn nhất 1 px CSS) → alpha → vẽ phóng lên theo ma trận T. Lớp sau nằm dưới. */
  function snapShade(x, T, sh, paint, bb, W, H) {
    var L = [], n, i, k;
    for (n = 0; n < sh.length; n++) {
      var q = sh[n], h = Math.max(1, q.s / 3), reach = Math.max(Math.abs(q.x), Math.abs(q.y)) + 3 * q.s + 2 * h;
      var gx = bb[0] - reach, gy = bb[1] - reach, gw = Math.ceil((bb[2] - bb[0] + 2 * reach) / h), gh = Math.ceil((bb[3] - bb[1] + 2 * reach) / h);
      var a = snapMask(paint, gx, gy, gw, gh, h); if (!a) return false;
      /* mặt nạ đọc ra phải đúng: góc ngoài trống, giữa vé kín giấy (trình duyệt chống dò vân tay trả ảnh nhiễu / trắng → dự phòng) */
      var ci = Math.floor((H / 2 - gy) / h) * gw + Math.floor((W / 2 - gx) / h);
      if (!(a[0] < .02 && a[gw * gh - 1] < .02 && a[ci] > .98)) return false;
      /* filter nối tiếp: lớp này đổ bóng cả các lớp trước → mặt nạ = 1 − (1 − mực)(1 − bóng trước) */
      L.forEach(function (l) {
        var v = snapRes(l.g, l.gw, l.gh, gw, gh, h / l.h, (gx + .5 * h - l.gx) / l.h - .5, h / l.h, (gy + .5 * h - l.gy) / l.h - .5);
        for (k = 0; k < v.length; k++) if (v[k] > 0) a[k] = 1 - (1 - a[k]) * (1 - v[k]);
      });
      /* σ theo ô lưới; trừ phần nhoè sẵn của ô vuông khi vẽ mặt nạ (phương sai 1/12) · dời theo độ lệch bóng · nhân độ đậm */
      var sg = Math.sqrt(Math.max(q.s * q.s / (h * h) - 1 / 12, 0)), f = sg > .25 ? snapBlur(a, gw, gh, sg) : a, g = snapRes(f, gw, gh, gw, gh, 1, -q.x / h, 1, -q.y / h);
      for (k = 0; k < g.length; k++) g[k] *= q.a;
      L.push({ gx: gx, gy: gy, h: h, gw: gw, gh: gh, g: g, c: q.c });
    }
    for (n = L.length - 1; n >= 0; n--) {
      var l = L[n], cv = document.createElement('canvas'); cv.width = l.gw; cv.height = l.gh;
      var c = cv.getContext('2d'); if (!c) return false;
      var im = c.createImageData(l.gw, l.gh), d = im.data;
      for (i = 0; i < l.g.length; i++) { var al = Math.round(Math.min(1, l.g[i]) * 255); if (al > 0) { d[i * 4] = l.c[0]; d[i * 4 + 1] = l.c[1]; d[i * 4 + 2] = l.c[2]; d[i * 4 + 3] = al; } }
      c.putImageData(im, 0, 0);
      x.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]); x.imageSmoothingEnabled = true;
      x.drawImage(cv, l.gx, l.gy, l.gw * l.h, l.gh * l.h);
      cv.width = cv.height = 0;
    }
    return true;
  }
  /* dự phòng: shadowBlur của canvas (σ = blur / 2 theo chuẩn), chỉ bóng — hình đặt ra ngoài khung, bóng dời về đúng chỗ */
  function snapShadeNative(x, T, sh, paint, s, Wc) {
    for (var n = sh.length - 1; n >= 0; n--) {
      var q = sh[n], D = Wc + 8 * q.s * s + 64;
      x.save(); x.setTransform(T[0], T[1], T[2], T[3], T[4] - D, T[5]);
      x.shadowColor = 'rgba(' + q.c.map(Math.round).join(',') + ',' + q.a + ')'; x.shadowBlur = 2 * q.s * s;
      x.shadowOffsetX = D + T[0] * q.x + T[2] * q.y; x.shadowOffsetY = T[1] * q.x + T[3] * q.y;
      paint(x, '#000'); x.restore();
    }
  }
  function snapshot(tk, o) {
    o = o || {};
    if (!tk || !tk.isConnected || !tk.offsetWidth || !tk.offsetHeight || !window.Path2D) return null;
    var pe = tk.querySelector('.tk-paper path'), d = pe && pe.getAttribute('d'), svg = pe && pe.ownerSVGElement, st = tk.closest('.tk-stage') || tk.parentNode;
    if (!d || !st) return null;
    var pc = paperCss(tk), M = measure({ tk: tk, stage: st, paperCss: pc }), W = M.W, H = M.H;
    if (!W || !H) return null;
    var P = snapPose(tk, st, W, H), sh = o.shadow === false ? [] : snapShadows(P.f);
    /* thứ tự vẽ như trình duyệt (thứ tự cây, xếp ổn định): measure() trả hộp trước, chữ sau — chữ tràn (tên rất dài) phải nằm dưới
       nét đứt / ô vẽ sau nó như vé DOM */
    if (M.items.every(function (it) { return typeof it.o === 'number'; })) M.items.sort(function (a, b) { return a.o - b.o; });
    /* path giấy: viewBox → hộp vé như SVG (xMidYMid meet; bình thường viewBox = W × H → giữ nguyên) */
    var path = new Path2D(d), vb = svg && svg.viewBox && svg.viewBox.baseVal, pm = [1, 0, 0, 1, 0, 0];
    if (vb && vb.width && vb.height) { var kv = Math.min(W / vb.width, H / vb.height); pm = [kv, 0, 0, kv, (W - vb.width * kv) / 2 - vb.x * kv, (H - vb.height * kv) / 2 - vb.y * kv]; }
    /* ô, viền, nét đứt, mã vạch, chữ B0DY: mép hộp bám px CSS trong toạ độ vé — đúng cách trình duyệt vẽ hộp của phần tử có transform
       (chữ: measure() đã làm tròn đường chân chữ; x giữ phần lẻ như trình duyệt). Đo ở 3×: viền ô lệch 0,8 → 0,02 điểm ảnh. */
    M.items.forEach(function (it) {
      if (it.k === 't') return;
      var x0 = Math.round(it.x), y0 = Math.round(it.y), x1 = Math.round(it.x + it.w), y1 = Math.round(it.y + it.h);
      it.x = x0; it.y = y0; it.w = Math.max(0, x1 - x0); it.h = Math.max(0, y1 - y0);
    });
    /* hộp nội dung (toạ độ vé): giấy + mực tràn ra ngoài giấy (tên rất dài…) — mực tràn cũng đổ bóng như vé DOM */
    var bb = [0, 0, W, H], over = [];
    M.items.forEach(function (it) {
      var b;
      if (it.k === 't') {
        var fs = parseFloat((/([\d.]+)px/.exec(it.font) || [0, 16])[1]) || 16; b = [Infinity, Infinity, -Infinity, -Infinity];
        it.g.forEach(function (g) { b[0] = Math.min(b[0], g[1] - fs * .1); b[1] = Math.min(b[1], g[2] - fs); b[2] = Math.max(b[2], g[1] + fs); b[3] = Math.max(b[3], g[2] + fs * .3); });
      } else b = [it.x, it.y, it.x + it.w, it.y + it.h];
      if (b[0] < -.5 || b[1] < -.5 || b[2] > W + .5 || b[3] > H + .5) { over.push(it); bb = [Math.min(bb[0], b[0]), Math.min(bb[1], b[1]), Math.max(bb[2], b[2]), Math.max(bb[3], b[3])]; }
    });
    function paint(c, col) {
      c.save(); c.transform(pm[0], pm[1], pm[2], pm[3], pm[4], pm[5]); c.fillStyle = col; c.fill(path, 'evenodd'); c.restore();
      c.textBaseline = 'alphabetic'; c.textAlign = 'left';
      over.forEach(function (it) { paintItem(c, it); });
    }
    /* vé (px CSS, chưa biến đổi) → trang: A = dời(gốc) · matrix · dời(−gốc) */
    var m = P.m, ox = P.o[0], oy = P.o[1], A = [m[0], m[1], m[2], m[3], m[4] + ox - m[0] * ox - m[2] * oy, m[5] + oy - m[1] * ox - m[3] * oy];
    var cx = [], cy = [];
    [[bb[0], bb[1]], [bb[2], bb[1]], [bb[0], bb[3]], [bb[2], bb[3]]].forEach(function (p) { cx.push(A[0] * p[0] + A[2] * p[1] + A[4]); cy.push(A[1] * p[0] + A[3] * p[1] + A[5]); });
    /* lề (px CSS): tối thiểu 32; đủ để mỗi lớp bóng tắt hẳn (2,4 σ ngoài mép bóng đã dời: < 0,25 mức màu) */
    var mg = [32, 32, 32, 32];
    sh.forEach(function (q) { var r = 2.4 * q.s; mg[0] = Math.max(mg[0], r - q.x); mg[1] = Math.max(mg[1], r - q.y); mg[2] = Math.max(mg[2], r + q.x); mg[3] = Math.max(mg[3], r + q.y); });
    var X0 = Math.floor(Math.min.apply(null, cx) - mg[0]), Y0 = Math.floor(Math.min.apply(null, cy) - mg[1]);
    var X1 = Math.ceil(Math.max.apply(null, cx) + mg[2]), Y1 = Math.ceil(Math.max.apply(null, cy) + mg[3]), cw = X1 - X0, ch = Y1 - Y0;
    var s = Math.min(o.scale || 3, 4096 / Math.max(cw, ch), Math.sqrt(16e6 / (cw * ch))), Wc = Math.round(cw * s), Hc = Math.round(ch * s);
    s = Math.min(Wc / cw, Hc / ch);
    var T = [s * A[0], s * A[1], s * A[2], s * A[3], s * (A[4] - X0), s * (A[5] - Y0)];
    var cv = document.createElement('canvas'); cv.width = Wc; cv.height = Hc;
    var x = cv.getContext('2d'); if (!x) return null;
    var bg = o.bg || (function () { var b = getComputedStyle(document.body).backgroundColor; return rgbaA(b) === 1 ? b : '#FAFAFA'; })();
    x.fillStyle = bg; x.fillRect(0, 0, Wc, Hc);
    if (sh.length) { var ok = false; try { ok = snapShade(x, T, sh, paint, bb, W, H); } catch (e) { ok = false; } if (!ok) { x.setTransform(1, 0, 0, 1, 0, 0); x.fillStyle = bg; x.fillRect(0, 0, Wc, Hc); snapShadeNative(x, T, sh, paint, s, Wc); } }
    /* giấy rồi mực, cùng ma trận (chữ dựng thẳng theo góc nghiêng, sắc như vé DOM) */
    x.setTransform(T[0], T[1], T[2], T[3], T[4], T[5]);
    x.save(); x.transform(pm[0], pm[1], pm[2], pm[3], pm[4], pm[5]); x.fillStyle = pc; x.fill(path, 'evenodd'); x.restore();
    x.textBaseline = 'alphabetic'; x.textAlign = 'left';
    M.items.forEach(function (it) { paintItem(x, it); });
    x.setTransform(1, 0, 0, 1, 0, 0);
    cv.tkSnap = { s: s, T: T, W: W, H: H, el: tk.id, v: tk.classList.contains('tkm') ? 'm' : 'd' };
    return cv;
  }

  return {
    snapshot: snapshot,
    attach: attach, show: show, pose: pose, rot: rot, refit: refit, release: release, warm: warm,
    ready: function () { var c = CUR; return OK === false || LOST || !c || c.dead ? -1 : c.rdy ? 1 : 0; },
    booted: function () { return OK === true && !LOST; },
    shown: function () { var c = CUR; return c && !c.dead && c.shown ? c.p : -1; },
    el: function () { var c = CUR; return c && !c.dead ? c.tk : null; },
    _dbg: dbg, _view: view, _rebuild: function () { if (CUR) { CUR.rb = 1; refit0(); } }, _lose: lose, _restore: restore, _V: V
  };
})();
