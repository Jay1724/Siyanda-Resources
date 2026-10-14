(function () {
  var M = window.Motion;

  // Mobile menu
  var btn = document.querySelector('.menu-btn');
  var nav = document.querySelector('.nav');
  if (btn && nav) {
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  // Hero slider — each new slide replays its own text motion
  var slides = document.querySelectorAll('.slide');
  var dots = document.querySelectorAll('.dot');
  if (slides.length > 1) {
    var i = 0, timer;
    var show = function (n) {
      slides[i].classList.remove('active'); dots[i].classList.remove('active');
      i = (n + slides.length) % slides.length;
      slides[i].classList.add('active'); dots[i].classList.add('active');
      if (M) slides[i].querySelectorAll('[data-motion]').forEach(M.replay);
    };
    var start = function () {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
      timer = setInterval(function () { show(i + 1); }, 7000);
    };
    dots.forEach(function (d, n) {
      d.addEventListener('click', function () { clearInterval(timer); if (n !== i) show(n); start(); });
    });
    start();
  }

  // Graceful fallback for any image that fails to load
  document.querySelectorAll('img[data-initials]').forEach(function (img) {
    img.addEventListener('error', function () {
      var s = document.createElement('span');
      s.className = 'ini';
      s.textContent = img.getAttribute('data-initials');
      img.replaceWith(s);
    });
  });

  // Motion: tag page elements, then start
  if (M) {
    M.tag([
      ['.split > img', 'img-reveal'],
      ['.split > div, .split > ul', 'rise', { children: '', stagger: '.1' }],
      ['.banner .wrap, .section.dark > .wrap', 'rise', { children: '', stagger: '.1' }],
      ['.section:not(.dark) > .wrap > :is(.eyebrow, h2, .lead, p)', 'rise'],
      ['.grid, .gallery', 'rise', { children: '', stagger: '.06' }],
      ['.op, .invest, .post', 'rise'],
      ['.foot-grid', 'rise', { children: '', stagger: '.12' }]
    ]);
    M.start();
  }
})();
