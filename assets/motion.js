/* Motion kit (GSAP 3.12.5) — core, text split, and the effects this site uses.
   Markup API: data-motion="name" + data-m-* options (data-m-foo -> opts.foo).
   Triggers: view (default) | load | manual. Effects return { tl, cleanup }. */
(function () {
  if (!window.gsap) { return; } // fail safe: page stays fully visible without GSAP
  var M = window.Motion = { fx: {}, inst: new WeakMap() };
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  M.reduce = reduce;

  function coerce(v) {
    if (v === '' || v === 'true') return true;
    if (v === 'false') return false;
    if (v !== null && v !== undefined && !isNaN(v) && String(v).trim() !== '') return Number(v);
    return v;
  }
  function opts(el) {
    var o = {};
    for (var k in el.dataset) {
      var m = /^m([A-Z])(.*)$/.exec(k);
      if (m) o[m[1].toLowerCase() + m[2]] = coerce(el.dataset[k]);
    }
    return o;
  }

  M.define = function (name, fn, meta) { M.fx[name] = { fn: fn, meta: meta || {} }; };

  M.kill = function (el) {
    var r = M.inst.get(el);
    if (r) { if (r.tl) r.tl.kill(); if (r.cleanup) r.cleanup(); M.inst.delete(el); }
    el.classList.remove('m-on');
  };

  M.run = function (el) {
    var fx = M.fx[el.dataset.motion];
    if (!fx) return;
    M.kill(el);
    var r = fx.fn(el, opts(el));
    M.inst.set(el, r);
    el.classList.add('m-on');
    if (reduce && r.tl) { fx.meta.continuous ? r.tl.pause(0) : r.tl.progress(1, false); }
  };
  M.replay = function (el) { M.run(el); };

  // Add data-motion to elements matched by rules: [selector, effect, {opt: value}]
  M.tag = function (rules) {
    rules.forEach(function (r) {
      document.querySelectorAll(r[0]).forEach(function (el) {
        if (el.hasAttribute('data-motion')) return;
        el.setAttribute('data-motion', r[1]);
        var a = r[2] || {};
        for (var k in a) el.setAttribute('data-m-' + k, a[k]);
      });
    });
  };

  M.init = function (root) {
    root = root || document;
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { io.unobserve(e.target); M.run(e.target); } });
    }, { rootMargin: '0px 0px -10% 0px', threshold: 0.01 });
    root.querySelectorAll('[data-motion]').forEach(function (el) {
      if (el.classList.contains('m-on')) return;
      var t = opts(el).trigger || 'view';
      if (t === 'load') M.run(el);
      else if (t === 'view') { reduce ? M.run(el) : io.observe(el); }
    });
  };

  M.start = function () {
    clearTimeout(window.__mFail);
    var go = function () { M.init(); document.documentElement.classList.add('m-ready'); };
    (document.fonts && document.fonts.ready) ? document.fonts.ready.then(go, go) : go();
  };

  /* ---- Text split: lines (masked). Text only; screen readers get a hidden copy. ---- */
  M.split = function (el) {
    var orig = el.innerHTML, txt = el.textContent.replace(/\s+/g, ' ').trim();
    // words in document order, remembering which sit inside a .hl highlight
    var toks = [];
    (function walk(node, hl) {
      Array.prototype.forEach.call(node.childNodes, function (c) {
        if (c.nodeType === 3) c.nodeValue.split(/\s+/).forEach(function (w) { if (w) toks.push({ w: w, hl: hl }); });
        else if (c.nodeType === 1) walk(c, hl || c.classList.contains('hl'));
      });
    })(el, false);
    el.innerHTML = '';
    var sr = document.createElement('span'); sr.className = 'm-sr'; sr.textContent = txt;
    var vis = document.createElement('span'); vis.className = 'm-vis'; vis.setAttribute('aria-hidden', 'true');
    var words = toks.map(function (t) {
      var s = document.createElement('span'); s.className = 'm-w'; s.textContent = t.w;
      vis.appendChild(s); vis.appendChild(document.createTextNode(' ')); return s;
    });
    el.appendChild(sr); el.appendChild(vis);
    var lines = [], top = null, cur = null;
    words.forEach(function (w, n) {
      var t = w.offsetTop;
      if (top === null || Math.abs(t - top) > 4) { cur = []; lines.push(cur); top = t; }
      cur.push(toks[n]);
    });
    vis.innerHTML = '';
    var inners = lines.map(function (ws) {
      var l = document.createElement('span'); l.className = 'm-line';
      var i = document.createElement('span'); i.className = 'm-line-in';
      ws.forEach(function (t, k) {
        if (k) i.appendChild(document.createTextNode(' '));
        if (t.hl) { var h = document.createElement('span'); h.className = 'hl'; h.textContent = t.w; i.appendChild(h); }
        else i.appendChild(document.createTextNode(t.w));
      });
      l.appendChild(i); vis.appendChild(l); return i;
    });
    return { lines: inners, revert: function () { el.innerHTML = orig; } };
  };

  /* ---- Effects ---- */
  M.define('line-reveal', function (el, o) {
    var s = M.split(el);
    var tl = gsap.timeline({ delay: o.delay || 0, onComplete: s.revert });
    tl.from(s.lines, {
      yPercent: 115, rotate: o.rotate == null ? 3 : o.rotate, transformOrigin: '0% 100%',
      duration: o.duration || 1.2, ease: 'expo.out', stagger: o.stagger == null ? 0.12 : o.stagger
    });
    return { tl: tl, cleanup: s.revert };
  });

  M.define('rise', function (el, o) {
    var t = o.children ? Array.prototype.slice.call(el.children) : [el];
    var clear = function () { gsap.set(t, { clearProps: 'transform,opacity' }); };
    var tl = gsap.timeline({ delay: o.delay || 0, onComplete: clear });
    tl.from(t, { y: o.y == null ? 34 : o.y, opacity: 0, duration: o.duration || 1, ease: 'power4.out', stagger: o.stagger == null ? 0.1 : o.stagger });
    return { tl: tl, cleanup: clear };
  });

  M.define('img-reveal', function (el, o) {
    var clear = function () { gsap.set(el, { clearProps: 'clipPath,webkitClipPath' }); };
    var tl = gsap.timeline({ delay: o.delay || 0, onComplete: clear });
    tl.fromTo(el, { clipPath: 'inset(0% 0% 100% 0%)' }, { clipPath: 'inset(0% 0% 0% 0%)', duration: o.duration || 1.3, ease: 'expo.out' });
    return { tl: tl, cleanup: clear };
  });

  M.define('count-up', function (el, o) {
    var finalText = el.textContent, to = Number(o.to), dec = o.decimals || 0, obj = { v: Number(o.from || 0) };
    var fmt = function (v) {
      return (o.prefix || '') + Number(v).toLocaleString('en-US', { minimumFractionDigits: dec, maximumFractionDigits: dec }) + (o.suffix || '');
    };
    el.textContent = fmt(obj.v);
    var tl = gsap.timeline({ delay: o.delay || 0 });
    tl.to(obj, { v: to, duration: o.duration || 2, ease: 'power3.out', onUpdate: function () { el.textContent = fmt(obj.v); } });
    return { tl: tl, cleanup: function () { el.textContent = finalText; } };
  });

  M.define('marquee', function (el, o) {
    var track = el.querySelector('.m-track');
    if (!M.reduce && !track.dataset.cloned) {
      Array.prototype.slice.call(track.children).forEach(function (c) {
        var k = c.cloneNode(true); k.setAttribute('aria-hidden', 'true'); track.appendChild(k);
      });
      track.dataset.cloned = '1';
    }
    var tl = gsap.timeline({ repeat: -1 });
    tl.fromTo(track, { xPercent: 0 }, { xPercent: -50, duration: o.duration || 40, ease: 'none' });
    var slow = function () { gsap.to(tl, { timeScale: 0.15, duration: 0.6 }); };
    var fast = function () { gsap.to(tl, { timeScale: 1, duration: 0.6 }); };
    el.addEventListener('mouseenter', slow); el.addEventListener('mouseleave', fast);
    return { tl: tl, cleanup: function () { el.removeEventListener('mouseenter', slow); el.removeEventListener('mouseleave', fast); gsap.set(track, { clearProps: 'transform' }); } };
  }, { continuous: true });
})();
