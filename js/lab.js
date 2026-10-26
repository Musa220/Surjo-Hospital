/**
 * Diagnostic Laboratory Controller
 * Manages test catalog requisitions, order status transitions, and clinical result entry.
 */

let currentFilter = 'All';
let catalogQuery = '';
let orderQuery = ''; // text typed in the orders-table search box
// Codes of the tests ticked in the order form. Kept here (not read back from the page)
// so ticked tests stay selected, and are still ordered, while the list is being searched.
const selectedCodes = new Set();

document.addEventListener('DOMContentLoaded', () => {
  initLabPage();
  renderCatalogCheckboxes();
  renderLabTable();
});

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function initLabPage() {
  const dateInput = document.getElementById('lab-order-date');
  if (dateInput) {
    dateInput.value = getToday();
    dateInput.max = getToday(); // a test cannot be ordered in the future
  }

  populatePatientSelect();
  preselectPatientFromLink();

  // An order cannot be dated before the patient was registered. Moving the date can
  // change a test's discount, so the prices are drawn again.
  const patientSelect = document.getElementById('lab-patient');
  if (patientSelect && dateInput) {
    patientSelect.addEventListener('change', () => {
      limitDateToRegistration(dateInput, patientSelect.value);
      renderCatalogCheckboxes();
    });
    limitDateToRegistration(dateInput, patientSelect.value); // patient picked from a profile link
  }

  // A test discount can have an end date, so prices follow the order date
  if (dateInput) {
    dateInput.addEventListener('change', () => renderCatalogCheckboxes());
  }

  const searchInput = document.getElementById('lab-test-search');
  if (searchInput) {
    // Pressing Enter in the search box must not submit the order form
    searchInput.addEventListener('keydown', e => {
      if (e.key === 'Enter') e.preventDefault();
    });
    searchInput.addEventListener('input', () => {
      catalogQuery = searchInput.value.trim().toLowerCase();
      renderCatalogCheckboxes();
    });
  }

  const form = document.getElementById('lab-order-form');
  if (form) {
    form.addEventListener('submit', handleOrderSubmit);
    form.addEventListener('reset', () => {
      setTimeout(() => {
        if (dateInput) {
          dateInput.value = getToday();
          dateInput.max = getToday();
          dateInput.removeAttribute('min'); // no patient chosen after a reset
        }
        catalogQuery = '';
        selectedCodes.clear();
        if (searchInput) searchInput.value = '';
        renderCatalogCheckboxes();
      }, 0);
    });
  }

  // Search box above the orders table (patient, order ID, test, result)
  const orderSearch = document.getElementById('lab-order-search');
  if (orderSearch) {
    orderSearch.addEventListener('keydown', e => {
      if (e.key === 'Enter') e.preventDefault();
    });
    orderSearch.addEventListener('input', () => {
      orderQuery = orderSearch.value.trim().toLowerCase();
      renderLabTable();
    });
  }

  // Filter tabs
  const filterBtns = document.querySelectorAll('.filter-btn');
  filterBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      filterBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFilter = btn.getAttribute('data-filter') || 'All';
      renderLabTable();
    });
  });

  // Result entry modal
  const modal = document.getElementById('result-modal');
  const closeModalBtn = document.getElementById('btn-close-modal');
  if (closeModalBtn && modal) {
    closeModalBtn.addEventListener('click', () => {
      modal.classList.remove('open');
    });
  }

  const resultForm = document.getElementById('result-form');
  if (resultForm) {
    resultForm.addEventListener('submit', handleResultSubmit);
  }
}

/** Opened from a patient's profile: lab.html?patient=SMH-1001 picks that patient. */
function preselectPatientFromLink() {
  const wanted = new URLSearchParams(window.location.search).get('patient');
  const select = document.getElementById('lab-patient');
  if (!wanted || !select) return;
  if (Array.from(select.options).some(o => o.value === wanted)) select.value = wanted;
}

