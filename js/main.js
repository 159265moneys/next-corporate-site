/* ============================================================
   main.js — オーケストレーション
   Loader / Lenis / カスタムカーソル / スクランブル / スパイン(SVG一本線)
   フェーズレール / 各セクションの ScrollTrigger 演出 / エンジンのIO管理
   ============================================================ */
(function () {
  'use strict';

  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var clamp01 = function (v) { return Math.max(0, Math.min(1, v)); };

  var REDUCED = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var COARSE = window.matchMedia('(pointer: coarse)').matches;
  var VW = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
  var MOBILE = VW > 0 && VW < 821;
  var hasGSAP = typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined';
  var hasLenis = typeof Lenis !== 'undefined';

  var lenis = null;
  var engines = {};
  var spineST = null;
  var abTimer = null;

  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  if (REDUCED) document.documentElement.classList.add('reduced');
  if (hasGSAP) {
    gsap.registerPlugin(ScrollTrigger);
    // iOS Safariのアドレスバー伸縮による高さ変動でピンが暴れないように。
    // タッチのピンはネイティブスクロール + pinType:'fixed'（既定）で安定させる。
    // ※ normalizeScroll はアンカー遷移等のプログラムスクロールと干渉するため不使用
    ScrollTrigger.config({ ignoreMobileResize: true });
  }

  /* ============ boot ============ */
  function boot() {
    window.scrollTo(0, 0);
    buildEngines();
    initHeader();
    initAnchors();

    // WebGL背景
    if (window.NextScene) {
      window.NextScene.init({ reduced: REDUCED, lite: MOBILE });
    }

    if (REDUCED) { staticAll(); return; }

    if (!hasGSAP) {
      // CDN失敗時フォールバック：全表示 + エンジンのみ稼働
      document.documentElement.classList.add('reduced');
      removeLoader();
      initEngineObservers();
      initRailIO();
      setFinalNumbers();
      buildSpine(true);
      return;
    }

    initLenis();
    initCursor();
    hideInitial();
    // 重要: ピン留めトリガーをページ順で先に作成する。
    // 後続トリガーの位置計算にピンの延長距離を正しく織り込ませるため。
    initProblem();
    initBlueprint();
    initConveyor();
    initHeroParallax();
    initReveals();
    initRail();
    initIso();
    initFlow();
    initCounters();
    initKPIs();
    initAB();
    initCTAScramble();
    initSceneCTA();
    initEngineObservers();
    if (ScrollTrigger.sort) ScrollTrigger.sort();

    runLoader(function () {
      heroIntro();
    });

    window.addEventListener('load', function () {
      ScrollTrigger.refresh();
      buildSpine(false);
    });

    // リサイズ（デバウンス）
    // タッチ端末では幅が変わらない限り無視（iOSアドレスバー伸縮対策）
    var rid = null;
    var lastW = window.innerWidth;
    window.addEventListener('resize', function () {
      if (COARSE && Math.abs(window.innerWidth - lastW) < 2) return;
      clearTimeout(rid);
      rid = setTimeout(function () {
        lastW = window.innerWidth;
        Object.keys(engines).forEach(function (k) {
          if (engines[k].resize) engines[k].resize();
        });
        ScrollTrigger.refresh();
        buildSpine(false);
      }, 280);
    });
  }

  /* ============ Lenis 慣性スクロール ============ */
  function initLenis() {
    if (!hasLenis) return;
    // タッチはLenis既定でネイティブスクロールのまま（scrollイベントが
    // そのままScrollTriggerを駆動し、position:fixedピンが確実に効く）
    lenis = new Lenis({
      duration: 1.25,
      easing: function (t) { return Math.min(1, 1.001 - Math.pow(2, -10 * t)); }, // expo out
      smoothWheel: true
    });
    lenis.on('scroll', ScrollTrigger.update);
    gsap.ticker.add(function (time) { lenis.raf(time * 1000); });
    gsap.ticker.lagSmoothing(0);
  }

  /* ============ ヘッダー ============ */
  function initHeader() {
    var header = $('.site-header');
    var onScroll = function () {
      header.classList.toggle('scrolled', (window.scrollY || 0) > 40);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  function initAnchors() {
    // 委譲方式: 後からinnerHTML再構築されたアンカーにも効く
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('[data-scrollto]') : null;
      if (!a) return;
      var href = a.getAttribute('href');
      if (!href || href.charAt(0) !== '#') return;
      var target = $(href);
      if (!target) return;
      e.preventDefault();
      if (lenis) {
        if (lenis.isStopped) lenis.start(); // 停止状態の取り残し対策
        lenis.scrollTo(target, { duration: 1.6, easing: function (t) { return 1 - Math.pow(1 - t, 4); } });
        // Lenisが不健康なロード(raf未稼働等)でもアンカーを保証するフォールバック
        var y0 = window.scrollY;
        setTimeout(function () {
          if (Math.abs(window.scrollY - y0) < 2) {
            target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
          }
        }, 300);
      } else {
        target.scrollIntoView({ behavior: REDUCED ? 'auto' : 'smooth' });
      }
    });
  }

  /* ============ カスタムカーソル ============ */
  function initCursor() {
    if (COARSE || REDUCED) return;
    var dot = $('.cursor-dot'), ring = $('.cursor-ring');
    if (!dot || !ring) return;
    var x = window.innerWidth / 2, y = window.innerHeight / 2;
    var rx = x, ry = y, shown = false;

    window.addEventListener('mousemove', function (e) {
      x = e.clientX; y = e.clientY;
      if (!shown) { shown = true; dot.style.opacity = '1'; ring.style.opacity = '1'; }
      dot.style.transform = 'translate(' + x + 'px,' + y + 'px)';
    }, { passive: true });

    (function loop() {
      requestAnimationFrame(loop);
      rx += (x - rx) * 0.16;
      ry += (y - ry) * 0.16;
      ring.style.transform = 'translate(' + rx.toFixed(1) + 'px,' + ry.toFixed(1) + 'px)';
    })();

    // ホバーでリング拡大
    $$('a, button, .magnet').forEach(function (el) {
      el.addEventListener('mouseenter', function () { ring.classList.add('is-hover'); });
      el.addEventListener('mouseleave', function () { ring.classList.remove('is-hover'); });
    });
    // マグネット
    $$('.magnet').forEach(function (el) {
      el.addEventListener('mousemove', function (e) {
        var r = el.getBoundingClientRect();
        var mx = e.clientX - (r.left + r.width / 2);
        var my = e.clientY - (r.top + r.height / 2);
        gsap.to(el, { x: mx * 0.22, y: my * 0.22, duration: 0.5, ease: 'power3.out' });
      });
      el.addEventListener('mouseleave', function () {
        gsap.to(el, { x: 0, y: 0, duration: 0.8, ease: 'expo.out' });
      });
    });
  }

  /* ============ ローダー ============ */
  function removeLoader() {
    var loader = $('#loader');
    if (loader) loader.style.display = 'none';
  }

  function runLoader(done) {
    var loader = $('#loader');
    if (!loader) { done(); return; }
    if (lenis) lenis.stop();
    document.body.style.overflow = 'hidden';

    var strokes = $$('#loader-logo .ll');
    strokes.forEach(function (s) {
      var L = s.getTotalLength();
      s.style.strokeDasharray = L;
      s.style.strokeDashoffset = L;
    });
    var pctEl = $('#loader-pct');
    var pct = { v: 0 };

    var tl = gsap.timeline({
      onComplete: function () {
        loader.style.display = 'none';
        document.body.style.overflow = '';
        if (lenis) lenis.start();
        ScrollTrigger.refresh();
        buildSpine(false);
        if (done) done();
      }
    });
    tl.to('.loader-grid', { opacity: 1, scale: 1, duration: 1.0, ease: 'power2.out' }, 0)
      .to(strokes, { strokeDashoffset: 0, duration: 1.5, ease: 'power3.inOut', stagger: 0.09 }, 0.1)
      .to(pct, {
        v: 100, duration: 1.9, ease: 'power2.inOut',
        onUpdate: function () { pctEl.textContent = String(Math.round(pct.v)).padStart(2, '0'); }
      }, 0)
      .to('#loader-bar-fill', { scaleX: 1, duration: 1.9, ease: 'power2.inOut' }, 0)
      .to('.loader-inner', { opacity: 0, y: -24, duration: 0.5, ease: 'power3.in' }, '+=0.3')
      .to(loader, { yPercent: -100, duration: 0.9, ease: 'power4.inOut' }, '-=0.25');
  }

  /* ============ スクランブルテキスト ============ */
  function scramble(el, dur, done) {
    if (!el) { if (done) done(); return; }
    var final = el.getAttribute('data-text') || el.textContent;
    var CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789#/<>+*=';
    var start = null;
    var finished = false;
    // 同一要素への再入は前のループを無効化
    var token = (el.__scrambleToken = (el.__scrambleToken || 0) + 1);
    el.style.opacity = '1';
    function finish() {
      if (finished || token !== el.__scrambleToken) return;
      finished = true;
      el.textContent = final;
      if (done) done();
    }
    function tick(t) {
      if (finished || token !== el.__scrambleToken) return;
      if (start === null) start = t;
      var p = clamp01((t - start) / dur);
      var eased = 1 - Math.pow(1 - p, 3);
      var resolved = Math.floor(eased * final.length);
      var out = final.slice(0, resolved);
      for (var i = resolved; i < final.length; i++) {
        var ch = final[i];
        out += (ch === '、' || ch === '。' || ch === ' ') ? ch : CHARS[(Math.random() * CHARS.length) | 0];
      }
      el.textContent = out;
      if (p < 1) requestAnimationFrame(tick);
      else finish();
    }
    requestAnimationFrame(tick);
    // rAFが途絶えても必ず正しい最終文字列に着地させるフェイルセーフ
    setTimeout(finish, dur + 450);
  }

  /* ============ 初期非表示（JSが担う: CDN失敗時も内容は見える） ============ */
  function hideInitial() {
    gsap.set('#phase-00 [data-reveal]', { y: 44, opacity: 0 });
    gsap.set('#hero-title', { opacity: 0 });
    gsap.set('#cta-title', { opacity: 0 });
    var els = $$('[data-reveal]').filter(function (el) { return !el.closest('#phase-00'); });
    gsap.set(els, { y: 48, opacity: 0 });
  }

  /* ============ ヒーロー開幕 ============ */
  function heroIntro() {
    var fills = $$('#hero-title .ht-fill');
    fills.forEach(function (f) { f.style.opacity = '0'; });
    gsap.set('#hero-title', { opacity: 1 });
    if (fills.length >= 3) {
      scramble(fills[0], 850);
      setTimeout(function () { scramble(fills[1], 950); }, 240);
      setTimeout(function () { scramble(fills[2], 1050, drawSwash); }, 430);
    } else {
      scramble($('#hero-title'), 1500, drawSwash);
    }
    gsap.from('.hero-billboard i', {
      opacity: 0, duration: 1.5, ease: 'power3.out', stagger: 0.1
    });
    gsap.to('#phase-00 [data-reveal]', {
      y: 0, opacity: 1, duration: 1.3, ease: 'power4.out', stagger: 0.13, delay: 0.35
    });
  }

  /* キーフレーズ下のアクセント・スウォッシュ（SVGストローク描画） */
  function drawSwash() {
    var path = $('.ht-swash path');
    if (!path) return;
    var L = 400;
    try { L = path.getTotalLength(); } catch (e) { /* noop */ }
    path.style.strokeDasharray = L;
    path.style.strokeDashoffset = L;
    path.style.opacity = '1';
    gsap.to(path, { strokeDashoffset: 0, duration: 0.85, ease: 'power3.inOut' });
  }

  function initHeroParallax() {
    gsap.to('#phase-00 .wrap', {
      yPercent: -14, opacity: 0.25, ease: 'none',
      scrollTrigger: { trigger: '#phase-00', start: 'top top', end: 'bottom top', scrub: 0.6 }
    });
  }

  /* ============ 汎用リビール ============ */
  function initReveals() {
    var els = $$('[data-reveal]').filter(function (el) { return !el.closest('#phase-00'); });
    ScrollTrigger.batch(els, {
      start: 'top 88%',
      onEnter: function (batch) {
        gsap.to(batch, { y: 0, opacity: 1, duration: 1.15, ease: 'power4.out', stagger: 0.09, overwrite: true });
      }
    });
    // ゴースト番号のパララックス
    $$('.ghost-num').forEach(function (g) {
      gsap.fromTo(g, { y: 70 }, {
        y: -70, ease: 'none',
        scrollTrigger: { trigger: g, start: 'top bottom', end: 'bottom top', scrub: 0.8 }
      });
    });
  }

  /* ============ フェーズレール ============ */
  function setRail(idx) {
    $$('.phase-rail a').forEach(function (a) {
      a.classList.toggle('active', a.getAttribute('data-rail') === String(idx));
    });
  }
  function initRail() {
    initRailIO();
    // ダークセクションでレールの色を反転
    ScrollTrigger.create({
      trigger: '#phase-04', start: 'top 55%', end: 'bottom 45%',
      toggleClass: { targets: document.body, className: 'dark-mode' }
    });
  }
  function initRailIO() {
    setRail(0);
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) setRail(e.target.getAttribute('data-phase'));
      });
    }, { rootMargin: '-45% 0px -45% 0px' });
    $$('.sec[data-phase]').forEach(function (s) { io.observe(s); });
  }

  /* ============ スパイン：全セクションを貫く一本の青ライン ============ */
  function buildSpine(fullDrawn) {
    var svg = $('#spine'), path = $('#spine-path'), tip = $('#spine-tip');
    if (!svg || !path) return;
    if (spineST) { spineST.kill(); spineST = null; }

    var docH = document.documentElement.scrollHeight;
    var W = window.innerWidth;
    svg.setAttribute('width', W);
    svg.setAttribute('height', docH);
    svg.setAttribute('viewBox', '0 0 ' + W + ' ' + docH);
    svg.style.height = docH + 'px';

    var xs = MOBILE ? [0.92, 0.08] : [0.87, 0.13];
    var pts = [{ x: W * 0.5, y: 0 }];
    $$('.sec').forEach(function (s, i) {
      var r = s.getBoundingClientRect();
      var y = r.top + (window.scrollY || 0) + r.height * 0.5;
      pts.push({ x: W * xs[i % 2], y: y });
    });
    pts.push({ x: W * 0.5, y: docH - 6 });

    var d = 'M ' + pts[0].x.toFixed(1) + ' ' + pts[0].y.toFixed(1);
    for (var i = 1; i < pts.length; i++) {
      var p0 = pts[i - 1], p1 = pts[i], my = (p0.y + p1.y) / 2;
      d += ' C ' + p0.x.toFixed(1) + ' ' + my.toFixed(1) +
           ', ' + p1.x.toFixed(1) + ' ' + my.toFixed(1) +
           ', ' + p1.x.toFixed(1) + ' ' + p1.y.toFixed(1);
    }
    path.setAttribute('d', d);
    var L = path.getTotalLength();
    path.style.strokeDasharray = L;

    if (fullDrawn || !hasGSAP) {
      path.style.strokeDashoffset = 0;
      if (tip) tip.style.opacity = 0;
      return;
    }
    path.style.strokeDashoffset = L;
    spineST = ScrollTrigger.create({
      start: 0, end: 'max',
      onUpdate: function (self) {
        var drawn = L * self.progress;
        path.style.strokeDashoffset = Math.max(0, L - drawn);
        if (tip) {
          var pt = path.getPointAtLength(drawn);
          tip.setAttribute('cx', pt.x);
          tip.setAttribute('cy', pt.y);
          tip.style.opacity = self.progress > 0.004 && self.progress < 0.998 ? 1 : 0;
        }
      }
    });
  }

  /* ============ PHASE 01：80%カウンター（ピン留め1） ============ */
  function initProblem() {
    // 行リビール用に内側スパンを作る
    $$('.problem-title .pl').forEach(function (pl) {
      pl.innerHTML = '<span class="pl-in" style="display:inline-block">' + pl.innerHTML + '</span>';
    });
    var counter = { v: 0 };
    var numEl = $('#problem-counter');

    var stConf = MOBILE
      ? { trigger: '#phase-01', start: 'top 62%' }
      : { trigger: '#phase-01', start: 'top top', end: '+=130%', scrub: 0.55, pin: true, anticipatePin: 1 };

    var tl = gsap.timeline({ scrollTrigger: stConf });
    tl.fromTo('#problem-num',
        { rotationX: 82, yPercent: 30, opacity: 0 },
        { rotationX: 0, yPercent: 0, opacity: 1, duration: 0.55, ease: MOBILE ? 'power4.out' : 'none' }, 0)
      .to(counter, {
        v: 80, duration: 0.55, ease: MOBILE ? 'power2.out' : 'none',
        onUpdate: function () { numEl.textContent = Math.round(counter.v); }
      }, 0)
      .fromTo('.problem-title .pl-in',
        { yPercent: 110 },
        { yPercent: 0, duration: 0.3, stagger: 0.08, ease: 'power4.out' }, 0.42)
      .fromTo('.problem-sub',
        { opacity: 0, y: 34 },
        { opacity: 1, y: 0, duration: 0.28, ease: 'power3.out' }, 0.6);
  }

  /* ============ PHASE 02：設計図の横ピン留めスクロール（ピン2） ============ */
  function initBlueprint() {
    var track = $('#bp-track');
    var svg = $('#flowchart');
    var fcls = $$('#flowchart .fcl');
    var nodes = $$('#flowchart .fnode');
    var pulses = $$('#flowchart .fpl');

    // 描画順は data-d 属性で明示（ノード→コネクタを視覚順に）
    var seq = $$('#flowchart [data-d]').sort(function (a, b) {
      return (+a.getAttribute('data-d')) - (+b.getAttribute('data-d'));
    });

    var lens = seq.map(function (el) {
      var L = 0;
      try { L = el.getTotalLength(); } catch (e) { L = 600; }
      el.style.strokeDasharray = L;
      el.style.strokeDashoffset = L;
      el.style.fillOpacity = 0;
      return L;
    });
    var locals = new Array(seq.length);

    function drawTo(p) {
      var n = seq.length;
      seq.forEach(function (el, i) {
        var t0 = (i / n) * 0.86;
        var local = clamp01((p - t0) / 0.16);
        locals[i] = local;
        el.style.strokeDashoffset = lens[i] * (1 - local);
        el.style.fillOpacity = local;
      });
      // ノードは描画完了で「点灯」（ブラケット+アイコン+発光）
      nodes.forEach(function (g) {
        var d = +g.getAttribute('data-lit');
        g.classList.toggle('lit', (locals[d] || 0) >= 0.999);
      });
      // コネクタ完成後、光のパルスが流れ始める
      pulses.forEach(function (pl) {
        var d = +pl.getAttribute('data-for');
        pl.classList.toggle('on', (locals[d] || 0) >= 0.999);
      });
      if (svg) {
        svg.classList.toggle('live', p > 0.04);
        svg.classList.toggle('deep', p > 0.58);
      }
      fcls.forEach(function (el, i) {
        var t0 = 0.08 + (i / fcls.length) * 0.8;
        el.style.opacity = clamp01((p - t0) / 0.08);
      });
    }

    // モバイルもピン留め横スクロール：縦入力を横進行に100%変換し、
    // 横移動が完了するまで縦方向へは進ませない（縦横同時進行の禁止）
    var getDist = function () { return track.scrollWidth - window.innerWidth; };
    gsap.to(track, {
      x: function () { return -getDist(); },
      ease: 'none',
      scrollTrigger: {
        trigger: '#phase-02',
        start: 'top top',
        end: function () { return '+=' + (getDist() + window.innerHeight * 0.4); },
        scrub: 0.6,
        pin: true,
        anticipatePin: 1,
        invalidateOnRefresh: true,
        onUpdate: function (self) {
          // チャートは横行程の 15%〜85% で描画
          drawTo(clamp01((self.progress - 0.12) / 0.68));
        }
      }
    });
  }

  /* ============ PHASE 03：コンベア（ピン3） ============ */
  function initConveyor() {
    var cards = $$('.ccard');
    var countEl = $('#belt-count');
    var spacing = MOBILE ? 260 : 340;

    // モバイルも同一実装：ピン留め + スクラブで横流し
    // （自動マーキーは縦スクロールと同時進行して見逃されるため廃止）
    var starts = cards.map(function (c, i) {
      var sx = window.innerWidth * 0.42 + i * spacing;
      gsap.set(c, { x: sx, rotationY: -22, rotationX: 6, transformPerspective: 1000 });
      return sx;
    });
    var total = starts[starts.length - 1] + window.innerWidth * 0.55;
    var stampTimes = starts.map(function (sx) { return sx / total; });

    var tl = gsap.timeline({
      scrollTrigger: {
        trigger: '#phase-03',
        start: 'top top',
        end: '+=260%',
        scrub: 0.55,
        pin: '.conveyor-pin',
        anticipatePin: 1,
        onUpdate: function (self) {
          var done = 0;
          stampTimes.forEach(function (t) { if (self.progress >= t) done++; });
          if (countEl) countEl.textContent = done;
          cards.forEach(function (c, i) { c.classList.toggle('done', self.progress >= stampTimes[i]); });
        }
      }
    });

    tl.to(cards, { x: '-=' + total, duration: 1, ease: 'none' }, 0);
    // ベルトの破線も進行に同期して流れる
    tl.to('.belt-line', { backgroundPositionX: '-=1360px', duration: 1, ease: 'none' }, 0);
    // 各カードが中央ゲートを通過する瞬間に AUTO ✓ スタンプ
    cards.forEach(function (c, i) {
      var stamp = c.querySelector('.stamp');
      tl.fromTo(stamp,
        { scale: 3, opacity: 0, rotation: -12 },
        { scale: 1, opacity: 1, rotation: -12, duration: 0.03, ease: 'power4.in' },
        Math.max(0, stampTimes[i] - 0.015));
    });
  }

  /* ============ PHASE 06：アイソメ・ジオラマ（組み上げ + 主役化ツアー） ============ */
  function initIso() {
    if (!engines.iso) return;

    // 1) 組み上がり：パーツが下から順に stagger + オーバーシュートで着地
    ScrollTrigger.create({
      trigger: '.iso-stage',
      start: 'top 94%',
      end: 'top 30%',
      scrub: 0.5,
      onUpdate: function (self) { engines.iso.setProgress(self.progress); }
    });

    // 2) 4業界の主役化ツアー：ステージをピンし、カメラが緩くドリー/パン。
    //    非主役は彩度・明度を落とし、特化カードもハイライト同期。
    if (!engines.iso.setFocus) return;
    var cards = $$('.icard');
    var focusIdx = null;
    function focus(i) {
      if (i === focusIdx) return;
      focusIdx = i;
      engines.iso.setFocus(i);
      cards.forEach(function (c, ci) { c.classList.toggle('is-live', ci === i); });
    }
    ScrollTrigger.create({
      trigger: '.iso-stage',
      start: 'center 52%',
      end: '+=150%',
      pin: true,
      anticipatePin: 1,
      onUpdate: function (self) {
        focus(Math.min(3, Math.floor(self.progress * 4)));
      },
      onLeave: function () { focus(-1); },
      onLeaveBack: function () { focus(-1); }
    });
  }

  /* ============ 導入フロー：一本線 + ノード点灯 ============ */
  function initFlow() {
    var line = $('#flow-line');
    var nodes = $$('#flow-svg .flow-node');
    if (!line) return;
    var L = line.getTotalLength();
    line.style.strokeDasharray = L;
    line.style.strokeDashoffset = L;

    ScrollTrigger.create({
      trigger: '.flow-stage', start: 'top 82%', end: 'top 30%', scrub: 0.5,
      onUpdate: function (self) {
        line.style.strokeDashoffset = L * (1 - self.progress);
        nodes.forEach(function (n, i) {
          n.classList.toggle('lit', self.progress >= i / (nodes.length - 1) - 0.02);
        });
      }
    });
    gsap.from('.flow-step', {
      y: 44, opacity: 0, duration: 1.1, ease: 'power4.out', stagger: 0.14,
      scrollTrigger: { trigger: '.flow-steps', start: 'top 85%' }
    });
  }

  /* ============ カウンター類 ============ */
  function initCounters() {
    $$('[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count'));
      var obj = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: 'top 90%', once: true,
        onEnter: function () {
          gsap.to(obj, {
            v: target, duration: 1.8, ease: 'expo.out',
            onUpdate: function () { el.textContent = Math.round(obj.v); }
          });
        }
      });
    });
  }

  // 統一階層：数値=大（そのまま）/ 単位・接頭辞=中（<em>で一段下げ）
  function kpiFormat(el, v) {
    var dec = parseInt(el.getAttribute('data-kpi-decimal') || '0', 10);
    var prefix = el.getAttribute('data-kpi-prefix') || '';
    var suffix = el.getAttribute('data-kpi-suffix') || '';
    var plus = (el.getAttribute('data-kpi') || '').trim().charAt(0) === '+';
    var s = v.toFixed(dec);
    if (plus && v > 0) s = '+' + s;
    return (prefix ? '<em>' + prefix + '</em>' : '') + s + (suffix ? '<em>' + suffix + '</em>' : '');
  }
  function initKPIs() {
    $$('[data-kpi]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-kpi'));
      var obj = { v: 0 };
      ScrollTrigger.create({
        trigger: el, start: 'top 90%', once: true,
        onEnter: function () {
          gsap.to(obj, {
            v: target, duration: 1.9, ease: 'expo.out',
            onUpdate: function () { el.innerHTML = kpiFormat(el, obj.v); }
          });
        }
      });
    });
  }

  /* ============ A/B クリエイティブ自動入替 ============ */
  function initAB() {
    var stage = $('#ab-stage');
    var a = $('#ab-a'), b = $('#ab-b');
    if (!stage || !a || !b) return;
    b.classList.add('is-winner'); // CTR 6.8% 側
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (e) {
        if (e.isIntersecting) {
          if (abTimer) return;
          abTimer = setInterval(function () {
            a.classList.toggle('is-front');
            b.classList.toggle('is-front');
          }, 3400);
        } else {
          clearInterval(abTimer); abTimer = null;
        }
      });
    }, { rootMargin: '60px' });
    io.observe(stage);
  }

  /* ============ CTA スクランブル ============ */
  function initCTAScramble() {
    ScrollTrigger.create({
      trigger: '#cta', start: 'top 68%', once: true,
      onEnter: function () { scramble($('#cta-title'), 1300); }
    });
  }

  /* ============ CTA：粒子「Next.inc」収束の進行をシーンへ供給 ============ */
  function initSceneCTA() {
    if (!window.NextScene || !window.NextScene.setCTAProgress) return;
    ScrollTrigger.create({
      trigger: '#cta',
      start: 'top 85%',
      end: 'bottom bottom',
      scrub: 0.3,
      onUpdate: function (self) { window.NextScene.setCTAProgress(self.progress); }
    });
  }

  /* ============ セクションエンジン（sections.js）とIO管理 ============ */
  function buildEngines() {
    if (!window.NextFX) return;
    var radarC = $('#radar-canvas');
    var isoC = $('#iso-canvas');
    var dashC = $('#dash-canvas');
    var termRoot = $('#terminal-root');
    var citeRoot = $('#citation-root');
    if (radarC) engines.radar = NextFX.createRadar(radarC);
    if (isoC) engines.iso = NextFX.createIso(isoC);
    if (dashC) engines.dashboard = NextFX.createDashboard(dashC);
    if (termRoot) engines.terminal = NextFX.createTerminal(termRoot);
    if (citeRoot) engines.citation = NextFX.createCitation(citeRoot);
  }

  function initEngineObservers() {
    var pairs = [
      ['#phase-04 .radar-stage', 'radar'],
      ['.iso-stage', 'iso'],
      ['.dash-chart', 'dashboard'],
      ['#terminal-root', 'terminal'],
      ['#citation-root', 'citation']
    ];
    pairs.forEach(function (p) {
      var el = $(p[0]);
      var eng = engines[p[1]];
      if (!el || !eng) return;
      if (eng.resize) eng.resize();
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (e) {
          if (e.isIntersecting) eng.start(); else eng.stop();
        });
      }, { rootMargin: '90px' });
      io.observe(el);
    });
  }

  /* ============ reduced-motion：全静止描画 ============ */
  function setFinalNumbers() {
    var pc = $('#problem-counter');
    if (pc) pc.textContent = '80';
    $$('[data-count]').forEach(function (el) {
      el.textContent = el.getAttribute('data-count');
    });
    $$('[data-kpi]').forEach(function (el) {
      el.innerHTML = kpiFormat(el, parseFloat(el.getAttribute('data-kpi')));
    });
    var bc = $('#belt-count');
    if (bc) bc.textContent = '5';
  }

  function staticAll() {
    removeLoader();
    setFinalNumbers();
    $$('.ccard').forEach(function (c) { c.classList.add('done'); });
    $$('.flow-node').forEach(function (n) { n.classList.add('lit'); });
    var fl = $('#flow-line');
    if (fl) { fl.style.strokeDasharray = 'none'; }
    ['radar', 'iso', 'dashboard', 'terminal', 'citation'].forEach(function (k) {
      if (engines[k] && engines[k].renderStatic) {
        try { engines[k].renderStatic(); } catch (e) { /* noop */ }
      }
    });
    initRailIO();
    buildSpine(true);
  }

  /* ============ 起動 ============ */
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }
})();
