/*!
 * reactbits.js —— React Bits 组件的「原生态移植版」（本站自用：无 React、无构建步骤）
 * 移植自 DavidHDev/react-bits —— https://github.com/DavidHDev/react-bits
 * License: MIT + Commons Clause License Condition v1.0 — Copyright (c) 2026 David Haz
 *   作为本站（应用）的一部分使用；不得把组件本身（含移植版）单独出售、再许可或再分发。
 *
 * 移植清单与保留的原默认值：
 *   CountUp   —— duration 2s、easing easeOut = cubicBezier(.33,1,.68,1)、tabular-nums
 *   BlurText  —— delay 200ms、stepDuration .35s、blur 10px、distance 50px、direction top、
 *                缓动 cubic-bezier(.22,1,.36,1)；中文按「字」切分（原实现按词，中文无空格）
 *   GlareHover—— variant streak、glareSize 30、glareOpacity .5、softness .6、glareAngle -45、
 *                33 段渐变、smootherstep 剖面、transitionDuration 650ms
 *   ClickSpark—— count 8、radius 30、size 14、width 2、duration 500ms、ease-out、
 *                DPR 上限 2、reduced-motion 退化为 320ms 线性
 */
(function () {
  'use strict';

  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ================= 缓动 ================= */

  // motion 的 cubicBezier：牛顿迭代 + 二分兜底
  function cubicBezier(x1, y1, x2, y2) {
    function A(a, b) { return 1 - 3 * b + 3 * a; }
    function B(a, b) { return 3 * b - 6 * a; }
    function C(a) { return 3 * a; }
    function calc(t, a, b) { return ((A(a, b) * t + B(a, b)) * t + C(a)) * t; }
    function slope(t, a, b) { return 3 * A(a, b) * t * t + 2 * B(a, b) * t + C(a); }
    return function (x) {
      if (x <= 0) return 0;
      if (x >= 1) return 1;
      var t = x;
      for (var i = 0; i < 8; i++) {
        var s = slope(t, x1, x2);
        if (s === 0) break;
        var e = calc(t, x1, x2) - x;
        t -= e / s;
      }
      var lo = 0, hi = 1;
      for (var j = 0; j < 12; j++) {
        var v = calc(t, x1, x2);
        if (Math.abs(v - x) < 1e-5) break;
        if (v > x) hi = t; else lo = t;
        t = (lo + hi) / 2;
      }
      return calc(t, y1, y2);
    };
  }

  var easeOut = cubicBezier(0.33, 1, 0.68, 1);        // CountUp 默认 easing
  var easeOutCubic = function (t) { return 1 - Math.pow(1 - t, 3); };  // ClickSpark 默认 ease-out
  var smootherstep = function (t) { return t * t * t * (t * (t * 6 - 15) + 10); }; // GlareHover
  function smoothstep(a, b, x) {
    var t = Math.min(1, Math.max(0, (x - a) / (b - a)));
    return t * t * (3 - 2 * t);
  }
  function bump(t, c, half) { return half === 0 ? 0 : smootherstep(1 - Math.abs(t - c) / half); }
  function num(v, d) { var n = parseFloat(v); return isNaN(n) ? d : n; }

  var inView = function (el, fn, threshold, rootMargin) {
    if (!('IntersectionObserver' in window)) { fn(); return; }
    var io = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (entries[i].isIntersecting) { io.disconnect(); fn(); return; }
      }
    }, { threshold: threshold == null ? 0.2 : threshold, rootMargin: rootMargin || '0px' });
    io.observe(el);
  };

  /* ================= CountUp ================= */

  function countUp(el) {
    if (el.dataset.rbDone) return;
    el.dataset.rbDone = '1';
    // 目标值就是页面上已经写好的数字 —— 脚本失效时页面照样正确
    var raw = (el.textContent || '').replace(/[,\s]/g, '');
    var target = parseFloat(raw);
    if (!isFinite(target)) return;
    var decimals = (raw.split('.')[1] || '').length;
    var dur = num(el.dataset.rbDuration, 2) * 1000;   // 默认 duration=2s
    var delay = num(el.dataset.rbDelay, 0);
    var fmt = function (v) {
      return v.toLocaleString('zh-CN', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
    };
    el.style.fontVariantNumeric = 'tabular-nums';
    if (reduced || target === 0) { el.textContent = fmt(target); return; }

    inView(el, function () {
      var t0 = performance.now() + delay;
      var step = function (now) {
        var p = Math.min(1, Math.max(0, (now - t0) / dur));
        el.textContent = fmt(target * easeOut(p));
        if (p < 1) requestAnimationFrame(step);
        else el.textContent = fmt(target);
      };
      el.textContent = fmt(0);
      requestAnimationFrame(step);
    }, 0.6);   // 原实现 useInView margin 0、只触发一次；阈值取 .6 以免小元素卡在 100% 可见
  }

  /* ================= BlurText ================= */

  function splitPieces(text) {
    // 原实现 animateBy='words'；中文没有空格，所以对含 CJK 的词再按「字」切
    var out = [];
    var words = text.split(/(\s+)/);
    for (var i = 0; i < words.length; i++) {
      var w = words[i];
      if (!w) continue;
      if (/^\s+$/.test(w)) { out.push('\u00A0'); continue; }   // 原实现用 \u00A0 防折叠
      if (w.length > 1 && /[\u4e00-\u9fff]/.test(w)) {
        for (var j = 0; j < w.length; j++) out.push(w[j]);
      } else {
        out.push(w);
      }
    }
    return out;
  }

  function blurText(el) {
    if (el.dataset.rbDone) return;
    el.dataset.rbDone = '1';
    var text = (el.textContent || '').trim();
    if (!text || reduced) return;   // 原实现包在 MotionConfig reducedMotion="user" 里

    var delay = num(el.dataset.rbDelay, 200);        // 默认 delay=200ms（每个片段的间隔）
    var stepDur = num(el.dataset.rbStep, 0.35);      // 默认 stepDuration=0.35s
    var blur = num(el.dataset.rbBlur, 10);
    var distance = num(el.dataset.rbDistance, 50);
    var direction = el.dataset.rbDirection || 'top';

    var pieces = splitPieces(text);
    el.setAttribute('aria-label', text);
    el.textContent = '';
    el.classList.add('rb-blurtext');

    var frag = document.createDocumentFragment();
    for (var i = 0; i < pieces.length; i++) {
      var s = document.createElement('span');
      s.className = 'rb-blurtext__piece';
      s.setAttribute('aria-hidden', 'true');
      s.textContent = pieces[i];
      if (pieces[i] === '\u00A0') { s.className += ' rb-blurtext__piece--static'; }
      else {
        s.style.transitionDelay = (i * delay) + 'ms';
        s.style.transitionDuration = stepDur + 's';
        // 只喂参数、不写初始态：初始态在 reactbits.css，.is-in 才盖得住（行内样式会赢过类）
        s.style.setProperty('--rb-blur', blur + 'px');
        s.style.setProperty('--rb-dist', (direction === 'top' ? -distance : distance) + 'px');
      }
      frag.appendChild(s);
    }
    el.appendChild(frag);

    el.style.filter = ''; // 清掉可能的内联值
    var reveal = function () { el.classList.add('is-in'); };
    inView(el, reveal, 0.1);  // 默认 threshold=0.1
    // 兜底：观察器万一不触发（隐藏容器、旧内核），1.5 秒后也把标题显出来
    window.setTimeout(reveal, 1500);
  }

  /* ================= GlareHover（streak） ================= */

  function rgba(hex, a) {
    var h = (hex || '#fffefb').replace('#', '');
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  function glareGradient(color, opacity, softness) {
    // 原实现：33 段，profile = bump(t,.5,.06+.16s) + .32*bump(t,.5,.5)
    var stops = [];
    var half = 0.06 + 0.16 * softness;
    for (var i = 0; i <= 32; i++) {
      var t = i / 32;
      var profile = bump(t, 0.5, half) + 0.32 * bump(t, 0.5, 0.5);
      var alpha = Math.round(Math.min(1, profile * opacity) * 1000) / 1000;
      stops.push(rgba(color, alpha) + ' ' + (t * 100).toFixed(1) + '%');
    }
    return 'linear-gradient(90deg, ' + stops.join(',') + ')';
  }

  function glare(el) {
    if (el.dataset.rbDone) return;
    el.dataset.rbDone = '1';

    var angle = num(el.dataset.rbAngle, -45);
    var sizePct = num(el.dataset.rbSize, 30);
    var opacity = num(el.dataset.rbOpacity, 0.5);
    var softness = num(el.dataset.rbSoftness, 0.6);
    var color = el.dataset.rbColor || '#fffefb';
    var duration = num(el.dataset.rbDuration, 650);
    var maxOpacity = num(el.dataset.rbMax, 1);

    el.classList.add('rb-glare');
    var glareEl = document.createElement('span');
    glareEl.className = 'rb-glare__glare';
    glareEl.setAttribute('aria-hidden', 'true');
    var band = document.createElement('span');
    band.className = 'rb-glare__band';
    band.style.setProperty('--rb-glare', glareGradient(color, opacity, softness));
    glareEl.appendChild(band);
    el.appendChild(glareEl);

    if (reduced) return;   // 原实现：reduced 时 sweep() 变成空操作

    var rad = (angle * Math.PI) / 180;
    var ux = Math.sin(rad), uy = -Math.cos(rad);
    var w = 0, h = 0, bandW = 0, reach = 0;
    var pos = -1e4, presence = 0, pTarget = 0;
    var from = 0, to = 0, t0 = 0, sweepDur = 0, sweeping = false;
    var raf = 0, last = 0, hovering = false;

    function measure() {
      var r = el.getBoundingClientRect();
      w = r.width; h = r.height;
      var diagonal = Math.sqrt(w * w + h * h);
      bandW = Math.max(8, (diagonal * sizePct) / 100);
      reach = (Math.abs(w * ux) + Math.abs(h * uy)) / 2 + bandW / 2 + 2;
      band.style.width = bandW + 'px';
      band.style.height = (diagonal + bandW) + 'px';
    }

    function frame(now) {
      var dt = Math.min(0.05, (now - last) / 1000);
      last = now;

      if (sweeping) {
        var p = sweepDur > 0 ? Math.min(1, (now - t0) / sweepDur) : 1;
        pos = from + (to - from) * ((1 - Math.cos(Math.PI * p)) / 2);  // ease(t)=(1-cos(pi t))/2
        if (p >= 1) { sweeping = false; }
      }

      var tau = pTarget > presence ? 0.18 : 0.4;   // 进 0.18 / 出 0.4
      presence += (pTarget - presence) * (1 - Math.exp(-dt / tau));

      band.style.transform = 'translate(-50%,-50%) rotate(' + (angle - 90) + 'deg) translateX(' + pos.toFixed(2) + 'px)';
      glareEl.style.opacity = Math.min(maxOpacity, presence).toFixed(3);

      if (hovering || sweeping || presence > 0.002) {
        raf = requestAnimationFrame(frame);
      } else {
        presence = 0;
        glareEl.style.opacity = '0';
        raf = 0;
      }
    }

    function start() {
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
    }

    function enter() {
      if (!document.hidden) { /* 原实现 document.hidden 时暂停循环 */ }
      hovering = true;
      pTarget = 1;
      measure();
      if (pos === -1e4 || pos > reach) pos = -reach;   // 上一次扫到右侧就回到左侧
      from = pos; to = reach;
      var share = Math.abs(to - from) / (2 * reach);
      sweepDur = Math.max(120, duration * share);      // 距离越短越快，但有 120ms 下限
      t0 = performance.now();
      sweeping = true;
      start();
    }

    function leave() {
      hovering = false;
      pTarget = 0;
      start();
    }

    el.addEventListener('pointerenter', enter);
    el.addEventListener('pointerleave', leave);
    if ('ResizeObserver' in window) {
      var ro = new ResizeObserver(function () { if (hovering) measure(); });
      ro.observe(el);
    }
  }

  /* ================= ClickSpark ================= */

  function clickSpark(opts) {
    var o = {
      color: '#b4543a',
      size: 14,
      radius: 30,
      count: 8,
      width: 2,
      duration: 500,
      glow: 0,
      randomness: 0.2,
      spread: 360
    };
    for (var k in (opts || {})) if (Object.prototype.hasOwnProperty.call(opts, k)) o[k] = opts[k];
    if (reduced) { o.duration = 320; o.glow = 0; }   // 原实现 REDUCED_MS=320，线性、无重力

    var canvas = null, ctx = null, ratio = 1, bursts = [], raf = 0, last = 0, lastClick = 0, lastXY = [0, 0];

    function ensure() {
      if (canvas) return;
      canvas = document.createElement('canvas');
      canvas.className = 'rb-spark';
      canvas.setAttribute('aria-hidden', 'true');
      document.body.appendChild(canvas);
      ctx = canvas.getContext('2d');
      resize();
      window.addEventListener('resize', resize);
    }

    function resize() {
      if (!canvas) return;
      ratio = Math.min(window.devicePixelRatio || 1, 2);   // 原实现 DPR 上限 2
      canvas.width = Math.ceil(window.innerWidth * ratio);
      canvas.height = Math.ceil(window.innerHeight * ratio);
      ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function spawn(x, y) {
      var now = performance.now();
      // 700ms / 12px 内的重复事件不重复爆（原实现的去重窗口）
      if (now - lastClick < 700 && Math.abs(x - lastXY[0]) < 12 && Math.abs(y - lastXY[1]) < 12) return;
      lastClick = now; lastXY = [x, y];

      var sparks = [], n = Math.max(1, Math.min(64, Math.round(o.count)));
      var base = Math.random() * 360;
      for (var i = 0; i < n; i++) {
        var jitter = (Math.random() - 0.5) * 2 * o.randomness * 0.9;
        sparks.push({
          angle: ((base + (i / n) * o.spread + jitter * (360 / n)) * Math.PI) / 180,
          reach: 1 + (Math.random() - 0.5) * 0.7,          // 1 ± 0.35
          scale: 1 + (Math.random() - 0.5) * 0.8,          // 1 ± 0.4
          life: 1 + (Math.random() - 0.5) * 0.5            // 1 ± 0.25
        });
      }
      bursts.push({ x: x, y: y, t0: now, sparks: sparks });
      if (bursts.length > 32) bursts.shift();              // 原实现 MAX_BURSTS=32
      if (!raf) { last = performance.now(); raf = requestAnimationFrame(draw); }
    }

    function draw(now) {
      var dt = (now - last) / 1000;
      last = now;
      if (bursts.length) ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio);

      var alive = [];
      for (var b = 0; b < bursts.length; b++) {
        var burst = bursts[b];
        var any = false;
        for (var i = 0; i < burst.sparks.length; i++) {
          var s = burst.sparks[i];
          var dur = o.duration * s.life;
          var e = now - burst.t0;
          var p = e / dur;
          if (p >= 1) continue;
          any = true;
          var eased = reduced ? p : easeOutCubic(p);
          var dist = o.radius * eased * s.reach;
          var cx = burst.x + Math.cos(s.angle) * dist;
          var cy = burst.y + Math.sin(s.angle) * dist;
          var len = o.size * s.scale * Math.pow(1 - p, 1.6);
          var alpha = 1 - smoothstep(0.55, 1, p);        // 形状 line 的 0.55 阈值
          if (alpha <= 0.002) continue;
          var dx = Math.cos(s.angle), dy = Math.sin(s.angle);
          var hw = Math.max(0.5, o.width / 2);
          ctx.strokeStyle = rgba(o.color, alpha);
          ctx.lineWidth = hw * 2;
          ctx.lineCap = 'round';
          if (o.glow > 0) {                               // 默认 glow=0，不画光晕
            ctx.globalAlpha = alpha * 0.14 * o.glow;
            ctx.lineWidth = hw * 2 * 4.5;
            ctx.beginPath();
            ctx.moveTo(cx - dx * len, cy - dy * len);
            ctx.lineTo(cx + dx * len, cy + dy * len);
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.lineWidth = hw * 2;
          }
          ctx.beginPath();
          ctx.moveTo(cx - dx * (len / 2), cy - dy * (len / 2));
          ctx.lineTo(cx + dx * (len / 2), cy + dy * (len / 2));
          ctx.stroke();
        }
        if (any) alive.push(burst);
      }
      bursts = alive;

      if (bursts.length) raf = requestAnimationFrame(draw);
      else { ctx.clearRect(0, 0, canvas.width / ratio, canvas.height / ratio); raf = 0; }
    }

    document.addEventListener('pointerdown', function (ev) {
      if (ev.pointerType && ev.pointerType !== 'mouse') return;   // 触屏/笔交给 click
      if (ev.button !== 0) return;
      ensure();
      spawn(ev.clientX, ev.clientY);
    });
    document.addEventListener('click', function (ev) {
      if (ev.detail !== 0) {                     // 键盘触发的 click 没有坐标
        if (ev.pointerType === 'mouse') return;  // 鼠标已经在 pointerdown 里爆过
        ensure();
        spawn(ev.clientX, ev.clientY);
      } else {
        var r = ev.target.getBoundingClientRect();
        ensure();
        spawn(r.left + r.width / 2, r.top + r.height / 2);
      }
    });
  }

  /* ================= 卡片悬浮：指针倾斜 + 光斑跟手 ================= */

  var EFFECTS = {
    countup: countUp,
    blurtext: blurText,
    glare: glare,
    tilt: tilt,
    reveal: reveal
  };

  function tilt(el) {
    el.classList.add('rb-tilt');
    if (reducedMotion() || !finePointer()) return;
    var max = num(el.dataset.rbTilt, 3.4);
    var raf = 0, nx = 0, ny = 0;

    function apply() {
      raf = 0;
      el.style.setProperty('--rb-tx', (nx * max).toFixed(2) + 'deg');
      el.style.setProperty('--rb-ty', (-ny * max).toFixed(2) + 'deg');
      el.style.setProperty('--rb-mx', ((nx + 0.5) * 100).toFixed(1) + '%');
      el.style.setProperty('--rb-my', ((ny + 0.5) * 100).toFixed(1) + '%');
    }
    function move(e) {
      var r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      nx = (e.clientX - r.left) / r.width - 0.5;
      ny = (e.clientY - r.top) / r.height - 0.5;
      if (!raf) raf = requestAnimationFrame(apply);
    }
    function rest() { nx = 0; ny = 0; apply(); }

    el.addEventListener('pointermove', move);
    el.addEventListener('pointerleave', rest);
    el.addEventListener('pointercancel', rest);
  }

  /* ================= 入场：滚动到位时错落浮现 ================= */
  // 关键：rb-reveal 这个类只由 JS 加上去。脚本没跑（或出错）时元素保持默认可见，
  // 绝不会出现「JS 挂了整页空白」。

  function reveal(el) {
    el.classList.add('rb-reveal');
    if (reducedMotion() || typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-in');
      return;
    }
    var d = el.dataset.rbDelay;
    if (d === undefined) {
      var sibs = el.parentElement ? el.parentElement.querySelectorAll(':scope > [data-rb]') : [];
      var i = Array.prototype.indexOf.call(sibs, el);
      d = Math.min(Math.max(i, 0) * 70, 420);
    }
    el.style.setProperty('--rb-delay', num(d, 0) + 'ms');
    inView(el, function () { el.classList.add('is-in'); }, 0.08);
    // 兜底：万一 IntersectionObserver 因为容器尺寸/时机没回调，也别让内容一直看不见
    window.setTimeout(function () { el.classList.add('is-in'); }, 2500);
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  function finePointer() {
    return !!(window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches);
  }

  /* ================= 自动挂载 ================= */

  function scan(root) {
    var scope = root || document;
    var list = scope.querySelectorAll('[data-rb]');
    for (var i = 0; i < list.length; i++) {
      var el = list[i];
      var names = String(el.getAttribute('data-rb') || '').split(/\s+/);
      for (var j = 0; j < names.length; j++) {
        var key = names[j].toLowerCase();
        var fn = EFFECTS[key];
        var flag = '__rb_' + key;
        if (fn && !el[flag]) { el[flag] = 1; fn(el); }
      }
    }
  }

  // home.js / pages.js 渲染完成后会派发 site:rendered
  document.addEventListener('site:rendered', function () { scan(document); });
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { scan(document); clickSpark(); });
  } else {
    scan(document);
    clickSpark();
  }

  window.RB = { scan: scan, countUp: countUp, blurText: blurText, glare: glare, tilt: tilt, reveal: reveal, clickSpark: clickSpark, version: '1.1.0' };
})();