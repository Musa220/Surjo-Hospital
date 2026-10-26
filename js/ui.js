/**
 * Shared UI behaviour (loaded on every page):
 *  - light / dark theme toggle (remembered in localStorage as smh_theme)
 *  - mobile navigation drawer
 *  - the "day arc" on the dashboard: a sun that sits at the current time of day
 *
 * Purely visual. It never reads or writes hospital records.
 */
(function () {
  'use strict';

  var root = document.documentElement;
  var THEME_KEY = 'smh_theme';

  /* ---------- Theme ---------- */
  function currentTheme() {
    return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
  }

  function syncThemeButtons() {
    var next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.setAttribute('aria-label', 'Switch to ' + next + ' theme');
    });
  }

  function setTheme(theme) {
    root.setAttribute('data-theme', theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch (err) {
      /* storage can be blocked; the theme still applies for this visit */
    }
    syncThemeButtons();
  }

  document.querySelectorAll('.theme-toggle').forEach(function (btn) {
    btn.addEventListener('click', function () {
      setTheme(currentTheme() === 'dark' ? 'light' : 'dark');
    });
  });
  syncThemeButtons();

  /* ---------- Mobile navigation drawer ---------- */
  var sidebar = document.getElementById('sidebar');
  var scrim = document.getElementById('scrim');
  var navToggle = document.querySelector('.nav-toggle');
  var narrow = window.matchMedia('(max-width: 960px)');

  function setNav(open) {
    if (!sidebar) return;
    sidebar.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
    if (navToggle) navToggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    sidebar.inert = narrow.matches && !open;
    if (open) {
      var first = sidebar.querySelector('.main-nav a');
      if (first) first.focus();
    }
  }

  if (sidebar && navToggle) {
    navToggle.addEventListener('click', function () {
      setNav(!sidebar.classList.contains('open'));
    });
    if (scrim) scrim.addEventListener('click', function () { setNav(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && sidebar.classList.contains('open')) {
        setNav(false);
        navToggle.focus();
      }
    });
    var onWidthChange = function () { setNav(false); };
    if (narrow.addEventListener) narrow.addEventListener('change', onWidthChange);
    else if (narrow.addListener) narrow.addListener(onWidthChange);
    sidebar.inert = narrow.matches;
  }

  /* ---------- Top bar: date chip and patient search ---------- */
  var topDate = document.getElementById('top-date');
  if (topDate) {
    topDate.textContent = new Date().toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });
  }

  var topSearch = document.querySelector('.top-search input');
  if (topSearch) {
    /* Press "/" anywhere to jump to the search box. */
    document.addEventListener('keydown', function (e) {
      if (e.key !== '/' || e.ctrlKey || e.metaKey || e.altKey) return;
      var tag = (document.activeElement && document.activeElement.tagName) || '';
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      e.preventDefault();
      topSearch.focus();
    });

    /* On the Patients page, a search sent from the top bar fills the list filter. */
    var listSearch = document.getElementById('patient-search');
    if (listSearch) {
      var q = new URLSearchParams(window.location.search).get('q');
      if (q) {
        topSearch.value = q;
        document.addEventListener('DOMContentLoaded', function () {
          listSearch.value = q;
          listSearch.dispatchEvent(new Event('input', { bubbles: true }));
        });
      }
    }
  }

  /* ---------- Day arc (dashboard) ---------- */
  var arc = document.getElementById('day-arc');
  if (arc) {
    var CX = 110;
    var CY = 104;
    var R = 92;
    var core = arc.querySelector('.sun-core');
    var halo = arc.querySelector('.sun-halo');
    var progress = arc.querySelector('.arc-progress');
    var greetingEl = document.getElementById('arc-greeting');
    var timeEl = document.getElementById('arc-time');

    var place = function (t) {
      var angle = Math.PI * t;
      var x = CX - R * Math.cos(angle);
      var y = CY - R * Math.sin(angle);
      core.setAttribute('cx', x.toFixed(2));
      core.setAttribute('cy', y.toFixed(2));
      halo.setAttribute('cx', x.toFixed(2));
      halo.setAttribute('cy', y.toFixed(2));
      progress.setAttribute('stroke-dasharray', (t * 100).toFixed(2) + ' 100');
    };

    var clockState = function () {
      var now = new Date();
      var hour = now.getHours() + now.getMinutes() / 60;
      return {
        now: now,
        hour: hour,
        target: Math.min(Math.max((hour - 6) / 12, 0), 1),
        night: hour < 6 || hour >= 18
      };
    };

    var paintCaption = function (state) {
      var greeting = state.hour < 12 ? 'Good morning' : state.hour < 17 ? 'Good afternoon' : 'Good evening';
      if (greetingEl) greetingEl.textContent = greeting;
      if (timeEl) {
        timeEl.textContent = state.now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
      }
      arc.classList.toggle('is-night', state.night);
    };

    var first = clockState();
    paintCaption(first);

    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduceMotion) {
      place(first.target);
    } else {
      /* The page's one entrance moment: the sun rises to where it is now. */
      var start = null;
      var DURATION = 1100;
      place(0);
      var step = function (ts) {
        if (start === null) start = ts;
        var p = Math.min((ts - start) / DURATION, 1);
        var eased = 1 - Math.pow(1 - p, 3);
        place(first.target * eased);
        if (p < 1) window.requestAnimationFrame(step);
      };
      window.requestAnimationFrame(step);
    }

    window.setInterval(function () {
      var state = clockState();
      paintCaption(state);
      place(state.target);
    }, 60000);
  }
})();
