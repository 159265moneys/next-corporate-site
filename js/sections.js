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
     PHASE 06 — ISOMETRIC（4業界の建物が数式描画で立ち上がる）
     ============================================================ */
  function createIso(canvas) {
    var ctx, W, H, unit;
    var raf = null, running = false, last = 0, t = 0;
    var progress = 0;

    var COL = {
      stroke: '#7E93B8',
      strokeSoft: 'rgba(126,147,184,.5)',
      top: '#F3F7FC', left: '#E3EAF5', right: '#D3DFEF',
      accent: '#2563EB',
      ink: '#1A2333'
    };

    function resize() {
      var s = setupCanvas(canvas, 2);
      ctx = s.ctx; W = s.w; H = s.h;
      unit = W / 1200; // 論理座標 1200x560
    }

    // アイソメ投影（論理px）
    function iso(ox, oy, x, y, z) {
      return { x: ox + (x - y) * 0.866, y: oy + (x + y) * 0.5 - z };
    }
    function P(o, x, y, z) {
      var p = iso(o.x, o.y, x, y, z);
      return { x: p.x * unit, y: p.y * unit };
    }
    function poly(pts, fill, stroke, lw) {
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.2; ctx.stroke(); }
    }
    function line(a, b, stroke, lw) {
      ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.2;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    // 直方体（x0,y0 基点 / w,d 底面 / h 高さ）
    function box(o, x0, y0, w, d, h, opt) {
      opt = opt || {};
      var A = P(o, x0, y0 + d, 0), B = P(o, x0 + w, y0 + d, 0), C = P(o, x0 + w, y0, 0);
      var A2 = P(o, x0, y0 + d, h), B2 = P(o, x0 + w, y0 + d, h), C2 = P(o, x0 + w, y0, h), D2 = P(o, x0, y0, h);
      poly([A, B, B2, A2], opt.left || COL.left, COL.stroke);   // 左面
      poly([B, C, C2, B2], opt.right || COL.right, COL.stroke); // 右面
      poly([A2, B2, C2, D2], opt.top || COL.top, COL.stroke);   // 天面
    }
    function easeOut(p) { return 1 - Math.pow(1 - p, 4); }
    function sub(p, a, b) { return Math.max(0, Math.min(1, (p - a) / (b - a))); }

    /* --- 建設: クレーン付きビル --- */
    function construction(o, p, time) {
      if (p <= 0) return;
      var e = easeOut(p);
      // ビル本体（フロアが積み上がる）
      var floors = 5, fh = 30;
      for (var f = 0; f < floors; f++) {
        var fp = sub(e, f / floors, (f + 1) / floors);
        if (fp <= 0) break;
        box(o, 0, 0, 110, 85, 0, {});
        box(o, 0, 0, 110, 85, (f + fp) * fh);
      }
      var topH = e * floors * fh;
      // 窓（左面）
      if (e > 0.35) {
        ctx.strokeStyle = COL.strokeSoft;
        ctx.lineWidth = 1;
        var maxF = Math.floor(e * floors);
        for (var wf = 0; wf < maxF; wf++) {
          for (var wx = 0; wx < 3; wx++) {
            var a = P(o, 14 + wx * 34, 85, wf * fh + 9);
            var b = P(o, 34 + wx * 34, 85, wf * fh + 9);
            var c = P(o, 34 + wx * 34, 85, wf * fh + 22);
            var d2 = P(o, 14 + wx * 34, 85, wf * fh + 22);
            poly([a, b, c, d2], 'rgba(197,212,232,.35)', COL.strokeSoft, 1);
          }
        }
      }
      // クレーン
      var cp = sub(p, 0.25, 1);
      if (cp > 0) {
        var ce = easeOut(cp);
        var mastH = 220 * ce;
        var mB = P(o, -55, 20, 0), mT = P(o, -55, 20, mastH);
        line(mB, mT, COL.stroke, 2);
        // マストのトラス
        ctx.strokeStyle = COL.strokeSoft;
        for (var m = 20; m < mastH; m += 20) {
          var t1 = P(o, -62, 14, m), t2 = P(o, -48, 26, m + 12);
          line(t1, t2, COL.strokeSoft, 1);
        }
        if (ce > 0.85) {
          var jibLen = 150, cwLen = 55;
          var jibT = P(o, -55 + jibLen, 20, mastH);
          var cwT = P(o, -55 - cwLen, 20, mastH);
          line(mT, jibT, COL.stroke, 2);
          line(mT, cwT, COL.stroke, 2);
          var peak = P(o, -55, 20, mastH + 26);
          line(cwT, peak, COL.strokeSoft, 1); line(peak, jibT, COL.strokeSoft, 1);
          // カウンターウェイト
          var cw1 = P(o, -55 - cwLen, 12, mastH), cw2 = P(o, -55 - cwLen, 28, mastH - 16);
          poly([cw1, P(o, -55 - cwLen, 28, mastH), cw2, P(o, -55 - cwLen, 12, mastH - 16)], COL.right, COL.stroke, 1);
          // フック（揺れる） + アクセント
          var sway = Math.sin(time * 0.0012) * 8;
          var hookX = -55 + jibLen * 0.72 + sway * 0.4;
          var cableTop = P(o, hookX, 20, mastH);
          var hookZ = mastH - 70 - Math.sin(time * 0.0008) * 12;
          var hook = P(o, hookX, 20, hookZ);
          line(cableTop, hook, COL.stroke, 1);
          ctx.fillStyle = COL.accent;
          ctx.fillRect(hook.x - 4 * unit, hook.y, 8 * unit, 9 * unit);
        }
      }
    }

    /* --- 運送: トラック + 道路 --- */
    function truck(o, p, time) {
      if (p <= 0) return;
      var e = easeOut(p);
      // 道路
      var r1 = P(o, -90, 100, 0), r2 = P(o, 220, 100, 0), r3 = P(o, 220, 160, 0), r4 = P(o, -90, 160, 0);
      poly([r1, r2, r3, r4], 'rgba(211,223,239,.55)', COL.strokeSoft, 1);
      // センターライン（流れる破線）
      ctx.save();
      ctx.strokeStyle = COL.stroke;
      ctx.lineWidth = 1.4;
      ctx.setLineDash([12 * unit, 10 * unit]);
      ctx.lineDashOffset = -(time * 0.02) * unit;
      var c1 = P(o, -90, 130, 0), c2 = P(o, 220, 130, 0);
      ctx.beginPath(); ctx.moveTo(c1.x, c1.y); ctx.lineTo(c2.x, c2.y); ctx.stroke();
      ctx.restore();
      // トラック（スライドインしつつ立ち上がる）
      var slide = (1 - e) * 60;
      var tx = 10 + slide;
      var bob = Math.sin(time * 0.004) * 1.2 * e;
      var o2 = { x: o.x, y: o.y - bob };
      // 荷台
      box(o2, tx, 108, 95 * e, 44, 52 * e, {});
      // キャブ
      box(o2, tx + 95 * e + 6, 108, 30 * e, 44, 34 * e, {});
      if (e > 0.9) {
        // 荷台ロゴライン
        ctx.strokeStyle = COL.strokeSoft;
        var l1 = P(o2, tx + 14, 152, 30), l2 = P(o2, tx + 66, 152, 30);
        line(l1, l2, COL.strokeSoft, 1.4);
        var l3 = P(o2, tx + 14, 152, 22), l4 = P(o2, tx + 48, 152, 22);
        line(l3, l4, 'rgba(37,99,235,.75)', 1.6);
        // 車輪
        ctx.strokeStyle = COL.ink; ctx.lineWidth = 1.4;
        [tx + 18, tx + 52, tx + 108].forEach(function (wx) {
          var wp = P(o2, wx, 152, 0);
          ctx.beginPath();
          ctx.ellipse(wp.x, wp.y, 7.5 * unit, 6.5 * unit, 0, 0, Math.PI * 2);
          ctx.stroke();
          var sp = time * 0.006 + wx;
          ctx.beginPath();
          ctx.moveTo(wp.x - Math.cos(sp) * 5 * unit, wp.y - Math.sin(sp) * 4.4 * unit);
          ctx.lineTo(wp.x + Math.cos(sp) * 5 * unit, wp.y + Math.sin(sp) * 4.4 * unit);
          ctx.stroke();
        });
        // スピード線
        ctx.strokeStyle = 'rgba(126,147,184,.4)';
        for (var s = 0; s < 3; s++) {
          var sl1 = P(o2, tx - 16 - s * 14, 118 + s * 12, 26 - s * 6);
          var sl2 = P(o2, tx - 38 - s * 14, 118 + s * 12, 26 - s * 6);
          line(sl1, sl2, 'rgba(126,147,184,.4)', 1);
        }
      }
    }

    /* --- 介護: 施設 + 十字 --- */
    function care(o, p) {
      if (p <= 0) return;
      var e = easeOut(p);
      box(o, 0, 0, 150 * e, 95, 58 * e, {});
      if (e > 0.55) {
        var e2 = sub(e, 0.55, 1);
        box(o, 20, 12, 90 * e2, 70, 58 + 40 * e2, {});
      }
      if (e > 0.85) {
        // エントランスひさし
        box(o, 55, 95, 40, 18, 16, { top: COL.top });
        // 十字（アクセント: 右面に）
        var cx0 = 120, cz0 = 66;
        var h1 = P(o, 150, cx0 - 26, cz0), h2 = P(o, 150, cx0 + 26 - 52, cz0);
        // 十字は面上に矩形2枚で描く
        ctx.fillStyle = COL.accent;
        var v1 = P(o, 150, 55, 88), v2 = P(o, 150, 71, 88), v3 = P(o, 150, 71, 58), v4 = P(o, 150, 55, 58);
        poly([v1, v2, v3, v4], COL.accent, null);
        var g1 = P(o, 150, 47, 78), g2 = P(o, 150, 79, 78), g3 = P(o, 150, 79, 68), g4 = P(o, 150, 47, 68);
        poly([g1, g2, g3, g4], COL.accent, null);
        // 植栽
        [[-24, 30], [-24, 70]].forEach(function (tp) {
          var b = P(o, tp[0], tp[1], 0), t2 = P(o, tp[0], tp[1], 18);
          line(b, t2, COL.stroke, 1.2);
          ctx.strokeStyle = COL.stroke;
          ctx.beginPath(); ctx.arc(t2.x, t2.y - 6 * unit, 8 * unit, 0, Math.PI * 2); ctx.stroke();
        });
      }
    }

    /* --- 警備: 監視塔 + ビーコン --- */
    function security(o, p, time) {
      if (p <= 0) return;
      var e = easeOut(p);
      box(o, 0, 0, 55, 55, 30 * e, {});                       // 基部
      if (e > 0.3) box(o, 12, 12, 30, 30, 30 + 130 * sub(e, 0.3, 0.85)); // シャフト
      if (e > 0.85) {
        var topZ = 160;
        box(o, 2, 2, 52, 52, topZ + 26, { top: COL.top });     // キャビン
        // アンテナ
        var ab = P(o, 27, 27, topZ + 26), at = P(o, 27, 27, topZ + 62);
        line(ab, at, COL.stroke, 1.4);
        ctx.strokeStyle = COL.strokeSoft;
        ctx.beginPath(); ctx.arc(at.x, at.y, 6 * unit, Math.PI * 0.9, Math.PI * 2.1); ctx.stroke();
        // 回転ビーコン（アクセント / 面積は極小）
        var ba = time * 0.0016;
        var bx = P(o, 27, 27, topZ + 40);
        var grad = ctx.createLinearGradient(bx.x, bx.y,
          bx.x + Math.cos(ba) * 90 * unit, bx.y + Math.sin(ba) * 34 * unit);
        grad.addColorStop(0, 'rgba(37,99,235,.5)');
        grad.addColorStop(1, 'rgba(37,99,235,0)');
        ctx.strokeStyle = grad; ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(bx.x, bx.y);
        ctx.lineTo(bx.x + Math.cos(ba) * 90 * unit, bx.y + Math.sin(ba) * 34 * unit);
        ctx.stroke();
        ctx.fillStyle = COL.accent;
        ctx.beginPath(); ctx.arc(bx.x, bx.y, 2.6 * unit, 0, Math.PI * 2); ctx.fill();
        // フェンス
        ctx.strokeStyle = COL.strokeSoft;
        for (var f = 0; f <= 4; f++) {
          var fb = P(o, 75 + f * 16, 60, 0), ft = P(o, 75 + f * 16, 60, 14);
          line(fb, ft, COL.strokeSoft, 1);
        }
        var fr1 = P(o, 75, 60, 12), fr2 = P(o, 75 + 64, 60, 12);
        line(fr1, fr2, COL.strokeSoft, 1);
      }
    }

    var SITES = [
      { o: { x: 150, y: 320 }, fn: construction, label: '建設 / CONSTRUCTION' },
      { o: { x: 430, y: 300 }, fn: truck, label: '運送 / LOGISTICS' },
      { o: { x: 760, y: 320 }, fn: care, label: '介護 / CARE' },
      { o: { x: 1035, y: 320 }, fn: security, label: '警備 / SECURITY' }
    ];

    function draw(time) {
      ctx.clearRect(0, 0, W, H);
      // 地面グリッド（アイソメ格子 / 進行で伸びる）
      var gp = easeOut(Math.min(1, progress * 2.2));
      ctx.strokeStyle = 'rgba(197,212,232,.5)';
      ctx.lineWidth = 1;
      var go = { x: 600, y: 258 };
      var range = 560 * gp;
      for (var g = -560; g <= 560; g += 70) {
        if (Math.abs(g) > range + 70) continue;
        var a1 = P(go, g, -240, 0), a2 = P(go, g, 240, 0);
        line(a1, a2, 'rgba(197,212,232,.4)', 1);
        var b1 = P(go, -560, g * 0.43, 0), b2 = P(go, 560, g * 0.43, 0);
        line(b1, b2, 'rgba(197,212,232,.4)', 1);
      }
      // 各建物（時間差で立ち上がる）
      SITES.forEach(function (s, i) {
        var lp = sub(progress, i * 0.2, i * 0.2 + 0.4);
        s.fn(s.o, lp, time);
        if (lp > 0.92) {
          ctx.fillStyle = 'rgba(26,35,51,.55)';
          ctx.font = '500 10px ' + EN;
          ctx.textAlign = 'center';
          var lb = P(s.o, 70, 70, 0);
          ctx.fillText(s.label, lb.x, Math.min(H - 12, lb.y + 46 * unit));
          ctx.textAlign = 'left';
        }
      });
    }

    function frame(time) {
      raf = requestAnimationFrame(frame);
      t = time;
      draw(time);
    }

    return {
      resize: resize,
      setProgress: function (p) { progress = Math.max(0, Math.min(1, p)); },
      start: function () { if (running) return; running = true; raf = requestAnimationFrame(frame); },
      stop: function () { running = false; if (raf) cancelAnimationFrame(raf); raf = null; },
      renderStatic: function () { resize(); progress = 1; draw(1600); }
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
