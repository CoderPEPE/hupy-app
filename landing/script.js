/* Hupy landing page — minimal interactivity, no dependencies. */

(function () {
  'use strict';

  var nav = document.getElementById('site-nav');
  var burger = document.querySelector('.nav-burger');
  var menu = document.getElementById('mobile-menu');

  // Mobile menu toggle
  if (burger && menu) {
    burger.addEventListener('click', function () {
      var open = menu.hidden;
      menu.hidden = !open;
      burger.setAttribute('aria-expanded', String(open));
    });

    menu.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        menu.hidden = true;
        burger.setAttribute('aria-expanded', 'false');
      }
    });
  }

  // Shrink the navbar after scrolling
  function onScroll() {
    if (nav) nav.classList.toggle('is-scrolled', window.scrollY > 8);
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  // Scroll-reveal for sections
  var revealables = document.querySelectorAll('.section-head, .feature-grid, .steps, .planet-row, .language-strip, .cta-card, .legal-inner');
  if ('IntersectionObserver' in window) {
    revealables.forEach(function (el) { el.classList.add('reveal'); });
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.12 });
    revealables.forEach(function (el) { io.observe(el); });
  }
})();
