/* fluid.js — 香烟：WebGL 曲噪声流体
   鼠标过处留下一缕金灰色烟，随噪声场向上飘散，如殿中香火。
   WebGL1 + 8bit 反馈纹理，不支持时静默降级（不显示，不报错）。 */
(function () {
  'use strict';

  var canvas = document.getElementById('fluid-canvas');
  if (!canvas) return;
  var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: false });
  if (!gl) { canvas.style.display = 'none'; return; }

  var VERT = [
    'attribute vec2 p;',
    'varying vec2 uv;',
    'void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }'
  ].join('\n');

  // 更新通道：曲噪声平流 + 衰减 + 鼠标注入
  var FRAG_UPDATE = [
    'precision mediump float;',
    'varying vec2 uv;',
    'uniform sampler2D tex;',
    'uniform vec2 res;',
    'uniform vec2 mouse;',
    'uniform vec2 mvel;',
    'uniform float time;',
    'float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }',
    'float noise(vec2 p){',
    '  vec2 i = floor(p), f = fract(p);',
    '  vec2 u = f * f * (3. - 2. * f);',
    '  return mix(mix(hash(i), hash(i + vec2(1., 0.)), u.x),',
    '             mix(hash(i + vec2(0., 1.)), hash(i + vec2(1., 1.)), u.x), u.y);',
    '}',
    'float fbm(vec2 p){ float v = 0.; float a = .5;',
    '  for(int i = 0; i < 4; i++){ v += a * noise(p); p *= 2.03; a *= .5; } return v; }',
    // 曲噪声：势场的旋度，天然无散度，烟不会糊成一团
    'vec2 curl(vec2 p){',
    '  float e = .01;',
    '  float n1 = fbm(p + vec2(0., e));',
    '  float n2 = fbm(p - vec2(0., e));',
    '  float n3 = fbm(p + vec2(e, 0.));',
    '  float n4 = fbm(p - vec2(e, 0.));',
    '  return vec2((n1 - n2), -(n3 - n4)) / (2. * e);',
    '}',
    'void main(){',
    '  vec2 asp = vec2(res.x / res.y, 1.);',
    '  vec2 v = curl(uv * asp * 3. + vec2(0., -time * .12)) * .0016;',
    '  v.y += .0012;', // 热气上升
    '  float d = texture2D(tex, uv - v).r * .972;',
    '  vec2 dm = (uv - mouse) * asp;',
    '  float splat = exp(-dot(dm, dm) * 900.) * (length(mvel) * 22. + .05);',
    '  d += splat;',
    '  gl_FragColor = vec4(clamp(d, 0., 1.), 0., 0., 1.);',
    '}'
  ].join('\n');

  // 显示通道：密度 → 金灰烟色
  var FRAG_SHOW = [
    'precision mediump float;',
    'varying vec2 uv;',
    'uniform sampler2D tex;',
    'void main(){',
    '  float d = texture2D(tex, uv).r;',
    '  vec3 smoke = mix(vec3(.29, .27, .23), vec3(.69, .55, .27), smoothstep(.0, .55, d));',
    '  float a = smoothstep(.015, .5, d) * .34;',
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
  catch (e) { canvas.style.display = 'none'; return; }

  var quad = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, quad);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);

  var SIM = 384; // 模拟分辨率，烟本来就该是糊的
  function makeTarget() {
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
  var A = makeTarget(), B = makeTarget();

  var mouse = { x: .5, y: .5, px: .5, py: .5, vx: 0, vy: 0 };
  var hero = document.querySelector('.hero') || document.body;
  window.addEventListener('pointermove', function (e) {
    var r = canvas.getBoundingClientRect();
    if (r.bottom < 0 || r.top > innerHeight) return;
    mouse.x = (e.clientX - r.left) / r.width;
    mouse.y = 1 - (e.clientY - r.top) / r.height;
  }, { passive: true });

  function resize() {
    var r = hero.getBoundingClientRect();
    canvas.width = Math.max(2, Math.floor(r.width * .75));
    canvas.height = Math.max(2, Math.floor(r.height * .75));
  }
  resize();
  window.addEventListener('resize', resize);

  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduced) { canvas.style.display = 'none'; return; }

  var t0 = performance.now();
  function frame() {
    var now = (performance.now() - t0) / 1000;
    mouse.vx = mouse.x - mouse.px; mouse.vy = mouse.y - mouse.py;
    mouse.px = mouse.x; mouse.py = mouse.y;

    // 更新到 B
    gl.bindFramebuffer(gl.FRAMEBUFFER, B.fbo);
    gl.viewport(0, 0, SIM, SIM);
    gl.useProgram(progU);
    bindQuad(progU);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, A.tex);
    gl.uniform1i(gl.getUniformLocation(progU, 'tex'), 0);
    gl.uniform2f(gl.getUniformLocation(progU, 'res'), canvas.width, canvas.height);
    gl.uniform2f(gl.getUniformLocation(progU, 'mouse'), mouse.x, mouse.y);
    gl.uniform2f(gl.getUniformLocation(progU, 'mvel'), mouse.vx, mouse.vy);
    gl.uniform1f(gl.getUniformLocation(progU, 'time'), now);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    // 显示
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
    gl.useProgram(progS);
    bindQuad(progS);
    gl.bindTexture(gl.TEXTURE_2D, B.tex);
    gl.uniform1i(gl.getUniformLocation(progS, 'tex'), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    var t = A; A = B; B = t;
    requestAnimationFrame(frame);
  }
  function bindQuad(p) {
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    var loc = gl.getAttribLocation(p, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  }
  requestAnimationFrame(frame);
})();
