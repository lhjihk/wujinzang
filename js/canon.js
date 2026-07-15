/* canon.js — 藏經閣：书架 + 阅读器
   书架读 data/catalog.json（285部书目）；
   可读之典＝data/texts/ 下有 JSON 的（content.json canon_page.featured 声明 + 上传新增 available.json）。
   阅读器：竖排乌丝栏分页 / 横排流式，纸·夜·墨水屏三主题，键盘←→翻页。 */
(function () {
  'use strict';

  var catalog = [], available = {}, content = null;
  var featuredIds = [];

  document.addEventListener('site:ready', function (ev) {
    content = ev.detail || {};
    featuredIds = (content.canon_page && content.canon_page.featured) || [];
    var sp = document.getElementById('search');
    if (sp && content.canon_page) sp.placeholder = content.canon_page.search_placeholder || '';
    init();
  });

  function init() {
    Promise.all([
      fetch('data/catalog.json').then(function (r) { return r.json(); }),
      // available.json 是编辑台上传经文后维护的可读清单，没有也不报错
      fetch('data/available.json').then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; })
    ]).then(function (res) {
      catalog = res[0];
      res[1].concat(featuredIds).forEach(function (id) { available[id] = true; });
      buildFeatured();
      buildShelf(catalog);
      bindSearch();
      reveal();
    });
  }

  function reveal() {
    document.querySelectorAll('.rise').forEach(function (el, i) {
      setTimeout(function () {
        el.style.transition = 'opacity .9s cubic-bezier(.22,1,.36,1), transform .9s cubic-bezier(.22,1,.36,1)';
        el.style.opacity = 1; el.style.transform = 'none';
      }, 80 * i);
    });
  }

  /* ---------- 今日可读 ---------- */
  function buildFeatured() {
    var row = document.getElementById('featured-row');
    row.innerHTML = '';
    featuredIds.forEach(function (id) {
      fetch('data/texts/' + id + '.json').then(function (r) { return r.json(); }).then(function (d) {
        var titleZh = d.title.replace(/^\S+\s*/, '');
        var el = document.createElement('div');
        el.className = 'featured-card';
        el.setAttribute('tabindex', '0');
        el.innerHTML =
          '<span class="zh-v">' + titleZh + '</span>' +
          '<span class="fc-meta"><span class="t-info">' + d.id + '<br>' + (d.creator || '') + '</span>' +
          '<span class="fc-read">開卷 READ</span></span>';
        el.addEventListener('click', function () { openReader(d); });
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter') openReader(d); });
        row.appendChild(el);
      }).catch(function () {});
    });
  }

  /* ---------- 书脊墙 ---------- */
  function buildShelf(list) {
    var shelf = document.getElementById('shelf');
    var frag = document.createDocumentFragment();
    list.forEach(function (b) {
      var el = document.createElement('div');
      el.className = 'spine' + (available[b.id] ? ' has-text' : '');
      el.setAttribute('tabindex', '0');
      el.innerHTML =
        '<span class="sp-id">' + b.id + '</span>' +
        '<span class="sp-title">' + b.title + '</span>' +
        '<span class="sp-juan">' + numCN(b.juans) + '卷</span>';
      el.addEventListener('click', function () { openBook(b); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') openBook(b); });
      frag.appendChild(el);
    });
    shelf.innerHTML = '';
    shelf.appendChild(frag);
    document.getElementById('count').textContent = list.length + ' 部';
  }

  function numCN(n) {
    var d = '〇一二三四五六七八九';
    if (n >= 100) return n;
    if (n >= 10) return (n >= 20 ? d[Math.floor(n / 10)] : '') + '十' + (n % 10 ? d[n % 10] : '');
    return d[n];
  }

  function openBook(b) {
    if (available[b.id]) {
      fetch('data/texts/' + b.id + '.json')
        .then(function (r) { if (!r.ok) throw 0; return r.json(); })
        .then(openReader)
        .catch(function () { toast('《' + b.title + '》全文缺失，请到编辑台重新上传'); });
    } else {
      toast('《' + b.title + '》· ' + ((content.canon_page && content.canon_page.locked_note) || '尚未上架全文'));
    }
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- 检索 ---------- */
  function bindSearch() {
    var inp = document.getElementById('search');
    inp.addEventListener('input', function () {
      var q = inp.value.trim().toLowerCase();
      if (!q) return buildShelf(catalog);
      buildShelf(catalog.filter(function (b) {
        return (b.title + b.creator + b.id).toLowerCase().indexOf(q) > -1;
      }));
    });
  }

  /* ============================================================
     阅读器
     ============================================================ */
  var R = {
    root: null, flow: null, clip: null, flash: null,
    doc: null, juan: 0, page: 0, pages: 1, fs: 21, vertical: true
  };

  function $(id) { return document.getElementById(id); }

  function setupReader() {
    if (R.root) return;
    R.root = $('reader'); R.flow = $('r-flow'); R.clip = $('r-clip'); R.flash = $('reader-flash');

    $('r-close').addEventListener('click', closeReader);
    $('flip-next').addEventListener('click', function () { flip(1); });
    $('flip-prev').addEventListener('click', function () { flip(-1); });
    $('r-fs-plus').addEventListener('click', function () { setFs(R.fs + 2); });
    $('r-fs-minus').addEventListener('click', function () { setFs(R.fs - 2); });
    $('r-mode').addEventListener('click', toggleMode);
    $('r-theme-paper').addEventListener('click', function () { setTheme(''); });
    $('r-theme-night').addEventListener('click', function () { setTheme('th-night'); });
    $('r-theme-eink').addEventListener('click', function () { setTheme('th-eink'); });
    $('r-juan').addEventListener('change', function () { loadJuan(+this.value); });

    document.addEventListener('keydown', function (e) {
      if (!R.root.classList.contains('open')) return;
      if (e.key === 'Escape') closeReader();
      // 竖排从右向左读：← 是下一页
      if (e.key === 'ArrowLeft') flip(R.vertical ? 1 : -1);
      if (e.key === 'ArrowRight') flip(R.vertical ? -1 : 1);
    });
    window.addEventListener('resize', function () {
      if (R.root.classList.contains('open')) paginate();
    });

    // 记住读者偏好
    try {
      var pref = JSON.parse(localStorage.getItem('wjz-reader') || '{}');
      if (pref.fs) R.fs = pref.fs;
      if (pref.theme) setTheme(pref.theme, true);
      if (pref.mode === 'h') { R.vertical = false; R.rootModeInit = true; }
    } catch (e) {}
  }

  function savePref() {
    try {
      localStorage.setItem('wjz-reader', JSON.stringify({
        fs: R.fs,
        theme: R.root.classList.contains('th-night') ? 'th-night' : R.root.classList.contains('th-eink') ? 'th-eink' : '',
        mode: R.vertical ? 'v' : 'h'
      }));
    } catch (e) {}
  }

  function openReader(doc) {
    setupReader();
    R.doc = doc;
    $('r-title').textContent = doc.title.replace(/^\S+\s*/, '');
    $('r-creator').textContent = doc.creator || '';
    var sel = $('r-juan');
    sel.innerHTML = '';
    doc.juans.forEach(function (_, i) {
      var o = document.createElement('option');
      o.value = i; o.textContent = '卷' + numCN(i + 1);
      sel.appendChild(o);
    });
    sel.style.display = doc.juans.length > 1 ? '' : 'none';
    R.root.classList.toggle('mode-h', !R.vertical);
    $('r-mode').textContent = R.vertical ? '橫排' : '竪排';
    R.root.classList.add('open');
    document.body.classList.add('no-scroll');
    R.root.style.setProperty('--fs', R.fs + 'px');
    loadJuan(0);
  }

  function closeReader() {
    R.root.classList.remove('open');
    document.body.classList.remove('no-scroll');
  }

  function loadJuan(i) {
    R.juan = i;
    $('r-juan').value = i;
    var html = R.doc.juans[i].map(function (b) {
      var cls = { h: 'blk-h', by: 'blk-by', juan: 'blk-juan', dh: 'blk-dh', p: '' }[b.t] || '';
      return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(b.s) + '</p>';
    }).join('');
    R.flow.innerHTML = html;
    R.page = 0;
    paginate();
  }

  function esc(s) {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function paginate() {
    if (!R.vertical) {
      R.clip.style.width = ''; R.clip.style.left = ''; R.clip.style.marginLeft = ''; R.clip.style.right = '';
      R.clip.scrollTop = 0;
      $('r-pageno').textContent = '卷' + numCN(R.juan + 1);
      return;
    }
    // 竖排：内容自右向左生长，翻页 = 向右平移一页宽。
    // 页宽对齐到整数栏（栏距 = fs × 行高2.05），否则页边会切出半个字。
    R.flow.style.transform = 'translateX(0)';
    R.clip.style.width = ''; R.clip.style.left = ''; R.clip.style.marginLeft = ''; R.clip.style.right = '';
    var stride = R.fs * 2.05;
    var raw = R.clip.clientWidth;
    var pw = Math.max(stride, Math.floor(raw / stride) * stride);
    R.clip.style.width = pw + 'px';
    R.clip.style.left = '50%';
    R.clip.style.right = 'auto';
    R.clip.style.marginLeft = (-pw / 2) + 'px';
    R.pw = pw;
    var total = R.flow.scrollWidth;
    R.pages = Math.max(1, Math.ceil(total / pw));
    if (R.page >= R.pages) R.page = R.pages - 1;
    applyPage(false);
  }

  function flip(dir) {
    if (!R.vertical) {
      R.clip.scrollBy({ top: R.clip.clientHeight * .85 * dir, behavior: 'smooth' });
      return;
    }
    var np = R.page + dir;
    if (np < 0) {
      if (R.juan > 0) { loadJuan(R.juan - 1); R.page = R.pages - 1; applyPage(true); }
      return;
    }
    if (np >= R.pages) {
      if (R.juan < R.doc.juans.length - 1) loadJuan(R.juan + 1);
      return;
    }
    R.page = np;
    applyPage(true);
  }

  function applyPage(animate) {
    var pw = R.pw || R.clip.clientWidth;
    var eink = R.root.classList.contains('th-eink');
    if (eink && animate) einkFlash();
    R.flow.style.transform = 'translateX(' + (R.page * pw) + 'px)';
    $('r-pageno').textContent = numCN(R.page + 1) + ' / ' + numCN(R.pages);
  }

  /* 墨水屏整页刷新：黑一下再显示 */
  function einkFlash() {
    R.flash.style.opacity = '.85';
    setTimeout(function () { R.flash.style.opacity = '0'; }, 90);
  }

  function setFs(v) {
    R.fs = Math.max(15, Math.min(34, v));
    R.root.style.setProperty('--fs', R.fs + 'px');
    paginate();
    savePref();
  }

  function toggleMode() {
    R.vertical = !R.vertical;
    R.root.classList.toggle('mode-h', !R.vertical);
    $('r-mode').textContent = R.vertical ? '橫排' : '竪排';
    R.flow.style.transform = 'none';
    R.page = 0;
    paginate();
    savePref();
  }

  function setTheme(cls, skipSave) {
    R.root = R.root || $('reader');
    R.root.classList.remove('th-night', 'th-eink');
    if (cls) R.root.classList.add(cls);
    ['r-theme-paper', 'r-theme-night', 'r-theme-eink'].forEach(function (id, i) {
      var on = (i === 0 && !cls) || (i === 1 && cls === 'th-night') || (i === 2 && cls === 'th-eink');
      $(id).classList.toggle('on', on);
    });
    if (!skipSave) savePref();
  }
})();
