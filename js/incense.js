/* incense.js — 爐香贊：宣德爐常燃 + 隨指生煙（全站通用，主頁/藏經閣/手機皆可）
   右下角一尊明宣德灑金蚰龍耳爐（原件照片摳圖），爐口一縷煙終日不斷——
   不碰滑鼠不碰屏也在冒；滑鼠/手指過處另起一縷。
   WebGL 曲噪聲流體，畫布固定覆蓋視窗，pointer-events:none 不擋閱讀；
   不支持 WebGL 或開了「減少動態」時只留爐、不生煙。 */
(function () {
  'use strict';

  /* ---------- 佈置爐與畫布 ---------- */
  var censer = document.createElement('img');
  censer.src = 'assets/censer_cut.webp';
  censer.alt = '明宣德 灑金蚰龍耳爐';
  censer.id = 'censer';
  censer.draggable = false;
  document.body.appendChild(censer);

  var canvas = document.createElement('canvas');
  canvas.id = 'incense-canvas';
  document.body.appendChild(canvas);

  if (matchMedia('(prefers-reduced-motion: reduce)').matches) { canvas.remove(); return; }
  var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) { canvas.remove(); return; }

  var VERT = 'attribute vec2 p; varying vec2 uv; void main(){ uv = p*.5+.5; gl_Position = vec4(p,0.,1.); }';

  var FRAG_UPDATE = [
    'precision mediump float;',
    'varying vec2 uv;',
    'uniform sampler2D tex;',
    'uniform vec2 res;',
    'uniform vec2 mouse;',
    'uniform vec2 mvel;',
    'uniform vec2 ember;',
    'uniform float time;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }',
    'float noise(vec2 p){ vec2 i=floor(p), f=fract(p); vec2 u=f*f*(3.-2.*f);',
    '  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x), mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x), u.y); }',
    'float fbm(vec2 p){ float v=0.; float a=.5; for(int i=0;i<4;i++){ v+=a*noise(p); p*=2.03; a*=.5; } return v; }',
    'vec2 curl(vec2 p){ float e=.01;',
    '  float n1=fbm(p+vec2(0.,e)); float n2=fbm(p-vec2(0.,e));',
    '  float n3=fbm(p+vec2(e,0.)); float n4=fbm(p-vec2(e,0.));',
    '  return vec2((n1-n2), -(n3-n4))/(2.*e); }',
    'void main(){',
    '  vec2 asp = vec2(res.x/res.y, 1.);',
    '  vec2 v = curl(uv*asp*3. + vec2(0., -time*.1)) * .0016;',
    '  v.y += .0019;',
    '  float d = texture2D(tex, uv - v).r * .982;',
    '  vec2 dm = (uv - mouse) * asp;',
    '  d += exp(-dot(dm,dm)*900.) * (length(mvel)*26.);',
    // 爐口香頭：一縷細煙持續上供，隨呼吸明滅、微微搖曳
    '  vec2 de = (uv - ember - vec2(sin(time*.8)*.004, 0.)) * asp;',
    '  d += exp(-dot(de,de)*9000.) * (.5 + .18*sin(time*1.3));',
    '  gl_FragColor = vec4(clamp(d,0.,1.), 0., 0., 1.);',
    '}'
  ].join('\n');

  var FRAG_SHOW = [
    'precision mediump float;',
    'varying vec2 uv;',
    'uniform sampler2D tex;',
    'void main(){',
    '  float d = texture2D(tex, uv).r;',
    '  vec3 smoke = mix(vec3(.32,.30,.26), vec3(.68,.55,.28), smoothstep(.0,.5,d));',
    '  float a = smoothstep(.012,.4,d) * .42;',
    '  gl_FragColor = vec4(smoke, a);',
    '}'
  ].join('\n');

  function shader(type, src) {
    var s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw gl.getShaderInfoLog(s);
    return s;
  }
  function program(fs) {
    var p = gl.createProgram();
    gl.attachShader(p, shader(gl.VERTEX_SHADER, VERT));
    gl.attachShader(p, shader(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw gl.getProgramInfoLog(p);
    return p;
  }
  var progU, progS;
  try { progU = program(FRAG_UPDATE); progS = program(FRAG_SHOW); }
  catch (e) { canvas.remove(); return; }

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);

  var SIM = 384;
  function target() {
    var t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, SIM, SIM, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    var f = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, f);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { tex: t, fbo: f };
  }
  var A = target(), B = target();

  var mouse = { x: -1, y: -1, px: -1, py: -1, vx: 0, vy: 0 };
  function point(e) {
    var cx = e.clientX !== undefined ? e.clientX : (e.touches && e.touches[0] && e.touches[0].clientX);
    var cy = e.clientY !== undefined ? e.clientY : (e.touches && e.touches[0] && e.touches[0].clientY);
    if (cx === undefined) return;
    if (mouse.x < 0) { mouse.px = cx / innerWidth; mouse.py = 1 - cy / innerHeight; }
    mouse.x = cx / innerWidth;
    mouse.y = 1 - cy / innerHeight;
  }
  window.addEventListener('pointermove', point, { passive: true });
  window.addEventListener('touchmove', point, { passive: true });

  function resize() {
    canvas.width = Math.max(2, Math.floor(innerWidth * .7));
    canvas.height = Math.max(2, Math.floor(innerHeight * .7));
  }
  resize();
  window.addEventListener('resize', resize);

  /* 爐口位置（規範化到視窗座標，y 向上） */
  function emberPos(now) {
    var r = censer.getBoundingClientRect();
    if (!r.width) return [.85, .1];
    return [
      (r.left + r.width * .5) / innerWidth + Math.sin(now * .3) * .003,
      1 - (r.top + r.height * .18) / innerHeight
    ];
  }

  var t0 = performance.now();
  function frame() {
    var now = (performance.now() - t0) / 1000;
    if (mouse.x >= 0) {
      mouse.vx = mouse.x - mouse.px; mouse.vy = mouse.y - mouse.py;
      mouse.px = mouse.x; mouse.py = mouse.y;
    }
    var em = emberPos(now);

    gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo);
    gl.viewport(0, 0, SIM, SIM);
    gl.useProgram(progU);
    bind(progU);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.uniform1i(gl.getUniformLocation(progU, 'tex'), 0);
    gl.uniform2f(gl.getUniformLocation(progU, 'res'), innerWidth, innerHeight);
    gl.uniform2f(gl.getUniformLocation(progU, 'mouse'), Math.max(mouse.x, 0), Math.max(mouse.y, 0));
    gl.uniform2f(gl.getUniformLocation(progU, 'mvel'), mouse.vx, mouse.vy);
    gl.uniform2f(gl.getUniformLocation(progU, 'ember'), em[0], em[1]);
    gl.uniform1f(gl.getUniformLocation(progU, 'time'), now);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progS);
    bind(progS);
    gl.bindTexture(gl.TEXTURE_2D, B.tex);
    gl.uniform1i(gl.getUniformLocation(progS, 'tex'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    var t = A; A = B; B = t;
    requestAnimationFrame(frame);
  }
  function bind(p) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    var loc = gl.getAttribLocation(p, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  requestAnimationFrame(frame);
})();