function populatePatientSelect() {
  const select = document.getElementById('lab-patient');
  if (!select) return;

  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  let html = '<option value="">Select Patient</option>';
  patients.forEach(p => {
    html += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.id)} - ${escapeHtml(p.name)}</option>`;
  });
  select.innerHTML = html;
}

function currentOrderDate() {
  const el = document.getElementById('lab-order-date');
  return (el && el.value) || getToday();
}

/**
 * Draws the tests staff can order. Only available (not disabled) tests are listed.
 * Tests are grouped by category; a test with a running discount shows the old price
 * crossed out and the price the patient pays. Ticked tests stay ticked while the
 * list is searched or re-priced.
 */
function renderCatalogCheckboxes() {
  const container = document.getElementById('test-catalog-container');
  if (!container) return;

  const orderDate = currentOrderDate();
  const all = getTestCatalog({ activeOnly: true });

  // A test that was disabled after being ticked can no longer be ordered
  Array.from(selectedCodes).forEach(code => {
    if (!all.some(t => t.code === code)) selectedCodes.delete(code);
  });
  const tests = all.filter(t => {
    if (!catalogQuery) return true;
    return (t.code + ' ' + t.name + ' ' + t.category).toLowerCase().includes(catalogQuery);
  });

  if (all.length === 0) {
    container.innerHTML = '<p class="empty-state">No lab tests are available. Open "Test catalog & pricing" to add or enable tests.</p>';
    updateRunningTotal();
    return;
  }

  if (tests.length === 0) {
    container.innerHTML = '<p class="empty-state">No test matches "' + escapeHtml(catalogQuery) + '".</p>';
    updateRunningTotal();
    return;
  }

  const groups = new Map();
  tests.forEach(t => {
    if (!groups.has(t.category)) groups.set(t.category, []);
    groups.get(t.category).push(t);
  });

  let html = '';
  groups.forEach((list, category) => {
    html += `<div class="test-group"><h4 class="test-group-title">${escapeHtml(category)}</h4><div class="test-catalog-grid">`;
    list.forEach(test => {
      const pct = activeTestDiscountPercent(test, orderDate);
      const net = netTestPrice(test, orderDate);
      const priceHtml = pct > 0
        ? `<span class="price-old">Tk ${test.price.toLocaleString()}</span> <strong>Tk ${net.toLocaleString()}</strong> <span class="tag-discount">-${pct}%</span>`
        : `Tk ${test.price.toLocaleString()}`;
      html += `
        <label class="test-checkbox-card">
          <span style="display: flex; align-items: center;">
            <input type="checkbox" class="lab-test-cb" value="${escapeHtml(test.code)}"${selectedCodes.has(test.code) ? ' checked' : ''}>
            <span><strong>${escapeHtml(test.code)}</strong> - ${escapeHtml(test.name)}</span>
          </span>
          <span class="test-price">${priceHtml}</span>
        </label>
      `;
    });
    html += '</div></div>';
  });

  container.innerHTML = html;

  container.querySelectorAll('.lab-test-cb').forEach(cb => {
    cb.addEventListener('change', () => {
      if (cb.checked) selectedCodes.add(cb.value);
      else selectedCodes.delete(cb.value);
      updateRunningTotal();
    });
  });

  updateRunningTotal();
}

function updateRunningTotal() {
  const orderDate = currentOrderDate();
  const byCode = new Map(getTestCatalog({ activeOnly: true }).map(t => [t.code, t]));

  let total = 0;
  let listTotal = 0;
  selectedCodes.forEach(code => {
    const test = byCode.get(code);
    if (!test) return;
    total += netTestPrice(test, orderDate);
    listTotal += test.price;
  });

  const totalEl = document.getElementById('lab-running-total');
  if (totalEl) totalEl.textContent = total.toLocaleString();

  const saveEl = document.getElementById('lab-running-save');
  if (saveEl) {
    const saved = listTotal - total;
    saveEl.textContent = saved > 0 ? ' (you save Tk ' + saved.toLocaleString() + ')' : '';
  }
}

function handleOrderSubmit(e) {
  e.preventDefault();

  const patientId = document.getElementById('lab-patient').value;
  const orderedDate = document.getElementById('lab-order-date').value || getToday();
  const chosenCodes = Array.from(selectedCodes);

  if (!patientId) {
    showLabAlert('Please select a patient.', 'danger');
    return;
  }

  if (isFutureDate(orderedDate)) {
    showLabAlert('The order date cannot be in the future. Pick today or an earlier date.', 'danger');
    return;
  }

  const tooEarly = dateBeforeRegistrationMessage(patientId, orderedDate, 'lab order');
  if (tooEarly) {
    showLabAlert(tooEarly, 'danger');
    return;
  }

  if (chosenCodes.length === 0) {
    showLabAlert('Please select at least one lab test.', 'danger');
    return;
  }

  // Prices come from the live catalog (it may have been edited since this page was opened)
  const catalog = getTestCatalog({ activeOnly: true });
  const byCode = new Map(catalog.map(t => [t.code, t]));
  const missing = chosenCodes.filter(code => !byCode.has(code));
  if (missing.length > 0) {
    renderCatalogCheckboxes();
    showLabAlert('A selected test is no longer available. Please check your selection.', 'danger');
    return;
  }

  const labTests = getStorage(STORAGE_KEYS.LAB_TESTS, []);
  let createdCount = 0;

  chosenCodes.forEach(code => {
    const test = byCode.get(code);
    const pct = activeTestDiscountPercent(test, orderedDate);
    const price = netTestPrice(test, orderedDate);
    const orderId = generateNextId('SML-', labTests, 'orderId', 8001);

    const newOrder = {
      orderId,
      patientId,
      testCode: test.code,
      testName: test.name,
      listPrice: test.price,
      discountPercent: pct,
      discount: test.price - price,
      price,
      orderedDate,
      status: 'Pending',
      result: '',
      remarks: ''
    };

    labTests.push(newOrder);
    createdCount++;
  });

  setStorage(STORAGE_KEYS.LAB_TESTS, labTests);

  showLabAlert(`${createdCount} lab test order(s) placed with status "Pending".`, 'success');

  // Reset form (the reset handler re-draws the test list)
  document.getElementById('lab-order-form').reset();
  document.getElementById('lab-order-date').value = getToday();
  document.getElementById('lab-order-date').max = getToday();

  renderLabTable();
}

function renderLabTable() {
  const tbody = document.getElementById('lab-orders-table-body');
  if (!tbody) return;

  const orders = getStorage(STORAGE_KEYS.LAB_TESTS, []);
  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  const pMap = new Map(patients.map(p => [p.id, p.name]));

  let filtered = [...orders];
  if (currentFilter !== 'All') {
    filtered = filtered.filter(o => o.status === currentFilter);
  }
  if (orderQuery) {
    filtered = filtered.filter(o => {
      const text = [o.orderId, o.patientId, pMap.get(o.patientId), o.testName, o.testCode, o.result].join(' ').toLowerCase();
      return text.includes(orderQuery);
    });
  }

  if (filtered.length === 0) {
    const why = orderQuery
      ? `No lab orders match "${escapeHtml(orderQuery)}"${currentFilter !== 'All' ? ` under "${escapeHtml(currentFilter)}"` : ''}.`
      : `No lab orders found for filter "${escapeHtml(currentFilter)}".`;
    tbody.innerHTML = `<tr><td colspan="8" class="empty-state">${why}</td></tr>`;
    return;
  }

  filtered.sort((a, b) => (b.orderId > a.orderId ? 1 : -1));

  let html = '';
  filtered.forEach(o => {
    const pName = pMap.get(o.patientId) || 'Unknown';
    const isPending = o.status === 'Pending';
    const isCancelled = o.status === 'Cancelled';
    const badgeClass = isPending ? 'badge-pending' : (isCancelled ? 'badge-muted' : 'badge-completed');

    let resultDisplay = '—';
    let actionBtn = '';
    if (isPending) {
      actionBtn = `<div class="row-actions stacked">
          <button type="button" class="btn btn-primary btn-sm" data-act="result" data-id="${escapeHtml(o.orderId)}">Enter Result</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="cancel" data-id="${escapeHtml(o.orderId)}">Cancel</button>
        </div>`;
    } else if (isCancelled) {
      resultDisplay = `<span style="font-size: 0.8rem; color: var(--text-muted);">Cancelled ${escapeHtml(o.cancelledDate || '')}${o.cancelReason ? ': ' + escapeHtml(o.cancelReason) : ''}</span>`;
      actionBtn = `<span style="font-size: 0.75rem; color: var(--text-muted);">Not billed</span>`;
    } else {
      resultDisplay = `<strong>${escapeHtml(o.result || 'No details')}</strong>`;
      if (o.remarks) {
        resultDisplay += `<br><span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(o.remarks)}</span>`;
      }
      if (o.editedDate) {
        resultDisplay += `<br><span style="font-size: 0.7rem; color: var(--text-muted);">Corrected on ${escapeHtml(o.editedDate)}</span>`;
      }
      actionBtn = `<div class="row-actions stacked">
          <button type="button" class="btn btn-secondary btn-sm" data-act="result" data-id="${escapeHtml(o.orderId)}">Edit result</button>
          <button type="button" class="btn btn-secondary btn-sm" data-act="print" data-id="${escapeHtml(o.orderId)}">Print report</button>
        </div>`;
    }

    html += `
      <tr class="${isCancelled ? 'row-voided' : ''}">
        <td>${escapeHtml(o.orderedDate)}</td>
        <td><strong>${escapeHtml(o.orderId)}</strong></td>
        <td>${escapeHtml(pName)} <span style="font-size: 0.75rem; color: var(--text-muted);">(${escapeHtml(o.patientId)})</span></td>
        <td>${escapeHtml(o.testName)} <span style="font-size: 0.75rem; color: var(--text-muted);">(${escapeHtml(o.testCode)})</span></td>
        <td style="text-align: right;">${orderPriceHtml(o)}</td>
        <td><span class="badge ${badgeClass}">${escapeHtml(o.status)}</span></td>
        <td style="max-width: 280px;">${resultDisplay}</td>
        <td style="text-align: right;">${actionBtn}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  // Row buttons: enter / edit result, cancel an order, print the report
  tbody.querySelectorAll('button[data-act]').forEach(btn => {
    btn.addEventListener('click', () => {
      const orderId = btn.getAttribute('data-id');
      const act = btn.getAttribute('data-act');
      if (act === 'result') openResultModal(orderId);
      else if (act === 'cancel') cancelOrder(orderId);
      else if (act === 'print') SMH.showLabReport(orderId);
    });
  });
}

