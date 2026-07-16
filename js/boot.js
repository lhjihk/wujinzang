/* boot.js — 數據引導：拉 content.json → 注入 data-txt → 廣播 site:ready
   與舊站同一思路：頁面是殼，內容全在 JSON。 */
(function () {
  'use strict';

  // 頂欄禮讓正文：下滑即隱、上滑即現（過首屏前不收）
  var lastY = 0, nav = null;
  window.addEventListener('scroll', function () {
    nav = nav || document.querySelector('.nav');
    if (!nav) return;
    var y = window.scrollY;
    if (y > 160 && y > lastY + 4) nav.classList.add('nav-hidden');
    else if (y < lastY - 4 || y < 160) nav.classList.remove('nav-hidden');
    lastY = y;
  }, { passive: true });

  function get(obj, path) {
    return path.split('.').reduce(function (o, k) { return o && o[k]; }, obj);
  }

  window.SITE = { content: null };

  fetch('data/content.json?t=' + Date.now())
    .then(function (r) { if (!r.ok) throw new Error('content.json ' + r.status); return r.json(); })
    .then(function (c) {
      window.SITE.content = c;

      document.querySelectorAll('[data-txt]').forEach(function (el) {
        var v = get(c, el.getAttribute('data-txt'));
        if (typeof v === 'string' && v) el.textContent = v;
      });

      document.querySelectorAll('[data-href]').forEach(function (el) {
        var v = get(c, el.getAttribute('data-href'));
        if (typeof v === 'string' && v) el.href = v;
      });

      // 需要逐字拆分做動畫的標題
      document.querySelectorAll('[data-split]').forEach(function (el) {
        var v = get(c, el.getAttribute('data-split')) || el.textContent;
        el.textContent = '';
        v.split('').forEach(function (ch) {
          var s = document.createElement('span');
          s.textContent = ch;
          el.appendChild(s);
        });
      });

      document.dispatchEvent(new CustomEvent('site:ready', { detail: c }));
    })
    .catch(function (e) {
      console.error('[boot]', e);
      // 數據取不到也要能看：解除隱藏態
      document.querySelectorAll('.rise').forEach(function (el) {
        el.style.opacity = 1; el.style.transform = 'none';
      });
      document.body.classList.remove('no-scroll');
      var l = document.getElementById('loader');
      if (l) l.style.display = 'none';
      document.dispatchEvent(new CustomEvent('site:ready', { detail: null }));
    });
})();
