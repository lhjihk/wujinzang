/* admin.js — 編輯臺
   與舊站同一套路：純靜態 + GitHub contents API = 免服務器的後臺。
   token 只存 localStorage，不進代碼不進倉庫。
   三件事：① content.json 自動錶單  ② EPUB 瀏覽器端解析上架  ③ 原始 JSON 直編。 */
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
  /* 保存前先取最新 sha，減少 409 衝突 */
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
    if (!S.token || !S.repo) return status('token 與倉庫都要填', 'err');
    status('驗證中…');
    gh('/repos/' + S.repo).then(function (r) {
      if (!r) throw new Error('倉庫不存在或 token 無權限');
      localStorage.setItem('wjz-token', S.token);
      localStorage.setItem('wjz-repo', S.repo);
      $('conn-st').textContent = '已連接 ' + S.repo;
      status('連接成功', 'ok');
      loadContent();
    }).catch(function (e) { status('連接失敗：' + e.message, 'err'); });
  });
  $('btn-disconnect').addEventListener('click', function () {
    localStorage.removeItem('wjz-token');
    S.token = ''; $('token').value = '';
    $('conn-st').textContent = '未連接';
    status('已斷開並清除本機 token');
  });

  /* ---------- content.json 自動錶單 ----------
     把 JSON 裡所有字符串葉子鋪成輸入框，路徑即字段名；
     以 _ 開頭的鍵（_version/_comment）不展示但保留。 */
  function loadContent() {
    status('讀取 content.json …');
    getFile('data/content.json').then(function (f) {
      if (!f) throw new Error('data/content.json 不存在');
      S.content = JSON.parse(b64decode(f.content));
      S.contentSha = f.sha;
      buildForm();
      $('raw-json').value = JSON.stringify(S.content, null, 2);
      status('content.json 已載入', 'ok');
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
    if (!S.content) return status('先載入', 'err');
    document.querySelectorAll('#form-fields [data-path]').forEach(function (inp) {
      setPath(S.content, inp.dataset.path, inp.value);
    });
    var text = JSON.stringify(S.content, null, 2);
    status('提交中…');
    saveFile('data/content.json', text, '編輯臺：更新文案').then(function () {
      status('已發佈，約一分鐘後生效', 'ok');
      $('raw-json').value = text;
    }).catch(function (e) { status('保存失敗：' + e.message, 'err'); });
  });

  $('btn-raw-save').addEventListener('click', function () {
    var text = $('raw-json').value;
    try { S.content = JSON.parse(text); }
    catch (e) { return status('JSON 語法錯誤：' + e.message, 'err'); }
    status('提交中…');
    saveFile('data/content.json', JSON.stringify(S.content, null, 2), '編輯臺：直編 JSON')
      .then(function () { status('已發佈', 'ok'); buildForm(); })
      .catch(function (e) { status('保存失敗：' + e.message, 'err'); });
  });

  /* ---------- EPUB 上架 ----------
     瀏覽器本地解析 CBETA epub → 與站內同構的 {id,title,creator,juans:[blocks]}
     提交 data/texts/{id}.json，並把 id 記入 data/available.json；
     若書目裡沒有此 id（非嘉興藏），一併補進 catalog.json。 */
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
        status('解析完成，確認後點「上架此經」', 'ok');
      })
      .catch(function (e) { status('解析失敗：' + e.message, 'err'); });
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
      if (!juanNames.length) throw new Error('未找到正文（OEBPS/juans/），確認是 CBETA 的 epub');
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
      // 普通段落有兩種寫法：裸 <div> 或（div-other 等容器裡的）<p>
      else if (tag === 'P' && !cls && !el.querySelector('div,p')) blocks.push({ t: 'p', s: text });
      else if (tag === 'DIV' && !cls && !el.querySelector('div,p')) blocks.push({ t: 'p', s: text });
      // 科判樹（起信論疏科這類）：正文全是嵌套 li
      else if (tag === 'LI' && !el.querySelector('li')) blocks.push({ t: 'p', s: text });
    });
    return blocks;
  }

  $('btn-upload').addEventListener('click', function () {
    var d = S.epubDoc;
    if (!d) return;
    if (!S.token) return status('先連接 GitHub', 'err');
    status('提交 ' + d.id + ' …');
    var code = (d.id.match(/^[A-Z]+/) || ['ZW'])[0];
    var entry = { id: d.id, title: d.title.replace(/^\S+\s*/, ''), creator: d.creator, juans: d.juans.length };
    saveFile('data/texts/' + d.id + '.json', JSON.stringify(d), '編輯臺：上架 ' + d.title)
      .then(function () {
        // 補進該藏書目（data/catalog/{code}.json，新藏則建新檔）
        return getFile('data/catalog/' + code + '.json').then(function (f) {
          var cat = f ? JSON.parse(b64decode(f.content)) : [];
          if (cat.some(function (b) { return b.id === d.id; })) return null;
          cat.push(entry);
          return putFile('data/catalog/' + code + '.json', JSON.stringify(cat), '編輯臺：書目 +' + d.id, f && f.sha);
        });
      })
      .then(function () {
        // 補進全局檢索書目 all.json
        return getFile('data/catalog/all.json').then(function (f) {
          var all = f ? JSON.parse(b64decode(f.content)) : [];
          if (all.some(function (b) { return b.id === d.id; })) return null;
          var e2 = Object.assign({ c: code }, entry);
          all.push(e2);
          return putFile('data/catalog/all.json', JSON.stringify(all), '編輯臺：檢索書目 +' + d.id, f && f.sha);
        });
      })
      .then(function () {
        status('《' + d.title + '》已上架，約一分鐘後可讀', 'ok');
        $('btn-upload').disabled = true;
        $('upl-preview').classList.remove('show');
        $('epub-file').value = '';
      })
      .catch(function (e) { status('上架失敗：' + e.message, 'err'); });
  });

  /* ---------- 摺疊 ---------- */
  document.querySelectorAll('section > header').forEach(function (h) {
    h.addEventListener('click', function () { h.parentElement.classList.toggle('open'); });
  });

  if (S.token) { $('btn-connect').click(); }
})();