function orderPriceHtml(o) {
  const net = Number(o.price || 0);
  const disc = Number(o.discount || 0);
  if (disc > 0) {
    return `<span class="price-old">Tk ${(net + disc).toLocaleString()}</span> <strong>Tk ${net.toLocaleString()}</strong>`;
  }
  return `Tk ${net.toLocaleString()}`;
}

function openResultModal(orderId) {
  const orders = getStorage(STORAGE_KEYS.LAB_TESTS, []);
  const order = orders.find(o => o.orderId === orderId);
  if (!order) return;

  const modal = document.getElementById('result-modal');
  const orderDesc = document.getElementById('modal-order-desc');
  const idInput = document.getElementById('modal-order-id');
  const resultInput = document.getElementById('modal-result');
  const remarksInput = document.getElementById('modal-remarks');

  // A cancelled order has no result; a completed one can be corrected
  if (order.status === 'Cancelled') return;
  const editing = order.status === 'Completed';
  const title = document.getElementById('result-modal-title');
  const saveBtn = document.getElementById('btn-result-save');
  if (title) title.textContent = editing ? 'Edit laboratory result' : 'Enter laboratory result';
  if (saveBtn) saveBtn.textContent = editing ? 'Save correction' : 'Mark as completed';

  if (orderDesc) {
    orderDesc.textContent = `Order ${order.orderId} | ${order.testName} (${order.testCode}) for Patient ${order.patientId}`;
  }
  if (idInput) idInput.value = order.orderId;
  if (resultInput) resultInput.value = order.result || '';
  if (remarksInput) remarksInput.value = order.remarks || '';

  if (modal) modal.classList.add('open');
}

