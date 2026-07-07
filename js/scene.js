/* ============================================================
   scene.js — 固定WebGL背景（three.js r128）
   極薄青のパーティクル網 + ワイヤーフレームグリッド。
   スクロール進行でカメラがロール/オービット/ドリー/FOVパンチを
   組み合わせて空間を泳ぎ、隊形が 神経網 → 整列グリッド → 「N」収束、
   最終CTAで「N」が左端へ寄り「ext.inc」が画面外から飛来して
   「Next.inc」の粒子タイポグラフィが完成する。
   ============================================================ */
(function () {
  'use strict';

  var NextScene = {
    ready: false,
    init: init,
    setProgress: function (p) { state.targetProgress = clamp01(p); },
    setCTAProgress: function (p) { state.ctaExternal = true; state.ctaTarget = clamp01(p); },
    start: startLoop,
    stop: stopLoop
  };
  window.NextScene = NextScene;

  var ACCENT = { r: 0.145, g: 0.388, b: 0.922 }; // #2563EB

  var state = {
    renderer: null, scene: null, camera: null,
    points: null, lines: null,
    count: 0, nCount: 0,
    current: null,
    neural: null, grid: null, nShape: null,
    extPts: null, extDelay: null, incMask: null, extReady: false,
    baseCol: null,
    phase: null,
    linePairs: [],
    lineGeo: null,
    progress: 0, targetProgress: 0,
    cta: 0, ctaTarget: 0, ctaExternal: false,
    cam: { x: 0, y: 4, z: 62, tx: 0, ty: 2, tz: 16, roll: 0, fov: 58 },
    ctaScaleX: 1,
    raf: null, running: false,
    mouseX: 0, mouseY: 0,
    reduced: false, lite: false,
    colK: -1
  };

  function clamp01(v) { return Math.max(0, Math.min(1, v)); }
  function smooth(a, b, x) {
    var t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  }
  function easeInOut(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
  function backOut(t) {
    var s = 2.2, u = t - 1;
    return 1 + (s + 1) * u * u * u + s * u * u;
  }
  function gauss(x, c, w) {
    var d = (x - c) / w;
    return Math.exp(-d * d * 0.5);
  }

  function init(opts) {
    opts = opts || {};
    if (typeof THREE === 'undefined') return false;
    var canvas = document.getElementById('gl');
    if (!canvas) return false;

    state.reduced = !!opts.reduced;
    state.lite = !!opts.lite;
    state.count = state.lite ? 420 : 950;
    state.nCount = Math.round(state.count * 0.38);

    try {
      state.renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        alpha: true,
        antialias: !state.lite,
        powerPreference: 'high-performance'
      });
    } catch (e) {
      canvas.style.display = 'none';
      return false;
    }
    state.renderer.setClearColor(0x000000, 0);
    state.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, state.lite ? 1.5 : 2));

    state.scene = new THREE.Scene();
    state.scene.fog = new THREE.Fog(0xfafbfc, 50, 190);

    state.camera = new THREE.PerspectiveCamera(58, 1, 0.1, 400);
    state.camera.position.set(0, 4, 62);

    buildFormations();
    buildPoints();
    if (!state.lite) buildLines();
    buildGrids();
    buildExtFormation();
    // Webフォント読込後に ext.inc 隊形を作り直す（字形を正確に）
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(function () { buildExtFormation(); });
    }

    resize();
    window.addEventListener('resize', resize);

    if (!state.lite && !state.reduced) {
      window.addEventListener('mousemove', function (e) {
        state.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
        state.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
      }, { passive: true });
    }

    NextScene.ready = true;

    if (state.reduced) {
      // 静止1フレーム：整列グリッド隊形で描画して終了
      state.progress = state.targetProgress = 0.5;
      applyFormation(0);
      applyCamera();
      state.renderer.render(state.scene, state.camera);
      return true;
    }
    startLoop();
    return true;
  }

  /* ---------- 隊形の生成 ---------- */
  function buildFormations() {
    var n = state.count, nC = state.nCount;
    state.neural = new Float32Array(n * 3);
    state.grid = new Float32Array(n * 3);
    state.nShape = new Float32Array(n * 3);
    state.current = new Float32Array(n * 3);
    state.phase = new Float32Array(n);
    state.extDelay = new Float32Array(n - nC);

    var i, ix;

    // 1) 神経網：球殻+ノイズの有機的クラウド（ヒーロー周辺 z 0〜-60）
    for (i = 0; i < n; i++) {
      ix = i * 3;
      var r = 26 + Math.random() * 26;
      var theta = Math.random() * Math.PI * 2;
      var phi = Math.acos(2 * Math.random() - 1);
      state.neural[ix] = r * Math.sin(phi) * Math.cos(theta) * 1.5;
      state.neural[ix + 1] = r * Math.cos(phi) * 0.75;
      state.neural[ix + 2] = r * Math.sin(phi) * Math.sin(theta) - 26;
      state.phase[i] = Math.random() * Math.PI * 2;
    }

    // 2) 整列グリッド：フラットな格子（中盤 z -20〜-90）
    var cols = Math.ceil(Math.sqrt(n * 1.8));
    var rows = Math.ceil(n / cols);
    for (i = 0; i < n; i++) {
      ix = i * 3;
      var cx = i % cols, cz = Math.floor(i / cols);
      state.grid[ix] = (cx - cols / 2) * 5.2;
      state.grid[ix + 1] = -8;
      state.grid[ix + 2] = -18 - (cz - rows / 2) * 5.2 - 38;
    }

    // 3a) 「N」収束：先頭38%の粒子をNの3ストロークへ（CTA面 z -108）
    var strokes = [
      [-14, -18, -14, 18],   // 左縦
      [-14, 18, 14, -18],    // 対角
      [14, -18, 14, 18]      // 右縦
    ];
    for (i = 0; i < nC; i++) {
      ix = i * 3;
      var s = strokes[i % 3];
      var t = (Math.floor(i / 3) / Math.floor(nC / 3 + 1)) + (Math.random() - 0.5) * 0.02;
      t = Math.max(0, Math.min(1, t));
      state.nShape[ix] = s[0] + (s[2] - s[0]) * t + (Math.random() - 0.5) * 0.9;
      state.nShape[ix + 1] = 24 + s[1] + (s[3] - s[1]) * t + (Math.random() - 0.5) * 0.9;
      state.nShape[ix + 2] = -108 + (Math.random() - 0.5) * 2.5;
    }

    // 3b) 残りの粒子：N形成時は画面外（右・上下）へ退避 → CTA後半で ext.inc へ飛来
    for (i = nC; i < n; i++) {
      ix = i * 3;
      var side = i % 4;
      if (side < 2) {          // 右
        state.nShape[ix] = 100 + Math.random() * 90;
        state.nShape[ix + 1] = -40 + Math.random() * 110;
      } else if (side === 2) { // 上
        state.nShape[ix] = -50 + Math.random() * 150;
        state.nShape[ix + 1] = 85 + Math.random() * 60;
      } else {                 // 下
        state.nShape[ix] = -50 + Math.random() * 150;
        state.nShape[ix + 1] = -55 - Math.random() * 60;
      }
      state.nShape[ix + 2] = -96 - Math.random() * 26;
      state.extDelay[i - nC] = Math.random() * 0.4;
    }

    // 初期位置 = 神経網
    state.current.set(state.neural);
  }

  /* ---------- 「ext.inc」の粒子ターゲット（オフスクリーンcanvasから採取） ---------- */
  function buildExtFormation() {
    try {
      var cw = 560, ch = 160;
      var cnv = document.createElement('canvas');
      cnv.width = cw; cnv.height = ch;
      var c = cnv.getContext('2d', { willReadFrequently: true });
      if (!c) return;
      c.clearRect(0, 0, cw, ch);
      c.fillStyle = '#000';
      c.font = '700 116px "Space Grotesk", Arial, sans-serif';
      c.textBaseline = 'middle';
      c.fillText('ext.inc', 8, 82);
      var extW = c.measureText('ext').width;
      var img = c.getImageData(0, 0, cw, ch).data;

      var pts = [];
      var step = 2;
      for (var y = 0; y < ch; y += step) {
        for (var x = 0; x < cw; x += step) {
          if (img[(y * cw + x) * 4 + 3] > 140) pts.push([x, y]);
        }
      }
      if (pts.length < 60) return;

      var minX = 1e9, maxX = -1e9, minY = 1e9, maxY = -1e9, k;
      for (k = 0; k < pts.length; k++) {
        if (pts[k][0] < minX) minX = pts[k][0];
        if (pts[k][0] > maxX) maxX = pts[k][0];
        if (pts[k][1] < minY) minY = pts[k][1];
        if (pts[k][1] > maxY) maxY = pts[k][1];
      }
      var scale = 86 / Math.max(1, maxX - minX);
      var midX = (minX + maxX) / 2, midY = (minY + maxY) / 2;

      var extN = state.count - state.nCount;
      state.extPts = new Float32Array(extN * 3);
      state.incMask = new Uint8Array(extN);
      for (k = 0; k < extN; k++) {
        var p = pts[Math.floor(k * pts.length / extN) % pts.length];
        state.extPts[k * 3] = 20 + (p[0] - midX) * scale + (Math.random() - 0.5) * 0.7;
        state.extPts[k * 3 + 1] = 22 - (p[1] - midY) * scale + (Math.random() - 0.5) * 0.7;
        state.extPts[k * 3 + 2] = -108 + (Math.random() - 0.5) * 2.2;
        state.incMask[k] = p[0] > 8 + extW + 2 ? 1 : 0; // 「.inc」側
      }
      state.extReady = true;
    } catch (e) { /* canvas不可環境では ext.inc 収束を省略 */ }
  }

  function buildPoints() {
    var n = state.count;
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(state.current, 3));

    var colors = new Float32Array(n * 3);
    var base = new THREE.Color(0x91a9cf);
    var acc = new THREE.Color(0x2563eb);
    for (var i = 0; i < n; i++) {
      var c = Math.random() < 0.05 ? acc : base;
      colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
    }
    state.baseCol = new Float32Array(colors);
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    var mat = new THREE.PointsMaterial({
      size: state.lite ? 1.4 : 1.05,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
      sizeAttenuation: true,
      depthWrite: false
    });
    state.points = new THREE.Points(geo, mat);
    state.scene.add(state.points);
  }

  function buildLines() {
    // 神経網位置で近傍ペアを事前計算（毎フレームは端点コピーのみ）
    var n = state.count, pairs = [], maxPairs = 420, threshold2 = 13 * 13;
    for (var i = 0; i < n && pairs.length < maxPairs; i += 2) {
      for (var j = i + 1; j < Math.min(i + 40, n); j++) {
        var dx = state.neural[i * 3] - state.neural[j * 3];
        var dy = state.neural[i * 3 + 1] - state.neural[j * 3 + 1];
        var dz = state.neural[i * 3 + 2] - state.neural[j * 3 + 2];
        if (dx * dx + dy * dy + dz * dz < threshold2) {
          pairs.push([i, j]);
          if (pairs.length >= maxPairs) break;
        }
      }
    }
    state.linePairs = pairs;
    var linePos = new Float32Array(pairs.length * 6);
    state.lineGeo = new THREE.BufferGeometry();
    state.lineGeo.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    var mat = new THREE.LineBasicMaterial({
      color: 0xa8bcd9, transparent: true, opacity: 0.4, depthWrite: false
    });
    state.lines = new THREE.LineSegments(state.lineGeo, mat);
    state.scene.add(state.lines);
  }

  function buildGrids() {
    var gridB = new THREE.GridHelper(700, 64, 0xc5d4e8, 0xc5d4e8);
    gridB.material.transparent = true;
    gridB.material.opacity = 0.3;
    gridB.material.depthWrite = false;
    gridB.position.y = -34;
    gridB.position.z = -60;
    state.scene.add(gridB);

    var gridT = new THREE.GridHelper(700, 40, 0xc5d4e8, 0xc5d4e8);
    gridT.material.transparent = true;
    gridT.material.opacity = 0.12;
    gridT.material.depthWrite = false;
    gridT.position.y = 46;
    gridT.position.z = -60;
    state.scene.add(gridT);
  }

  /* ---------- 隊形ブレンド ---------- */
  function weights(p) {
    // 0-0.14 神経網 / 0.14-0.4 でグリッドへ / 0.62-0.86 でNへ収束（CTA前に完成）
    var wN = 1 - smooth(0.14, 0.4, p);
    var wG = smooth(0.14, 0.4, p) * (1 - smooth(0.62, 0.86, p));
    var wX = smooth(0.62, 0.86, p);
    var sum = wN + wG + wX || 1;
    return [wN / sum, wG / sum, wX / sum];
  }

  function applyFormation(time) {
    var n = state.count, nC = state.nCount;
    var w = weights(state.progress);
    var pos = state.points.geometry.attributes.position.array;
    var lerpK = state.reduced ? 1 : 0.07;
    var cta = state.cta;

    // 疑似カールノイズ：隊形間の遷移中に振幅が増して「呼吸」する
    var trans = 1 - (w[0] * w[0] + w[1] * w[1] + w[2] * w[2]); // 遷移中ほど大
    var breathe = 0.6 + 0.4 * Math.sin(time * 0.0006);
    var clarity = 1 - smooth(0.5, 0.9, cta) * 0.85;            // 文字収束時は鎮める
    var amp = (0.75 + trans * 3.4) * breathe * clarity * (state.lite ? 0.6 : 1);
    var t1 = time * 0.0011, t2 = time * 0.0009, t3 = time * 0.0007;

    // CTA前半：Nを画面左端側へスライド / 後半：ext.incが飛来
    var shiftX = -48 * easeInOut(clamp01(cta / 0.5));
    var tB = clamp01((cta - 0.5) / 0.5);
    var sx = state.ctaScaleX;

    for (var i = 0; i < n; i++) {
      var ix = i * 3;
      var ph = state.phase[i];
      var fx, fy, fz;

      if (i < nC) {
        fx = (state.nShape[ix] + shiftX) * sx;
        fy = state.nShape[ix + 1];
        fz = state.nShape[ix + 2];
      } else {
        var ei = i - nC, eo = ei * 3;
        var ox = state.nShape[ix], oy = state.nShape[ix + 1], oz = state.nShape[ix + 2];
        var e = 0;
        if (state.extReady && tB > 0) {
          e = backOut(clamp01((tB - state.extDelay[ei]) / 0.6)); // オーバーシュート付き飛来
        }
        if (e > 0) {
          fx = ox + (state.extPts[eo] - ox) * e;
          fy = oy + (state.extPts[eo + 1] - oy) * e;
          fz = oz + (state.extPts[eo + 2] - oz) * e;
        } else {
          fx = ox; fy = oy; fz = oz;
        }
        fx *= sx;
      }

      var tx = state.neural[ix] * w[0] + state.grid[ix] * w[1] + fx * w[2];
      var ty = state.neural[ix + 1] * w[0] + state.grid[ix + 1] * w[1] + fy * w[2];
      var tz = state.neural[ix + 2] * w[0] + state.grid[ix + 2] * w[1] + fz * w[2];

      // 有機的ドリフト（sin/cos合成の疑似カール）
      var n1 = Math.sin(ty * 0.12 + t1 + ph);
      var n2 = Math.cos(tx * 0.10 - t2 + ph * 1.7);
      var n3 = Math.sin((tx + tz) * 0.06 + t3 + ph * 0.6);
      tx += (n1 - n3 * 0.7) * amp;
      ty += (n2 + n3 * 0.5) * amp + Math.sin(state.grid[ix] * 0.12 + time * 0.0013) * 2.2 * w[1];
      tz += (n2 * 0.6 - n1 * 0.4) * amp;

      pos[ix] += (tx - pos[ix]) * lerpK;
      pos[ix + 1] += (ty - pos[ix + 1]) * lerpK;
      pos[ix + 2] += (tz - pos[ix + 2]) * lerpK;
    }
    state.points.geometry.attributes.position.needsUpdate = true;

    // ライン端点の更新
    if (state.lines) {
      var lp = state.lineGeo.attributes.position.array;
      var pairs = state.linePairs;
      for (var k2 = 0; k2 < pairs.length; k2++) {
        var a = pairs[k2][0] * 3, b = pairs[k2][1] * 3, o = k2 * 6;
        lp[o] = pos[a]; lp[o + 1] = pos[a + 1]; lp[o + 2] = pos[a + 2];
        lp[o + 3] = pos[b]; lp[o + 4] = pos[b + 1]; lp[o + 5] = pos[b + 2];
      }
      state.lineGeo.attributes.position.needsUpdate = true;
      state.lines.material.opacity = (0.42 * w[0] + 0.14 * w[1] + 0.05 * w[2]) * (1 - cta);
    }
  }

  /* ---------- 「.inc」の粒子をaccent青へ ---------- */
  function updateColors() {
    if (!state.incMask) return;
    var k = smooth(0.5, 0.9, state.cta);
    if (Math.abs(k - state.colK) < 0.01) return;
    state.colK = k;
    var col = state.points.geometry.attributes.color.array;
    var nC = state.nCount;
    for (var i = nC; i < state.count; i++) {
      var ei = i - nC, ix = i * 3;
      if (!state.incMask[ei]) continue;
      col[ix] = state.baseCol[ix] + (ACCENT.r - state.baseCol[ix]) * k;
      col[ix + 1] = state.baseCol[ix + 1] + (ACCENT.g - state.baseCol[ix + 1]) * k;
      col[ix + 2] = state.baseCol[ix + 2] + (ACCENT.b - state.baseCol[ix + 2]) * k;
    }
    state.points.geometry.attributes.color.needsUpdate = true;
  }

  /* ---------- カメラ：ロール / オービット / ドリー / FOVパンチ ---------- */
  // orbit,roll はラジアン。dolly は注視点との距離オフセット。
  var CAM_KEYS = [
    { p: 0.00, orbit: 0.00, roll: 0.00, dolly: 0, y: 4, fov: 58 },
    { p: 0.10, orbit: -0.32, roll: -0.10, dolly: 6, y: 7, fov: 60 },
    { p: 0.22, orbit: 0.61, roll: 0.20, dolly: -8, y: 2, fov: 53 },
    { p: 0.34, orbit: -0.52, roll: -0.27, dolly: 10, y: 9, fov: 63 },
    { p: 0.47, orbit: 0.96, roll: 0.31, dolly: -6, y: 1, fov: 55 },
    { p: 0.60, orbit: -0.78, roll: -0.36, dolly: 12, y: 10, fov: 64 },
    { p: 0.72, orbit: 0.45, roll: 0.22, dolly: -10, y: 4, fov: 56 },
    { p: 0.84, orbit: -0.20, roll: -0.09, dolly: 4, y: 6, fov: 59 },
    { p: 1.00, orbit: 0.00, roll: 0.00, dolly: -2, y: 5, fov: 58 }
  ];

  function camAt(p) {
    var a = CAM_KEYS[0], b = CAM_KEYS[CAM_KEYS.length - 1];
    for (var i = 0; i < CAM_KEYS.length - 1; i++) {
      if (p >= CAM_KEYS[i].p && p <= CAM_KEYS[i + 1].p) {
        a = CAM_KEYS[i]; b = CAM_KEYS[i + 1];
        break;
      }
    }
    var t = (b.p - a.p) ? clamp01((p - a.p) / (b.p - a.p)) : 0;
    var e = t * t * (3 - 2 * t); // 長い弧のイージング
    return {
      orbit: a.orbit + (b.orbit - a.orbit) * e,
      roll: a.roll + (b.roll - a.roll) * e,
      dolly: a.dolly + (b.dolly - a.dolly) * e,
      y: a.y + (b.y - a.y) * e,
      fov: a.fov + (b.fov - a.fov) * e
    };
  }

  function applyCamera() {
    var p = state.progress;
    var cam = state.camera;
    var cs = state.cam;
    var k = camAt(p);
    var lerpK = state.reduced ? 1 : 0.06;

    var dyn = state.lite ? 0.55 : 1;                 // モバイルは振幅を抑える
    var settle = smooth(0.5, 0.95, state.cta);       // CTAでは静定してタイポを読ませる
    var orbit = k.orbit * dyn * (1 - settle);
    var roll = k.roll * dyn * (1 - settle);

    // FOVパンチ：隊形遷移の瞬間に広角化 → 戻す
    var punch = gauss(p, 0.27, 0.05) + gauss(p, 0.74, 0.05);
    var fov = k.fov + punch * 10 * dyn * (1 - settle);

    var baseZ = 62 - p * 86;                          // 62 → -24
    var tgtX = 0, tgtY = 2 + smooth(0.72, 1, p) * 10, tgtZ = baseZ - 46;
    // CTA静定時は「Next.inc」の重心へ
    tgtX += (-4 * state.ctaScaleX - tgtX) * settle;
    tgtY += (20 - tgtY) * settle;
    tgtZ += (-108 - tgtZ) * settle;

    var dist = 46 + k.dolly * dyn;
    var dx = tgtX + Math.sin(orbit) * dist;
    var dz = tgtZ + Math.cos(orbit) * dist;
    var dy = k.y;
    dx += (0 - dx) * settle;
    dy += (10 - dy) * settle;
    dz += (-24 - dz) * settle;

    // マウスパララックス（従来比1.5倍）
    dx += state.mouseX * 3.6;
    dy -= state.mouseY * 2.4;

    cs.x += (dx - cs.x) * lerpK;
    cs.y += (dy - cs.y) * lerpK;
    cs.z += (dz - cs.z) * (lerpK * 1.25);
    cs.tx += (tgtX - cs.tx) * lerpK;
    cs.ty += (tgtY - cs.ty) * lerpK;
    cs.tz += (tgtZ - cs.tz) * (lerpK * 1.25);
    cs.roll += (roll - cs.roll) * lerpK;
    cs.fov += (fov - cs.fov) * lerpK;

    cam.position.set(cs.x, cs.y, cs.z);
    cam.lookAt(cs.tx, cs.ty, cs.tz);
    cam.rotation.z += cs.roll;
    if (Math.abs(cam.fov - cs.fov) > 0.01) {
      cam.fov = cs.fov;
      cam.updateProjectionMatrix();
    }
  }

  /* ---------- ループ管理 ---------- */
  function frame(t) {
    state.raf = requestAnimationFrame(frame);
    // スクロール進行（Lenis後の実スクロール値から算出）
    var doc = document.documentElement;
    var max = (doc.scrollHeight - window.innerHeight) || 1;
    state.targetProgress = clamp01((window.scrollY || window.pageYOffset) / max);
    state.progress += (state.targetProgress - state.progress) * 0.07;

    // CTA進行：ScrollTrigger未接続時はスクロール進行から導出
    if (!state.ctaExternal) state.ctaTarget = smooth(0.9, 0.995, state.targetProgress);
    state.cta += (state.ctaTarget - state.cta) * 0.08;

    applyFormation(t);
    updateColors();
    applyCamera();
    state.renderer.render(state.scene, state.camera);
  }

  function startLoop() {
    if (state.running || state.reduced || !state.renderer) return;
    state.running = true;
    state.raf = requestAnimationFrame(frame);
  }
  function stopLoop() {
    state.running = false;
    if (state.raf) cancelAnimationFrame(state.raf);
    state.raf = null;
  }

  // タブ非表示時は描画停止
  document.addEventListener('visibilitychange', function () {
    if (!NextScene.ready || state.reduced) return;
    if (document.hidden) stopLoop(); else startLoop();
  });

  function resize() {
    if (!state.renderer) return;
    var w = window.innerWidth, h = window.innerHeight;
    state.renderer.setSize(w, h, false);
    state.camera.aspect = w / h;
    state.camera.updateProjectionMatrix();
    // 狭い画面ではCTAタイポグラフィを横方向に圧縮
    state.ctaScaleX = Math.max(0.58, Math.min(1.05, (w / h) / 1.65));
    if (state.reduced) state.renderer.render(state.scene, state.camera);
  }
})();
