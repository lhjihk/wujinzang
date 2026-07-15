/* member.js — 書齋（會員）：郵箱驗證入館、收藏、書籤雲同步
   本地優先：未入館也能用收藏/書籤（localStorage）；入館後同步到雲端（Cloudflare Pages Functions + KV）。
   後端未配置時全部功能自動退化為本地模式，不報錯。 */
(function () {
  'use strict';

  var API = '/api';
  var LS_TOKEN = 'wjz-token-member', LS_DATA = 'wjz-study';

  var S = {
    token: null, email: null,
    data: { favs: [], bookmarks: {} },
    turnstileToken: null,
    syncTimer: null
  };

  try {
    var t = JSON.parse(localStorage.getItem(LS_TOKEN) || 'null');
    if (t && t.exp > Date.now()) { S.token = t.token; S.email = t.email; }
    S.data = JSON.parse(localStorage.getItem(LS_DATA) || '{"favs":[],"bookmarks":{}}');
    if (!S.data.favs) S.data.favs = [];
    if (!S.data.bookmarks) S.data.bookmarks = {};
  } catch (e) {}

  function persist() {
    try { localStorage.setItem(LS_DATA, JSON.stringify(S.data)); } catch (e) {}
    if (S.token) {
      clearTimeout(S.syncTimer);
      S.syncTimer = setTimeout(pushCloud, 1200);
    }
  }

  function api(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
    if (S.token) opts.headers['Authorization'] = 'Bearer ' + S.token;
    return fetch(API + path, opts).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
        return j;
      });
    });
  }

  function pushCloud() {
    api('/data', { method: 'PUT', body: JSON.stringify(S.data) }).catch(function () {});
  }
  function pullCloud() {
    if (!S.token) return;
    api('/data').then(function (j) {
      // 合併：雲端與本地取並集，書籤以較新者為準
      (j.favs || []).forEach(function (id) {
        if (S.data.favs.indexOf(id) === -1) S.data.favs.push(id);
      });
      Object.keys(j.bookmarks || {}).forEach(function (id) {
        var c = j.bookmarks[id], l = S.data.bookmarks[id];
        if (!l || (c.t || 0) > (l.t || 0)) S.data.bookmarks[id] = c;
      });
      persist();
    }).catch(function (e) {
      if (String(e.message).indexOf('401') > -1) logout(true);
    });
  }

  /* ---------- 對外接口（canon.js 使用） ---------- */
  window.Member = {
    email: function () { return S.email; },
    isFav: function (id) { return S.data.favs.indexOf(id) > -1; },
    toggleFav: function (id) {
      var i = S.data.favs.indexOf(id);
      if (i > -1) S.data.favs.splice(i, 1); else S.data.favs.push(id);
      persist();
      return i === -1;
    },
    getBookmark: function (id) { return id ? S.data.bookmarks[id] : null; },
    setBookmark: function (id, bm) { S.data.bookmarks[id] = bm; persist(); },
    getPos: function (id) { return id ? (S.data.pos || {})[id] : null; },
    setPos: function (id, p) {
      if (!S.data.pos) S.data.pos = {};
      S.data.pos[id] = p; persist();
    }
  };

  /* ---------- UI ---------- */
  function $(id) { return document.getElementById(id); }
  function status(msg) { var el = $('study-status'); if (el) el.textContent = msg; }

  document.addEventListener('site:ready', function (ev) {
    var c = ev.detail || {};
    var btn = $('study-btn');
    if (!btn) return;
    btn.addEventListener('click', openModal);
    $('study-close').addEventListener('click', closeModal);
    $('study-modal').addEventListener('click', function (e) { if (e.target === this) closeModal(); });
    $('study-send').addEventListener('click', sendCode);
    $('study-verify').addEventListener('click', verifyCode);
    $('study-logout').addEventListener('click', function () { logout(false); });
    var hint = $('study-hint');
    if (hint) hint.addEventListener('click', openModal);
    refreshBtn();
    if (S.token) pullCloud();

    // Turnstile 人機驗證（content.json 配了 sitekey 才加載）
    var key = c.auth && c.auth.turnstile_sitekey;
    if (key) {
      var s = document.createElement('script');
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.onload = function () {
        window.turnstile.render('#turnstile-box', {
          sitekey: key,
          callback: function (tk) { S.turnstileToken = tk; }
        });
      };
      document.head.appendChild(s);
    }
  });

  function refreshBtn() {
    var zh = $('study-btn-zh');
    if (zh) zh.textContent = S.email ? '書齋 ✓' : '入館 · 書齋';
    var hint = $('study-hint');
    if (hint && S.email) hint.style.display = 'none';
  }

  function openModal() {
    $('study-modal').classList.add('open');
    if (S.email) showPanel(); else {
      $('study-login').style.display = '';
      $('study-panel').style.display = 'none';
    }
  }
  function closeModal() { $('study-modal').classList.remove('open'); }

  function sendCode() {
    var email = $('study-email').value.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return status('郵箱格式不對');
    status('寄送中…');
    api('/code', { method: 'POST', body: JSON.stringify({ email: email, turnstile: S.turnstileToken }) })
      .then(function () {
        $('study-code-row').style.display = '';
        status('入館碼已寄出，請查收郵箱（含垃圾箱）· CODE SENT');
      })
      .catch(function (e) {
        if (String(e.message).indexOf('Failed to fetch') > -1 || String(e.message).indexOf('404') > -1) {
          status('會員後端尚未配置（見維護手冊「書齋」一節），本機收藏書籤不受影響');
        } else status('寄送失敗：' + e.message);
      });
  }

  function verifyCode() {
    var email = $('study-email').value.trim();
    var code = $('study-code').value.trim();
    if (code.length !== 6) return status('入館碼為六位數字');
    status('驗證中…');
    api('/verify', { method: 'POST', body: JSON.stringify({ email: email, code: code }) })
      .then(function (j) {
        S.token = j.token; S.email = email;
        try {
          localStorage.setItem(LS_TOKEN, JSON.stringify({ token: j.token, email: email, exp: Date.now() + 1000 * 3600 * 24 * 90 }));
        } catch (e) {}
        status('');
        refreshBtn();
        pullCloud();
        pushCloud();
        showPanel();
        if (window.WJZ_TOAST) WJZ_TOAST('入館成功，收藏與書籤已隨身 · WELCOME');
      })
      .catch(function (e) { status('驗證失敗：' + e.message); });
  }

  function logout(silent) {
    S.token = null; S.email = null;
    try { localStorage.removeItem(LS_TOKEN); } catch (e) {}
    refreshBtn();
    if (!silent) closeModal();
  }

  function showPanel() {
    $('study-login').style.display = 'none';
    $('study-panel').style.display = '';
    $('study-who').textContent = S.email;
    var bmBox = $('study-bookmarks');
    var ids = Object.keys(S.data.bookmarks).sort(function (a, b) {
      return (S.data.bookmarks[b].t || 0) - (S.data.bookmarks[a].t || 0);
    });
    bmBox.innerHTML = ids.length ? '' : '<p class="study-empty">尚無書籤——開卷時點「書籤」，下次接著讀。</p>';
    ids.slice(0, 20).forEach(function (id) {
      var bm = S.data.bookmarks[id];
      var a = document.createElement('a');
      a.className = 'study-item';
      a.href = '#';
      a.innerHTML = '<span>' + esc(bm.title || id) + '</span><span class="t-mono">卷' + (bm.juan + 1) + ' · 頁' + ((bm.page || 0) + 1) + '</span>';
      a.addEventListener('click', function (e) { e.preventDefault(); openById(id); });
      bmBox.appendChild(a);
    });
    var fvBox = $('study-favs');
    fvBox.innerHTML = S.data.favs.length ? '' : '<p class="study-empty">尚無收藏——開卷時點「收藏」。</p>';
    S.data.favs.slice(0, 40).forEach(function (id) {
      var a = document.createElement('a');
      a.className = 'study-item';
      a.href = '#';
      a.innerHTML = '<span class="t-mono">' + esc(id) + '</span><span>♥</span>';
      a.addEventListener('click', function (e) { e.preventDefault(); openById(id); });
      fvBox.appendChild(a);
    });
  }

  function openById(id) {
    closeModal();
    fetch('data/texts/' + id + '.json').then(function (r) { return r.json(); })
      .then(function (d) { document.dispatchEvent(new CustomEvent('study:open', { detail: d })); })
      .catch(function () { if (window.WJZ_TOAST) WJZ_TOAST('此典全文缺失'); });
  }

  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
})();
