/* boot.js — 数据引导：拉 content.json → 注入 data-txt → 广播 site:ready
   与旧站同一思路：页面是壳，内容全在 JSON。 */
(function () {
  'use strict';

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

      // 需要逐字拆分做动画的标题
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
      // 数据取不到也要能看：解除隐藏态
      document.querySelectorAll('.rise').forEach(function (el) {
        el.style.opacity = 1; el.style.transform = 'none';
      });
      document.body.classList.remove('no-scroll');
      var l = document.getElementById('loader');
      if (l) l.style.display = 'none';
      document.dispatchEvent(new CustomEvent('site:ready', { detail: null }));
    });
})();
