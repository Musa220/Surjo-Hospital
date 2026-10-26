/**
 * Lab Test Catalog & Pricing (Lab Orders page, "Test catalog & pricing" tab)
 *
 * When the hospital adds a new lab service, raises a price, or runs an offer,
 * the front desk can do it here without touching any code:
 *  - Add a new test (code, name, category, price, optional discount)
 *  - Edit the name, category, price or discount of any test
 *  - Disable a test (hidden from new orders) or enable it again
 *  - Delete a test that has never been ordered
 *  - Give one discount to a whole category or to every test (health camp / offer week)
 *
 * Rules that keep old records correct:
 *  - Every lab order stores the price it was billed at, so changing a price or
 *    discount affects NEW orders only. Past bills, dues and reports do not move.
 *  - A test that has been ordered is never deleted, only disabled.
 *  - A discount with a "valid until" date switches itself off after that day.
 */
(function () {
  'use strict';

  var esc = SMH.esc;
  var state = { filter: 'Active', query: '', category: '' };

  var COMMON_CATEGORIES = [
    'Hematology', 'Biochemistry', 'Pathology', 'Radiology', 'Microbiology',
    'Cardiology', 'Immunology', 'Hormones', 'Ultrasound', 'General'
  ];

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('pane-catalog')) return;

    SMH.initTabs();
    bindEvents();
    render();
  });

  /* ---------- helpers ---------- */

  function orderCounts() {
    var counts = {};
    getStorage(STORAGE_KEYS.LAB_TESTS, []).forEach(function (o) {
      counts[o.testCode] = (counts[o.testCode] || 0) + 1;
    });
    return counts;
  }

  function categoriesInUse() {
    var seen = {};
    var list = [];
    getTestCatalog().forEach(function (t) {
      if (!seen[t.category]) { seen[t.category] = true; list.push(t.category); }
    });
    return list.sort();
  }

  function showError(id, msg) {
    var el = document.getElementById(id);
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
    return false;
  }

  function parsePercent(raw) {
    if (raw === '' || raw === null || raw === undefined) return 0;
    var n = Math.round(parseFloat(raw));
    return isNaN(n) ? NaN : n;
  }

  /* ---------- events ---------- */

  function bindEvents() {
    document.getElementById('btn-add-test').addEventListener('click', function () { openForm(null); });
    document.getElementById('btn-bulk-discount').addEventListener('click', openBulk);
    document.getElementById('btn-test-cancel').addEventListener('click', function () { SMH.closeModal('test-modal'); });
    document.getElementById('btn-bulk-cancel').addEventListener('click', function () { SMH.closeModal('bulk-modal'); });
    document.getElementById('test-form').addEventListener('submit', handleSave);
    document.getElementById('bulk-form').addEventListener('submit', handleBulk);

    ['test-price', 'test-discount', 'test-until'].forEach(function (id) {
      document.getElementById(id).addEventListener('input', updatePreview);
    });

    document.getElementById('test-code').addEventListener('input', function (e) {
      var pos = e.target.selectionStart;
      e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, '');
      e.target.setSelectionRange(pos, pos);
    });

    document.getElementById('test-search').addEventListener('input', function (e) {
      state.query = e.target.value.trim().toLowerCase();
      render();
    });
    document.getElementById('test-category-filter').addEventListener('change', function (e) {
      state.category = e.target.value;
      render();
    });

    document.querySelectorAll('#test-filter .filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#test-filter .filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.filter = btn.getAttribute('data-test-filter');
        render();
      });
    });

    document.getElementById('catalog-table-body').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var code = btn.getAttribute('data-code');
      var action = btn.getAttribute('data-action');
      if (action === 'edit') openForm(code);
      else if (action === 'toggle') toggleActive(code);
      else if (action === 'delete') removeTest(code);
    });
  }

  /* ---------- table ---------- */

  function discountCell(t) {
    var pct = Number(t.discountPercent) || 0;
    if (pct <= 0) return '—';
    var today = getToday();
    if (t.discountUntil && today > t.discountUntil) {
      return '<span class="tag-expired">' + pct + '% ended ' + esc(t.discountUntil) + '</span>';
    }
    var tail = t.discountUntil ? 'until ' + esc(t.discountUntil) : 'no end date';
    return '<span class="tag-discount">-' + pct + '%</span><small class="cell-sub">' + tail + '</small>';
  }

  function render() {
    var tests = getTestCatalog();
    var counts = orderCounts();

    var tally = { All: tests.length, Active: 0, Disabled: 0 };
    tests.forEach(function (t) { tally[t.active ? 'Active' : 'Disabled'] += 1; });
    document.querySelectorAll('#test-filter [data-count-for]').forEach(function (el) {
      el.textContent = tally[el.getAttribute('data-count-for')];
    });
    SMH.setTabCount('catalog', tally.Active);

    // Category dropdown (keeps the current choice when it still exists)
    var cats = categoriesInUse();
    if (state.category && cats.indexOf(state.category) === -1) state.category = '';
    var sel = document.getElementById('test-category-filter');
    sel.innerHTML = '<option value="">All categories</option>' + cats.map(function (c) {
      return '<option value="' + esc(c) + '"' + (c === state.category ? ' selected' : '') + '>' + esc(c) + '</option>';
    }).join('');

    var rows = tests.filter(function (t) {
      if (state.filter === 'Active' && !t.active) return false;
      if (state.filter === 'Disabled' && t.active) return false;
      if (state.category && t.category !== state.category) return false;
      if (!state.query) return true;
      return (t.code + ' ' + t.name + ' ' + t.category).toLowerCase().indexOf(state.query) !== -1;
    }).sort(function (a, b) {
      return a.category.localeCompare(b.category) || a.code.localeCompare(b.code);
    });

    var tbody = document.getElementById('catalog-table-body');
    if (rows.length === 0) {
      var msg = tests.length === 0
        ? 'The catalog is empty. Click "Add new test" to add the first test.'
        : 'No tests match this filter.';
      tbody.innerHTML = '<tr><td colspan="8" class="empty-state">' + msg + '</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (t) {
      var n = counts[t.code] || 0;
      var net = netTestPrice(t);
      var del = n === 0
        ? '<button type="button" class="btn btn-danger btn-sm" data-action="delete" data-code="' + esc(t.code) + '">Delete</button>'
        : '';
      var status = t.active
        ? '<span class="badge badge-completed">Available</span>'
        : '<span class="badge badge-muted">Disabled</span>';
      var priceCell = net !== t.price
        ? '<span class="price-old">' + t.price.toLocaleString() + '</span> <strong>' + net.toLocaleString() + '</strong>'
        : '<strong>' + net.toLocaleString() + '</strong>';
      var orderedNote = n === 0 ? 'never ordered' : 'ordered ' + n + (n === 1 ? ' time' : ' times');
      return '<tr>' +
        '<td data-label="Code"><span class="badge badge-id">' + esc(t.code) + '</span></td>' +
        '<td data-label="Test" class="cell-wrap"><div>' + esc(t.name) + '<small class="cell-sub">' + orderedNote + '</small></div></td>' +
        '<td data-label="Category">' + esc(t.category) + '</td>' +
        '<td data-label="List price" style="text-align: right;">' + t.price.toLocaleString() + '</td>' +
        '<td data-label="Discount"><div>' + discountCell(t) + '</div></td>' +
        '<td data-label="Patient pays" style="text-align: right;">' + priceCell + '</td>' +
        '<td data-label="Status">' + status + '</td>' +
        '<td data-label="Actions" style="text-align: right;"><div class="row-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-code="' + esc(t.code) + '">Edit</button>' +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="toggle" data-code="' + esc(t.code) + '">' + (t.active ? 'Disable' : 'Enable') + '</button>' +
          del +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- add / edit test ---------- */

  function fillCategoryList() {
    var names = COMMON_CATEGORIES.slice();
    categoriesInUse().forEach(function (c) { if (names.indexOf(c) === -1) names.push(c); });
    document.getElementById('test-category-list').innerHTML = names.map(function (n) {
      return '<option value="' + esc(n) + '"></option>';
    }).join('');
  }

  function updatePreview() {
    var el = document.getElementById('test-price-preview');
    var price = Math.round(parseFloat(document.getElementById('test-price').value));
    if (isNaN(price)) { el.innerHTML = ''; return; }
    var pct = parsePercent(document.getElementById('test-discount').value);
    var until = document.getElementById('test-until').value;
    if (isNaN(pct) || pct < 0 || pct > 100) { el.innerHTML = ''; return; }

    var net = netTestPrice({ price: price, discountPercent: pct, discountUntil: until });
    if (pct > 0 && net === price) {
      el.innerHTML = 'Patient pays <strong>Tk ' + price.toLocaleString() + '</strong> (that discount has already ended).';
    } else if (pct > 0) {
      el.innerHTML = 'Patient pays <strong>Tk ' + net.toLocaleString() + '</strong> <span class="price-old">Tk ' + price.toLocaleString() + '</span> <span class="tag-discount">-' + pct + '%</span>';
    } else {
      el.innerHTML = 'Patient pays <strong>Tk ' + price.toLocaleString() + '</strong>';
    }
  }

  function openForm(code) {
    document.getElementById('test-form').reset();
    showError('test-form-error', '');
    fillCategoryList();

    var test = code ? getTestCatalog().find(function (t) { return t.code === code; }) : null;
    if (code && !test) return;

    document.getElementById('test-edit-code').value = code || '';
    document.getElementById('test-modal-title').textContent = test ? 'Edit test' : 'Add new test';
    document.getElementById('test-modal-desc').textContent = test
      ? 'The test code cannot be changed because past orders use it.'
      : 'The test appears in the order form as soon as you save it.';
    document.getElementById('btn-test-save').textContent = test ? 'Save changes' : 'Add test';
    document.getElementById('test-price-hint').style.display = test ? 'block' : 'none';

    var codeInput = document.getElementById('test-code');
    codeInput.disabled = !!test;

    if (test) {
      codeInput.value = test.code;
      document.getElementById('test-name').value = test.name;
      document.getElementById('test-category').value = test.category;
      document.getElementById('test-price').value = test.price;
      document.getElementById('test-discount').value = test.discountPercent || '';
      document.getElementById('test-until').value = test.discountUntil;
      document.getElementById('test-active').value = String(test.active);
    } else {
      document.getElementById('test-active').value = 'true';
    }
    updatePreview();
    SMH.openModal('test-modal');
  }

  function handleSave(e) {
    e.preventDefault();

    var editCode = document.getElementById('test-edit-code').value;
    var code = (editCode || document.getElementById('test-code').value).trim().toUpperCase();
    var name = document.getElementById('test-name').value.trim().replace(/\s+/g, ' ');
    var category = document.getElementById('test-category').value.trim() || 'General';
    var priceRaw = document.getElementById('test-price').value;
    var price = Math.round(parseFloat(priceRaw));
    var pct = parsePercent(document.getElementById('test-discount').value);
    var until = document.getElementById('test-until').value;
    var active = document.getElementById('test-active').value !== 'false';

    if (!/^[A-Z0-9][A-Z0-9_-]{1,11}$/.test(code)) {
      return showError('test-form-error', 'Enter a test code of 2 to 12 letters or numbers, for example USG or ECG.');
    }
    if (!name) return showError('test-form-error', 'Please enter the test name.');
    if (priceRaw === '' || isNaN(price) || price < 0) return showError('test-form-error', 'Please enter a valid list price (0 or more).');
    if (isNaN(pct) || pct < 0 || pct > 100) return showError('test-form-error', 'The discount must be between 0 and 100 percent.');
    if (pct > 0 && until && until < getToday()) {
      return showError('test-form-error', 'The discount end date is already in the past. Pick today or a later date, or leave it empty.');
    }
    if (pct === 0) until = '';

    var tests = getTestCatalog();
    if (!editCode && tests.some(function (t) { return t.code === code; })) {
      return showError('test-form-error', 'The code ' + code + ' is already used. Pick a different code.');
    }

    if (editCode) {
      var idx = tests.findIndex(function (t) { return t.code === editCode; });
      if (idx === -1) return showError('test-form-error', 'This test no longer exists.');
      tests[idx] = Object.assign({}, tests[idx], {
        name: name, category: category, price: price,
        discountPercent: pct, discountUntil: until, active: active
      });
      saveTestCatalog(tests);
      SMH.toast('lab-alert', code + ' updated. New orders use the new price.', 'success');
    } else {
      tests.push({
        code: code, name: name, category: category, price: price,
        discountPercent: pct, discountUntil: until, active: active
      });
      saveTestCatalog(tests);
      SMH.toast('lab-alert', code + ' added to the lab catalog' + (active ? ' and ready to order.' : ' (disabled).'), 'success');
    }

    SMH.closeModal('test-modal');
    afterChange();
  }

  /* ---------- quick actions ---------- */

  function toggleActive(code) {
    var tests = getTestCatalog();
    var idx = tests.findIndex(function (t) { return t.code === code; });
    if (idx === -1) return;
    tests[idx].active = !tests[idx].active;
    saveTestCatalog(tests);
    SMH.toast('lab-alert', code + (tests[idx].active ? ' is available for new orders again.' : ' disabled. It is hidden from new orders; old orders are not affected.'), 'info');
    afterChange();
  }

  function removeTest(code) {
    var test = getTestCatalog().find(function (t) { return t.code === code; });
    if (!test) return;
    if ((orderCounts()[code] || 0) > 0) {
      SMH.toast('lab-alert', code + ' has been ordered before. Disable it instead of deleting.', 'danger');
      return;
    }
    if (!confirm('Delete ' + test.code + ' - ' + test.name + '? It has never been ordered, so nothing else is affected.')) return;
    saveTestCatalog(getTestCatalog().filter(function (t) { return t.code !== code; }));
    SMH.toast('lab-alert', code + ' deleted from the catalog.', 'info');
    afterChange();
  }

  /* ---------- discount many tests ---------- */

  function openBulk() {
    document.getElementById('bulk-form').reset();
    showError('bulk-form-error', '');
    var cats = [];
    getTestCatalog({ activeOnly: true }).forEach(function (t) {
      if (cats.indexOf(t.category) === -1) cats.push(t.category);
    });
    cats.sort();
    document.getElementById('bulk-category').innerHTML =
      '<option value="">Every available test</option>' +
      cats.map(function (c) { return '<option value="' + esc(c) + '">Only ' + esc(c) + ' tests</option>'; }).join('');
    SMH.openModal('bulk-modal');
  }

  function handleBulk(e) {
    e.preventDefault();
    var category = document.getElementById('bulk-category').value;
    var pct = parsePercent(document.getElementById('bulk-percent').value);
    var until = document.getElementById('bulk-until').value;
    var raw = document.getElementById('bulk-percent').value;

    if (raw === '' || isNaN(pct) || pct < 0 || pct > 100) {
      return showError('bulk-form-error', 'Enter a discount between 0 and 100 percent (0 removes discounts).');
    }
    if (pct > 0 && until && until < getToday()) {
      return showError('bulk-form-error', 'The end date is already in the past. Pick today or a later date, or leave it empty.');
    }

    var tests = getTestCatalog();
    var changed = 0;
    tests.forEach(function (t) {
      if (!t.active) return;
      if (category && t.category !== category) return;
      t.discountPercent = pct;
      t.discountUntil = pct > 0 ? until : '';
      changed += 1;
    });

    if (changed === 0) return showError('bulk-form-error', 'There are no available tests to change.');

    saveTestCatalog(tests);
    var scope = category ? category + ' tests' : 'tests';
    var msg = pct === 0
      ? 'Discounts removed from ' + changed + ' ' + scope + '.'
      : pct + '% discount set on ' + changed + ' ' + scope + (until ? ' until ' + until + '.' : '.');
    SMH.toast('lab-alert', msg, 'success');
    SMH.closeModal('bulk-modal');
    afterChange();
  }

  function afterChange() {
    render();
    // Keep the order form in step with the catalog
    if (typeof renderCatalogCheckboxes === 'function') renderCatalogCheckboxes();
  }
})();
