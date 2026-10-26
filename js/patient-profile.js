/**
 * Patient profile (patient.html?id=SMH-1001)
 *
 * One page with everything the hospital has for a patient: details, money summary
 * (the same numbers as the Billing page, from patientLedger), doctor visits with
 * prescriptions, lab orders with results, payments and refunds, and discounts.
 * It only reads records; changes are made on the Patients, Visits, Lab and
 * Billing pages (quick links at the top).
 */
(function () {
  'use strict';

  var esc = SMH.esc;

  function money(n) {
    var v = Number(n) || 0;
    return (v < 0 ? '-Tk ' : 'Tk ') + Math.abs(v).toLocaleString();
  }

  function initials(name) {
    var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return (parts[0].charAt(0) + (parts.length > 1 ? parts[parts.length - 1].charAt(0) : '')).toUpperCase();
  }

  /** Newest first by date, then by ID. */
  function newestFirst(a, b, dateKey, idKey) {
    return String(b[dateKey]).localeCompare(String(a[dateKey])) || String(b[idKey]).localeCompare(String(a[idKey]));
  }

  function fillRows(id, rows, emptyText, cols) {
    var tbody = document.getElementById(id);
    tbody.innerHTML = rows.length
      ? rows.join('')
      : '<tr><td colspan="' + cols + '" class="empty-state">' + esc(emptyText) + '</td></tr>';
  }

  document.addEventListener('DOMContentLoaded', function () {
    var id = new URLSearchParams(window.location.search).get('id');
    var patient = getStorage(STORAGE_KEYS.PATIENTS, []).find(function (p) { return p.id === id; });

    if (!patient) {
      document.getElementById('pp-missing').style.display = 'block';
      document.getElementById('pp-title').textContent = 'Patient not found';
      return;
    }

    document.title = patient.name + ' - Surjo Medical Hospital';
    document.getElementById('pp-content').style.display = 'block';
    document.getElementById('pp-title').textContent = patient.name;
    document.getElementById('pp-sub').textContent = patient.id + ' · registered on ' + patient.registeredAt;

    renderHeader(patient);
    renderLedger(patient.id);
    renderVisits(patient.id);
    renderLabs(patient.id);
    renderPayments(patient.id);
    renderDiscounts(patient.id);

    // Prescription / lab report buttons inside the tables
    document.getElementById('pp-content').addEventListener('click', function (e) {
      var rx = e.target.closest('button[data-rx]');
      if (rx) return SMH.showPrescription(rx.getAttribute('data-rx'));
      var lab = e.target.closest('button[data-lab]');
      if (lab) SMH.showLabReport(lab.getAttribute('data-lab'));
    });
  });

  function renderHeader(p) {
    document.getElementById('pp-avatar').textContent = initials(p.name);
    document.getElementById('pp-name').textContent = p.name;
    document.getElementById('pp-line').textContent = p.age + ' yrs / ' + p.sex + (p.bloodGroup ? ' · Blood group ' + p.bloodGroup : '');

    var facts = [
      ['Patient ID', p.id],
      ['Phone', p.phone],
      ['Address', p.address],
      ['Registered', p.registeredAt]
    ];
    document.getElementById('pp-facts').innerHTML = facts.map(function (f) {
      return '<div><dt>' + esc(f[0]) + '</dt><dd>' + esc(f[1] || '—') + '</dd></div>';
    }).join('');

    var q = encodeURIComponent(p.id);
    document.getElementById('pp-act-visit').href = 'visits.html?patient=' + q;
    document.getElementById('pp-act-lab').href = 'lab.html?patient=' + q;
    document.getElementById('pp-act-bill').href = 'billing.html?patient=' + q;
    document.getElementById('pp-act-edit').href = 'patients.html?edit=' + q;
  }

  function renderLedger(id) {
    var l = patientLedger(id);
    var charges = l.totalVisitCharges + l.totalLabCharges;
    var paid = l.paidVisitAmount + l.paidLabAmount;
    var stats = [
      ['Total charges', money(charges), ''],
      ['Total discount', money(l.totalDiscount), 'discount-stat'],
      ['Total paid (net of refunds)', money(paid), 'summary-total'],
      ['Balance due', money(l.totalDue), 'due-stat summary-due']
    ];
    document.getElementById('pp-ledger').innerHTML = stats.map(function (s) {
      return '<div class="ledger-stat ' + s[2] + '"><div class="title">' + esc(s[0]) + '</div><div class="amount">' + esc(s[1]) + '</div></div>';
    }).join('');

    var note = document.getElementById('pp-credit');
    if (l.totalCredit > 0) {
      note.textContent = 'This patient has paid ' + money(l.totalCredit) + ' more than is owed. It can be returned from the Billing page (Refund).';
      note.style.display = 'block';
    }
  }

  function renderVisits(id) {
    var doctors = getDoctors();
    var visits = getVisits({ includeCancelled: true })
      .filter(function (v) { return v.patientId === id; })
      .sort(function (a, b) { return newestFirst(a, b, 'date', 'visitId'); });

    document.getElementById('pp-count-visits').textContent = visits.length;
    fillRows('pp-visits', visits.map(function (v) {
      var d = doctors.find(function (x) { return x.id === v.doctorId; });
      var cancelled = v.status === 'Cancelled';
      var meds = (v.medicines || []).map(function (m) { return m.name; }).join(', ');
      var diagnosis = cancelled
        ? '<span class="badge badge-muted">Cancelled ' + esc(v.cancelledDate || '') + '</span> ' + esc(v.cancelReason || '')
        : esc(v.diagnosis || '—');
      var action = cancelled
        ? '—'
        : '<button type="button" class="btn btn-secondary btn-sm" data-rx="' + esc(v.visitId) + '">View / print</button>';
      return '<tr class="' + (cancelled ? 'row-voided' : '') + '">' +
        '<td>' + esc(v.date) + '</td>' +
        '<td><strong>' + esc(v.visitId) + '</strong></td>' +
        '<td>' + esc(d ? d.name : 'Unknown') + '</td>' +
        '<td class="cell-wrap">' + diagnosis + '</td>' +
        '<td class="cell-wrap">' + (cancelled ? '—' : esc(meds || '—')) + '</td>' +
        '<td style="text-align: right;">' + (cancelled ? '<span class="price-old">' + money(v.visitFee) + '</span>' : money(v.visitFee)) + '</td>' +
        '<td style="text-align: right;">' + action + '</td>' +
        '</tr>';
    }), 'No doctor visits yet.', 7);
  }

  function renderLabs(id) {
    var orders = getStorage(STORAGE_KEYS.LAB_TESTS, [])
      .filter(function (o) { return o.patientId === id; })
      .sort(function (a, b) { return newestFirst(a, b, 'orderedDate', 'orderId'); });

    document.getElementById('pp-count-labs').textContent = orders.length;
    fillRows('pp-labs', orders.map(function (o) {
      var cancelled = o.status === 'Cancelled';
      var badge = o.status === 'Pending' ? 'badge-pending' : (cancelled ? 'badge-muted' : 'badge-completed');
      var result = o.status === 'Completed' ? '<strong>' + esc(o.result || '') + '</strong>' : (cancelled ? esc(o.cancelReason || 'Cancelled') : '—');
      var action = o.status === 'Completed'
        ? '<button type="button" class="btn btn-secondary btn-sm" data-lab="' + esc(o.orderId) + '">Print report</button>'
        : '';
      return '<tr class="' + (cancelled ? 'row-voided' : '') + '">' +
        '<td>' + esc(o.orderedDate) + '</td>' +
        '<td><strong>' + esc(o.orderId) + '</strong></td>' +
        '<td>' + esc(o.testName) + ' <small class="cell-sub">' + esc(o.testCode) + '</small></td>' +
        '<td style="text-align: right;">' + money(o.price) + '</td>' +
        '<td><span class="badge ' + badge + '">' + esc(o.status) + '</span></td>' +
        '<td class="cell-wrap">' + result + '</td>' +
        '<td style="text-align: right;">' + action + '</td>' +
        '</tr>';
    }), 'No lab orders yet.', 7);
  }

  function renderPayments(id) {
    var pays = getPayments({ includeVoided: true })
      .filter(function (p) { return p.patientId === id; })
      .sort(function (a, b) { return newestFirst(a, b, 'date', 'receiptId'); });

    document.getElementById('pp-count-pays').textContent = pays.length;
    fillRows('pp-pays', pays.map(function (p) {
      var v = Number(p.visitAmount || 0);
      var l = Number(p.labAmount || 0);
      var tag = p.isRefund ? ' <span class="badge badge-muted">Refund</span>' : '';
      var note = p.voided
        ? '<span class="badge badge-muted">Voided ' + esc(p.voidedDate || '') + '</span> ' + esc(p.voidReason || '')
        : esc(p.notes || '—');
      return '<tr class="' + (p.voided ? 'row-voided' : '') + '">' +
        '<td>' + esc(p.date) + '</td>' +
        '<td><strong>' + esc(p.receiptId) + '</strong>' + tag + '</td>' +
        '<td>' + esc(p.paymentMethod) + (p.trxId ? ' <small class="cell-sub">' + esc(p.trxId) + '</small>' : '') + '</td>' +
        '<td style="text-align: right;">' + money(v) + '</td>' +
        '<td style="text-align: right;">' + money(l) + '</td>' +
        '<td style="text-align: right; font-weight: 700;">' + money(v + l) + '</td>' +
        '<td class="cell-wrap">' + note + '</td>' +
        '</tr>';
    }), 'No payments yet.', 7);
  }

  function renderDiscounts(id) {
    var discs = getDiscounts()
      .filter(function (d) { return d.patientId === id; })
      .sort(function (a, b) { return newestFirst(a, b, 'date', 'discountId'); });
    if (discs.length === 0) return;

    document.getElementById('pp-discount-section').style.display = 'block';
    document.getElementById('pp-count-discs').textContent = discs.length;
    fillRows('pp-discs', discs.map(function (d) {
      return '<tr class="' + (d.voided ? 'row-voided' : '') + '">' +
        '<td>' + esc(d.date) + '</td>' +
        '<td><strong>' + esc(d.discountId) + '</strong></td>' +
        '<td style="text-align: right;">' + money(d.amount) + '</td>' +
        '<td class="cell-wrap">' + esc(d.reason || '—') + '</td>' +
        '<td>' + esc(d.approvedBy || '—') + '</td>' +
        '<td>' + (d.voided ? '<span class="badge badge-muted">Voided ' + esc(d.voidedDate || '') + '</span>' : '<span class="badge badge-completed">Applied</span>') + '</td>' +
        '</tr>';
    }), 'No discounts.', 6);
  }
})();
