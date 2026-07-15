/* mandala.js — 念珠壇城環
   hero 背景的第二重氛圍：108 顆泥金珠排成環，如一串數珠懸於虛空緩緩轉動；
   一顆硃砂珠沿環行走，如指尖捻珠計數。外一圈虛線環反向微轉。
   Canvas 2D，極輕量；prefers-reduced-motion 時只畫靜環不動。 */
(function () {
  'use strict';

  var canvas = document.getElementById('mandala-canvas');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');
  var hero = document.querySelector('.hero') || document.body;
  var reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  var DPR = Math.min(2, window.devicePixelRatio || 1);
  var W, H, CX, CY, R;

  function resize() {
    var r = hero.getBoundingClientRect();
    W = Math.floor(r.width); H = Math.floor(r.height);
    canvas.width = W * DPR; canvas.height = H * DPR;
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    // 環心偏右上，避開左側大標題的核心筆畫
    CX = W * (W < 900 ? .5 : .62);
    CY = H * .44;
    R = Math.min(W, H) * (W < 900 ? .38 : .34);
  }
  resize();
  window.addEventListener('resize', resize);

  var GOLD = '176,141,70';
  var CINNABAR = '166,58,37';
  var N = 108;              // 一串數珠
  var px = 0, py = 0;       // 鼠標視差

  window.addEventListener('pointermove', function (e) {
    px = (e.clientX / window.innerWidth - .5) * 14;
    py = (e.clientY / window.innerHeight - .5) * 10;
  }, { passive: true });

  function draw(t) {
    ctx.clearRect(0, 0, W, H);
    var cx = CX + px, cy = CY + py;
    var rot = reduced ? 0 : t * .000045;          // 一圈約40分鐘，幾不可察卻在動
    var breathe = reduced ? 0 : Math.sin(t * .0006) * R * .01;
    var r1 = R + breathe;

    // 外圈：細虛線環，反向
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(-rot * 1.6);
    ctx.strokeStyle = 'rgba(' + GOLD + ',.28)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 9]);
    ctx.beginPath();
    ctx.arc(0, 0, r1 * 1.13, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // 內圈：一條極淡的整圓
    ctx.strokeStyle = 'rgba(' + GOLD + ',.16)';
    ctx.setLineDash([]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, r1 * .86, 0, Math.PI * 2);
    ctx.stroke();

    // 108 珠
    var counter = Math.floor(t / 2200) % N;       // 每2.2秒捻過一顆
    for (var i = 0; i < N; i++) {
      var a = rot + (i / N) * Math.PI * 2 - Math.PI / 2;
      var x = cx + Math.cos(a) * r1;
      var y = cy + Math.sin(a) * r1;
      var isMother = i === 0;                     // 母珠稍大
      var isCount = !reduced && i === counter;
      ctx.beginPath();
      ctx.arc(x, y, isCount ? 3.4 : isMother ? 2.8 : 1.7, 0, Math.PI * 2);
      ctx.fillStyle = isCount
        ? 'rgba(' + CINNABAR + ',.85)'
        : 'rgba(' + GOLD + ',' + (isMother ? '.75' : '.5') + ')';
      ctx.fill();
    }

    if (!reduced) requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
})();
