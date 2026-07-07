/* ============================================================
   sections.js — セクション別演出エンジン
   createRadar / createIso / createDashboard / createTerminal / createCitation
   すべて { start, stop, resize, setProgress?, renderStatic? } を返す。
   rAF は可視中のみ回す（main.js が IntersectionObserver で制御）。
   ============================================================ */
(function () {
  'use strict';

  var EN = '"Space Grotesk", sans-serif';
  var JP = '"Noto Sans JP", sans-serif';

  function setupCanvas(canvas, maxDpr) {
    var dpr = Math.min(window.devicePixelRatio || 1, maxDpr || 2);
    var rect = canvas.getBoundingClientRect();
    var w = Math.max(1, rect.width), h = Math.max(1, rect.height);
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: w, h: h, dpr: dpr };
  }

  /* ============================================================
     PHASE 04 — RADAR（Canvas 2D 掃引レーダー / ダークセクション）
     ============================================================ */
  function createRadar(canvas) {
    var ctx, W, H, R, cx, cy;
    var raf = null, running = false, last = 0;
    var angle = -Math.PI / 2;
    var dots = [];
    var labels = ['MATCH 94%', 'REPLY 38%', 'SCOUT SENT', 'MATCH 88%'];
    var clockEl = document.getElementById('radar-clock');
    var clockT = 0;

    // 候補者ドット（固定シードで散布）
    (function seed() {
      var rand = mulberry(42);
      for (var i = 0; i < 22; i++) {
        dots.push({
          r: 0.22 + rand() * 0.72,
          a: rand() * Math.PI * 2,
          ping: 0,
          label: i % 6 === 0 ? labels[(i / 6) % labels.length | 0] : null
        });
      }
      // リンクペア
      for (var j = 0; j < dots.length - 1; j += 3) dots[j].link = j + 1;
    })();

    function mulberry(a) {
      return function () {
        a |= 0; a = a + 0x6D2B79F5 | 0;
        var t = Math.imul(a ^ a >>> 15, 1 | a);
        t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
        return ((t ^ t >>> 14) >>> 0) / 4294967296;
      };
    }

    function resize() {
      var s = setupCanvas(canvas, 2);
      ctx = s.ctx; W = s.w; H = s.h;
      cx = W / 2; cy = H / 2;
      R = Math.min(W, H) * 0.42;
    }

    function polar(d) {
      return { x: cx + Math.cos(d.a) * d.r * R, y: cy + Math.sin(d.a) * d.r * R };
    }

    function draw(dt, t) {
      ctx.clearRect(0, 0, W, H);

      // 同心円 + 十字 + 目盛
      ctx.strokeStyle = 'rgba(197,212,232,.14)';
      ctx.lineWidth = 1;
      for (var i = 1; i <= 4; i++) {
        ctx.beginPath(); ctx.arc(cx, cy, R * i / 4, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(cx - R, cy); ctx.lineTo(cx + R, cy);
      ctx.moveTo(cx, cy - R); ctx.lineTo(cx, cy + R);
      ctx.stroke();
      for (var d = 0; d < 360; d += 15) {
        var ra = d * Math.PI / 180;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(ra) * (R - 6), cy + Math.sin(ra) * (R - 6));
        ctx.lineTo(cx + Math.cos(ra) * R, cy + Math.sin(ra) * R);
        ctx.stroke();
      }
      // 距離ラベル
      ctx.fillStyle = 'rgba(197,212,232,.3)';
      ctx.font = '500 9px ' + EN;
      ctx.textAlign = 'left';
      for (i = 1; i <= 4; i++) ctx.fillText((i * 25) + 'K', cx + 5, cy - R * i / 4 + 12);

      // 掃引（尾を引くウェッジ）
      angle += dt * 0.0011;
      var segs = 44;
      for (i = 0; i < segs; i++) {
        var aa = angle - i * 0.02;
        var alpha = 0.30 * (1 - i / segs);
        ctx.strokeStyle = 'rgba(91,141,239,' + alpha.toFixed(3) + ')';
        ctx.lineWidth = R * 0.021;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + Math.cos(aa) * R, cy + Math.sin(aa) * R);
        ctx.stroke();
      }
      // 掃引先端ライン
      ctx.strokeStyle = 'rgba(127,166,240,.9)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(angle) * R, cy + Math.sin(angle) * R);
      ctx.stroke();

      // ドット: 掃引通過でピング
      var na = ((angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
      dots.forEach(function (dd) {
        var da = ((dd.a % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        var diff = Math.abs(na - da);
        if (Math.min(diff, Math.PI * 2 - diff) < 0.03) dd.ping = 1;
        dd.ping = Math.max(0, dd.ping - dt * 0.00035);
      });

      // リンク線（両端がピング中）
      dots.forEach(function (dd, idx) {
        if (dd.link == null) return;
        var o = dots[dd.link];
        var k = Math.min(dd.ping, o.ping);
        if (k <= 0.05) return;
        var p1 = polar(dd), p2 = polar(o);
        ctx.strokeStyle = 'rgba(127,166,240,' + (k * 0.55).toFixed(3) + ')';
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.moveTo(p1.x, p1.y); ctx.lineTo(p2.x, p2.y); ctx.stroke();
      });

      // ドット本体 + ピング波紋 + ラベル
      dots.forEach(function (dd) {
        var p = polar(dd);
        var base = 0.25 + dd.ping * 0.75;
        ctx.fillStyle = 'rgba(185,201,228,' + base.toFixed(3) + ')';
        ctx.beginPath(); ctx.arc(p.x, p.y, 2.4 + dd.ping * 1.6, 0, Math.PI * 2); ctx.fill();
        if (dd.ping > 0.01) {
          var rr = (1 - dd.ping) * 26 + 4;
          ctx.strokeStyle = 'rgba(91,141,239,' + (dd.ping * 0.8).toFixed(3) + ')';
          ctx.lineWidth = 1.2;
          ctx.beginPath(); ctx.arc(p.x, p.y, rr, 0, Math.PI * 2); ctx.stroke();
        }
        if (dd.label && dd.ping > 0.35) {
          ctx.fillStyle = 'rgba(127,166,240,' + dd.ping.toFixed(3) + ')';
          ctx.font = '500 9.5px ' + EN;
          ctx.fillText(dd.label, p.x + 9, p.y - 8);
          ctx.strokeStyle = 'rgba(127,166,240,' + (dd.ping * 0.5).toFixed(3) + ')';
          ctx.beginPath(); ctx.moveTo(p.x + 4, p.y - 4); ctx.lineTo(p.x + 8, p.y - 8); ctx.stroke();
        }
      });

      // 中心
      ctx.fillStyle = 'rgba(231,237,247,.9)';
      ctx.beginPath(); ctx.arc(cx, cy, 3, 0, Math.PI * 2); ctx.fill();

      // 時計
      if (clockEl) {
        clockT += dt;
        if (clockT > 500) {
          clockT = 0;
          var now = new Date();
          clockEl.textContent =
            String(now.getHours()).padStart(2, '0') + ':' +
            String(now.getMinutes()).padStart(2, '0') + ':' +
            String(now.getSeconds()).padStart(2, '0');
        }
      }
    }

    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(50, t - last || 16);
      last = t;
      draw(dt, t);
    }

    return {
      resize: resize,
      start: function () { if (running) return; running = true; last = 0; raf = requestAnimationFrame(frame); },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = null; },
      renderStatic: function () {
        resize();
        dots.forEach(function (d, i) { d.ping = i % 2 ? 0.6 : 0.2; });
        draw(16, 0);
      }
    };
  }

  /* ============================================================
     PHASE 06 — ISOMETRIC DIORAMA（three.js 実3Dジオラマ都市）
     建設 / 運送 / 介護 / 警備 の4ミニ世界を1シーンに構築。
     スクロールで下から順に組み上がり、業界ごとに「主役化」する。
     ラベルは canvas 文字描画を廃止し、HTMLチップ（.iso-chip）+
     world→screen 射影のコネクタ線（.iso-links）で接続する。
     three.js 未読込 / WebGL不可時は Canvas 2D の静的フォールバック。
     interface: { start, stop, resize, setProgress, setFocus, renderStatic }
     ============================================================ */
  function createIso(canvas) {
    var stage = canvas.parentElement || canvas;
    var chips = Array.prototype.slice.call(stage.querySelectorAll('.iso-chip'));
    var linkSvg = stage.querySelector('.iso-links');

    if (typeof THREE === 'undefined') return createIsoFallback(canvas, stage, chips, linkSvg);

    var VW = Math.max(window.innerWidth || 0, document.documentElement.clientWidth || 0);
    var lite = VW > 0 && VW < 821;

    var renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas, alpha: true,
        antialias: !lite, powerPreference: 'high-performance'
      });
    } catch (e) {
      return createIsoFallback(canvas, stage, chips, linkSvg);
    }
    renderer.setClearColor(0x000000, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, lite ? 1.5 : 2));
    if (!lite) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    /* ---- パレット（氷青の面 / 白 / インクのエッジ / accentは点のみ） ---- */
    var C = {
      white: 0xF4F8FC, face: 0xDDE7F3, mid: 0xCBD9EA, deep: 0xB9CBE1,
      steel: 0x8FA6C6, glass: 0xAFC6E2, road: 0xAFBFD6, dark: 0x4A5A76,
      leaf: 0x9FBFAF, leaf2: 0x8CB29E, trunk: 0x8B9DBA, lawn: 0xCCDCD0,
      ink: 0x2A3850, accent: 0x2563EB
    };
    var DIM = new THREE.Color(0xE6ECF4);

    var scene = new THREE.Scene();

    /* ---- ライティング：Hemisphere + Directional（PCFSoftの柔影） ---- */
    scene.add(new THREE.HemisphereLight(0xFFFFFF, 0xC5D4E8, 0.8));
    var sun = new THREE.DirectionalLight(0xFFFFFF, 0.62);
    sun.position.set(90, 150, 55);
    if (!lite) {
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -185;
      sun.shadow.camera.right = 185;
      sun.shadow.camera.top = 150;
      sun.shadow.camera.bottom = -110;
      sun.shadow.camera.near = 20;
      sun.shadow.camera.far = 460;
      sun.shadow.bias = -0.0004;
    }
    scene.add(sun);

    /* ---- 地面：薄グラデ + 方眼（設計図の世界観を継続） ---- */
    var groundMat = null;
    (function buildGround() {
      var tw = 1024, th = 640;
      var cnv = document.createElement('canvas');
      cnv.width = tw; cnv.height = th;
      var g = cnv.getContext('2d');
      if (!g) return;
      g.fillStyle = 'rgba(255,255,255,.6)';
      g.fillRect(0, 0, tw, th);
      var i;
      g.lineWidth = 1;
      g.strokeStyle = 'rgba(151,172,203,.5)';
      for (i = 0; i <= tw; i += 26) { g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, th); g.stroke(); }
      for (i = 0; i <= th; i += 26) { g.beginPath(); g.moveTo(0, i + 0.5); g.lineTo(tw, i + 0.5); g.stroke(); }
      g.strokeStyle = 'rgba(151,172,203,.8)';
      for (i = 0; i <= tw; i += 104) { g.beginPath(); g.moveTo(i + 0.5, 0); g.lineTo(i + 0.5, th); g.stroke(); }
      for (i = 0; i <= th; i += 104) { g.beginPath(); g.moveTo(0, i + 0.5); g.lineTo(tw, i + 0.5); g.stroke(); }
      var rad = g.createRadialGradient(tw / 2, th / 2, 40, tw / 2, th / 2, tw * 0.52);
      rad.addColorStop(0, 'rgba(255,255,255,1)');
      rad.addColorStop(0.6, 'rgba(255,255,255,.85)');
      rad.addColorStop(1, 'rgba(255,255,255,0)');
      g.globalCompositeOperation = 'destination-in';
      g.fillStyle = rad;
      g.fillRect(0, 0, tw, th);
      var tex = new THREE.CanvasTexture(cnv);
      tex.anisotropy = 4;
      groundMat = new THREE.MeshLambertMaterial({ map: tex, transparent: true, opacity: 0, depthWrite: false });
      var ground = new THREE.Mesh(new THREE.PlaneGeometry(480, 300), groundMat);
      ground.rotation.x = -Math.PI / 2;
      ground.position.y = -0.4;
      if (!lite) ground.receiveShadow = true;
      scene.add(ground);
    })();

    /* ---- 正投影アイソメカメラ（主役化で緩いパン + ドリー） ---- */
    var ISO_DIR = new THREE.Vector3(1, 0.85, 1).normalize();
    var UAX = new THREE.Vector3(1, 0, -1).normalize();   // 画面横方向の地面軸
    var VAX = new THREE.Vector3(1, 0, 1).normalize();    // 画面手前方向の地面軸
    var SPOTS = [-114, -38, 38, 114];
    var camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 30, 720);
    var lookCur = new THREE.Vector3(0, 15, 0);
    var lookTgt = lookCur.clone();
    var zoomCur = 1, zoomTgt = 1;

    function placeCamera(hard) {
      if (hard) {
        lookCur.copy(lookTgt);
        zoomCur = zoomTgt;
      } else {
        lookCur.lerp(lookTgt, 0.06);
        zoomCur += (zoomTgt - zoomCur) * 0.06;
      }
      camera.position.copy(lookCur).addScaledVector(ISO_DIR, 300);
      camera.lookAt(lookCur.x, lookCur.y, lookCur.z);
      if (Math.abs(camera.zoom - zoomCur) > 0.0005) {
        camera.zoom = zoomCur;
        camera.updateProjectionMatrix();
      }
    }

    /* ---- ジオラマ機構：素材追跡（dim用）+ パーツ順序（組み上げ用） ---- */
    var dios = [];
    var anims = [];

    function makeDio(i) {
      var g = new THREE.Group();
      g.position.copy(UAX).multiplyScalar(SPOTS[i]);
      scene.add(g);
      var dio = {
        idx: i, group: g, parts: [], maxOrder: 1,
        built: 0, chipOn: false, dim: 0, dimApplied: -1,
        mats: [], fx: [], cache: {},
        edgeMat: new THREE.LineBasicMaterial({ color: C.ink, transparent: true, opacity: 0.42 })
      };
      dios.push(dio);
      return dio;
    }
    function mat(dio, hex) {
      if (dio.cache[hex]) return dio.cache[hex];
      var m = new THREE.MeshLambertMaterial({ color: hex });
      dio.cache[hex] = m;
      dio.mats.push({ m: m, base: new THREE.Color(hex) });
      return m;
    }
    function glow(dio, hex, op) {
      var m = new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op, depthWrite: false });
      m.userData.dimK = 1;
      dio.fx.push(m);
      return m;
    }
    function box(dio, w, h, d, hex, opt) {
      opt = opt || {};
      var geo = new THREE.BoxGeometry(w, h, d);
      geo.translate(0, h / 2, 0); // 原点=底面中心（上へ伸びる）
      var mesh = new THREE.Mesh(geo, opt.mat || mat(dio, hex));
      if (!lite) {
        mesh.castShadow = opt.shadow !== false;
        mesh.receiveShadow = true;
        if (opt.edges) {
          mesh.add(new THREE.LineSegments(new THREE.EdgesGeometry(geo, 40), dio.edgeMat));
        }
      }
      return mesh;
    }
    function cyl(dio, rT, rB, h, hex, seg) {
      var geo = new THREE.CylinderGeometry(rT, rB, h, seg || 10);
      geo.translate(0, h / 2, 0);
      var mesh = new THREE.Mesh(geo, mat(dio, hex));
      if (!lite) { mesh.castShadow = true; mesh.receiveShadow = true; }
      return mesh;
    }
    function put(parent, obj, x, y, z, ry) {
      obj.position.set(x, y, z);
      if (ry) obj.rotation.y = ry;
      parent.add(obj);
      return obj;
    }
    function part(dio, obj, ord, x, y, z) {
      if (x !== undefined) obj.position.set(x, y || 0, z || 0);
      obj.userData.ord = ord;
      if (ord > dio.maxOrder) dio.maxOrder = ord;
      dio.parts.push(obj);
      dio.group.add(obj);
      return obj;
    }
    function grp(dio, x, z, ord) {
      var g = new THREE.Group();
      return part(dio, g, ord, x, 0, z);
    }
    function roundedBlock(dio, w, h, d, r, hex) {
      var g = new THREE.Group();
      put(g, box(dio, w - 2 * r, h, d, hex, { edges: true }), 0, 0, 0);
      put(g, box(dio, w, h, d - 2 * r, hex), 0, 0, 0);
      var cg = new THREE.CylinderGeometry(r, r, h, 10);
      cg.translate(0, h / 2, 0);
      var m = mat(dio, hex);
      [[w / 2 - r, d / 2 - r], [r - w / 2, d / 2 - r], [w / 2 - r, r - d / 2], [r - w / 2, r - d / 2]]
        .forEach(function (p) {
          var c = new THREE.Mesh(cg, m);
          if (!lite) { c.castShadow = true; c.receiveShadow = true; }
          put(g, c, p[0], 0, p[1]);
        });
      return g;
    }
    function tree(dio, s) {
      var g = new THREE.Group();
      put(g, cyl(dio, 0.45 * s, 0.6 * s, 3 * s, C.trunk, 8), 0, 0, 0);
      var f1 = new THREE.Mesh(new THREE.SphereGeometry(2.6 * s, 10, 8), mat(dio, C.leaf));
      f1.position.y = 4.6 * s;
      var f2 = new THREE.Mesh(new THREE.SphereGeometry(1.7 * s, 8, 6), mat(dio, C.leaf2));
      f2.position.set(1.3 * s, 5.8 * s, 0.7 * s);
      if (!lite) { f1.castShadow = true; f2.castShadow = true; }
      g.add(f1);
      g.add(f2);
      return g;
    }
    function blink(m, rate, ph, base, amp) {
      anims.push(function (t) {
        var sv = Math.sin(t * rate + ph);
        m.opacity = (base + amp * Math.max(0, sv * sv * sv)) * m.userData.dimK;
      });
    }
    function backOut(p) {
      var s = 1.7, u = p - 1;
      return 1 + (s + 1) * u * u * u + s * u * u;
    }
    function sub01(p, a, b) {
      return Math.max(0, Math.min(1, (p - a) / (b - a)));
    }
    function pulse01(x, a, b, c, d) {
      if (x <= a || x >= d) return 0;
      if (x < b) x = (x - a) / (b - a);
      else if (x <= c) x = 1;
      else x = 1 - (x - c) / (d - c);
      return x * x * (3 - 2 * x);
    }

    /* ---- 1) 建設 / CONSTRUCTION：建設中ビル + 稼働タワークレーン ---- */
    function buildConstruction(dio) {
      // 造成パッド
      part(dio, box(dio, 56, 1.1, 46, C.mid, { edges: true, shadow: false }), 0, 0, 0, 0);

      // 竣工済み下層ブロック（バンド窓）
      var block = box(dio, 26, 17, 20, C.face, { edges: true });
      part(dio, block, 1, 7, 1.1, -8);
      if (!lite) {
        put(block, box(dio, 21, 2.5, 0.4, C.glass, { shadow: false }), 0, 4.2, 10.1);
        put(block, box(dio, 21, 2.5, 0.4, C.glass, { shadow: false }), 0, 11, 10.1);
        put(block, box(dio, 0.4, 2.5, 15, C.glass, { shadow: false }), 13.1, 4.2, 0);
        put(block, box(dio, 0.4, 2.5, 15, C.glass, { shadow: false }), 13.1, 11, 0);
      }
      // 床スラブ（白い張り出し）+ 鉄骨むき出しの上層
      part(dio, box(dio, 29, 1.2, 23, C.white, { edges: true }), 2, 7, 18.1, -8);
      var sk1 = grp(dio, 7, -8, 3);
      sk1.position.y = 19.3;
      [[-12.5, -8.5], [0, -8.5], [12.5, -8.5], [-12.5, 8.5], [0, 8.5], [12.5, 8.5]]
        .forEach(function (p) { put(sk1, box(dio, 1.3, 7.4, 1.3, C.steel), p[0], 0, p[1]); });
      part(dio, box(dio, 29, 1.2, 23, C.white, { edges: true }), 4, 7, 26.7, -8);
      var sk2 = grp(dio, 7, -8, 5);
      sk2.position.y = 27.9;
      [[-12.5, -8.5], [-12.5, 8.5], [0, -8.5], [0, 8.5]]
        .forEach(function (p) { put(sk2, box(dio, 1.3, 7, 1.3, C.steel), p[0], 0, p[1]); });
      part(dio, box(dio, 15, 1.1, 23, C.white, { edges: true }), 6, 0, 34.9, -8);

      // 足場 + ブレース（前面）
      var scaf = grp(dio, 7, 3.6, 2);
      scaf.position.y = 1.1;
      var sx;
      for (sx = -13; sx <= 13; sx += (lite ? 13 : 6.5)) {
        put(scaf, box(dio, 0.55, 21, 0.55, C.steel), sx, 0, 0);
        put(scaf, box(dio, 0.55, 21, 0.55, C.steel), sx, 0, 2.6);
      }
      [7, 14, 20.5].forEach(function (ry) {
        put(scaf, box(dio, 27, 0.45, 0.45, C.steel, { shadow: false }), 0, ry, 0);
        put(scaf, box(dio, 27, 0.45, 0.45, C.steel, { shadow: false }), 0, ry, 2.6);
      });
      if (!lite) {
        put(scaf, box(dio, 27, 0.6, 2.4, C.white, { shadow: false }), 0, 7.5, 1.3);
        put(scaf, box(dio, 27, 0.6, 2.4, C.white, { shadow: false }), 0, 14.5, 1.3);
        var brA = put(scaf, box(dio, 0.5, 14.5, 0.5, C.steel, { shadow: false }), -12, 0.5, 1.3);
        brA.rotation.z = -1.05;
        var brB = put(scaf, box(dio, 0.5, 14.5, 0.5, C.steel, { shadow: false }), 12, 0.5, 1.3);
        brB.rotation.z = 1.05;
      }

      // タワークレーン（基部 → マスト → 旋回部）
      var craneX = -17, craneZ = 11, mastH = 40;
      part(dio, box(dio, 8, 1.8, 8, C.deep, { edges: true }), 1, craneX, 1.1, craneZ);
      var mast = grp(dio, craneX, craneZ, 3);
      mast.position.y = 2.9;
      [[-1.5, -1.5], [1.5, -1.5], [-1.5, 1.5], [1.5, 1.5]]
        .forEach(function (p) { put(mast, box(dio, 0.6, mastH, 0.6, C.steel), p[0], 0, p[1]); });
      for (var mr = 1; mr <= (lite ? 3 : 5); mr++) {
        put(mast, box(dio, 3.9, 0.5, 3.9, C.steel, { shadow: false }), 0, mr * (mastH / 6), 0);
      }
      var turn = new THREE.Group();
      part(dio, turn, 5, craneX, 2.9 + mastH, craneZ);
      put(turn, box(dio, 4.2, 3.4, 4.2, C.white, { edges: true }), 0, 0, 0);
      put(turn, box(dio, 3, 1.8, 0.5, C.glass, { shadow: false }), 0, 1, 2.2);
      put(turn, box(dio, 30, 1.1, 1.7, C.steel, { edges: true }), 13, 3.4, 0);   // ジブ
      put(turn, box(dio, 10, 1.2, 2.2, C.steel, { edges: true }), -7, 3.4, 0);   // カウンタージブ
      put(turn, box(dio, 2.6, 4.2, 3.4, C.deep, { edges: true }), -11, 0.8, 0);  // カウンターウェイト
      put(turn, box(dio, 1, 6, 1, C.steel), 0, 4.5, 0);                          // 頂部ポスト
      var tie1 = put(turn, box(dio, 0.28, 27.7, 0.28, C.steel, { shadow: false }), 0, 10.2, 0);
      tie1.rotation.z = -1.78;
      var tie2 = put(turn, box(dio, 0.28, 12.4, 0.28, C.steel, { shadow: false }), 0, 10.2, 0);
      tie2.rotation.z = 2.05;
      // トロリー + ケーブル + フック（accent）
      var trolley = put(turn, box(dio, 1.7, 0.8, 1.7, C.dark), 14, 2.5, 0);
      var cableGeo = new THREE.BoxGeometry(0.16, 1, 0.16);
      cableGeo.translate(0, -0.5, 0);
      var cable = new THREE.Mesh(cableGeo, mat(dio, C.dark));
      put(trolley, cable, 0, 0.2, 0);
      var hookG = new THREE.Group();
      trolley.add(hookG);
      put(hookG, box(dio, 1.7, 1.9, 1.7, C.accent, { shadow: false }), -0.85, 0, 0);
      // 点滅する赤色灯ポジション（accent発光）
      var beaconM = glow(dio, C.accent, 1);
      var beacon = new THREE.Mesh(new THREE.SphereGeometry(0.95, 10, 8), beaconM);
      put(turn, beacon, 0, 10.9, 0);
      blink(beaconM, 0.0042, 0, 0.16, 0.84);

      // 資材パレット + 現場事務所
      var pal = grp(dio, 21, 16, 2);
      put(pal, box(dio, 5, 0.9, 5, C.deep), 0, 0, 0);
      put(pal, box(dio, 3.7, 2.7, 3.7, C.face, { edges: true }), 0, 0.9, 0, 0.28);
      put(pal, box(dio, 4.4, 2.2, 4.4, C.white, { edges: true }), -6.5, 0, 1.5, -0.2);
      put(pal, box(dio, 3.2, 1.6, 3.2, C.face, { edges: true }), -5.8, 2.2, 1.8, 0.5);
      var hut = grp(dio, 22, -14, 2);
      hut.position.y = 1.1;
      put(hut, box(dio, 7.5, 5, 5.5, C.white, { edges: true }), 0, 0, 0);
      put(hut, box(dio, 8.3, 0.6, 6.3, C.mid, { edges: true }), 0, 5, 0);

      // クレーン稼働：ゆっくり旋回 / トロリー往復 / フック上下
      anims.push(function (t) {
        turn.rotation.y = Math.sin(t * 0.00019) * 0.9 - 0.35;
        trolley.position.x = 15 + Math.sin(t * 0.00013 + 1) * 8;
        var len = 14 + Math.sin(t * 0.00017 + 2) * 7;
        cable.scale.y = len;
        hookG.position.y = 0.2 - len;
      });
    }

    /* ---- 2) 運送 / LOGISTICS：配送センター + 周回トラック ---- */
    function buildLogistics(dio) {
      part(dio, box(dio, 60, 1, 40, C.mid, { edges: true, shadow: false }), 0, -2, 0, -6);
      // 道路 + 破線の路面標示
      part(dio, box(dio, 68, 0.9, 13, C.road, { shadow: false }), 0, 0, 0, 19);
      var dashes = grp(dio, 0, 19, 1);
      for (var di = -3; di <= 3; di++) {
        put(dashes, box(dio, 3.4, 0.22, 0.7, C.white, { shadow: false }), di * 9, 0.9, 0);
      }
      // 配送センター（搬入口シャッター×2 + accentロゴライン）
      var depot = box(dio, 40, 15, 22, C.face, { edges: true });
      part(dio, depot, 2, -6, 1, -7);
      [-9, 3].forEach(function (sxx) {
        var door = put(depot, box(dio, 9, 10, 0.5, C.deep), sxx, 0, 11.1);
        if (!lite) {
          for (var sl = 1; sl <= 4; sl++) {
            put(door, box(dio, 8.2, 0.34, 0.22, C.steel, { shadow: false }), 0, sl * 2, 0.3);
          }
        }
      });
      if (!lite) put(depot, box(dio, 0.4, 2.4, 16, C.glass, { shadow: false }), 20.1, 9, 0);
      put(depot, box(dio, 12, 1, 0.35, C.accent, { shadow: false }), 12, 12.2, 11.1);
      part(dio, box(dio, 42, 1.2, 24, C.white, { edges: true }), 3, -6, 16, -7);
      var roofu = grp(dio, -6, -7, 4);
      roofu.position.y = 17.2;
      put(roofu, box(dio, 4, 2.2, 4, C.mid, { edges: true }), -12, 0, -4);
      put(roofu, box(dio, 3, 1.8, 3, C.mid, { edges: true }), -5, 0, 5);
      // ドックプラットフォーム + 荷物の山
      part(dio, box(dio, 24, 2.2, 5, C.deep, { edges: true }), 2, -3, 1, 7.5);
      var cargo = grp(dio, 17, 5, 4);
      put(cargo, box(dio, 4.4, 3.2, 4.4, C.white, { edges: true }), 0, 0, 0, 0.15);
      put(cargo, box(dio, 3.6, 2.6, 3.6, C.face, { edges: true }), 0.8, 3.2, 0.4, -0.2);
      put(cargo, box(dio, 3.8, 2.8, 3.8, C.face, { edges: true }), 5, 0, 1.2, 0.4);
      put(cargo, box(dio, 3, 2.2, 3, C.white, { edges: true }), -4.5, 0, 2, -0.3);
      // 小さなフォークリフト（ドック前をシャトル走行）
      var fork = new THREE.Group();
      part(dio, fork, 5, 8, 1, 12.5);
      fork.rotation.y = Math.PI / 2;
      put(fork, box(dio, 2.7, 2.5, 4.2, C.face, { edges: true }), 0, 0.9, -0.6);
      put(fork, box(dio, 2.3, 0.5, 2, C.white, { shadow: false }), 0, 3.9, -1.3);
      put(fork, box(dio, 2.2, 4.4, 0.5, C.steel), 0, 0.4, 1.6);
      put(fork, box(dio, 1.8, 0.3, 2, C.dark, { shadow: false }), 0, 0.75, 2.6);
      [[-1.5, -1.6], [1.5, -1.6], [-1.5, 0.9], [1.5, 0.9]].forEach(function (p) {
        var wg = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 8);
        wg.rotateZ(Math.PI / 2);
        put(fork, new THREE.Mesh(wg, mat(dio, C.dark)), p[0], 0.55, p[1]);
      });
      anims.push(function (t) {
        fork.position.x = 8 + Math.sin(t * 0.00045) * 6.5;
      });
      // トラック（センターを周回 / 車輪回転 + サスの揺れ）
      var truck = new THREE.Group();
      part(dio, truck, 5);
      put(truck, box(dio, 4.6, 1.1, 13.5, C.dark, { shadow: false }), 0, 0.9, 0);
      var cargoBox = put(truck, box(dio, 5, 5.4, 8.8, C.white, { edges: true }), 0, 2, -1.8);
      put(cargoBox, box(dio, 0.24, 0.9, 7.6, C.accent, { shadow: false }), 2.55, 1.4, 0);
      var cab = put(truck, box(dio, 4.6, 4.2, 3, C.face, { edges: true }), 0, 2, 4.6);
      put(cab, box(dio, 4.2, 1.6, 0.4, C.glass, { shadow: false }), 0, 2.1, 1.4);
      var wheels = [];
      [[-2.15, 4.4], [2.15, 4.4], [-2.15, -0.6], [2.15, -0.6], [-2.15, -3.4], [2.15, -3.4]]
        .forEach(function (p, wi) {
          if (lite && wi > 3) return;
          var wg = new THREE.CylinderGeometry(1.05, 1.05, 0.8, 10);
          wg.rotateZ(Math.PI / 2);
          var wm = new THREE.Mesh(wg, mat(dio, C.dark));
          if (!lite) wm.castShadow = true;
          put(truck, wm, p[0], 1.05, p[1]);
          wheels.push(wm);
        });
      // 周回路（角丸矩形パス：直線×4 + 1/4円弧×4）
      var HW = 26, HD = 21, RR = 6, CXO = -4, CZO = -1;
      var SX = HW - RR, SZ = HD - RR, QC = Math.PI * RR / 2;
      var segs = [
        { len: SX * 2, at: function (u, o) { o.x = -SX + u * SX * 2; o.z = HD; o.h = Math.PI / 2; } },
        { len: QC, at: function (u, o) { var a = u * Math.PI / 2; o.x = SX + Math.sin(a) * RR; o.z = SZ + Math.cos(a) * RR; o.h = Math.atan2(Math.cos(a), -Math.sin(a)); } },
        { len: SZ * 2, at: function (u, o) { o.x = HW; o.z = SZ - u * SZ * 2; o.h = Math.PI; } },
        { len: QC, at: function (u, o) { var a = u * Math.PI / 2; o.x = SX + Math.cos(a) * RR; o.z = -SZ - Math.sin(a) * RR; o.h = Math.atan2(-Math.sin(a), -Math.cos(a)); } },
        { len: SX * 2, at: function (u, o) { o.x = SX - u * SX * 2; o.z = -HD; o.h = -Math.PI / 2; } },
        { len: QC, at: function (u, o) { var a = u * Math.PI / 2; o.x = -SX - Math.sin(a) * RR; o.z = -SZ - Math.cos(a) * RR; o.h = Math.atan2(-Math.cos(a), Math.sin(a)); } },
        { len: SZ * 2, at: function (u, o) { o.x = -HW; o.z = -SZ + u * SZ * 2; o.h = 0; } },
        { len: QC, at: function (u, o) { var a = u * Math.PI / 2; o.x = -SX - Math.cos(a) * RR; o.z = SZ + Math.sin(a) * RR; o.h = a; } }
      ];
      var per = 0;
      segs.forEach(function (sg) { per += sg.len; });
      var tp = { x: 0, z: 0, h: 0 };
      var trkS = per * 0.12;
      anims.push(function (t, dt) {
        trkS = (trkS + dt * 0.011) % per;
        var sv = trkS;
        for (var si = 0; si < segs.length; si++) {
          if (sv <= segs[si].len) { segs[si].at(sv / segs[si].len, tp); break; }
          sv -= segs[si].len;
        }
        truck.position.set(CXO + tp.x, 1.02 + Math.sin(t * 0.009) * 0.13, CZO + tp.z);
        truck.rotation.y = tp.h;
        var spin = dt * 0.011 / 1.05;
        for (var wi = 0; wi < wheels.length; wi++) wheels[wi].rotation.x += spin;
      });
    }

    /* ---- 3) 介護 / CARE：角丸の施設棟 + 中庭 + ケアハロー ---- */
    function buildCare(dio) {
      part(dio, box(dio, 54, 1, 44, C.mid, { edges: true, shadow: false }), 0, 0, 0, 0);
      part(dio, box(dio, 22, 0.5, 16, C.lawn, { shadow: false }), 1, 13, 1, 3);
      // 角丸の施設棟（1F + 2F + 屋上スラブ）
      var b1 = roundedBlock(dio, 30, 13, 20, 3.5, C.face);
      part(dio, b1, 1, -8, 1, -8);
      var b2 = roundedBlock(dio, 22, 10, 16, 3.5, C.white);
      part(dio, b2, 2, -8, 14, -8);
      part(dio, roundedBlock(dio, 23.5, 1.2, 17.5, 4, C.mid), 3, -8, 24, -8);
      if (!lite) {
        put(b1, box(dio, 18, 2.4, 0.4, C.glass, { shadow: false }), 0, 3.6, 10.1);
        put(b1, box(dio, 0.4, 2.4, 12, C.glass, { shadow: false }), 15.1, 3.6, 0);
        put(b2, box(dio, 12, 2.2, 0.4, C.glass, { shadow: false }), 0, 3.2, 8.1);
      }
      // 青十字サイン（accent）
      var sign = new THREE.Group();
      part(dio, sign, 3, -8, 16.5, 0.6);
      put(sign, box(dio, 6, 6, 0.5, C.white, { edges: true }), 0, 0, 0);
      put(sign, box(dio, 1.5, 4.6, 0.45, C.accent, { shadow: false }), 0, 0.7, 0.15);
      put(sign, box(dio, 4.6, 1.5, 0.45, C.accent, { shadow: false }), 0, 2.25, 0.15);
      // エントランス庇 + 小道
      var ent = grp(dio, -8, 2, 2);
      ent.position.y = 1;
      put(ent, box(dio, 9, 0.8, 5.5, C.white, { edges: true }), 0, 5.2, 2.75);
      put(ent, cyl(dio, 0.3, 0.3, 5.2, C.steel, 8), -3.6, 0, 4.6);
      put(ent, cyl(dio, 0.3, 0.3, 5.2, C.steel, 8), 3.6, 0, 4.6);
      part(dio, box(dio, 4.5, 0.3, 13, C.deep, { shadow: false }), 1, -8, 1, 13.5);
      part(dio, box(dio, 12, 0.3, 4, C.deep, { shadow: false }), 2, 2, 1, 12);
      // 中庭の樹木（球 + 円柱の様式化）+ ベンチ
      part(dio, tree(dio, 1.15), 2, 14, 1.5, 1);
      part(dio, tree(dio, 0.85), 3, 19.5, 1.5, -5);
      part(dio, tree(dio, 0.65), 4, 10.5, 1.5, 8.5);
      var bench = grp(dio, 16.5, 9, 4);
      bench.position.y = 1;
      bench.rotation.y = 0.5;
      put(bench, box(dio, 4.6, 0.5, 1.7, C.white), 0, 1.1, 0);
      put(bench, box(dio, 0.5, 1.1, 1.5, C.steel), -1.8, 0, 0);
      put(bench, box(dio, 0.5, 1.1, 1.5, C.steel), 1.8, 0, 0);
      // ケアハロー（屋上で淡く明滅 + 微浮遊）
      var haloM = glow(dio, C.accent, 0.3);
      var halo = new THREE.Mesh(new THREE.TorusGeometry(5.5, 0.3, 8, 40), haloM);
      halo.rotation.x = Math.PI / 2;
      var haloG = new THREE.Group();
      haloG.add(halo);
      part(dio, haloG, 4, -8, 28.5, -8);
      anims.push(function (t) {
        haloG.position.y = 28.5 + Math.sin(t * 0.0011) * 0.9;
        haloM.opacity = (0.16 + 0.17 * (Math.sin(t * 0.0016) * 0.5 + 0.5)) * haloM.userData.dimK;
      });
    }

    /* ---- 4) 警備 / SECURITY：監視塔 + サーチライト + フェンス ---- */
    function buildSecurity(dio) {
      part(dio, box(dio, 52, 1, 42, C.mid, { edges: true, shadow: false }), 0, 0, 0, 0);
      var tx = -10, tz = -6;
      // 監視塔（基部 → シャフト + 支持脚 → キャビン）
      part(dio, box(dio, 11, 2, 11, C.deep, { edges: true }), 1, tx, 1, tz);
      var shaft = grp(dio, tx, tz, 2);
      shaft.position.y = 3;
      put(shaft, box(dio, 5.5, 24, 5.5, C.face, { edges: true }), 0, 0, 0);
      [[4.4, 4.4], [-4.4, 4.4], [4.4, -4.4], [-4.4, -4.4]].forEach(function (p) {
        var leg = put(shaft, box(dio, 0.8, 19, 0.8, C.steel), p[0], 0, p[1]);
        leg.rotation.z = p[0] > 0 ? 0.15 : -0.15;
        leg.rotation.x = p[1] > 0 ? -0.15 : 0.15;
      });
      var cab = grp(dio, tx, tz, 3);
      cab.position.y = 27;
      put(cab, box(dio, 10, 4.6, 10, C.white, { edges: true }), 0, 0, 0);
      put(cab, box(dio, 10.5, 1.9, 10.5, C.glass, { shadow: false }), 0, 1.7, 0);
      put(cab, box(dio, 11.6, 0.9, 11.6, C.mid, { edges: true }), 0, 4.6, 0);
      if (!lite) {
        [[5.7, 5.7], [-5.7, 5.7], [5.7, -5.7], [-5.7, -5.7]].forEach(function (p) {
          put(cab, box(dio, 0.24, 1.2, 0.24, C.steel, { shadow: false }), p[0], 5.5, p[1]);
        });
        put(cab, box(dio, 11.6, 0.22, 0.22, C.steel, { shadow: false }), 0, 6.5, 5.7);
        put(cab, box(dio, 11.6, 0.22, 0.22, C.steel, { shadow: false }), 0, 6.5, -5.7);
        put(cab, box(dio, 0.22, 0.22, 11.6, C.steel, { shadow: false }), 5.7, 6.5, 0);
        put(cab, box(dio, 0.22, 0.22, 11.6, C.steel, { shadow: false }), -5.7, 6.5, 0);
      }
      // サーチライト（旋回する半透明の光錐）
      var head = new THREE.Group();
      cab.add(head);
      head.position.y = 5.5;
      put(head, cyl(dio, 0.55, 0.7, 1.8, C.steel, 8), 0, 0, 0);
      var lampM = glow(dio, C.accent, 0.8);
      var lamp = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 1.7), lampM);
      lamp.position.y = 2.4;
      head.add(lamp);
      var coneM = glow(dio, C.accent, 0.09);
      coneM.side = THREE.DoubleSide;
      var coneGeo = new THREE.ConeGeometry(10.5, 40, 20, 1, true);
      coneGeo.translate(0, -20, 0);
      var cone = new THREE.Mesh(coneGeo, coneM);
      var tiltG = new THREE.Group();
      tiltG.position.y = 2.4;
      tiltG.rotation.z = 0.62;
      tiltG.add(cone);
      head.add(tiltG);
      anims.push(function (t) {
        head.rotation.y = t * 0.00042;
        coneM.opacity = (0.075 + 0.035 * Math.sin(t * 0.0021)) * coneM.userData.dimK;
        lampM.opacity = (0.55 + 0.3 * Math.sin(t * 0.0021)) * lampM.userData.dimK;
      });
      // 外周フェンス（見える2辺の支柱 + レール）
      var fenceA = grp(dio, 0, 18.5, 1);
      fenceA.position.y = 1;
      for (var fx = -24; fx <= 8; fx += (lite ? 8 : 5.4)) {
        put(fenceA, box(dio, 0.5, 4.6, 0.5, C.steel), fx, 0, 0);
      }
      put(fenceA, box(dio, 33, 0.35, 0.35, C.steel, { shadow: false }), -8, 4.2, 0);
      put(fenceA, box(dio, 33, 0.28, 0.28, C.steel, { shadow: false }), -8, 2.4, 0);
      var fenceB = grp(dio, 23, 0, 1);
      fenceB.position.y = 1;
      for (var fz = -18; fz <= 18; fz += (lite ? 9 : 6)) {
        put(fenceB, box(dio, 0.5, 4.6, 0.5, C.steel), 0, 0, fz);
      }
      put(fenceB, box(dio, 0.35, 0.35, 37, C.steel, { shadow: false }), 0, 4.2, 0);
      put(fenceB, box(dio, 0.28, 0.28, 37, C.steel, { shadow: false }), 0, 2.4, 0);
      // ゲート + 開閉バリア（先端accent）
      var gate = grp(dio, 15, 18.5, 2);
      gate.position.y = 1;
      put(gate, box(dio, 1.6, 6.5, 1.6, C.white, { edges: true }), -4.2, 0, 0);
      put(gate, box(dio, 1.6, 6.5, 1.6, C.white, { edges: true }), 4.2, 0, 0);
      put(gate, box(dio, 10, 0.9, 1.2, C.mid, { edges: true }), 0, 6.5, 0);
      var armPivot = new THREE.Group();
      armPivot.position.set(-3.4, 2.7, 1.5);
      gate.add(armPivot);
      var armGeo = new THREE.BoxGeometry(6.6, 0.42, 0.42);
      armGeo.translate(3.3, 0, 0);
      var arm = new THREE.Mesh(armGeo, mat(dio, C.white));
      if (!lite) arm.castShadow = true;
      armPivot.add(arm);
      var tipM = glow(dio, C.accent, 0.9);
      var tip = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.5, 0.5), tipM);
      tip.position.set(6.2, 0, 0);
      arm.add(tip);
      anims.push(function (t) {
        var cyc = (t % 9000) / 9000;
        armPivot.rotation.z = pulse01(cyc, 0.52, 0.62, 0.78, 0.88) * 1.15;
      });
      blink(tipM, 0.006, 0.6, 0.25, 0.75);
      // 警備小屋 + カメラポール（LED点滅=accent）
      var hut = grp(dio, 15, 11, 2);
      hut.position.y = 1;
      put(hut, box(dio, 7, 5.5, 6, C.white, { edges: true }), 0, 0, 0);
      put(hut, box(dio, 5.6, 1.7, 0.4, C.glass, { shadow: false }), 0, 2.7, 3.1);
      put(hut, box(dio, 8, 0.7, 7, C.mid, { edges: true }), 0, 5.5, 0);
      var pole = grp(dio, -21, 13, 3);
      pole.position.y = 1;
      put(pole, cyl(dio, 0.32, 0.45, 12.5, C.steel, 8), 0, 0, 0);
      put(pole, box(dio, 0.4, 0.4, 2.4, C.steel, { shadow: false }), 0, 12, 0.8);
      var camBox = put(pole, box(dio, 1.1, 1, 2.1, C.dark), 0, 11.2, 2.2);
      camBox.rotation.x = 0.3;
      var ledM = glow(dio, C.accent, 1);
      var led = new THREE.Mesh(new THREE.SphereGeometry(0.42, 8, 6), ledM);
      led.position.set(0, 12.9, 0);
      pole.add(led);
      blink(ledM, 0.005, 1.3, 0.14, 0.86);
    }

    /* ---- シーン構築 ---- */
    buildConstruction(makeDio(0));
    buildLogistics(makeDio(1));
    buildCare(makeDio(2));
    buildSecurity(makeDio(3));

    /* ---- 組み上げ進行：下から順に stagger + 軽いオーバーシュート着地 ---- */
    var progress = 0, progressTgt = 0, extDriven = false, staticDone = false;

    function applyProgress() {
      if (groundMat) groundMat.opacity = Math.min(1, progress * 2.6);
      for (var i = 0; i < dios.length; i++) {
        var dio = dios[i];
        var lp = sub01(progress, i * 0.13, i * 0.13 + 0.61);
        dio.built = lp;
        for (var j = 0; j < dio.parts.length; j++) {
          var o = dio.parts[j];
          var t0 = (o.userData.ord / (dio.maxOrder + 1)) * 0.72;
          var s = sub01(lp, t0, t0 + 0.28);
          if (s <= 0.001) { o.visible = false; continue; }
          o.visible = true;
          var e = backOut(s);
          var wxz = Math.min(1, 0.6 + s * 0.7);
          o.scale.set(wxz, Math.max(0.001, e), wxz);
        }
        var on = lp > 0.82;
        if (on !== dio.chipOn) {
          dio.chipOn = on;
          if (chips[i]) chips[i].classList.toggle('on', on);
        }
      }
    }
    function setProgress(p) {
      extDriven = true;
      progressTgt = Math.max(0, Math.min(1, p));
    }

    /* ---- 主役化：カメラの緩いドリー/パン + 非主役の彩度・明度ダウン ---- */
    var focusIdx = -1;

    function setFocus(i) {
      i = (i == null || i < 0 || i >= dios.length) ? -1 : i | 0;
      if (i === focusIdx) return;
      focusIdx = i;
      chips.forEach(function (c, ci) { c.classList.toggle('lit', ci === i); });
      if (i < 0) {
        lookTgt.set(0, 15, 0);
        zoomTgt = 1;
      } else {
        lookTgt.copy(UAX).multiplyScalar(SPOTS[i]);
        lookTgt.y = 15;
        lookTgt.addScaledVector(VAX, 4);
        zoomTgt = lite ? 2.1 : 1.8;
      }
    }
    function updateDim() {
      for (var i = 0; i < dios.length; i++) {
        var dio = dios[i];
        var tgt = (focusIdx === -1 || focusIdx === i) ? 0 : 1;
        dio.dim += (tgt - dio.dim) * 0.07;
        if (Math.abs(dio.dim - dio.dimApplied) < 0.004) continue;
        dio.dimApplied = dio.dim;
        var k = dio.dim * 0.8;
        for (var j = 0; j < dio.mats.length; j++) {
          dio.mats[j].m.color.copy(dio.mats[j].base).lerp(DIM, k);
        }
        dio.edgeMat.opacity = 0.42 * (1 - dio.dim * 0.82);
        for (var f = 0; f < dio.fx.length; f++) {
          dio.fx[f].userData.dimK = 1 - dio.dim * 0.88;
        }
      }
    }

    /* ---- コネクタ線オーバーレイ（world→screen 射影で毎フレーム追従） ---- */
    var linkPaths = [], linkDots = [];
    if (linkSvg) {
      var SVGNS = 'http://www.w3.org/2000/svg';
      chips.forEach(function () {
        var p = document.createElementNS(SVGNS, 'path');
        var c = document.createElementNS(SVGNS, 'circle');
        c.setAttribute('r', '2.6');
        p.style.opacity = '0';
        c.style.opacity = '0';
        linkSvg.appendChild(p);
        linkSvg.appendChild(c);
        linkPaths.push(p);
        linkDots.push(c);
      });
    }
    var ovW = -1, ovH = -1;
    var projV = new THREE.Vector3();

    function updateOverlay() {
      if (!linkSvg || !chips.length) return;
      var sw = stage.clientWidth, sh = stage.clientHeight;
      if (sw < 2 || sh < 2) return;
      if (ovW !== sw || ovH !== sh) {
        ovW = sw; ovH = sh;
        linkSvg.setAttribute('viewBox', '0 0 ' + sw + ' ' + sh);
      }
      var cw = canvas.clientWidth || sw, ch = canvas.clientHeight || sh;
      var stageRect = stage.getBoundingClientRect();
      chips.forEach(function (chip, i) {
        var pathEl = linkPaths[i], dotEl = linkDots[i];
        var dio = dios[i];
        if (!pathEl || !dio) return;
        var on = dio.built > 0.8;
        pathEl.style.opacity = on ? '0.9' : '0';
        dotEl.style.opacity = on ? '0.9' : '0';
        if (!on) return;
        projV.copy(dio.group.position).addScaledVector(VAX, 27);
        projV.y = 0;
        projV.project(camera);
        var ax = (projV.x * 0.5 + 0.5) * cw;
        var ay = (0.5 - projV.y * 0.5) * ch;
        ax = Math.max(10, Math.min(cw - 10, ax));
        ay = Math.max(10, Math.min(ch - 4, ay));
        // チップ座標はステージ基準で算出（offsetParentに依存しない）
        var chipRect = chip.getBoundingClientRect();
        var cx = chipRect.left - stageRect.left + chipRect.width / 2;
        var cyv = chipRect.top - stageRect.top - 3;
        var my = ay + (cyv - ay) * 0.55;
        pathEl.setAttribute('d',
          'M' + ax.toFixed(1) + ' ' + ay.toFixed(1) +
          ' C' + ax.toFixed(1) + ' ' + my.toFixed(1) +
          ' ' + cx.toFixed(1) + ' ' + my.toFixed(1) +
          ' ' + cx.toFixed(1) + ' ' + cyv.toFixed(1));
        dotEl.setAttribute('cx', ax.toFixed(1));
        dotEl.setAttribute('cy', ay.toFixed(1));
        var isLit = focusIdx === i;
        if (pathEl.__lit !== isLit) {
          pathEl.__lit = isLit;
          pathEl.classList.toggle('lit', isLit);
          dotEl.classList.toggle('lit', isLit);
        }
      });
    }

    /* ---- ループ / リサイズ / 静的描画 ---- */
    var raf = null, running = false, last = 0;

    function frame(t) {
      raf = requestAnimationFrame(frame);
      var dt = Math.min(64, (t - last) || 16.7);
      last = t;
      // ScrollTrigger未接続（GSAP CDN失敗等）でも自走で組み上がる
      if (!extDriven && progressTgt < 1) progressTgt = Math.min(1, progressTgt + dt / 2600);
      progress += (progressTgt - progress) * 0.14;
      if (Math.abs(progressTgt - progress) < 0.0008) progress = progressTgt;
      applyProgress();
      for (var i = 0; i < anims.length; i++) anims[i](t, dt);
      updateDim();
      placeCamera(false);
      renderer.render(scene, camera);
      updateOverlay();
    }
    function renderOnce() {
      applyProgress();
      for (var i = 0; i < anims.length; i++) anims[i](2600, 16.7);
      updateDim();
      placeCamera(true);
      renderer.render(scene, camera);
      updateOverlay();
    }
    function resize() {
      var w = Math.max(2, canvas.clientWidth || stage.clientWidth - 2);
      var h = Math.max(2, canvas.clientHeight || Math.round(w * 0.52));
      renderer.setSize(w, h, false);
      var aspect = w / h;
      var halfW = Math.max(150, 77 * aspect);
      var halfH = halfW / aspect;
      camera.left = -halfW;
      camera.right = halfW;
      camera.top = halfH;
      camera.bottom = -halfH;
      camera.updateProjectionMatrix();
      ovW = -1;
      if (staticDone && !running) renderOnce();
    }

    resize();
    applyProgress();

    return {
      resize: resize,
      setProgress: setProgress,
      setFocus: setFocus,
      start: function () {
        if (running) return;
        running = true;
        last = 0;
        raf = requestAnimationFrame(frame);
      },
      stop: function () {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = null;
      },
      renderStatic: function () {
        extDriven = true;
        staticDone = true;
        progress = progressTgt = 1;
        resize();
        renderOnce();
      }
    };
  }

  /* ============================================================
     ISO フォールバック（three.js 不在 / WebGL不可）
     Canvas 2D の簡易静的ジオラマ + HTMLチップ表示
     ============================================================ */
  function createIsoFallback(canvas, stage, chips, linkSvg) {
    var AX = [0.135, 0.38, 0.625, 0.87];
    var COLS = ['#F3F7FC', '#E3EAF5', '#D3DFEF'];
    var STROKE = '#7E93B8';

    function iso(ox, oy, u, x, y, z) {
      return { x: ox + (x - y) * 0.866 * u, y: oy + (x + y) * 0.5 * u - z * u };
    }
    function poly(ctx, pts, fill, stroke) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = 1.1; ctx.stroke(); }
    }
    function block(ctx, ox, oy, u, x0, y0, w, d, h) {
      var A = iso(ox, oy, u, x0, y0 + d, 0), B = iso(ox, oy, u, x0 + w, y0 + d, 0);
      var Cp = iso(ox, oy, u, x0 + w, y0, 0);
      var A2 = iso(ox, oy, u, x0, y0 + d, h), B2 = iso(ox, oy, u, x0 + w, y0 + d, h);
      var C2 = iso(ox, oy, u, x0 + w, y0, h), D2 = iso(ox, oy, u, x0, y0, h);
      poly(ctx, [A, B, B2, A2], COLS[1], STROKE);
      poly(ctx, [B, Cp, C2, B2], COLS[2], STROKE);
      poly(ctx, [A2, B2, C2, D2], COLS[0], STROKE);
    }
    function draw() {
      var s = setupCanvas(canvas, 2);
      var ctx = s.ctx, W = s.w, H = s.h;
      ctx.clearRect(0, 0, W, H);
      // アイソメ方眼
      ctx.strokeStyle = 'rgba(197,212,232,.45)';
      ctx.lineWidth = 1;
      var g;
      for (g = -8; g <= 8; g++) {
        var a1 = iso(W / 2, H * 0.52, W / 1200, g * 70, -560, 0);
        var a2 = iso(W / 2, H * 0.52, W / 1200, g * 70, 560, 0);
        ctx.beginPath(); ctx.moveTo(a1.x, a1.y); ctx.lineTo(a2.x, a2.y); ctx.stroke();
        var b1 = iso(W / 2, H * 0.52, W / 1200, -560, g * 70, 0);
        var b2 = iso(W / 2, H * 0.52, W / 1200, 560, g * 70, 0);
        ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(b2.x, b2.y); ctx.stroke();
      }
      AX.forEach(function (fx, i) {
        var ox = fx * W, oy = H * 0.6, u = W / 1200;
        block(ctx, ox, oy, u, -52, -42, 104, 84, 5);
        if (i === 0) {
          block(ctx, ox, oy, u, -20, -25, 46, 40, 88);
          var mB = iso(ox, oy, u, -38, 20, 5), mT = iso(ox, oy, u, -38, 20, 120);
          var jE = iso(ox, oy, u, 40, 20, 120);
          ctx.strokeStyle = STROKE; ctx.lineWidth = 2;
          ctx.beginPath(); ctx.moveTo(mB.x, mB.y); ctx.lineTo(mT.x, mT.y); ctx.lineTo(jE.x, jE.y); ctx.stroke();
          ctx.fillStyle = '#2563EB';
          ctx.fillRect(jE.x - 3, jE.y, 6, 8);
        } else if (i === 1) {
          block(ctx, ox, oy, u, -40, -30, 66, 46, 46);
          block(ctx, ox, oy, u, 4, 26, 34, 18, 20);
          block(ctx, ox, oy, u, 40, 26, 12, 18, 14);
        } else if (i === 2) {
          block(ctx, ox, oy, u, -34, -28, 60, 44, 40);
          block(ctx, ox, oy, u, -24, -18, 40, 30, 64);
          var c1 = iso(ox, oy, u, 16, -3, 52);
          ctx.fillStyle = '#2563EB';
          ctx.fillRect(c1.x - 2.5 * u, c1.y - 9 * u, 5 * u, 18 * u);
          ctx.fillRect(c1.x - 9 * u, c1.y - 2.5 * u, 18 * u, 5 * u);
        } else {
          block(ctx, ox, oy, u, -14, -14, 28, 28, 16);
          block(ctx, ox, oy, u, -8, -8, 16, 16, 96);
          block(ctx, ox, oy, u, -12, -12, 24, 24, 112);
          var bx = iso(ox, oy, u, 0, 0, 118);
          ctx.fillStyle = '#2563EB';
          ctx.beginPath(); ctx.arc(bx.x, bx.y, 3, 0, Math.PI * 2); ctx.fill();
        }
      });
      // チップ + コネクタ（静的）
      var sw = stage.clientWidth || W, sh = stage.clientHeight || H;
      if (linkSvg) {
        linkSvg.setAttribute('viewBox', '0 0 ' + sw + ' ' + sh);
        linkSvg.innerHTML = '';
      }
      var stageRect = stage.getBoundingClientRect();
      chips.forEach(function (chip, i) {
        chip.classList.add('on');
        if (!linkSvg) return;
        var ax = AX[i] * (canvas.clientWidth || W);
        var ay = (canvas.clientHeight || H) * 0.78;
        var chipRect = chip.getBoundingClientRect();
        var cx = chipRect.left - stageRect.left + chipRect.width / 2;
        var cyv = chipRect.top - stageRect.top - 3;
        var my = ay + (cyv - ay) * 0.55;
        var p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        p.setAttribute('d', 'M' + ax + ' ' + ay + ' C' + ax + ' ' + my + ' ' + cx + ' ' + my + ' ' + cx + ' ' + cyv);
        p.style.opacity = '0.9';
        linkSvg.appendChild(p);
      });
    }
    return {
      resize: draw,
      start: draw,
      stop: function () {},
      setProgress: function () {},
      setFocus: function () {},
      renderStatic: draw
    };
  }

  /* ============================================================
     PHASE 08 — DASHBOARD（自己描画チャート）
     ============================================================ */
  function createDashboard(canvas) {
    var ctx, W, H;
    var raf = null, running = false, start = 0;
    var data = [], bars = [];

    (function seed() {
      var v = 30;
      for (var i = 0; i < 30; i++) {
        v += (Math.sin(i * 1.7) * 6 + (i > 8 ? 3.4 : 0.6)) + (Math.sin(i * 4.3) * 4);
        v = Math.max(14, v);
        data.push(v);
      }
      bars = [0.42, 0.66, 0.5, 0.88, 0.72, 1.0];
    })();

    function resize() {
      var s = setupCanvas(canvas, 2);
      ctx = s.ctx; W = s.w; H = s.h;
    }

    function draw(elapsed) {
      ctx.clearRect(0, 0, W, H);
      var pad = { l: 46, r: 24, t: 26, b: 34 };
      var cw = W - pad.l - pad.r;
      var ch = H - pad.t - pad.b;
      var maxV = Math.max.apply(null, data) * 1.15;

      // ループ進行（4.5s描画 → 1.5s保持）
      var cycle = (elapsed % 6000) / 6000;
      var prog = Math.min(1, cycle / 0.75);
      var pe = 1 - Math.pow(1 - prog, 3);

      // グリッド線 + Y軸ラベル
      ctx.strokeStyle = 'rgba(197,212,232,.5)';
      ctx.fillStyle = 'rgba(26,35,51,.4)';
      ctx.font = '500 9px ' + EN;
      ctx.lineWidth = 1;
      ctx.textAlign = 'right';
      for (var g = 0; g <= 4; g++) {
        var gy = pad.t + ch - ch * g / 4;
        ctx.beginPath(); ctx.moveTo(pad.l, gy); ctx.lineTo(W - pad.r, gy); ctx.stroke();
        ctx.fillText(Math.round(maxV * g / 4), pad.l - 8, gy + 3);
      }
      // X軸ラベル
      ctx.textAlign = 'center';
      for (var xl = 0; xl < 6; xl++) {
        ctx.fillText('W' + String(xl * 6 + 1).padStart(2, '0'),
          pad.l + cw * xl / 5, H - pad.b + 18);
      }

      var n = data.length;
      var drawN = pe * (n - 1);
      var px = function (i) { return pad.l + cw * i / (n - 1); };
      var py = function (v) { return pad.t + ch - (v / maxV) * ch; };

      // エリア塗り
      ctx.beginPath();
      ctx.moveTo(px(0), py(data[0]));
      var i;
      for (i = 1; i <= Math.floor(drawN); i++) ctx.lineTo(px(i), py(data[i]));
      var fi = Math.floor(drawN), ft = drawN - fi;
      var lastX = px(fi), lastY = py(data[fi]);
      if (fi < n - 1) {
        lastX = px(fi) + (px(fi + 1) - px(fi)) * ft;
        lastY = py(data[fi]) + (py(data[fi + 1]) - py(data[fi])) * ft;
        ctx.lineTo(lastX, lastY);
      }
      ctx.lineTo(lastX, pad.t + ch);
      ctx.lineTo(px(0), pad.t + ch);
      ctx.closePath();
      var grad = ctx.createLinearGradient(0, pad.t, 0, pad.t + ch);
      grad.addColorStop(0, 'rgba(37,99,235,.12)');
      grad.addColorStop(1, 'rgba(37,99,235,0)');
      ctx.fillStyle = grad;
      ctx.fill();

      // ライン本体（アクセント）
      ctx.beginPath();
      ctx.moveTo(px(0), py(data[0]));
      for (i = 1; i <= fi; i++) ctx.lineTo(px(i), py(data[i]));
      if (fi < n - 1) ctx.lineTo(lastX, lastY);
      ctx.strokeStyle = '#2563EB';
      ctx.lineWidth = 1.8;
      ctx.stroke();

      // 通過点ドット
      ctx.fillStyle = '#2563EB';
      for (i = 0; i <= fi; i += 4) {
        ctx.beginPath(); ctx.arc(px(i), py(data[i]), 2.2, 0, Math.PI * 2); ctx.fill();
      }
      // 先端カーソル + 値チップ
      ctx.beginPath(); ctx.arc(lastX, lastY, 4, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(37,99,235,.35)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lastX, pad.t); ctx.lineTo(lastX, pad.t + ch); ctx.stroke();
      var val = Math.round(data[Math.min(fi, n - 1)] * 10);
      ctx.fillStyle = '#1A2333';
      ctx.font = '700 11px ' + EN;
      ctx.textAlign = 'left';
      ctx.fillText(val + ' LEADS', Math.min(lastX + 8, W - 80), Math.max(pad.t + 12, lastY - 10));

      // 右下ミニバー（チャネル別）
      var bw = 13, bgap = 8, bx0 = W - pad.r - (bw + bgap) * bars.length;
      var bh = ch * 0.34, by0 = pad.t + ch;
      bars.forEach(function (b, bi) {
        var breath = 1 + Math.sin(elapsed * 0.0012 + bi * 1.3) * 0.05;
        var hgt = bh * b * pe * breath;
        var x = bx0 + bi * (bw + bgap);
        ctx.fillStyle = bi === 3 ? 'rgba(37,99,235,.75)' : 'rgba(197,212,232,.85)';
        ctx.fillRect(x, by0 - hgt, bw, hgt);
        ctx.strokeStyle = 'rgba(126,147,184,.6)';
        ctx.strokeRect(x, by0 - hgt, bw, hgt);
      });
      ctx.fillStyle = 'rgba(26,35,51,.4)';
      ctx.font = '500 8.5px ' + EN;
      ctx.textAlign = 'left';
      ctx.fillText('BY CHANNEL', bx0, by0 - bh - 10);
    }

    function frame(t) {
      raf = requestAnimationFrame(frame);
      if (!start) start = t;
      draw(t - start);
    }

    return {
      resize: resize,
      start: function () { if (running) return; running = true; raf = requestAnimationFrame(frame); },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = null; },
      renderStatic: function () { resize(); draw(4500); }
    };
  }

  /* ============================================================
     PHASE 05 — TERMINAL（自動タイピング + フォーム自動入力ループ）
     ============================================================ */
  function createTerminal(root) {
    var linesEl = document.getElementById('term-lines');
    var counterEl = document.getElementById('sent-counter');
    var ffCompany = document.getElementById('ff-company');
    var ffName = document.getElementById('ff-name');
    var ffMsg = document.getElementById('ff-msg');
    var ffSend = document.getElementById('ff-send');
    var running = false;
    var timers = [];
    var counter = 12480;

    var COMPANIES = ['アルファ工業', 'ベータ物流', 'シグマ建設', 'デルタ商事', 'オメガ製作所', 'イプシロン運輸'];
    var ci = 0;

    var SCRIPT = [
      { t: '$ next sales --channel=form --mode=autopilot', c: 'tl-cmd', d: 700 },
      { t: '> ターゲット抽出中 … 製造業 × 従業員300名以上', c: 'tl-dim', d: 900 },
      { t: '> 1,247社 を抽出 — セグメント確定', c: 'tl-ok', d: 700 },
      { t: '> 各社の事業内容を解析し、文面を生成中 …', c: 'tl-dim', d: 1000 },
      { t: '> 文面生成 完了 [GPT] — 送信キューへ投入', c: 'tl-ok', d: 800 },
      { t: '__SEND__', d: 0 },
      { t: '__SEND__', d: 0 },
      { t: '__SEND__', d: 0 },
      { t: '> 商談化 3件 — カレンダーに自動登録 ✓', c: 'tl-accent', d: 2400 }
    ];

    function wait(ms) {
      return new Promise(function (res) {
        var id = setTimeout(res, ms);
        timers.push(id);
      });
    }
    function clearTimers() {
      timers.forEach(clearTimeout);
      timers = [];
    }

    function addLine(cls) {
      var div = document.createElement('div');
      div.className = 'tl ' + (cls || '');
      linesEl.appendChild(div);
      while (linesEl.children.length > 11) linesEl.removeChild(linesEl.firstChild);
      return div;
    }

    function typeInto(el, text, speed) {
      return new Promise(function (res) {
        var i = 0;
        var caret = document.createElement('i');
        caret.className = 'term-caret';
        el.appendChild(caret);
        function step() {
          if (!running) { res(); return; }
          i += 1 + (Math.random() < 0.3 ? 1 : 0);
          el.textContent = text.slice(0, i);
          if (i < text.length) {
            el.appendChild(caret);
            timers.push(setTimeout(step, speed + Math.random() * speed));
          } else {
            res();
          }
        }
        step();
      });
    }

    function clock() {
      var d = new Date();
      return '[' + String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0') + ']';
    }

    async function sendOne() {
      var name = COMPANIES[ci++ % COMPANIES.length];
      // ターミナル側
      var line = addLine('tl-dim');
      await typeInto(line, clock() + ' 株式会社' + name + ' — フォーム送信中 …', 14);
      // フォーム側の自動入力
      if (ffCompany) {
        ffCompany.textContent = ''; ffName.textContent = ''; ffMsg.textContent = '';
        await typeInto(ffCompany, '株式会社' + name, 26);
        await typeInto(ffName, '採用ご担当者様', 26);
        await typeInto(ffMsg, '貴社の採用業務を拝見し、AIによる自動化のご提案が…', 16);
        if (!running) return;
        ffSend.classList.add('flash');
        ffSend.textContent = '送信完了 ✓';
        await wait(500);
        ffSend.classList.remove('flash');
        ffSend.textContent = '送信する';
      }
      if (!running) return;
      line.className = 'tl tl-ok';
      line.textContent = clock() + ' 株式会社' + name + ' — フォーム送信 ✓';
      counter += 1;
      if (counterEl) counterEl.textContent = counter.toLocaleString('en-US');
      await wait(300);
    }

    async function run() {
      while (running) {
        linesEl.innerHTML = '';
        for (var i = 0; i < SCRIPT.length && running; i++) {
          var s = SCRIPT[i];
          if (s.t === '__SEND__') {
            await sendOne();
            continue;
          }
          var el = addLine(s.c);
          await typeInto(el, s.t, 13);
          if (!running) return;
          await wait(s.d);
        }
        await wait(1200);
      }
    }

    return {
      resize: function () {},
      start: function () {
        if (running) return;
        running = true;
        run();
      },
      stop: function () {
        running = false;
        clearTimers();
      },
      renderStatic: function () {
        linesEl.innerHTML = '';
        SCRIPT.forEach(function (s) {
          if (s.t === '__SEND__') {
            addLine('tl-ok').textContent = '[02:14] 株式会社アルファ工業 — フォーム送信 ✓';
            return;
          }
          addLine(s.c).textContent = s.t;
        });
        if (ffCompany) {
          ffCompany.textContent = '株式会社アルファ工業';
          ffName.textContent = '採用ご担当者様';
          ffMsg.textContent = '貴社の採用業務を拝見し、AIによる自動化のご提案が…';
        }
      }
    };
  }

  /* ============================================================
     PHASE 07 — CITATION（AI回答タイピング + 引用点灯 + 軌道ノード）
     ============================================================ */
  function createCitation(root) {
    var answerEl = document.getElementById('ai-answer');
    var citeEl = document.getElementById('ai-cite');
    var caret = root ? root.querySelector('.ai-caret') : null;
    var nodes = root ? Array.prototype.slice.call(root.querySelectorAll('.orbit-node')) : [];
    var stage = root ? root.querySelector('.cite-stage') || root : null;
    var running = false;
    var raf = null, timers = [];
    var typeState = { i: 0, phase: 0, waitUntil: 0 };

    var ANSWER = 'AI導入から業務自動化までを一気通貫で支援する企業として、株式会社next（n-ext.co.jp）が挙げられます。ツール選定にとどまらず、業務フローの再設計と社内定着まで伴走する点が特徴です。';

    function frame(t) {
      raf = requestAnimationFrame(frame);
      // 軌道回転（2つの楕円軌道）
      var r = root.getBoundingClientRect();
      var cx = r.width / 2, cy = r.height / 2;
      nodes.forEach(function (n, i) {
        var ring = i % 2;
        var speed = ring ? 0.00016 : -0.00012;
        var a = t * speed + i * (Math.PI * 2 / nodes.length) * (ring ? 1.6 : 1);
        var rx = cx * (ring ? 1.06 : 0.88);
        var ry = cy * (ring ? 0.92 : 1.04);
        var x = cx + Math.cos(a) * rx - n.offsetWidth / 2;
        var y = cy + Math.sin(a) * ry - n.offsetHeight / 2;
        var depth = (Math.sin(a) + 1) / 2; // 手前で濃く
        n.style.transform = 'translate(' + x.toFixed(1) + 'px,' + y.toFixed(1) + 'px) scale(' + (0.85 + depth * 0.25).toFixed(3) + ')';
        n.style.opacity = (0.35 + depth * 0.65).toFixed(2);
      });

      // タイピング進行
      if (typeState.phase === 0 && t > typeState.waitUntil) {
        typeState.i += 1;
        answerEl.innerHTML = highlight(ANSWER.slice(0, typeState.i));
        typeState.waitUntil = t + 26 + Math.random() * 34;
        if (typeState.i >= ANSWER.length) {
          answerEl.innerHTML = highlight(ANSWER) + '<span class="cite-mark">&thinsp;[1]</span>';
          citeEl.classList.add('lit');
          if (caret) caret.style.display = 'none';
          typeState.phase = 1;
          typeState.waitUntil = t + 7000;
        }
      } else if (typeState.phase === 1 && t > typeState.waitUntil) {
        typeState = { i: 0, phase: 0, waitUntil: t + 800 };
        citeEl.classList.remove('lit');
        answerEl.textContent = '';
        if (caret) caret.style.display = '';
      }
    }

    function highlight(text) {
      return text
        .replace('株式会社next', '<b>株式会社next</b>')
        .replace('n-ext.co.jp', '<span class="cite-mark">n-ext.co.jp</span>');
    }

    return {
      resize: function () {},
      start: function () {
        if (running) return;
        running = true;
        raf = requestAnimationFrame(frame);
      },
      stop: function () {
        running = false;
        if (raf) cancelAnimationFrame(raf);
        raf = null;
        timers.forEach(clearTimeout); timers = [];
      },
      renderStatic: function () {
        answerEl.innerHTML = highlight(ANSWER) + '<span class="cite-mark">&thinsp;[1]</span>';
        citeEl.classList.add('lit');
        if (caret) caret.style.display = 'none';
        nodes.forEach(function (n, i) {
          var a = i * (Math.PI * 2 / nodes.length);
          var r = root.getBoundingClientRect();
          var x = r.width / 2 + Math.cos(a) * r.width * 0.46 - n.offsetWidth / 2;
          var y = r.height / 2 + Math.sin(a) * r.height * 0.46 - n.offsetHeight / 2;
          n.style.transform = 'translate(' + x + 'px,' + y + 'px)';
        });
      }
    };
  }

  window.NextFX = {
    createRadar: createRadar,
    createIso: createIso,
    createDashboard: createDashboard,
    createTerminal: createTerminal,
    createCitation: createCitation
  };
})();
