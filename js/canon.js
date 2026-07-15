/* canon.js — 藏經閣：二十四藏藏經櫃 + 閱讀器
   數據：data/canons.json（諸藏索引）→ data/catalog/{code}.json（分藏書目，展開才拉）
        → data/catalog/all.json（全局檢索，首次檢索才拉）→ data/texts/{id}.json（全文，開卷才拉）
   書籤/收藏：localStorage 永遠可用；登入書齋（member.js）後同步雲端。
   閱讀器：豎排烏絲欄分頁 / 橫排流式，紙·夜·墨水屏三主題，鍵盤←→翻頁，首次開卷有小引導。 */
(function () {
  'use strict';

  var HAN = '一二三四五六七八九十'.split('');
  function hanNo(i) { // 第i函（1起）
    var d = '〇一二三四五六七八九';
    if (i === 10) return '十';
    if (i < 10) return d[i];
    if (i < 20) return '十' + d[i - 10];
    return d[Math.floor(i / 10)] + '十' + (i % 10 ? d[i % 10] : '');
  }
  function numCN(n) {
    var d = '〇一二三四五六七八九';
    if (n >= 100) return String(n);
    if (n >= 10) return (n >= 20 ? d[Math.floor(n / 10)] : '') + '十' + (n % 10 ? d[n % 10] : '');
    return d[n];
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function $(id) { return document.getElementById(id); }

  var content = null, canons = [], allBooks = null, catCache = {};

  document.addEventListener('site:ready', function (ev) {
    content = ev.detail || {};
    var sp = $('search');
    if (sp && content.canon_page) sp.placeholder = content.canon_page.search_placeholder || '';
    init();
  });

  // 書齋面板點開某部經
  document.addEventListener('study:open', function (ev) { openReader(ev.detail); });

  function init() {
    fetch('data/canons.json').then(function (r) { return r.json(); }).then(function (cs) {
      canons = cs;
      buildFeatured();
      buildCabinet();
      buildSections();
      bindSearch();
      reveal();
      var total = canons.reduce(function (a, c) { return a + c.count; }, 0);
      $('count').textContent = total + ' 部';
      $('cabinet-total').textContent = canons.length + ' COLLECTIONS · ' + total + ' WORKS';
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

  /* ---------- 今日可讀 ---------- */
  function buildFeatured() {
    var row = $('featured-row');
    row.innerHTML = '';
    ((content.canon_page && content.canon_page.featured) || []).forEach(function (id) {
      fetch('data/texts/' + id + '.json').then(function (r) { return r.json(); }).then(function (d) {
        var el = document.createElement('div');
        el.className = 'featured-card';
        el.setAttribute('tabindex', '0');
        el.innerHTML =
          '<span class="zh-v">' + esc(d.title.replace(/^\S+\s*/, '')) + '</span>' +
          '<span class="fc-meta"><span class="t-info">' + esc(d.id) + '<br>' + esc(d.creator || '') + '</span>' +
          '<span class="fc-read">開卷 READ</span></span>';
        el.addEventListener('click', function () { openReader(d); });
        el.addEventListener('keydown', function (e) { if (e.key === 'Enter') openReader(d); });
        row.appendChild(el);
      }).catch(function () {});
    });
  }

  /* ---------- 藏經櫃 ---------- */
  function buildCabinet() {
    var box = $('cabinet');
    box.innerHTML = '';
    canons.forEach(function (c, i) {
      var el = document.createElement('div');
      el.className = 'cab';
      el.setAttribute('tabindex', '0');
      el.innerHTML =
        '<span class="cab-han">' + esc(c.code) + ' · 第' + hanNo(i + 1) + '函</span>' +
        '<span class="cab-name">' + esc(c.short || c.name) + '</span>' +
        '<span class="cab-count">' + c.count + ' 部</span>';
      function go() {
        var sec = $('sec-' + c.code);
        openSection(c, sec, true);
        sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      el.addEventListener('click', go);
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') go(); });
      box.appendChild(el);
    });
  }

  /* ---------- 各藏分函 ---------- */
  function buildSections() {
    var wrap = $('canon-sections');
    wrap.innerHTML = '';
    canons.forEach(function (c, i) {
      var sec = document.createElement('section');
      sec.className = 'canon-sec';
      sec.id = 'sec-' + c.code;
      sec.innerHTML =
        '<header>' +
        '  <div class="cs-left">' +
        '    <span class="cs-han">第' + hanNo(i + 1) + '函 · ' + esc(c.code) + '</span>' +
        '    <span class="cs-name">' + esc(c.name) + '</span>' +
        '  </div>' +
        '  <div style="display:flex;gap:2em;align-items:baseline">' +
        '    <span class="cs-meta t-info">' + c.count + ' 部</span>' +
        '    <span class="cs-toggle">＋</span>' +
        '  </div>' +
        '</header>' +
        (c.desc ? '<div class="cs-desc"><p class="zh">' + esc(c.desc) + '</p><p class="t-info">' + esc(c.desc_en || '') + '</p></div>' : '') +
        '<div class="shelf"></div>';
      sec.querySelector('header').addEventListener('click', function () { openSection(c, sec); });
      wrap.appendChild(sec);
    });
  }

  function openSection(c, sec, forceOpen) {
    var isOpen = sec.classList.contains('open');
    if (isOpen && !forceOpen) { sec.classList.remove('open'); return; }
    sec.classList.add('open');
    var shelf = sec.querySelector('.shelf');
    if (shelf.dataset.loaded) return;
    shelf.dataset.loaded = '1';
    loadCatalog(c.code).then(function (list) { renderShelfChunked(shelf, list, c.code); });
  }

  function loadCatalog(code) {
    if (catCache[code]) return Promise.resolve(catCache[code]);
    return fetch('data/catalog/' + code + '.json').then(function (r) { return r.json(); })
      .then(function (l) { catCache[code] = l; return l; });
  }

  /* 大藏幾千部：分批渲染 + 滾動哨兵續展，手機也不卡 */
  function renderShelfChunked(shelf, list, code) {
    var CHUNK = 150, pos = 0;
    var sentinel = document.createElement('div');
    sentinel.className = 'shelf-sentinel';
    function append() {
      var frag = document.createDocumentFragment();
      list.slice(pos, pos + CHUNK).forEach(function (b) { frag.appendChild(spineEl(b, code)); });
      pos += CHUNK;
      shelf.insertBefore(frag, sentinel);
      if (pos >= list.length) { io.disconnect(); sentinel.remove(); }
    }
    shelf.appendChild(sentinel);
    var io = new IntersectionObserver(function (es) {
      if (es[0].isIntersecting) append();
    }, { rootMargin: '1200px' });
    io.observe(sentinel);
    append();
  }

  function spineEl(b, code) {
    var el = document.createElement('div');
    el.className = 'spine';
    el.setAttribute('tabindex', '0');
    var fav = Member.isFav(b.id);
    el.innerHTML =
      '<span class="sp-id">' + esc(b.id) + (fav ? ' ♥' : '') + '</span>' +
      '<span class="sp-title">' + esc(b.title) + '</span>' +
      '<span class="sp-juan">' + numCN(b.juans) + '卷</span>';
    el.addEventListener('click', function () { openBook(b); });
    el.addEventListener('keydown', function (e) { if (e.key === 'Enter') openBook(b); });
    return el;
  }

  function openBook(b) {
    fetch('data/texts/' + b.id + '.json')
      .then(function (r) { if (!r.ok) throw 0; return r.json(); })
      .then(openReader)
      .catch(function () { toast('《' + b.title + '》· ' + ((content.canon_page && content.canon_page.locked_note) || '全文缺失')); });
  }

  var toastTimer = null;
  function toast(msg) {
    var t = $('toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2800);
  }
  window.WJZ_TOAST = toast;

  /* ---------- 全局檢索 ---------- */
  function bindSearch() {
    var inp = $('search'), timer = null;
    inp.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () { doSearch(inp.value.trim()); }, 200);
    });
  }
  function doSearch(q) {
    var sc = $('search-sec'), cab = $('cabinet-sec'), secs = $('canon-sections');
    if (!q) { sc.style.display = 'none'; cab.style.display = ''; secs.style.display = ''; return; }
    var run = function () {
      var ql = q.toLowerCase();
      var hits = allBooks.filter(function (b) {
        return (b.title + (b.creator || '') + b.id).toLowerCase().indexOf(ql) > -1;
      });
      sc.style.display = ''; cab.style.display = 'none'; secs.style.display = 'none';
      $('search-count').textContent = hits.length + ' 部';
      $('search-more').textContent = hits.length > 200 ? '僅展示前二百部，請加關鍵詞收窄 · SHOWING FIRST 200' : '';
      var shelf = $('search-shelf');
      shelf.innerHTML = '';
      var frag = document.createDocumentFragment();
      hits.slice(0, 200).forEach(function (b) { frag.appendChild(spineEl(b, b.c)); });
      shelf.appendChild(frag);
    };
    if (allBooks) return run();
    fetch('data/catalog/all.json').then(function (r) { return r.json(); })
      .then(function (l) { allBooks = l; run(); });
  }

  /* ============================================================
     閱讀器
     ============================================================ */
  var R = {
    root: null, flow: null, clip: null, flash: null,
    doc: null, juan: 0, page: 0, pages: 1, pw: 0, fs: 21, vertical: true
  };

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
    $('r-font').addEventListener('click', function () {
      var kai = R.root.classList.toggle('f-kai');
      $('r-font').textContent = kai ? '宋體' : '楷體';
      paginate(); savePref();
    });
    $('r-juan').addEventListener('change', function () { loadJuan(+this.value); });
    $('r-bookmark').addEventListener('click', saveBookmark);
    $('r-fav').addEventListener('click', function () {
      if (!R.doc) return;
      var on = Member.toggleFav(R.doc.id);
      $('r-fav').textContent = on ? '收藏 ♥' : '收藏';
      toast(on ? '已入收藏 · ' + (Member.email() ? '已同步書齋' : '存於本機，入館後隨身') : '已取消收藏');
    });

    document.addEventListener('keydown', function (e) {
      if (!R.root.classList.contains('open')) return;
      if (e.key === 'Escape') closeReader();
      if (e.key === 'ArrowLeft') flip(R.vertical ? 1 : -1);
      if (e.key === 'ArrowRight') flip(R.vertical ? -1 : 1);
    });
    window.addEventListener('resize', function () {
      if (R.root.classList.contains('open')) paginate();
    });

    // 防複製：經文尊貴，普通拷貝一律婉拒（防君子）
    ['copy', 'cut', 'contextmenu'].forEach(function (evt) {
      R.root.addEventListener(evt, function (e) { e.preventDefault(); });
    });

    try {
      var pref = JSON.parse(localStorage.getItem('wjz-reader') || '{}');
      if (pref.fs) R.fs = pref.fs;
      if (pref.theme) setTheme(pref.theme, true);
      if (pref.mode === 'h') R.vertical = false;
      if (pref.kai) { R.root.classList.add('f-kai'); $('r-font').textContent = '宋體'; }
    } catch (e) {}
  }

  function savePref() {
    try {
      localStorage.setItem('wjz-reader', JSON.stringify({
        fs: R.fs,
        theme: R.root.classList.contains('th-night') ? 'th-night' : R.root.classList.contains('th-eink') ? 'th-eink' : '',
        mode: R.vertical ? 'v' : 'h',
        kai: R.root.classList.contains('f-kai') ? 1 : 0
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

    // 續讀：手動書籤與自動記位，誰新聽誰的
    var bm = Member.getBookmark(doc.id), ap = Member.getPos(doc.id);
    var re = (bm && ap) ? ((ap.t || 0) > (bm.t || 0) ? ap : bm) : (bm || ap);
    if (re && re.juan < doc.juans.length) {
      loadJuan(re.juan);
      R.page = Math.min(re.page || 0, R.pages - 1);
      applyPage(false);
      toast('已回到上次讀處 · RESUMED');
    } else {
      loadJuan(0);
    }
    flipHintOnce();
    updateBookmarkBtn();
    $('r-fav').textContent = Member.isFav(doc.id) ? '收藏 ♥' : '收藏';
  }

  function closeReader() {
    R.root.classList.remove('open');
    document.body.classList.remove('no-scroll');
  }

  /* 首次開卷的小引導 */
  function flipHintOnce() {
    try {
      if (localStorage.getItem('wjz-flip-hint')) return;
      localStorage.setItem('wjz-flip-hint', '1');
    } catch (e) {}
    var h = $('reader-hint');
    h.textContent = (content.reader && content.reader.flip_hint) || '點左右兩緣翻頁 · TAP EDGES TO TURN';
    h.classList.add('show');
    setTimeout(function () { h.classList.remove('show'); }, 4200);
  }

  function loadJuan(i) {
    R.juan = i;
    $('r-juan').value = i;
    R.flow.innerHTML = R.doc.juans[i].map(function (b) {
      if (b.t === 'img') {
        // 經中插圖（科判圖/版畫等），豎排橫排都居中適應
        return '<span class="blk-img"><img src="' + esc(b.s) + '" alt="經中插圖" draggable="false"></span>';
      }
      var cls = { h: 'blk-h', by: 'blk-by', juan: 'blk-juan', dh: 'blk-dh', p: '' }[b.t] || '';
      return '<p' + (cls ? ' class="' + cls + '"' : '') + '>' + esc(b.s) + '</p>';
    }).join('');
    R.page = 0;
    paginate();
    // 圖片載入會改變豎排總寬，載完重排一次
    var imgs = R.flow.querySelectorAll('img');
    if (imgs.length) {
      var left = imgs.length;
      imgs.forEach(function (im) {
        var done = function () { if (--left === 0) paginate(); };
        if (im.complete) done(); else { im.addEventListener('load', done); im.addEventListener('error', done); }
      });
    }
  }

  /* 自動續讀：翻頁即靜默記位（與手動書籤分開，取較新者恢復） */
  var posTimer = null;
  function autoPos() {
    if (!R.doc) return;
    clearTimeout(posTimer);
    posTimer = setTimeout(function () {
      Member.setPos(R.doc.id, { juan: R.juan, page: R.page, title: R.doc.title.replace(/^\S+\s*/, ''), t: Date.now() });
    }, 800);
  }

  function paginate() {
    if (!R.vertical) {
      R.clip.style.width = ''; R.clip.style.left = ''; R.clip.style.marginLeft = ''; R.clip.style.right = '';
      R.clip.scrollTop = 0;
      $('r-pageno').textContent = '卷' + numCN(R.juan + 1);
      return;
    }
    // 頁寬對齊到整數欄（欄距 = fs × 行高2.05），否則頁邊會切出半個字
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
    R.pages = Math.max(1, Math.ceil(R.flow.scrollWidth / pw));
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
    if (R.root.classList.contains('th-eink') && animate) einkFlash();
    R.flow.style.transform = 'translateX(' + (R.page * pw) + 'px)';
    $('r-pageno').textContent = numCN(R.page + 1) + ' / ' + numCN(R.pages);
    autoPos();
  }

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

  /* ---------- 書籤 ---------- */
  function saveBookmark() {
    if (!R.doc) return;
    Member.setBookmark(R.doc.id, {
      juan: R.juan, page: R.page,
      title: R.doc.title.replace(/^\S+\s*/, ''), t: Date.now()
    });
    updateBookmarkBtn(true);
    toast('書籤已存：卷' + numCN(R.juan + 1) + ' 第' + numCN(R.page + 1) + '頁' + (Member.email() ? ' · 已同步書齋' : ''));
  }
  function updateBookmarkBtn(justSaved) {
    var b = $('r-bookmark');
    var has = !!Member.getBookmark(R.doc && R.doc.id);
    b.textContent = justSaved || has ? '書籤 ✓' : '書籤';
  }
})();
