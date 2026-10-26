/**
 * Small shared helpers for the management screens (doctors, lab catalog, billing).
 * Everything lives on one global object, SMH, so it cannot clash with the
 * per-page scripts. Purely UI: it never reads or writes hospital records.
 */
(function () {
  'use strict';

  var SMH = window.SMH = window.SMH || {};

  /** Escape text before putting it into innerHTML. */
  SMH.esc = function (value) {
    if (value === null || value === undefined) return '';
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  /** "Tk 1,250" */
  SMH.money = function (n) {
    return 'Tk ' + (Number(n) || 0).toLocaleString();
  };

  /** Show a toast in the page's .toast-slot element. */
  SMH.toast = function (slotId, message, type) {
    var slot = document.getElementById(slotId);
    if (!slot) return;
    slot.innerHTML = '<div class="alert alert-' + (type || 'success') + '">' + SMH.esc(message) + '</div>';
    clearTimeout(slot._smhTimer);
    slot._smhTimer = setTimeout(function () { slot.innerHTML = ''; }, 4500);
  };

  /* ---------- Modal dialogs (reuses the .modal-backdrop styles) ---------- */
  var lastFocus = null;

  SMH.openModal = function (id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    lastFocus = document.activeElement;
    modal.classList.add('open');
    var first = modal.querySelector('input:not([type=hidden]):not([disabled]), select, textarea');
    // Focus straight away: a delayed focus could steal the cursor from a field the user already started typing in
    if (first) first.focus();
  };

  SMH.closeModal = function (id) {
    var modal = document.getElementById(id);
    if (!modal) return;
    modal.classList.remove('open');
    if (lastFocus && typeof lastFocus.focus === 'function') {
      try { lastFocus.focus(); } catch (e) { /* element may be gone after a re-render */ }
    }
  };

  /* Close on Escape or when the dark backdrop itself is clicked. */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var open = document.querySelector('.modal-backdrop.open');
    if (open) SMH.closeModal(open.id);
  });

  document.addEventListener('mousedown', function (e) {
    if (e.target && e.target.classList && e.target.classList.contains('modal-backdrop')) {
      SMH.closeModal(e.target.id);
    }
  });

  /* ---------- Print one slip (prescription, lab report) ----------
     The slip HTML is put into a hidden #print-root block and only that block is
     printed (see "Printable slips" in style.css), so the page around it is left out. */
  SMH.printSheet = function (html) {
    var root = document.getElementById('print-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'print-root';
      root.className = 'print-root';
      document.body.appendChild(root);
    }
    root.innerHTML = html;
    document.body.classList.add('printing-sheet');

    var finished = false;
    var done = function () {
      if (finished) return;
      finished = true;
      document.body.classList.remove('printing-sheet');
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    window.print();
    // Some browsers do not report afterprint; tidy up anyway
    setTimeout(done, 2000);
  };

  /* ---------- Page tabs ----------
     Buttons:  <button class="tab-btn" data-pane="doctors">
     Panes:    <section class="page-pane" id="pane-doctors">
     A link like visits.html#doctors opens that tab directly. */
  SMH.initTabs = function () {
    var tabs = Array.prototype.slice.call(document.querySelectorAll('.tab-btn[data-pane]'));
    if (tabs.length === 0) return;

    function show(name, updateHash) {
      var found = false;
      tabs.forEach(function (t) {
        var on = t.getAttribute('data-pane') === name;
        if (on) found = true;
        t.classList.toggle('active', on);
        t.setAttribute('aria-selected', on ? 'true' : 'false');
      });
      if (!found) return false;
      document.querySelectorAll('.page-pane').forEach(function (p) {
        p.classList.toggle('active', p.id === 'pane-' + name);
      });
      if (updateHash && window.history && history.replaceState) {
        history.replaceState(null, '', '#' + name);
      }
      return true;
    }

    tabs.forEach(function (t) {
      t.addEventListener('click', function () { show(t.getAttribute('data-pane'), true); });
    });

    var fromHash = (window.location.hash || '').replace('#', '');
    if (fromHash) show(fromHash, false);
    window.addEventListener('hashchange', function () {
      show((window.location.hash || '').replace('#', ''), false);
    });
  };

  /** Update the little count shown on a tab, e.g. "Doctors (6)". */
  SMH.setTabCount = function (name, count) {
    var el = document.querySelector('.tab-btn[data-pane="' + name + '"] .tab-count');
    if (el) el.textContent = count;
  };
})();
