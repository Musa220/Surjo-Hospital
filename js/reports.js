/**
 * Reports Controller
 * Coordinates multi-tab reporting views strictly using pure calculation
 * functions from reports-logic.js. Never recalculates dues or aggregates manually.
 */

document.addEventListener('DOMContentLoaded', () => {
  initReports();
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

/**
 * A report cannot run when "From" is after "To". The old figures stay on screen
 * (with their old date range) and a message explains why nothing changed.
 */
function rangeIsValid(fromId, toId) {
  const from = document.getElementById(fromId).value;
  const to = document.getElementById(toId).value;
  if (from && to && from > to) {
    showReportAlert('The "From" date is after the "To" date. Change one of them and press Filter again.', 'danger');
    return false;
  }
  return true;
}

function showReportAlert(msg, type) {
  const slot = document.getElementById('report-alert');
  if (!slot) return;
  slot.innerHTML = `<div class="alert alert-${type || 'success'}">${escapeHtml(msg)}</div>`;
  clearTimeout(showReportAlert._timer);
  showReportAlert._timer = setTimeout(() => { slot.innerHTML = ''; }, 5000);
}

function initReports() {
  const today = getToday();

  // Compute 30 days prior using local date math (never toISOString)
  const parts = today.split('-').map(Number);
  const thirtyDaysPriorObj = new Date(parts[0], parts[1] - 1, parts[2] - 30);
  const pastYr = thirtyDaysPriorObj.getFullYear();
  const pastMo = String(thirtyDaysPriorObj.getMonth() + 1).padStart(2, '0');
  const pastDa = String(thirtyDaysPriorObj.getDate()).padStart(2, '0');
  const thirtyDaysAgo = `${pastYr}-${pastMo}-${pastDa}`;

  // Default date filter inputs
  const collFrom = document.getElementById('filter-coll-from');
  const collTo = document.getElementById('filter-coll-to');
  if (collFrom && collTo) {
    collFrom.value = today;
    collTo.value = today;
  }

  const patFrom = document.getElementById('filter-pat-from');
  const patTo = document.getElementById('filter-pat-to');
  if (patFrom && patTo) {
    patFrom.value = thirtyDaysAgo;
    patTo.value = today;
  }

  const docFrom = document.getElementById('filter-doc-from');
  const docTo = document.getElementById('filter-doc-to');
  if (docFrom && docTo) {
    docFrom.value = thirtyDaysAgo;
    docTo.value = today;
  }

  const discFrom = document.getElementById('filter-disc-from');
  const discTo = document.getElementById('filter-disc-to');
  if (discFrom && discTo) {
    discFrom.value = thirtyDaysAgo;
    discTo.value = today;
  }

  const labFrom = document.getElementById('filter-lab-from');
  const labTo = document.getElementById('filter-lab-to');
  if (labFrom && labTo) {
    labFrom.value = thirtyDaysAgo;
    labTo.value = today;
  }

  // Setup tab toggling
  const tabs = document.querySelectorAll('.tab-btn');
  tabs.forEach(tab => {
    tab.addEventListener('click', () => {
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.report-pane').forEach(p => p.classList.remove('active'));

      tab.classList.add('active');
      const targetPane = document.getElementById(`pane-${tab.dataset.tab}`);
      if (targetPane) {
        targetPane.classList.add('active');
      }
    });
  });

  // Setup filter actions
  document.getElementById('btn-coll-filter')?.addEventListener('click', renderDailyCollectionReport);
  document.getElementById('btn-pat-filter')?.addEventListener('click', renderPatientListReport);
  document.getElementById('btn-doc-filter')?.addEventListener('click', renderDoctorWiseReport);
  document.getElementById('btn-lab-filter')?.addEventListener('click', renderLabTestsReport);
  document.getElementById('btn-disc-filter')?.addEventListener('click', renderDiscountsReport);

  // Setup print buttons
  document.querySelectorAll('.btn-print-report').forEach(btn => {
    btn.addEventListener('click', () => {
      window.print();
    });
  });

  // Setup CSV export buttons (one per report)
  document.querySelectorAll('.btn-export-report').forEach(btn => {
    btn.addEventListener('click', () => {
      exportReportCsv(btn.closest('.report-pane'));
    });
  });

  // Initial load across all reports - isolated with try/catch to protect others
  try {
    renderDailyCollectionReport();
  } catch (err) {
    console.error('Error rendering daily collection report:', err);
  }

  try {
    renderPatientListReport();
  } catch (err) {
    console.error('Error rendering patient list report:', err);
  }

  try {
    renderDoctorWiseReport();
  } catch (err) {
    console.error('Error rendering doctor-wise report:', err);
  }

  try {
    renderLabTestsReport();
  } catch (err) {
    console.error('Error rendering lab tests report:', err);
  }

  try {
    renderDiscountsReport();
  } catch (err) {
    console.error('Error rendering discounts report:', err);
  }

  try {
    renderOutstandingDuesReport();
  } catch (err) {
    console.error('Error rendering outstanding dues report:', err);
  }
}

/**
 * 1. Daily Collection Report
 */
function renderDailyCollectionReport() {
  if (!rangeIsValid('filter-coll-from', 'filter-coll-to')) return;
  const from = document.getElementById('filter-coll-from').value;
  const to = document.getElementById('filter-coll-to').value;

  const printRange = document.getElementById('print-range-collection');
  if (printRange) printRange.textContent = `Date Range: ${from} to ${to}`;

  const rep = dailyCollection(from, to);

  document.getElementById('coll-total-collected').textContent = `Tk ${rep.totalCollected.toLocaleString()}`;
  document.getElementById('coll-total-visit').textContent = `Tk ${rep.totalVisitAmount.toLocaleString()}`;
  document.getElementById('coll-total-lab').textContent = `Tk ${rep.totalLabAmount.toLocaleString()}`;
  document.getElementById('coll-total-due').textContent = `Tk ${rep.totalDue.toLocaleString()}`;
  document.getElementById('coll-total-refunded').textContent = `Tk ${rep.totalRefunded.toLocaleString()}`;
  document.getElementById('coll-total-discount').textContent = `Tk ${discountReport(from, to).totalDiscount.toLocaleString()}`;

  document.getElementById('coll-method-cash').textContent = `Tk ${(rep.byMethod.Cash || 0).toLocaleString()}`;
  document.getElementById('coll-method-card').textContent = `Tk ${(rep.byMethod.Card || 0).toLocaleString()}`;
  document.getElementById('coll-method-bkash').textContent = `Tk ${(rep.byMethod.bKash || 0).toLocaleString()}`;

  const tbody = document.getElementById('coll-table-body');
  if (!tbody) return;

  if (rep.payments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No payment transactions found in this date range.</td></tr>`;
  } else {
    const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
    const patMap = {};
    patients.forEach(p => { patMap[p.id] = p.name; });

    let html = '';
    rep.payments.forEach(p => {
      const v = Number(p.visitAmount || 0);
      const l = Number(p.labAmount || 0);
      const tot = v + l;
      html += `
        <tr>
          <td>${escapeHtml(p.date)}</td>
          <td><strong>${escapeHtml(p.receiptId)}</strong>${p.isRefund ? ' <span class="badge badge-muted">Refund</span>' : ''}</td>
          <td>${escapeHtml(patMap[p.patientId] || p.patientId)} (${escapeHtml(p.patientId)})</td>
          <td>${escapeHtml(p.paymentMethod)} ${p.trxId ? `(${escapeHtml(p.trxId)})` : ''}</td>
          <td style="text-align: right;">Tk ${v.toLocaleString()}</td>
          <td style="text-align: right;">Tk ${l.toLocaleString()}</td>
          <td style="text-align: right; font-weight: 700;">Tk ${tot.toLocaleString()}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  document.getElementById('coll-foot-visit').textContent = `Tk ${rep.totalVisitAmount.toLocaleString()}`;
  document.getElementById('coll-foot-lab').textContent = `Tk ${rep.totalLabAmount.toLocaleString()}`;
  document.getElementById('coll-foot-total').textContent = `Tk ${rep.totalCollected.toLocaleString()}`;
}

/**
 * 2. Patient List Report
 */
function renderPatientListReport() {
  if (!rangeIsValid('filter-pat-from', 'filter-pat-to')) return;
  const from = document.getElementById('filter-pat-from').value;
  const to = document.getElementById('filter-pat-to').value;

  const printRange = document.getElementById('print-range-patients');
  if (printRange) printRange.textContent = `Date Range: ${from} to ${to}`;

  const rep = patientsRegistered(from, to);

  const tbody = document.getElementById('pat-table-body');
  if (!tbody) return;

  if (rep.patients.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No patients registered in this date range.</td></tr>`;
  } else {
    let html = '';
    rep.patients.forEach(p => {
      html += `
        <tr>
          <td><strong>${escapeHtml(p.id)}</strong></td>
          <td>${escapeHtml(p.name)}</td>
          <td>${escapeHtml(p.age)} yrs / ${escapeHtml(p.sex)}</td>
          <td>${escapeHtml(p.phone)}</td>
          <td>${escapeHtml(p.address)}</td>
          <td>${escapeHtml(p.registeredAt)}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  document.getElementById('pat-foot-count').textContent = `Total: ${rep.total} patients`;
  document.getElementById('pat-foot-split').textContent =
    `Male: ${rep.genderSplit.male} | Female: ${rep.genderSplit.female} | Other: ${rep.genderSplit.other}`;
}

/**
 * 3. Doctor-wise Activity Report
 */
function renderDoctorWiseReport() {
  if (!rangeIsValid('filter-doc-from', 'filter-doc-to')) return;
  const from = document.getElementById('filter-doc-from').value;
  const to = document.getElementById('filter-doc-to').value;

  const printRange = document.getElementById('print-range-doctors');
  if (printRange) printRange.textContent = `Date Range: ${from} to ${to}`;

  const doctorList = doctorWise(from, to);

  const tbody = document.getElementById('doc-table-body');
  if (!tbody) return;

  let totalVisits = 0;
  let totalFees = 0;

  if (!Array.isArray(doctorList) || doctorList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No doctor visit records found for this period.</td></tr>`;
  } else {
    let html = '';
    doctorList.forEach(d => {
      const vCount = Number(d.visitCount || 0);
      const rev = Number(d.totalRevenue || 0);
      totalVisits += vCount;
      totalFees += rev;

      html += `
        <tr>
          <td><strong>${escapeHtml(d.doctorName)}</strong>${d.status && d.status !== 'Active' ? ` <span style="font-size: 0.75rem; color: var(--text-muted);">(${escapeHtml(d.status === 'Left' ? 'left' : 'on leave')})</span>` : ''}</td>
          <td>${escapeHtml(d.specialty)}</td>
          <td style="text-align: right;">${vCount}</td>
          <td style="text-align: right;">Tk ${rev.toLocaleString()}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  document.getElementById('doc-foot-visits').textContent = totalVisits;
  document.getElementById('doc-foot-fees').textContent = `Tk ${totalFees.toLocaleString()}`;
}

/**
 * 4. Lab Tests Report
 */
function renderLabTestsReport() {
  if (!rangeIsValid('filter-lab-from', 'filter-lab-to')) return;
  const from = document.getElementById('filter-lab-from').value;
  const to = document.getElementById('filter-lab-to').value;

  const printRange = document.getElementById('print-range-lab');
  if (printRange) printRange.textContent = `Date Range: ${from} to ${to}`;

  const rep = labTestReport(from, to);

  document.getElementById('lab-stat-total').textContent = rep.totalOrders;
  document.getElementById('lab-stat-completed').textContent = rep.completedCount;
  document.getElementById('lab-stat-pending').textContent = rep.pendingCount;
  document.getElementById('lab-stat-cancelled').textContent = rep.cancelledCount;
  document.getElementById('lab-stat-discount').textContent = `Tk ${rep.totalDiscount.toLocaleString()}`;

  const tbody = document.getElementById('lab-table-body');
  if (!tbody) return;

  const breakdownList = rep.breakdown || [];
  if (breakdownList.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No lab tests ordered in this period.</td></tr>`;
  } else {
    let html = '';
    breakdownList.forEach(t => {
      html += `
        <tr>
          <td><strong>${escapeHtml(t.testCode)}</strong></td>
          <td>${escapeHtml(t.testName)}</td>
          <td style="text-align: right;">${t.count}</td>
          <td style="text-align: right;">Tk ${t.totalPrice.toLocaleString()}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  document.getElementById('lab-foot-orders').textContent = rep.totalOrders;
  document.getElementById('lab-foot-price').textContent = `Tk ${rep.totalValue.toLocaleString()}`;
}

/**
 * 5. Discounts Report
 */
function renderDiscountsReport() {
  if (!rangeIsValid('filter-disc-from', 'filter-disc-to')) return;
  const from = document.getElementById('filter-disc-from').value;
  const to = document.getElementById('filter-disc-to').value;

  const printRange = document.getElementById('print-range-discounts');
  if (printRange) printRange.textContent = `Date Range: ${from} to ${to}`;

  const rep = discountReport(from, to);

  document.getElementById('disc-total').textContent = `Tk ${rep.totalDiscount.toLocaleString()}`;
  document.getElementById('disc-billing').textContent = `Tk ${rep.billDiscountTotal.toLocaleString()}`;
  document.getElementById('disc-labtest').textContent = `Tk ${rep.labTestDiscountTotal.toLocaleString()}`;

  const tbody = document.getElementById('disc-table-body');
  if (!tbody) return;

  const labels = { both: 'Visits + lab', visit: 'Doctor visits', lab: 'Lab tests' };
  if (rep.discounts.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No billing discounts were given in this date range.</td></tr>`;
  } else {
    const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
    const patMap = {};
    patients.forEach(p => { patMap[p.id] = p.name; });

    const sorted = [...rep.discounts].sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.discountId).localeCompare(String(b.discountId)));
    tbody.innerHTML = sorted.map(d => `
      <tr>
        <td>${escapeHtml(d.date)}</td>
        <td><strong>${escapeHtml(d.discountId)}</strong></td>
        <td>${escapeHtml(patMap[d.patientId] || d.patientId)} (${escapeHtml(d.patientId)})</td>
        <td>${escapeHtml(labels[d.bucket] || d.bucket)}</td>
        <td style="text-align: right;">Tk ${Number(d.visitAmount || 0).toLocaleString()}</td>
        <td style="text-align: right;">Tk ${Number(d.labAmount || 0).toLocaleString()}</td>
        <td style="text-align: right; font-weight: 700;">Tk ${Number(d.amount || 0).toLocaleString()}</td>
        <td>${escapeHtml(d.reason || '—')}</td>
        <td>${escapeHtml(d.approvedBy || '—')}</td>
      </tr>`).join('');
  }

  document.getElementById('disc-foot-visit').textContent = `Tk ${rep.billVisitDiscount.toLocaleString()}`;
  document.getElementById('disc-foot-lab').textContent = `Tk ${rep.billLabDiscount.toLocaleString()}`;
  document.getElementById('disc-foot-total').textContent = `Tk ${rep.billDiscountTotal.toLocaleString()}`;
}

/**
 * 6. Outstanding Dues Report
 */
function renderOutstandingDuesReport() {
  const printRange = document.getElementById('print-range-dues');
  if (printRange) printRange.textContent = `As of ${getToday()}`;

  // Query single source of truth for dues
  const rep = outstandingDues();

  const tbody = document.getElementById('dues-table-body');
  if (!tbody) return;

  if (rep.debtors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="empty-state">No outstanding dues on record. All balances settled!</td></tr>`;
  } else {
    let html = '';
    rep.debtors.forEach(d => {
      html += `
        <tr>
          <td><strong>${escapeHtml(d.patientId)}</strong></td>
          <td>${escapeHtml(d.name)}</td>
          <td>${escapeHtml(d.phone || 'N/A')}</td>
          <td style="text-align: right;">Tk ${d.visitDue.toLocaleString()}</td>
          <td style="text-align: right;">Tk ${d.labDue.toLocaleString()}</td>
          <td style="text-align: right; font-weight: 700; color: var(--danger-text);">Tk ${d.totalDue.toLocaleString()}</td>
        </tr>
      `;
    });
    tbody.innerHTML = html;
  }

  document.getElementById('dues-foot-visit').textContent = `Tk ${rep.visitDueTotal.toLocaleString()}`;
  document.getElementById('dues-foot-lab').textContent = `Tk ${rep.labDueTotal.toLocaleString()}`;
  document.getElementById('dues-foot-total').textContent = `Tk ${rep.totalOutstanding.toLocaleString()}`;
}

/* ==========================================================================
   CSV export
   Exports exactly what the report shows on screen (title, date range, column
   headings, rows and the total line), so the file always matches the report.
   Opens in Excel / Google Sheets. Money columns are plain numbers.
   ========================================================================== */
function csvCell(raw) {
  let text = String(raw === null || raw === undefined ? '' : raw).replace(/\s+/g, ' ').trim();

  // "Tk 1,250" -> 1250 so spreadsheets can add the column up
  if (/^Tk\s/.test(text)) {
    text = text.replace(/^Tk\s*/, '').replace(/,/g, '');
  }
  // Phone numbers typed as plain digits would lose their leading 0 in Excel
  if (/^0\d{6,}$/.test(text)) {
    return '="' + text + '"';
  }
  if (/[",\n]/.test(text)) {
    return '"' + text.replace(/"/g, '""') + '"';
  }
  return text;
}

function exportReportCsv(pane) {
  if (!pane) return;
  const table = pane.querySelector('table');
  if (!table) return;

  const titleEl = pane.querySelector('.print-header h3');
  const rangeEl = pane.querySelector('[id^="print-range-"]');
  const title = titleEl ? titleEl.textContent.trim() : 'Report';
  const range = rangeEl ? rangeEl.textContent.trim() : '';

  const lines = [];
  lines.push(csvCell('Surjo Medical Hospital'));
  lines.push(csvCell(title));
  if (range) lines.push(csvCell(range));
  lines.push('');

  const rowToLine = tr => {
    const parts = [];
    tr.querySelectorAll('th, td').forEach(cell => {
      parts.push(csvCell(cell.textContent));
      // keep columns lined up when a cell spans several columns
      const span = Number(cell.getAttribute('colspan')) || 1;
      for (let i = 1; i < span; i++) parts.push('');
    });
    return parts.join(',');
  };

  table.querySelectorAll('thead tr').forEach(tr => lines.push(rowToLine(tr)));
  table.querySelectorAll('tbody tr').forEach(tr => {
    if (tr.querySelector('.empty-state')) return; // "No records" message is not data
    lines.push(rowToLine(tr));
  });
  table.querySelectorAll('tfoot tr').forEach(tr => lines.push(rowToLine(tr)));

  // File name from the report and its date range
  const slug = (pane.id || 'report').replace(/^pane-/, '');
  const dates = Array.from(pane.querySelectorAll('input[type="date"]')).map(i => i.value).filter(Boolean);
  const when = dates.length === 2 ? dates[0] + '_to_' + dates[1] : getToday();
  const fileName = 'surjo-' + slug + '-report-' + when + '.csv';

  const blob = new Blob(['\uFEFF' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
