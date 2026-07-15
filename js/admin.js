/* admin.js — 編輯台
   与旧站同一套路：纯静态 + GitHub contents API = 免服务器的后台。
   token 只存 localStorage，不进代码不进仓库。
   三件事：① content.json 自动表单  ② EPUB 浏览器端解析上架  ③ 原始 JSON 直编。 */
(function () {
  'use strict';

  var API = 'https://api.github.com';
  var S = {
    token: localStorage.getItem('wjz-token') || '',
    repo: localStorage.getItem('wjz-repo') || 'lhjihk/wujinzang',
    content: null, contentSha: null,
    epubDoc: null
  };

  function $(id) { return document.getElementById(id); }
  function status(msg, cls) {
    var el = $('status');
    el.textContent = msg;
    el.className = cls || '';
    console.log('[admin]', msg);
  }

  /* ---------- base64 ↔ UTF-8 ---------- */
  function b64encode(s) { return btoa(unescape(encodeURIComponent(s))); }
  function b64decode(s) { return decodeURIComponent(escape(atob(s.replace(/\n/g, '')))); }

  /* ---------- GitHub API ---------- */
  function gh(path, opts) {
    opts = opts || {};
    opts.headers = Object.assign({
      'Authorization': 'Bearer ' + S.token,
      'Accept': 'application/vnd.github+json'
    }, opts.headers || {});
    return fetch(API + path, opts).then(function (r) {
      if (r.status === 404) return null;
      if (!r.ok) return r.json().then(function (j) { throw new Error(r.status + ' ' + (j.message || '')); });
      return r.json();
    });
  }
  function getFile(path) {
    return gh('/repos/' + S.repo + '/contents/' + path + '?t=' + Date.now());
  }
  function putFile(path, text, message, sha) {
    var body = { message: message, content: b64encode(text) };
    if (sha) body.sha = sha;
    return gh('/repos/' + S.repo + '/contents/' + path, {
      method: 'PUT', body: JSON.stringify(body)
    });
  }
  /* 保存前先取最新 sha，减少 409 冲突 */
  function saveFile(path, text, message) {
    return getFile(path).then(function (f) {
      return putFile(path, text, message, f && f.sha);
    });
  }

  /* ---------- 連接 ---------- */
  $('token').value = S.token;
  $('repo').value = S.repo;
  $('btn-connect').addEventListener('click', function () {
    S.token = $('token').value.trim();
    S.repo = $('repo').value.trim();
    if (!S.token || !S.repo) return status('token 与仓库都要填', 'err');
    status('验证中…');
    gh('/repos/' + S.repo).then(function (r) {
      if (!r) throw new Error('仓库不存在或 token 无权限');
      localStorage.setItem('wjz-token', S.token);
      localStorage.setItem('wjz-repo', S.repo);
      $('conn-st').textContent = '已连接 ' + S.repo;
      status('连接成功', 'ok');
      loadContent();
    }).catch(function (e) { status('连接失败：' + e.message, 'err'); });
  });
  $('btn-disconnect').addEventListener('click', function () {
    localStorage.removeItem('wjz-token');
    S.token = ''; $('token').value = '';
    $('conn-st').textContent = '未连接';
    status('已断开并清除本机 token');
  });

  /* ---------- content.json 自动表单 ----------
     把 JSON 里所有字符串叶子铺成输入框，路径即字段名；
     以 _ 开头的键（_version/_comment）不展示但保留。 */
  function loadContent() {
    status('读取 content.json …');
    getFile('data/content.json').then(function (f) {
      if (!f) throw new Error('data/content.json 不存在');
      S.content = JSON.parse(b64decode(f.content));
      S.contentSha = f.sha;
      buildForm();
      $('raw-json').value = JSON.stringify(S.content, null, 2);
      status('content.json 已载入', 'ok');
    }).catch(function (e) { status(e.message, 'err'); });
  }
  $('btn-load').addEventListener('click', loadContent);
  $('btn-raw-load').addEventListener('click', loadContent);

  function walk(obj, path, out) {
    Object.keys(obj).forEach(function (k) {
      if (k.charAt(0) === '_') return;
      var v = obj[k], p = path ? path + '.' + k : k;
      if (typeof v === 'string') out.push(p);
      else if (v && typeof v === 'object') walk(v, p, out);
    });
  }
  function getPath(obj, path) {
    return path.split('.').reduce(function (o, k) { return o[k]; }, obj);
  }
  function setPath(obj, path, val) {
    var ks = path.split('.'), last = ks.pop();
    ks.reduce(function (o, k) { return o[k]; }, obj)[last] = val;
  }

  function buildForm() {
    var box = $('form-fields');
    box.innerHTML = '';
    var paths = [];
    walk(S.content, '', paths);
    var lastGroup = '';
    paths.forEach(function (p) {
      var group = p.split('.')[0];
      if (group !== lastGroup) {
        var h = document.createElement('label');
        h.style.cssText = 'margin-top:26px;color:var(--cinnabar);font-weight:700;letter-spacing:.2em;';
        h.textContent = '── ' + group + ' ──';
        box.appendChild(h);
        lastGroup = group;
      }
      var lab = document.createElement('label');
      lab.textContent = p;
      var v = getPath(S.content, p);
      var inp;
      if (v.length > 60) { inp = document.createElement('textarea'); inp.rows = 3; }
      else { inp = document.createElement('input'); inp.type = 'text'; }
      inp.value = v;
      inp.dataset.path = p;
      box.appendChild(lab); box.appendChild(inp);
    });
  }

  $('btn-save-form').addEventListener('click', function () {
    if (!S.content) return status('先载入', 'err');
    document.querySelectorAll('#form-fields [data-path]').forEach(function (inp) {
      setPath(S.content, inp.dataset.path, inp.value);
    });
    var text = JSON.stringify(S.content, null, 2);
    status('提交中…');
    saveFile('data/content.json', text, '编辑台：更新文案').then(function () {
      status('已发布，约一分钟后生效', 'ok');
      $('raw-json').value = text;
    }).catch(function (e) { status('保存失败：' + e.message, 'err'); });
  });

  $('btn-raw-save').addEventListener('click', function () {
    var text = $('raw-json').value;
    try { S.content = JSON.parse(text); }
    catch (e) { return status('JSON 语法错误：' + e.message, 'err'); }
    status('提交中…');
    saveFile('data/content.json', JSON.stringify(S.content, null, 2), '编辑台：直编 JSON')
      .then(function () { status('已发布', 'ok'); buildForm(); })
      .catch(function (e) { status('保存失败：' + e.message, 'err'); });
  });

  /* ---------- EPUB 上架 ----------
     浏览器本地解析 CBETA epub → 与站内同构的 {id,title,creator,juans:[blocks]}
     提交 data/texts/{id}.json，并把 id 记入 data/available.json；
     若书目里没有此 id（非嘉兴藏），一并补进 catalog.json。 */
  $('epub-file').addEventListener('change', function () {
    var f = this.files[0];
    if (!f) return;
    status('解析 ' + f.name + ' …');
    f.arrayBuffer().then(function (buf) { return JSZip.loadAsync(buf); }).then(parseEpub)
      .then(function (doc) {
        S.epubDoc = doc;
        var n = doc.juans.reduce(function (a, j) { return a + j.length; }, 0);
        var ch = doc.juans.reduce(function (a, j) { return a + j.reduce(function (x, b) { return x + b.s.length; }, 0); }, 0);
        var pv = $('upl-preview');
        pv.innerHTML = '<b>' + doc.title + '</b><br>' + (doc.creator || '') +
          '<br>' + doc.juans.length + ' 卷 · ' + n + ' 段 · ' + ch + ' 字' +
          '<br><span style="color:var(--soft)">首段：' + (doc.juans[0][0] ? doc.juans[0][0].s.slice(0, 60) : '') + '…</span>';
        pv.classList.add('show');
        $('btn-upload').disabled = false;
        status('解析完成，确认后点「上架此經」', 'ok');
      })
      .catch(function (e) { status('解析失败：' + e.message, 'err'); });
  });

  function parseEpub(zip) {
    var opfName = Object.keys(zip.files).filter(function (n) { return n.slice(-4) === '.opf'; })[0];
    if (!opfName) throw new Error('不是有效的 EPUB（缺 OPF）');
    return zip.file(opfName).async('string').then(function (opf) {
      var title = (opf.match(/<dc:title>([^<]*)<\/dc:title>/) || [])[1] || '未知';
      var creator = (opf.match(/<dc:creator>([^<]*)<\/dc:creator>/) || [])[1] || '';
      var id = title.split(/\s/)[0];
      var juanNames = Object.keys(zip.files).filter(function (n) {
        return n.indexOf('/juans/') > -1 && n.slice(-6) === '.xhtml';
      }).sort();
      if (!juanNames.length) throw new Error('未找到正文（OEBPS/juans/），确认是 CBETA 的 epub');
      return Promise.all(juanNames.map(function (n) { return zip.file(n).async('string'); }))
        .then(function (xs) {
          return { id: id, title: title, creator: creator, juans: xs.map(parseJuan) };
        });
    });
  }

  function parseJuan(xhtml) {
    var dom = new DOMParser().parseFromString(xhtml, 'text/html');
    var body = dom.getElementById('body') || dom.body;
    var blocks = [];
    body.querySelectorAll('*').forEach(function (el) {
      var tag = el.tagName, cls = el.className || '';
      var text = (el.textContent || '').trim();
      if (!text) return;
      if (tag === 'P' && cls === 'h1') blocks.push({ t: 'h', s: text });
      else if (tag === 'P' && cls === 'byline') blocks.push({ t: 'by', s: text });
      else if (tag === 'DIV' && cls === 'juan') blocks.push({ t: 'juan', s: text });
      else if (tag === 'DIV' && cls === 'dharani') blocks.push({ t: 'dh', s: text });
      // 普通段落有两种写法：裸 <div> 或（div-other 等容器里的）<p>
      else if (tag === 'P' && !cls && !el.querySelector('div,p')) blocks.push({ t: 'p', s: text });
      else if (tag === 'DIV' && !cls && !el.querySelector('div,p')) blocks.push({ t: 'p', s: text });
      // 科判树（起信論疏科这类）：正文全是嵌套 li
      else if (tag === 'LI' && !el.querySelector('li')) blocks.push({ t: 'p', s: text });
    });
    return blocks;
  }

  $('btn-upload').addEventListener('click', function () {
    var d = S.epubDoc;
    if (!d) return;
    if (!S.token) return status('先连接 GitHub', 'err');
    status('提交 ' + d.id + ' …');
    saveFile('data/texts/' + d.id + '.json', JSON.stringify(d), '编辑台：上架 ' + d.title)
      .then(function () {
        // 记入可读清单
        return getFile('data/available.json').then(function (f) {
          var list = f ? JSON.parse(b64decode(f.content)) : [];
          if (list.indexOf(d.id) === -1) list.push(d.id);
          return putFile('data/available.json', JSON.stringify(list), '编辑台：可读清单 +' + d.id, f && f.sha);
        });
      })
      .then(function () {
        // 非嘉兴藏书目（如 T 大正藏）补进 catalog
        return getFile('data/catalog.json').then(function (f) {
          var cat = JSON.parse(b64decode(f.content));
          if (cat.some(function (b) { return b.id === d.id; })) return null;
          cat.push({ id: d.id, title: d.title.replace(/^\S+\s*/, ''), creator: d.creator, juans: d.juans.length, file: d.id + '.epub' });
          return putFile('data/catalog.json', JSON.stringify(cat), '编辑台：书目 +' + d.id, f.sha);
        });
      })
      .then(function () {
        status('《' + d.title + '》已上架，约一分钟后可读', 'ok');
        $('btn-upload').disabled = true;
        $('upl-preview').classList.remove('show');
        $('epub-file').value = '';
      })
      .catch(function (e) { status('上架失败：' + e.message, 'err'); });
  });

  /* ---------- 折叠 ---------- */
  document.querySelectorAll('section > header').forEach(function (h) {
    h.addEventListener('click', function () { h.parentElement.classList.toggle('open'); });
  });

  if (S.token) { $('btn-connect').click(); }
})();
