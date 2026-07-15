/* main.js — 主頁動畫總控
   加載器漢字計數 → 朱印落章 → 開卷；Lenis 平滑滾動 + GSAP 編排；
   朝元圖橫向展卷（pin + scrub）；畫廊燈箱。
   鐵律：GSAP 管 transform 的元素，CSS 絕不再碰 transform（舊站踩過的坑）。 */
(function () {
  'use strict';

  var CN_NUM = ['零', '一十', '二十', '三十', '四十', '五十', '六十', '七十', '八十', '九十', '圓滿'];

  document.addEventListener('site:ready', function (ev) {
    var c = ev.detail;
    runLoader(function () { start(c); });
    if (c) buildGallery(c);
    if (c) buildMarquee(c);
  });

  // 保險絲：任何原因（CDN斷、腳本掛起、fetch超時）導致開卷失敗，6秒後強制揭幕
  setTimeout(function () {
    var l = document.getElementById('loader');
    if (l && l.style.display !== 'none' && document.body.classList.contains('no-scroll')) {
      l.style.display = 'none';
      document.body.classList.remove('no-scroll');
      revealAll();
    }
  }, 6000);

  /* ---------- 加載器 ---------- */
  function runLoader(done) {
    var num = document.getElementById('loader-num');
    var seal = document.getElementById('loader-seal');
    var bar = document.getElementById('loader-bar');
    var loader = document.getElementById('loader');
    if (!loader || !window.gsap) {
      if (loader) loader.style.display = 'none';
      document.body.classList.remove('no-scroll');
      return done();
    }
    var st = { v: 0 };
    gsap.to(st, {
      v: 100, duration: 2.1, ease: 'power2.inOut',
      onUpdate: function () {
        var i = Math.min(10, Math.floor(st.v / 10));
        num.textContent = CN_NUM[i];
        bar.style.width = st.v + '%';
      },
      onComplete: function () {
        // 朱印落章
        gsap.to(seal, {
          opacity: 1, scale: 1, rotate: -4, duration: .38, ease: 'power4.in',
          onComplete: function () {
            gsap.to(loader, {
              yPercent: -100, duration: .9, ease: 'power4.inOut', delay: .5,
              onComplete: function () {
                loader.style.display = 'none';
                document.body.classList.remove('no-scroll');
                done();
              }
            });
          }
        });
        gsap.to(num, { opacity: 0, duration: .3 });
      }
    });
  }

  /* ---------- 開場 + 滾動編排 ---------- */
  function start(c) {
    if (!window.gsap) return revealAll();
    gsap.registerPlugin(ScrollTrigger);

    // Lenis 平滑滾動
    var lenis = null;
    if (window.Lenis && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lenis = new Lenis({ lerp: .09 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }

    // hero 標題逐字升起
    gsap.to('.hero-title span', {
      opacity: 1, y: 0, rotate: 0, duration: 1.4, ease: 'power4.out',
      stagger: { each: .09, from: 'random' }, delay: .15
    });
    gsap.to('.hero .rise, .hero-quote', {
      opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', stagger: .12, delay: .7
    });

    // 各區塊 rise 進場
    gsap.utils.toArray('.rise').forEach(function (el) {
      if (el.closest('.hero') || el.classList.contains('hero-quote')) return;
      gsap.to(el, {
        opacity: 1, y: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    horizontalScroll();
    lightbox();
    galleryParallax();
  }

  /* 畫廊視差：各幅隨滾動以不同速度漂移，散排更有縱深（GSAP 獨佔 transform，CSS 只管 margin） */
  function galleryParallax() {
    // 觸屏/窄屏禁視差：塊狀直排下位移會互相壓疊（上輪手機錯亂的元兇）
    if (matchMedia('(prefers-reduced-motion: reduce), (max-width: 900px), (pointer: coarse)').matches) return;
    var speeds = [-40, 60, -70, 50, 90, -30];
    gsap.utils.toArray('.gallery-grid > *').forEach(function (el, i) {
      gsap.fromTo(el, { y: 0 }, {
        y: speeds[i % speeds.length],
        ease: 'none',
        scrollTrigger: { trigger: el, start: 'top bottom', end: 'bottom top', scrub: 1.4 }
      });
    });
  }

  function revealAll() {
    document.querySelectorAll('.rise, .hero-title span').forEach(function (el) {
      el.style.opacity = 1; el.style.transform = 'none';
    });
  }

  /* ---------- 朝元圖橫向展卷 ---------- */
  function horizontalScroll() {
    var stage = document.getElementById('scroll-stage');
    var strip = document.getElementById('scroll-strip');
    var bar = document.getElementById('scroll-bar');
    var pos = document.getElementById('scroll-pos');
    if (!stage || !strip) return;

    // 手機/觸屏：放棄 pin 動畫，原生橫向滑動最順手（上一站教訓：手機端最後統一收）
    if (matchMedia('(max-width: 900px), (pointer: coarse)').matches) {
      stage.classList.add('touch-scroll');
      stage.addEventListener('scroll', function () {
        var span = stage.scrollWidth - stage.clientWidth;
        var p = span > 0 ? stage.scrollLeft / span : 0;
        if (bar) bar.style.width = (p * 100).toFixed(1) + '%';
        if (pos) pos.textContent = (p * 90).toFixed(1) + 'M / 90M';
      }, { passive: true });
      return;
    }

    function span() { return Math.max(0, strip.scrollWidth - stage.clientWidth); }

    gsap.to(strip, {
      x: function () { return -span(); },
      ease: 'none',
      scrollTrigger: {
        trigger: stage,
        start: 'top top',
        end: function () { return '+=' + span(); },
        pin: true,
        scrub: 1.2,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          if (bar) bar.style.width = (self.progress * 100).toFixed(1) + '%';
          if (pos) pos.textContent = (self.progress * 90).toFixed(1) + 'M / 90M';
        }
      }
    });

    // 圖片全載後重新計算 pin 距離
    var imgs = strip.querySelectorAll('img'), left = imgs.length;
    imgs.forEach(function (im) {
      if (im.complete) { if (--left === 0) ScrollTrigger.refresh(); }
      else im.addEventListener('load', function () { if (--left === 0) ScrollTrigger.refresh(); });
    });
  }

  /* ---------- 畫廊 ---------- */
  function buildGallery(c) {
    var grid = document.getElementById('gallery-grid');
    if (!grid || !c.gallery) return;
    c.gallery.works.forEach(function (w, i) {
      var el = document.createElement('article');
      el.className = 'work';
      el.setAttribute('tabindex', '0');
      el.innerHTML =
        '<span class="work-num">' + w.location.replace(/[^0-9]/g, '').padStart(3, '0') + ' · ' + ['壹', '貳', '叄', '肆'][i] + '</span>' +
        '<div class="work-img rise"><img src="' + w.card + '" alt="' + w.title + '" loading="lazy"></div>' +
        '<div class="work-cap"><span class="zh">' + w.title + '</span>' +
        '<span class="t-info">' + w.location + '<br>' + w.period + '</span></div>';
      el.addEventListener('click', function () { openWork(w); });
      el.addEventListener('keydown', function (e) { if (e.key === 'Enter') openWork(w); });
      grid.appendChild(el);
    });

    // 第四幅旁的題記（展籤），有 colophon 字段才出現
    var last = c.gallery.works[c.gallery.works.length - 1];
    if (last && last.colophon) {
      var col = document.createElement('aside');
      col.className = 'colophon rise';
      col.innerHTML =
        '<div class="colophon-verse">' + (last.colophon_verse || '') + '</div>' +
        '<div class="colophon-body"><span class="t-info">' + (last.colophon_title || '題記') + ' · COLOPHON</span>' +
        '<p>' + last.colophon + '</p>' +
        '<div class="colophon-seal">' + ((c.site && c.site.footer_seal) || '無盡藏') + '</div></div>';
      grid.appendChild(col);
    }
    // 留白處：豎排偈語 + 書畫收藏鈐印（如手卷卷尾）
    if (c.gallery.deco_verse) {
      var v = document.createElement('aside');
      v.className = 'gallery-side rise';
      v.innerHTML =
        '<div class="gallery-verse">' + c.gallery.deco_verse + '</div>' +
        '<div class="seal-stack">' +
        '  <span class="art-seal s1">心燈文錄</span>' +
        '  <span class="art-seal s2">' + ((c.site && c.site.footer_seal) || '無盡藏') + '</span>' +
        '</div>';
      grid.appendChild(v);
    }
  }

  var lbEls = null;
  function lightbox() {
    lbEls = {
      root: document.getElementById('lightbox'),
      img: document.getElementById('lightbox-img'),
      title: document.getElementById('lightbox-title'),
      meta: document.getElementById('lightbox-meta'),
      close: document.getElementById('lightbox-close'),
      scroll: document.getElementById('lightbox-scroll')
    };
    lbEls.close.addEventListener('click', closeWork);
    // 原作尊貴：燈箱與畫廊不供右鍵取圖、不供拖拽（防君子）
    lbEls.root.addEventListener('contextmenu', function (e) { e.preventDefault(); });
    document.querySelectorAll('.work-img img, #lightbox-img').forEach(function (im) { im.draggable = false; });
    document.querySelector('.gallery').addEventListener('contextmenu', function (e) {
      if (e.target.tagName === 'IMG') e.preventDefault();
    });
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeWork(); });
    // 拖拽平移長卷
    var down = false, sx = 0, sl = 0;
    lbEls.scroll.addEventListener('pointerdown', function (e) { down = true; sx = e.clientX; sl = lbEls.scroll.scrollLeft; });
    window.addEventListener('pointermove', function (e) { if (down) lbEls.scroll.scrollLeft = sl - (e.clientX - sx); });
    window.addEventListener('pointerup', function () { down = false; });
  }
  function openWork(w) {
    if (!lbEls) return;
    lbEls.img.src = w.full;
    lbEls.img.alt = w.title;
    lbEls.title.textContent = w.title;
    lbEls.meta.textContent = w.en + ' — ' + w.period;
    lbEls.root.classList.add('open');
    document.body.classList.add('no-scroll');
  }
  function closeWork() {
    if (!lbEls) return;
    lbEls.root.classList.remove('open');
    document.body.classList.remove('no-scroll');
  }

  /* ---------- 跑馬燈：滾動越快經文跑越快（gsap.ticker 手動推進） ---------- */
  function buildMarquee(c) {
    var track = document.getElementById('marquee-track');
    if (!track) return;
    var line = c.reading.featured_quote + '　<b>◦</b>　' + c.hero.quote + '　<b>◦</b>　';
    track.innerHTML = '<span>' + line + line + '</span><span aria-hidden="true">' + line + line + '</span>';
    if (!window.gsap) return;
    var x = 0, vel = 0, lastY = window.scrollY;
    gsap.ticker.add(function () {
      var y = window.scrollY;
      vel += Math.abs(y - lastY) * .02; lastY = y;
      vel *= .92;
      x -= .4 + Math.min(vel, 6);
      var w = track.children[0].offsetWidth;
      if (w > 0 && -x >= w) x += w;
      track.style.transform = 'translateX(' + x + 'px)';
    });
  }
})();