function handleResultSubmit(e) {
  e.preventDefault();

  const orderId = document.getElementById('modal-order-id').value;
  const result = document.getElementById('modal-result').value.trim();
  const remarks = document.getElementById('modal-remarks').value.trim();

  if (!orderId || !result) {
    alert('Please enter clinical test findings.');
    return;
  }

  const orders = getStorage(STORAGE_KEYS.LAB_TESTS, []);
  const index = orders.findIndex(o => o.orderId === orderId);
  let wasCorrection = false;
  if (index !== -1) {
    if (orders[index].status === 'Cancelled') {
      showLabAlert(`Order ${orderId} was cancelled, so it cannot have a result.`, 'danger');
      return;
    }
    wasCorrection = orders[index].status === 'Completed';
    if (wasCorrection) {
      orders[index].editedDate = getToday();       // corrected after it was first reported
    } else {
      orders[index].completedDate = getToday();    // first time the result was entered
    }
    orders[index].status = 'Completed';
    orders[index].result = result;
    orders[index].remarks = remarks;
    setStorage(STORAGE_KEYS.LAB_TESTS, orders);
  }

  const modal = document.getElementById('result-modal');
  if (modal) modal.classList.remove('open');

  showLabAlert(wasCorrection ? `Result of ${orderId} corrected.` : `Lab order ${orderId} marked as Completed.`, 'success');
  renderLabTable();
}

