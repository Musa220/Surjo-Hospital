/**
 * Billing & Dual-Bucket Ledger Controller
 * Handles patient due checks via patientLedger(), payments validation, and receipts.
 */

let activeLedger = null;

document.addEventListener('DOMContentLoaded', () => {
  initBillingPage();
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

function initBillingPage() {
  populatePatientSelect();

  const patientSelect = document.getElementById('billing-patient');
  if (patientSelect) {
    patientSelect.addEventListener('change', () => {
      const pId = patientSelect.value;
      if (!pId) {
        hidePatientSections();
        return;
      }
      loadPatientLedger(pId);
    });
  }

  const payDateInput = document.getElementById('pay-date');
  if (payDateInput) {
    payDateInput.value = getToday();
    payDateInput.max = getToday(); // a payment cannot be dated in the future
  }

  // Opened from a patient's profile: billing.html?patient=SMH-1001 opens that ledger
  const wanted = new URLSearchParams(window.location.search).get('patient');
  if (wanted && patientSelect && Array.from(patientSelect.options).some(o => o.value === wanted)) {
    patientSelect.value = wanted;
    loadPatientLedger(wanted);
  }

  const payMethodSelect = document.getElementById('pay-method');
  const trxGroup = document.getElementById('trx-group');
  const trxInput = document.getElementById('pay-trx');

  if (payMethodSelect && trxGroup && trxInput) {
    payMethodSelect.addEventListener('change', () => {
      const method = payMethodSelect.value;
      if (method === 'Card' || method === 'bKash') {
        trxGroup.style.display = 'block';
        trxInput.required = true;
      } else {
        trxGroup.style.display = 'none';
        trxInput.required = false;
        trxInput.value = '';
      }
    });
  }

  const visitAmtInput = document.getElementById('pay-visit-amount');
  const labAmtInput = document.getElementById('pay-lab-amount');
  const totalCalcInput = document.getElementById('pay-total-calc');

  function updateTotalCalc() {
    const v = parseFloat(visitAmtInput.value) || 0;
    const l = parseFloat(labAmtInput.value) || 0;
    totalCalcInput.value = `Tk ${(v + l).toLocaleString()}`;
  }

  if (visitAmtInput && labAmtInput) {
    visitAmtInput.addEventListener('input', updateTotalCalc);
    labAmtInput.addEventListener('input', updateTotalCalc);
  }

  const form = document.getElementById('payment-form');
  if (form) {
    form.addEventListener('submit', handlePaymentSubmit);
  }

  initDiscountForm();
  initRefundForm();
}

function populatePatientSelect() {
  const select = document.getElementById('billing-patient');
  if (!select) return;

  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  let html = '<option value="">Select Patient</option>';
  patients.forEach(p => {
    html += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.id)} - ${escapeHtml(p.name)}</option>`;
  });
  select.innerHTML = html;
}

function hidePatientSections() {
  activeLedger = null;
  document.getElementById('ledger-summary-section').style.display = 'none';
  document.getElementById('payment-form-card').style.display = 'none';
  document.getElementById('payment-history-section').style.display = 'none';
  document.getElementById('discount-form-card').style.display = 'none';
  document.getElementById('discount-history-section').style.display = 'none';
  document.getElementById('refund-form-card').style.display = 'none';
  document.getElementById('credit-note').style.display = 'none';
  const receiptCard = document.getElementById('receipt-card');
  if (receiptCard) receiptCard.style.display = 'none';
}

function loadPatientLedger(patientId) {
  // Pure single-source-of-truth query from reports-logic.js
  activeLedger = patientLedger(patientId);
  if (!activeLedger) {
    hidePatientSections();
    return;
  }

  // Payments, discounts and refunds cannot be dated before the patient was registered
  ['pay-date', 'disc-date', 'ref-date'].forEach(id => {
    limitDateToRegistration(document.getElementById(id), patientId);
  });

  // Clear inputs and hide any previous patient's receipt
  const trxInput = document.getElementById('pay-trx');
  if (trxInput) trxInput.value = '';

  const notesInput = document.getElementById('pay-notes');
  if (notesInput) notesInput.value = '';

  const receiptCard = document.getElementById('receipt-card');
  if (receiptCard) receiptCard.style.display = 'none';

  // Populate ledger cards
  document.getElementById('ledger-summary-section').style.display = 'block';
  document.getElementById('payment-form-card').style.display = 'block';
  document.getElementById('payment-history-section').style.display = 'block';

  document.getElementById('ledger-patient-name').textContent = `${activeLedger.name} (${activeLedger.patientId})`;
  document.getElementById('ledger-patient-meta').textContent = `Phone: ${activeLedger.phone || 'N/A'}`;

  document.getElementById('stat-visit-charges').textContent = `Tk ${activeLedger.totalVisitCharges.toLocaleString()}`;
  document.getElementById('stat-visit-discount').textContent = `Tk ${activeLedger.visitDiscount.toLocaleString()}`;
  document.getElementById('stat-visit-paid').textContent = `Tk ${activeLedger.paidVisitAmount.toLocaleString()}`;
  document.getElementById('stat-visit-due').textContent = `Tk ${activeLedger.visitDue.toLocaleString()}`;

  document.getElementById('stat-lab-charges').textContent = `Tk ${activeLedger.totalLabCharges.toLocaleString()}`;
  document.getElementById('stat-lab-sub').textContent = activeLedger.labTestDiscount > 0
    ? `after Tk ${activeLedger.labTestDiscount.toLocaleString()} test discount`
    : '';
  document.getElementById('stat-lab-discount').textContent = `Tk ${activeLedger.labDiscount.toLocaleString()}`;
  document.getElementById('stat-lab-paid').textContent = `Tk ${activeLedger.paidLabAmount.toLocaleString()}`;
  document.getElementById('stat-lab-due').textContent = `Tk ${activeLedger.labDue.toLocaleString()}`;

  const totalCharges = activeLedger.totalVisitCharges + activeLedger.totalLabCharges;
  const totalPaid = activeLedger.paidVisitAmount + activeLedger.paidLabAmount;
  document.getElementById('stat-grand-charges').textContent = `Tk ${totalCharges.toLocaleString()}`;
  document.getElementById('stat-grand-discount').textContent = `Tk ${activeLedger.totalDiscount.toLocaleString()}`;
  document.getElementById('stat-grand-paid').textContent = `Tk ${totalPaid.toLocaleString()}`;

  document.getElementById('stat-total-due').textContent = `Tk ${activeLedger.totalDue.toLocaleString()}`;

  // Configure payment bounds
  const visitAmtInput = document.getElementById('pay-visit-amount');
  const labAmtInput = document.getElementById('pay-lab-amount');
  document.getElementById('max-visit-due').textContent = activeLedger.visitDue.toLocaleString();
  document.getElementById('max-lab-due').textContent = activeLedger.labDue.toLocaleString();

  visitAmtInput.max = activeLedger.visitDue;
  labAmtInput.max = activeLedger.labDue;
  visitAmtInput.value = activeLedger.visitDue > 0 ? activeLedger.visitDue : 0;
  labAmtInput.value = activeLedger.labDue > 0 ? activeLedger.labDue : 0;

  const v = parseFloat(visitAmtInput.value) || 0;
  const l = parseFloat(labAmtInput.value) || 0;
  document.getElementById('pay-total-calc').value = `Tk ${(v + l).toLocaleString()}`;

  renderCreditAndRefund();
  renderPaymentHistory(patientId);
  renderDiscountSection(patientId);
}

function handlePaymentSubmit(e) {
  e.preventDefault();

  if (!activeLedger) {
    showBillingAlert('No active patient selected.', 'danger');
    return;
  }

  // Re-read the ledger so a discount given in another tab is not missed
  activeLedger = patientLedger(activeLedger.patientId);

  const patientId = activeLedger.patientId;
  const date = document.getElementById('pay-date').value || getToday();
  const paymentMethod = document.getElementById('pay-method').value;
  const trxId = document.getElementById('pay-trx').value.trim();
  const visitAmount = parseFloat(document.getElementById('pay-visit-amount').value) || 0;
  const labAmount = parseFloat(document.getElementById('pay-lab-amount').value) || 0;
  const notes = document.getElementById('pay-notes').value.trim();

  // Validations per business rules
  if (isFutureDate(date)) {
    showBillingAlert('The payment date cannot be in the future. Pick today or an earlier date.', 'danger');
    return;
  }

  const tooEarly = dateBeforeRegistrationMessage(patientId, date, 'payment');
  if (tooEarly) {
    showBillingAlert(tooEarly, 'danger');
    return;
  }

  if ((paymentMethod === 'Card' || paymentMethod === 'bKash') && !trxId) {
    showBillingAlert(`Transaction ID is required for ${paymentMethod} payments.`, 'danger');
    return;
  }

  if (visitAmount < 0 || labAmount < 0) {
    showBillingAlert('Payment amounts cannot be negative.', 'danger');
    return;
  }

  if (visitAmount > activeLedger.visitDue) {
    showBillingAlert(`Visit allocation (Tk ${visitAmount}) exceeds visit due (Tk ${activeLedger.visitDue}).`, 'danger');
    return;
  }

  if (labAmount > activeLedger.labDue) {
    showBillingAlert(`Lab allocation (Tk ${labAmount}) exceeds lab due (Tk ${activeLedger.labDue}).`, 'danger');
    return;
  }

  const amountPaid = visitAmount + labAmount;
  if (amountPaid <= 0) {
    showBillingAlert('At least one payment amount (visit or lab) must be greater than zero.', 'danger');
    return;
  }

  const payments = getStorage(STORAGE_KEYS.PAYMENTS, []);
  const receiptId = generateNextId('SMR-', payments, 'receiptId', 9001);

  const newReceipt = {
    receiptId,
    patientId,
    date,
    visitAmount,
    labAmount,
    amountPaid,
    paymentMethod,
    trxId,
    notes
  };

  payments.push(newReceipt);
  setStorage(STORAGE_KEYS.PAYMENTS, payments);

  showBillingAlert(`Payment receipt ${receiptId} of Tk ${amountPaid.toLocaleString()} recorded successfully.`, 'success');

  // Reload patient ledger to reflect new calculated dues (clears trxId, notes, and resets card)
  loadPatientLedger(patientId);

  // Render receipt for the newly created transaction
  renderReceipt(newReceipt);
}

function renderPaymentHistory(patientId) {
  const tbody = document.getElementById('payment-history-table-body');
  if (!tbody) return;

  // The full history, including voided entries (they stay visible but do not count)
  const payments = getPayments({ includeVoided: true });
  const patientPayments = payments.filter(p => p.patientId === patientId).reverse();

  if (patientPayments.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="empty-state">No payment records on file for this patient.</td></tr>`;
    return;
  }

  let html = '';
  patientPayments.forEach(p => {
    const visitAmt = Number(p.visitAmount || 0);
    const labAmt = Number(p.labAmount || 0);
    const total = Number(p.amountPaid || (visitAmt + labAmt));
    const money = n => (n < 0 ? '-Tk ' : 'Tk ') + Math.abs(n).toLocaleString();
    const voided = !!p.voided;
    const refundTag = p.isRefund ? ' <span class="badge badge-muted">Refund</span>' : '';
    const voidInfo = voided
      ? `<span class="badge badge-muted" title="${escapeHtml(p.voidReason || '')}">Voided ${escapeHtml(p.voidedDate || '')}</span>`
      : `<button type="button" class="btn btn-secondary btn-sm" data-void-pay="${escapeHtml(p.receiptId)}">Void</button>`;
    html += `
      <tr class="${voided ? 'row-voided' : ''}">
        <td>${escapeHtml(p.date)}</td>
        <td><strong>${escapeHtml(p.receiptId)}</strong>${refundTag}</td>
        <td>${escapeHtml(p.paymentMethod)}</td>
        <td>${escapeHtml(p.trxId || '—')}</td>
        <td style="text-align: right;">${money(visitAmt)}</td>
        <td style="text-align: right;">${money(labAmt)}</td>
        <td style="text-align: right; font-weight: 700; color: var(--primary);">${money(total)}</td>
        <td>${escapeHtml(p.notes || '—')}</td>
        <td style="text-align: right;">
          <div class="row-actions">
            <button type="button" class="btn btn-secondary btn-sm btn-view-receipt" data-id="${escapeHtml(p.receiptId)}">${p.isRefund ? 'Voucher' : 'Receipt'}</button>
            ${voidInfo}
          </div>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll('.btn-view-receipt').forEach(btn => {
    btn.addEventListener('click', () => {
      const rId = btn.getAttribute('data-id');
      const rObj = payments.find(p => p.receiptId === rId);
      if (rObj) renderReceipt(rObj);
    });
  });

  tbody.querySelectorAll('button[data-void-pay]').forEach(btn => {
    btn.addEventListener('click', () => voidPayment(btn.getAttribute('data-void-pay')));
  });
}

function renderReceipt(receipt) {
  const receiptCard = document.getElementById('receipt-card');
  const container = document.getElementById('printable-receipt-content');
  if (!receiptCard || !container) return;

  // A refund is stored with negative amounts; the voucher shows them as positive money going back
  const isRefund = !!receipt.isRefund;

  const voidBanner = receipt.voided
    ? `<div class="receipt-void">VOID &mdash; cancelled on ${escapeHtml(receipt.voidedDate || '')}${receipt.voidReason ? ': ' + escapeHtml(receipt.voidReason) : ''}. This slip is no longer valid.</div>`
    : '';

  const heading = document.getElementById('receipt-heading');
  if (heading) heading.textContent = isRefund ? 'Refund voucher' : 'Payment receipt';

  // The slip itself (letterhead, details, barcode, items, amount in words, signatures)
  // is built in slips.js so the receipt looks like the other hospital documents
  container.innerHTML = SMH.receiptHtml(receipt, {
    ledger: patientLedger(receipt.patientId),
    voidBanner: voidBanner
  });

  receiptCard.style.display = 'block';
  receiptCard.scrollIntoView({ behavior: 'smooth' });
}

/* ==========================================================================
   Voiding a payment and refunding an overpayment
   - VOID: the payment was entered by mistake. It stays in the history (struck
     through) with the reason, but no longer counts as money collected and the
     amount goes back onto the patient's bill.
   - REFUND: the patient paid more than is now owed (for example a paid lab test
     was cancelled). The money handed back is saved as a negative payment, so
     "money collected" is always what the hospital really kept.
   ========================================================================== */

function voidPayment(receiptId) {
  const payments = getPayments({ includeVoided: true });
  const pay = payments.find(x => x.receiptId === receiptId);
  if (!pay || pay.voided) return;

  const amount = Math.abs(Number(pay.visitAmount || 0) + Number(pay.labAmount || 0));
  const consequence = pay.isRefund
    ? 'The refund will be cancelled: the money counts as kept again.'
    : "It will no longer count as money collected, and the amount goes back onto the patient's bill.";
  const why = prompt(`Void ${pay.isRefund ? 'refund' : 'receipt'} ${pay.receiptId} (Tk ${amount.toLocaleString()})?\n\n${consequence}\nType the reason for voiding:`);
  if (why === null) return;
  if (!why.trim()) {
    showBillingAlert('A reason is needed to void a payment.', 'danger');
    return;
  }

  pay.voided = true;
  pay.voidedDate = getToday();
  pay.voidReason = why.trim();
  setStorage(STORAGE_KEYS.PAYMENTS, payments);

  loadPatientLedger(pay.patientId);
  showBillingAlert(`${pay.receiptId} voided. ${pay.isRefund ? 'The refund no longer counts.' : `Tk ${amount.toLocaleString()} is due again.`}`, 'info');
}

/** Shows the "overpaid" note and the refund form, only when the patient has a credit. */
function renderCreditAndRefund() {
  const note = document.getElementById('credit-note');
  const card = document.getElementById('refund-form-card');
  if (!activeLedger || !note || !card) return;

  const credit = activeLedger.totalCredit;
  if (credit <= 0) {
    note.style.display = 'none';
    card.style.display = 'none';
    return;
  }

  const parts = [];
  if (activeLedger.visitCredit > 0) parts.push(`visits Tk ${activeLedger.visitCredit.toLocaleString()}`);
  if (activeLedger.labCredit > 0) parts.push(`lab Tk ${activeLedger.labCredit.toLocaleString()}`);
  note.textContent = `This patient has paid Tk ${credit.toLocaleString()} more than is owed (${parts.join(', ')}). Use "Refund money to the patient" below to give it back.`;
  note.style.display = 'block';

  card.style.display = 'block';
  document.getElementById('max-visit-credit').textContent = activeLedger.visitCredit.toLocaleString();
  document.getElementById('max-lab-credit').textContent = activeLedger.labCredit.toLocaleString();
  document.getElementById('ref-visit').value = activeLedger.visitCredit;
  document.getElementById('ref-lab').value = activeLedger.labCredit;
  document.getElementById('ref-visit').max = activeLedger.visitCredit;
  document.getElementById('ref-lab').max = activeLedger.labCredit;
  document.getElementById('ref-date').value = getToday();
  document.getElementById('ref-date').max = getToday();
  document.getElementById('ref-reason').value = '';
  document.getElementById('ref-trx').value = '';
  showRefundError('');
}

function showRefundError(msg) {
  const el = document.getElementById('ref-error');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  return false;
}

function initRefundForm() {
  const form = document.getElementById('refund-form');
  if (!form) return;

  document.getElementById('ref-method').addEventListener('change', () => {
    const needsTrx = document.getElementById('ref-method').value !== 'Cash';
    document.getElementById('ref-trx-group').style.display = needsTrx ? 'block' : 'none';
    if (!needsTrx) document.getElementById('ref-trx').value = '';
  });

  form.addEventListener('submit', handleRefundSubmit);
}

function handleRefundSubmit(e) {
  e.preventDefault();
  showRefundError('');

  if (!activeLedger) return showBillingAlert('No active patient selected.', 'danger');

  // Use the up-to-date ledger, not the one drawn when the patient was picked
  const ledger = patientLedger(activeLedger.patientId);
  const date = document.getElementById('ref-date').value || getToday();
  const method = document.getElementById('ref-method').value;
  const trxId = document.getElementById('ref-trx').value.trim();
  const visitRefund = Math.round(parseFloat(document.getElementById('ref-visit').value) || 0);
  const labRefund = Math.round(parseFloat(document.getElementById('ref-lab').value) || 0);
  const approvedBy = document.getElementById('ref-approver').value.trim();
  const reason = document.getElementById('ref-reason').value.trim();

  if (isFutureDate(date)) return showRefundError('The refund date cannot be in the future.');
  const refundTooEarly = dateBeforeRegistrationMessage(ledger.patientId, date, 'refund');
  if (refundTooEarly) return showRefundError(refundTooEarly);
  if (method !== 'Cash' && !trxId) return showRefundError(`Transaction ID is required for ${method} refunds.`);
  if (visitRefund < 0 || labRefund < 0) return showRefundError('Refund amounts cannot be negative.');
  if (visitRefund > ledger.visitCredit) return showRefundError(`The visit refund (Tk ${visitRefund.toLocaleString()}) is more than the Tk ${ledger.visitCredit.toLocaleString()} overpaid for visits.`);
  if (labRefund > ledger.labCredit) return showRefundError(`The lab refund (Tk ${labRefund.toLocaleString()}) is more than the Tk ${ledger.labCredit.toLocaleString()} overpaid for lab.`);
  if (visitRefund + labRefund <= 0) return showRefundError('Enter an amount to refund.');
  if (!approvedBy) return showRefundError('Enter who approved this refund.');
  if (!reason) return showRefundError('Enter the reason for the refund.');

  const payments = getPayments({ includeVoided: true });
  const receiptId = generateNextId('SMF-', payments, 'receiptId', 7001);

  const refund = {
    receiptId,
    patientId: ledger.patientId,
    date,
    visitAmount: -visitRefund,
    labAmount: -labRefund,
    amountPaid: -(visitRefund + labRefund),
    paymentMethod: method,
    trxId,
    notes: reason,
    approvedBy,
    isRefund: true
  };
  payments.push(refund);
  setStorage(STORAGE_KEYS.PAYMENTS, payments);

  loadPatientLedger(ledger.patientId);
  showBillingAlert(`Refund ${receiptId} of Tk ${(visitRefund + labRefund).toLocaleString()} recorded.`, 'success');
  renderReceipt(refund);
}

function showBillingAlert(msg, type = 'success') {
  const alert = document.getElementById('billing-alert');
  if (!alert) return;
  alert.innerHTML = `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { alert.innerHTML = ''; }, 4500);
}

/* ==========================================================================
   Discounts
   A discount is a waiver: the hospital agrees to charge less. It is saved as its
   own record (who, why, how much, who approved it), is never counted as money
   collected, and lowers the amount the patient owes. A wrong discount can be
   voided, which puts the amount back on the patient's bill.
   ========================================================================== */

const BUCKET_LABELS = { both: 'Visits + lab', visit: 'Doctor visits', lab: 'Lab tests' };

function initDiscountForm() {
  const form = document.getElementById('discount-form');
  if (!form) return;

  form.addEventListener('submit', handleDiscountSubmit);

  ['disc-bucket', 'disc-mode', 'disc-value'].forEach(id => {
    const el = document.getElementById(id);
    el.addEventListener('input', updateDiscountPreview);
    el.addEventListener('change', updateDiscountPreview);
  });

  document.getElementById('disc-mode').addEventListener('change', () => {
    const percent = document.getElementById('disc-mode').value === 'percent';
    document.getElementById('disc-value-label').innerHTML =
      (percent ? 'Discount (%)' : 'Discount amount (Tk)') + ' <span class="required">*</span>';
    document.getElementById('disc-value').placeholder = percent ? 'e.g. 10' : 'e.g. 200';
    document.getElementById('disc-value').max = percent ? 100 : '';
  });

  document.getElementById('disc-date').max = getToday();

  document.getElementById('discount-history-table-body').addEventListener('click', e => {
    const btn = e.target.closest('button[data-void]');
    if (btn) voidDiscount(btn.getAttribute('data-void'));
  });
}

/**
 * Works out how much comes off the visit bucket and the lab bucket.
 * The discount is always taken from what is still DUE (never from money already paid).
 *  - percent: that % of the due amount in each selected bucket
 *  - fixed:   the Tk amount, split between visit and lab in proportion to what is due
 * Returns { visit, lab, total } or { error }.
 */
function computeDiscountSplit(ledger, bucket, mode, value) {
  const availV = bucket === 'lab' ? 0 : ledger.visitDue;
  const availL = bucket === 'visit' ? 0 : ledger.labDue;
  const avail = availV + availL;

  if (avail <= 0) {
    return { error: 'Nothing is due on the selected charges, so there is nothing to discount.' };
  }
  if (!(value > 0)) {
    return { error: 'Enter a discount greater than zero.' };
  }

  let visit = 0;
  let lab = 0;

  if (mode === 'percent') {
    if (value > 100) return { error: 'A percentage cannot be more than 100.' };
    visit = Math.round(availV * value / 100);
    lab = Math.round(availL * value / 100);
  } else {
    const amount = Math.round(value);
    if (amount > avail) {
      return { error: `The discount (Tk ${amount.toLocaleString()}) is more than the Tk ${avail.toLocaleString()} still due.` };
    }
    visit = Math.round(amount * availV / avail);
    lab = amount - visit;
    if (visit > availV) { lab += visit - availV; visit = availV; }
    if (lab > availL) { visit += lab - availL; lab = availL; }
  }

  if (visit + lab <= 0) {
    return { error: 'That works out to Tk 0. Enter a larger discount.' };
  }
  return { visit, lab, total: visit + lab };
}

function readDiscountInputs() {
  return {
    bucket: document.getElementById('disc-bucket').value,
    mode: document.getElementById('disc-mode').value,
    value: parseFloat(document.getElementById('disc-value').value)
  };
}

function updateDiscountPreview() {
  const box = document.getElementById('disc-preview');
  if (!box || !activeLedger) return;

  const raw = document.getElementById('disc-value').value;
  if (raw === '') {
    box.innerHTML = '';
    return;
  }

  const input = readDiscountInputs();
  const r = computeDiscountSplit(activeLedger, input.bucket, input.mode, input.value);
  if (r.error) {
    box.innerHTML = `<span class="preview-bad">${escapeHtml(r.error)}</span>`;
    return;
  }

  const parts = [];
  if (r.visit > 0) parts.push(`Tk ${r.visit.toLocaleString()} off visit due`);
  if (r.lab > 0) parts.push(`Tk ${r.lab.toLocaleString()} off lab due`);
  const after = activeLedger.totalDue - r.total;
  box.innerHTML = `${parts.join(' and ')}. Balance due goes from <strong>Tk ${activeLedger.totalDue.toLocaleString()}</strong> to <strong>Tk ${after.toLocaleString()}</strong>.`;
}

function showDiscountError(msg) {
  const el = document.getElementById('disc-error');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
}

function renderDiscountSection(patientId) {
  const hasDue = activeLedger && activeLedger.totalDue > 0;
  document.getElementById('discount-form-card').style.display = 'block';
  document.getElementById('discount-form').style.display = hasDue ? '' : 'none';
  document.getElementById('disc-none-msg').style.display = hasDue ? 'none' : 'block';

  // Fresh form for every patient / after every change
  document.getElementById('disc-value').value = '';
  document.getElementById('disc-notes').value = '';
  document.getElementById('disc-date').value = getToday();
  document.getElementById('disc-preview').innerHTML = '';
  showDiscountError('');

  renderDiscountHistory(patientId);
}

function renderDiscountHistory(patientId) {
  const section = document.getElementById('discount-history-section');
  const tbody = document.getElementById('discount-history-table-body');
  const rows = getDiscounts().filter(d => d.patientId === patientId).reverse();

  // The history is only shown once the patient has had a discount
  section.style.display = rows.length > 0 ? 'block' : 'none';
  if (rows.length === 0) {
    tbody.innerHTML = '';
    return;
  }

  tbody.innerHTML = rows.map(d => {
    const typeText = d.mode === 'percent' ? `${Number(d.value)}%` : `Tk ${Number(d.value).toLocaleString()} fixed`;
    const reason = escapeHtml(d.reason || '—') + (d.notes ? `<br><span style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(d.notes)}</span>` : '');
    const voided = !!d.voided;
    const action = voided
      ? `<span class="badge badge-muted" title="${escapeHtml(d.voidReason || '')}">Voided ${escapeHtml(d.voidedDate || '')}</span>`
      : `<button type="button" class="btn btn-secondary btn-sm" data-void="${escapeHtml(d.discountId)}">Void</button>`;
    return `
      <tr class="${voided ? 'row-voided' : ''}">
        <td>${escapeHtml(d.date)}</td>
        <td><strong>${escapeHtml(d.discountId)}</strong></td>
        <td>${escapeHtml(BUCKET_LABELS[d.bucket] || d.bucket)}</td>
        <td>${escapeHtml(typeText)}</td>
        <td style="text-align: right;">Tk ${Number(d.visitAmount || 0).toLocaleString()}</td>
        <td style="text-align: right;">Tk ${Number(d.labAmount || 0).toLocaleString()}</td>
        <td style="text-align: right; font-weight: 700;">Tk ${Number(d.amount || 0).toLocaleString()}</td>
        <td>${reason}</td>
        <td>${escapeHtml(d.approvedBy || '—')}</td>
        <td style="text-align: right;">${action}</td>
      </tr>`;
  }).join('');
}

function handleDiscountSubmit(e) {
  e.preventDefault();
  showDiscountError('');

  if (!activeLedger) {
    showBillingAlert('No active patient selected.', 'danger');
    return;
  }

  // Use the up-to-date ledger, not the one drawn when the patient was picked
  const patientId = activeLedger.patientId;
  const ledger = patientLedger(patientId);

  const input = readDiscountInputs();
  const reason = document.getElementById('disc-reason').value;
  const approvedBy = document.getElementById('disc-approver').value.trim();
  const notes = document.getElementById('disc-notes').value.trim();
  const date = document.getElementById('disc-date').value || getToday();

  if (isNaN(input.value)) return showDiscountError('Enter the discount value.');
  if (!approvedBy) return showDiscountError('Enter who approved this discount.');
  if (reason === 'Other' && !notes) return showDiscountError('Write the reason in remarks when you choose Other.');
  if (date > getToday()) return showDiscountError('The discount date cannot be in the future.');
  const discountTooEarly = dateBeforeRegistrationMessage(patientId, date, 'discount');
  if (discountTooEarly) return showDiscountError(discountTooEarly);

  const split = computeDiscountSplit(ledger, input.bucket, input.mode, input.value);
  if (split.error) return showDiscountError(split.error);

  const discounts = getDiscounts();
  const discountId = generateNextId('SMD-', discounts, 'discountId', 3001);

  discounts.push({
    discountId,
    patientId,
    date,
    bucket: input.bucket,
    mode: input.mode,
    value: input.mode === 'percent' ? input.value : Math.round(input.value),
    visitAmount: split.visit,
    labAmount: split.lab,
    amount: split.total,
    reason,
    approvedBy,
    notes,
    voided: false
  });
  setStorage(STORAGE_KEYS.DISCOUNTS, discounts);

  showBillingAlert(`Discount ${discountId} of Tk ${split.total.toLocaleString()} applied. Balance due is now Tk ${(ledger.totalDue - split.total).toLocaleString()}.`, 'success');
  loadPatientLedger(patientId);
}

function voidDiscount(discountId) {
  const discounts = getDiscounts();
  const d = discounts.find(x => x.discountId === discountId);
  if (!d || d.voided) return;

  const why = prompt(`Void discount ${d.discountId} (Tk ${Number(d.amount).toLocaleString()})?\n\nThe amount goes back onto the patient's bill. Type the reason for voiding:`);
  if (why === null) return;
  if (!why.trim()) {
    showBillingAlert('A reason is needed to void a discount.', 'danger');
    return;
  }

  d.voided = true;
  d.voidedDate = getToday();
  d.voidReason = why.trim();
  setStorage(STORAGE_KEYS.DISCOUNTS, discounts);

  showBillingAlert(`Discount ${d.discountId} voided. Tk ${Number(d.amount).toLocaleString()} is due again.`, 'info');
  loadPatientLedger(d.patientId);
}
