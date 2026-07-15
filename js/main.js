/* main.js — 主页动画总控
   加载器汉字计数 → 朱印落章 → 开卷；Lenis 平滑滚动 + GSAP 编排；
   朝元图横向展卷（pin + scrub）；画廊灯箱。
   铁律：GSAP 管 transform 的元素，CSS 绝不再碰 transform（旧站踩过的坑）。 */
(function () {
  'use strict';

  var CN_NUM = ['零', '一十', '二十', '三十', '四十', '五十', '六十', '七十', '八十', '九十', '圓滿'];

  document.addEventListener('site:ready', function (ev) {
    var c = ev.detail;
    runLoader(function () { start(c); });
    if (c) buildGallery(c);
    if (c) buildMarquee(c);
  });

  /* ---------- 加载器 ---------- */
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

  /* ---------- 开场 + 滚动编排 ---------- */
  function start(c) {
    if (!window.gsap) return revealAll();
    gsap.registerPlugin(ScrollTrigger);

    // Lenis 平滑滚动
    var lenis = null;
    if (window.Lenis && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      lenis = new Lenis({ lerp: .09 });
      lenis.on('scroll', ScrollTrigger.update);
      gsap.ticker.add(function (t) { lenis.raf(t * 1000); });
      gsap.ticker.lagSmoothing(0);
    }

    // hero 标题逐字升起
    gsap.to('.hero-title span', {
      opacity: 1, y: 0, rotate: 0, duration: 1.4, ease: 'power4.out',
      stagger: { each: .09, from: 'random' }, delay: .15
    });
    gsap.to('.hero .rise, .hero-quote', {
      opacity: 1, y: 0, duration: 1.2, ease: 'power3.out', stagger: .12, delay: .7
    });

    // 各区块 rise 进场
    gsap.utils.toArray('.rise').forEach(function (el) {
      if (el.closest('.hero') || el.classList.contains('hero-quote')) return;
      gsap.to(el, {
        opacity: 1, y: 0, duration: 1.1, ease: 'power3.out',
        scrollTrigger: { trigger: el, start: 'top 88%' }
      });
    });

    horizontalScroll();
    lightbox();
  }

  function revealAll() {
    document.querySelectorAll('.rise, .hero-title span').forEach(function (el) {
      el.style.opacity = 1; el.style.transform = 'none';
    });
  }

  /* ---------- 朝元图横向展卷 ---------- */
  function horizontalScroll() {
    var stage = document.getElementById('scroll-stage');
    var strip = document.getElementById('scroll-strip');
    var bar = document.getElementById('scroll-bar');
    var pos = document.getElementById('scroll-pos');
    if (!stage || !strip) return;

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

    // 图片全载后重新计算 pin 距离
    var imgs = strip.querySelectorAll('img'), left = imgs.length;
    imgs.forEach(function (im) {
      if (im.complete) { if (--left === 0) ScrollTrigger.refresh(); }
      else im.addEventListener('load', function () { if (--left === 0) ScrollTrigger.refresh(); });
    });
  }

  /* ---------- 画廊 ---------- */
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
    document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeWork(); });
    // 拖拽平移长卷
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

  /* ---------- 跑马灯：滚动越快经文跑越快（gsap.ticker 手动推进） ---------- */
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