/**
 * Cancel a PENDING order (wrong test, patient left, ...). A cancelled order is never
 * billed and is left out of the lab reports. If the patient had already paid for it,
 * the extra money shows up as a refundable credit on the Billing page.
 */
function cancelOrder(orderId) {
  const orders = getStorage(STORAGE_KEYS.LAB_TESTS, []);
  const order = orders.find(o => o.orderId === orderId);
  if (!order) return;
  if (order.status !== 'Pending') {
    showLabAlert('Only a pending order can be cancelled. A completed result can be corrected instead.', 'danger');
    return;
  }

  const why = prompt(`Cancel order ${order.orderId} (${order.testName}, Tk ${Number(order.price || 0).toLocaleString()})?\n\nIt will not be billed any more. Type the reason:`);
  if (why === null) return;
  if (!why.trim()) {
    showLabAlert('A reason is needed to cancel an order.', 'danger');
    return;
  }

  order.status = 'Cancelled';
  order.cancelledDate = getToday();
  order.cancelReason = why.trim();
  setStorage(STORAGE_KEYS.LAB_TESTS, orders);

  const credit = patientLedger(order.patientId).labCredit;
  if (credit > 0) {
    showLabAlert(`Order ${orderId} cancelled. The patient has paid Tk ${credit.toLocaleString()} more than is now owed for lab. Return it from the Billing page (Refund).`, 'info');
  } else {
    showLabAlert(`Order ${orderId} cancelled. It will not be billed.`, 'success');
  }
  renderLabTable();
}

function showLabAlert(msg, type = 'success') {
  const alert = document.getElementById('lab-alert');
  if (!alert) return;
  alert.innerHTML = `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { alert.innerHTML = ''; }, 4500);
}