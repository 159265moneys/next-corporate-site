/* ============================================================
   scene.js — 固定WebGL背景（three.js r128）
   極薄青のパーティクル網 + ワイヤーフレームグリッド。
   スクロール進行でカメラが空間を前進・旋回し、
   隊形が 神経網 → 整列グリッド → 「N」収束 へモーフする。
   ============================================================ */
(function () {
  'use strict';

  var NextScene = {
    ready: false,
    init: init,
    setProgress: function (p) { state.targetProgress = Math.max(0, Math.min(1, p)); },
    start: startLoop,
    stop: stopLoop
  };
  window.NextScene = NextScene;

  var state = {
    renderer: null, scene: null, camera: null,
    points: null, lines: null,
    count: 0,
    current: null,           // 現在座標
    neural: null, grid: null, nShape: null,
    phase: null,             // 揺らぎ用の位相
    linePairs: [],
    lineGeo: null,
    progress: 0, targetProgress: 0,
    raf: null, running: false,
    lastT: 0,
    mouseX: 0, mouseY: 0,
    reduced: false, lite: false
  };

  function init(opts) {
    opts = opts || {};
    if (typeof THREE === 'undefined') return false;
    var canvas = document.getElementById('gl');
    if (!canvas) return false;

    state.reduced = !!opts.reduced;
    state.lite = !!opts.lite;
    state.count = state.lite ? 320 : 950;

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
      state.renderer.render(state.scene, state.camera);
      return true;
    }
    startLoop();
    return true;
  }

  /* ---------- 隊形の生成 ---------- */
  function buildFormations() {
    var n = state.count;
    state.neural = new Float32Array(n * 3);
    state.grid = new Float32Array(n * 3);
    state.nShape = new Float32Array(n * 3);
    state.current = new Float32Array(n * 3);
    state.phase = new Float32Array(n);

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

    // 3) 「N」収束：Nの3ストローク上にサンプリング（CTA、カメラ前方 z -108）
    var strokes = [
      [-14, -18, -14, 18],   // 左縦
      [-14, 18, 14, -18],    // 対角
      [14, -18, 14, 18]      // 右縦
    ];
    for (i = 0; i < n; i++) {
      ix = i * 3;
      var s = strokes[i % 3];
      var t = (Math.floor(i / 3) / Math.floor(n / 3 + 1)) + (Math.random() - 0.5) * 0.02;
      t = Math.max(0, Math.min(1, t));
      state.nShape[ix] = s[0] + (s[2] - s[0]) * t + (Math.random() - 0.5) * 0.9;
      state.nShape[ix + 1] = 6 + s[1] + (s[3] - s[1]) * t + (Math.random() - 0.5) * 0.9;
      state.nShape[ix + 2] = -108 + (Math.random() - 0.5) * 2.5;
    }

    // 初期位置 = 神経網
    state.current.set(state.neural);
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
    // 0-0.12 神経網 / 0.16-0.42 でグリッドへ / 0.72-0.95 でNへ収束
    var wN = 1 - smooth(0.14, 0.4, p);
    var wG = smooth(0.14, 0.4, p) * (1 - smooth(0.7, 0.94, p));
    var wX = smooth(0.7, 0.94, p);
    var sum = wN + wG + wX || 1;
    return [wN / sum, wG / sum, wX / sum];
  }
  function smooth(a, b, x) {
    var t = Math.max(0, Math.min(1, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }

  function applyFormation(time) {
    var n = state.count;
    var w = weights(state.progress);
    var wobble = (1 - w[2]) * (state.lite ? 0.5 : 1); // N収束時は揺らぎ0へ
    var pos = state.points.geometry.attributes.position.array;
    var lerpK = state.reduced ? 1 : 0.065;

    for (var i = 0; i < n; i++) {
      var ix = i * 3;
      var ph = state.phase[i];
      var tx = state.neural[ix] * w[0] + state.grid[ix] * w[1] + state.nShape[ix] * w[2];
      var ty = state.neural[ix + 1] * w[0] + state.grid[ix + 1] * w[1] + state.nShape[ix + 1] * w[2];
      var tz = state.neural[ix + 2] * w[0] + state.grid[ix + 2] * w[1] + state.nShape[ix + 2] * w[2];
      // 有機的な揺らぎ（グリッド時は波打ち）
      ty += Math.sin(time * 0.0011 + ph) * 1.6 * wobble + Math.sin(state.grid[ix] * 0.12 + time * 0.0013) * 2.2 * w[1];
      tx += Math.cos(time * 0.0009 + ph * 1.7) * 1.2 * wobble;

      pos[ix] += (tx - pos[ix]) * lerpK;
      pos[ix + 1] += (ty - pos[ix + 1]) * lerpK;
      pos[ix + 2] += (tz - pos[ix + 2]) * lerpK;
    }
    state.points.geometry.attributes.position.needsUpdate = true;

    // ライン端点の更新
    if (state.lines) {
      var lp = state.lineGeo.attributes.position.array;
      var pairs = state.linePairs;
      for (var k = 0; k < pairs.length; k++) {
        var a = pairs[k][0] * 3, b = pairs[k][1] * 3, o = k * 6;
        lp[o] = pos[a]; lp[o + 1] = pos[a + 1]; lp[o + 2] = pos[a + 2];
        lp[o + 3] = pos[b]; lp[o + 4] = pos[b + 1]; lp[o + 5] = pos[b + 2];
      }
      state.lineGeo.attributes.position.needsUpdate = true;
      state.lines.material.opacity = 0.42 * w[0] + 0.14 * w[1] + 0.05 * w[2];
    }
  }

  /* ---------- カメラ：前進 + 旋回 ---------- */
  function applyCamera() {
    var p = state.progress;
    var cam = state.camera;
    var z = 62 - p * 94;                        // 62 → -32（Nは-108で前方に）
    var x = Math.sin(p * Math.PI * 2) * 9 * (1 - smooth(0.75, 0.95, p));
    var y = 4 + Math.sin(p * Math.PI) * 5 - p * 2;

    cam.position.x += (x + state.mouseX * 2.4 - cam.position.x) * 0.06;
    cam.position.y += (y - state.mouseY * 1.6 - cam.position.y) * 0.06;
    cam.position.z += (z - cam.position.z) * 0.08;

    var look = new THREE.Vector3(0, 2 + smooth(0.75, 1, p) * 4, cam.position.z - 46);
    cam.lookAt(look);
    cam.rotation.z += Math.sin(p * Math.PI * 1.5) * 0.045; // わずかなロール
  }

  /* ---------- ループ管理 ---------- */
  function frame(t) {
    state.raf = requestAnimationFrame(frame);
    // スクロール進行（Lenis後の実スクロール値から算出）
    var doc = document.documentElement;
    var max = (doc.scrollHeight - window.innerHeight) || 1;
    state.targetProgress = Math.max(0, Math.min(1, (window.scrollY || window.pageYOffset) / max));
    state.progress += (state.targetProgress - state.progress) * 0.07;

    applyFormation(t);
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
    if (state.reduced) state.renderer.render(state.scene, state.camera);
  }
})();
