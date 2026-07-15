/* mandala.js — 一百八子沉香念珠
   hero 背景懸一串老念珠：一百零八顆木珠（徑向漸變出珠光與包漿，大小微差如手串），
   一顆碩大的佛頭母珠，一顆硃砂計數珠沿串緩行如捻珠誦持；貫珠一線隱然可見。
   珠串預先繪在離屏畫布上，每幀只做旋轉合成，極省性能；減少動態時只懸不轉。 */
(function () {
  'use strict';

  var canvas = document.getElementById('mandala-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var hero = document.querySelector('.hero') || document.body;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var W, H, CX, CY, R, ring = null;

  var N = 108;
  var seeds = [];
  (function () { // 每顆珠的個性：大小、色相偏移（固定隨機，像真串珠各有紋理）
    var s = 9973;
    for (var i = 0; i < N; i++) {
      s = (s * 16807) % 2147483647;
      seeds.push({ dr: (s % 1000) / 1000, dc: ((s >> 3) % 1000) / 1000 });
    }
  })();

  /* 画一颗木珠：包浆深棕，左上受光，边缘沉色，中央一点润光 */
  function bead(c, x, y, r, tone, highlight) {
    var g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
    g.addColorStop(0, 'rgba(' + tone.hi + ',' + highlight + ')');
    g.addColorStop(.45, 'rgba(' + tone.mid + ',' + highlight + ')');
    g.addColorStop(.85, 'rgba(' + tone.lo + ',' + highlight + ')');
    g.addColorStop(1, 'rgba(' + tone.edge + ',' + (highlight * .85) + ')');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    // 珠孔连线处的一点高光
    c.fillStyle = 'rgba(255,246,224,' + (highlight * .35) + ')';
    c.beginPath(); c.arc(x - r * .3, y - r * .38, r * .16, 0, Math.PI * 2); c.fill();
  }

  var WOOD = { hi: '167,124,80', mid: '124,86,52', lo: '84,56,33', edge: '52,34,20' };
  var WOOD2 = { hi: '150,106,66', mid: '108,72,42', lo: '72,47,27', edge: '46,30,18' };
  var CINN = { hi: '224,110,80', mid: '178,66,42', lo: '128,42,26', edge: '86,26,16' };

  /* 离屏珠串：静态部分（108木珠+母珠+贯线） */
  function buildRing() {
    var size = Math.ceil((R + 14) * 2 * DPR);
    ring = document.createElement('canvas');
    ring.width = ring.height = size;
    var c = ring.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    var cx = size / (2 * DPR), cy = cx;

    // 贯珠线（隐约）
    c.strokeStyle = 'rgba(84,56,33,.25)';
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();

    var alpha = .8;
    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2 - Math.PI / 2;
      var x = cx + Math.cos(a) * R;
      var y = cy + Math.sin(a) * R;
      var base = Math.max(4.2, R * .028);
      var r = base * (0.92 + seeds[i].dr * .18);
      bead(c, x, y, r, seeds[i].dc > .5 ? WOOD : WOOD2, alpha);
    }
    // 母珠（佛头）：正上方，更大，配三通小塔
    var mx = cx, my = cy - R;
    bead(c, mx, my, Math.max(7, R * .048), WOOD, .95);
    bead(c, mx, my - Math.max(9, R * .06), Math.max(3.4, R * .022), WOOD2, .95);
  }

  function resize() {
    var r = hero.getBoundingClientRect();
    W = Math.floor(r.width); H = Math.floor(r.height);
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CX = W * (W < 900 ? .5 : .63);
    CY = H * .44;
    R = Math.min(W, H) * (W < 900 ? .37 : .33);
    buildRing();
  }
  resize();
  window.addEventListener('resize', resize);

  var px = 0, py = 0;
  window.addEventListener('pointermove', function (e) {
    px = (e.clientX / innerWidth - .5) * 12;
    py = (e.clientY / innerHeight - .5) * 9;
  }, { passive: true });

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var cx = CX + px, cy = CY + py;
    var rot = reduced ? 0 : t * .00004;            // 缓不可察地转
    var breathe = reduced ? 1 : 1 + Math.sin(t * .0006) * .008;

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(rot);
    ctx.scale(breathe, breathe);
    ctx.globalAlpha = .9;
    ctx.drawImage(ring, -ring.width / (2 * DPR), -ring.height / (2 * DPR), ring.width / DPR, ring.height / DPR);
    ctx.restore();

    // 硃砂计数珠：沿串缓行（每2.6秒过一颗），独立于串的旋转
    if (!reduced) {
      var idx = (t / 2600) % N;
      var a = rot + (idx / N) * Math.PI * 2 - Math.PI / 2;
      var x = cx + Math.cos(a) * R * breathe;
      var y = cy + Math.sin(a) * R * breathe;
      bead(ctx, x, y, Math.max(5.5, R * .036), CINN, .95);
    }

    if (!reduced) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
