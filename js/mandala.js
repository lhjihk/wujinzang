/* mandala.js — 龕與念珠
   hero 中央供一尊明代木雕隨身佛龕（Met 藏，原件摳圖），
   外圍一串一百零八子念珠環繞——每顆珠子都貼真實明代木器的木紋
   （克利夫蘭藏明代條案桌面裁切，球面光影疊加），佛頭母珠居頂，
   一顆硃砂計數珠沿串緩行如捻珠誦持。
   珠串預渲染離屏畫布，每幀只做旋轉合成；減少動態時靜置不轉。 */
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
  (function () {
    var s = 9973;
    for (var i = 0; i < N; i++) {
      s = (s * 16807) % 2147483647;
      seeds.push({ dr: (s % 1000) / 1000, rot: ((s >> 4) % 628) / 100 });
    }
  })();

  /* 佛龕：置於珠環中央 */
  var shrine = document.createElement('img');
  shrine.src = 'assets/relic_shrine.webp';
  shrine.alt = '明代木雕隨身佛龕';
  shrine.className = 'hero-shrine';
  shrine.draggable = false;
  hero.insertBefore(shrine, hero.firstChild);

  /* 真木珠 sprite */
  var beadImg = new Image();
  var beadReady = false;
  beadImg.onload = function () { beadReady = true; if (R) buildRing(); };
  beadImg.src = 'assets/bead.webp';

  function stamp(c, x, y, r, rot, alpha) {
    c.save();
    c.translate(x, y);
    c.rotate(rot);
    c.globalAlpha = alpha;
    c.drawImage(beadImg, -r, -r, r * 2, r * 2);
    c.restore();
  }

  /* 硃砂計數珠：畫的（與木珠質感區分） */
  function cinnabarBead(c, x, y, r) {
    var g = c.createRadialGradient(x - r * .35, y - r * .4, r * .1, x, y, r);
    g.addColorStop(0, 'rgba(224,110,80,.95)');
    g.addColorStop(.5, 'rgba(178,66,42,.95)');
    g.addColorStop(1, 'rgba(86,26,16,.9)');
    c.fillStyle = g;
    c.beginPath(); c.arc(x, y, r, 0, Math.PI * 2); c.fill();
    c.fillStyle = 'rgba(255,240,220,.4)';
    c.beginPath(); c.arc(x - r * .3, y - r * .38, r * .17, 0, Math.PI * 2); c.fill();
  }

  function buildRing() {
    if (!beadReady) return;
    var size = Math.ceil((R + 16) * 2 * DPR);
    ring = document.createElement('canvas');
    ring.width = ring.height = size;
    var c = ring.getContext('2d');
    c.setTransform(DPR, 0, 0, DPR, 0, 0);
    var cx = size / (2 * DPR), cy = cx;

    // 貫珠線
    c.strokeStyle = 'rgba(70,46,26,.3)';
    c.lineWidth = 1.2;
    c.beginPath(); c.arc(cx, cy, R, 0, Math.PI * 2); c.stroke();

    for (var i = 0; i < N; i++) {
      var a = (i / N) * Math.PI * 2 - Math.PI / 2;
      var x = cx + Math.cos(a) * R;
      var y = cy + Math.sin(a) * R;
      var base = Math.max(4.6, R * .03);
      var r = base * (0.9 + seeds[i].dr * .22);
      stamp(c, x, y, r, seeds[i].rot, .95);
    }
    // 母珠與三通
    stamp(c, cx, cy - R, Math.max(7.5, R * .052), .3, 1);
    stamp(c, cx, cy - R - Math.max(9, R * .062), Math.max(3.8, R * .024), 1.2, 1);
  }

  function resize() {
    var r = hero.getBoundingClientRect();
    W = Math.floor(r.width); H = Math.floor(r.height);
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    CX = W * (W < 900 ? .5 : .70);
    CY = H * (W < 900 ? .42 : .44);
    R = Math.min(W, H) * (W < 900 ? .38 : .33);
    // 佛龕跟環走；手機屏太窄，只留珠環
    if (W < 900) { shrine.style.display = 'none'; }
    else {
      shrine.style.display = '';
      var sw = R * 1.12;
      shrine.style.width = sw + 'px';
      shrine.style.left = (CX - sw / 2) + 'px';
      shrine.style.top = (CY - sw * 0.34) + 'px'; // 龕寬:高 ≈ 11:7.5
    }
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
    var rot = reduced ? 0 : t * .00004;
    var breathe = reduced ? 1 : 1 + Math.sin(t * .0006) * .008;

    // 佛龕輕微視差（幅度是珠串的六成，像隔了一層）
    shrine.style.transform = 'translate(' + (px * .6) + 'px,' + (py * .6) + 'px)';

    if (ring) {
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(rot);
      ctx.scale(breathe, breathe);
      ctx.globalAlpha = .96;
      ctx.drawImage(ring, -ring.width / (2 * DPR), -ring.height / (2 * DPR), ring.width / DPR, ring.height / DPR);
      ctx.restore();
    }

    if (!reduced) {
      var idx = (t / 2600) % N;
      var a = rot + (idx / N) * Math.PI * 2 - Math.PI / 2;
      cinnabarBead(ctx, cx + Math.cos(a) * R * breathe, cy + Math.sin(a) * R * breathe, Math.max(5.8, R * .038));
      requestAnimationFrame(draw);
    }
  }
  requestAnimationFrame(draw);
})();
