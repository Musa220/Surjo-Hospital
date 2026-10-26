/**
 * Doctor Visits Controller
 * Records clinical consultations, prescriptions, and updates visit fee dues.
 */

document.addEventListener('DOMContentLoaded', () => {
  initVisitForm();
  renderVisitsTable();
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

function initVisitForm() {
  const dateInput = document.getElementById('visit-date');
  if (dateInput) {
    dateInput.value = getToday();
    dateInput.max = getToday(); // a consultation cannot be in the future
  }

  populatePatientSelect();
  populateDoctorSelect();
  preselectPatientFromLink();

  // A visit cannot be dated before the patient was registered
  const patientSelect = document.getElementById('visit-patient');
  if (patientSelect && dateInput) {
    patientSelect.addEventListener('change', () => limitDateToRegistration(dateInput, patientSelect.value));
    limitDateToRegistration(dateInput, patientSelect.value); // patient picked from a profile link
  }

  // Search box and date range above the history table
  ['visit-search', 'visit-filter-from', 'visit-filter-to'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    el.addEventListener('input', renderVisitsTable);
    el.addEventListener('change', renderVisitsTable);
  });
  const clearFilters = document.getElementById('btn-visit-filter-clear');
  if (clearFilters) {
    clearFilters.addEventListener('click', () => {
      ['visit-search', 'visit-filter-from', 'visit-filter-to'].forEach(id => {
        const el = document.getElementById(id);
        if (el) el.value = '';
      });
      renderVisitsTable();
    });
  }

  // "View / print" on a row opens the prescription; "Cancel" cancels a visit entered by mistake
  const tableBody = document.getElementById('visits-table-body');
  if (tableBody) {
    tableBody.addEventListener('click', e => {
      const btn = e.target.closest('button[data-view]');
      if (btn) {
        SMH.showPrescription(btn.getAttribute('data-view'));
        return;
      }
      const cancelBtn = e.target.closest('button[data-cancel]');
      if (cancelBtn) cancelVisit(cancelBtn.getAttribute('data-cancel'));
    });
  }

  const doctorSelect = document.getElementById('visit-doctor');
  const feeInput = document.getElementById('visit-fee');
  if (doctorSelect && feeInput) {
    doctorSelect.addEventListener('change', () => {
      const doctors = getDoctors();
      const selected = doctors.find(d => d.id === doctorSelect.value);
      if (selected && selected.visitFee !== undefined) {
        feeInput.value = selected.visitFee;
      }
    });
  }

  const addMedBtn = document.getElementById('btn-add-med');
  if (addMedBtn) {
    addMedBtn.addEventListener('click', () => addMedicineRow());
  }

  // Add one empty medicine row by default
  addMedicineRow();

  const form = document.getElementById('visit-form');
  if (form) {
    form.addEventListener('submit', handleVisitSubmit);
    form.addEventListener('reset', () => {
      setTimeout(() => {
        if (dateInput) {
          dateInput.value = getToday();
          dateInput.max = getToday();
          dateInput.removeAttribute('min'); // no patient chosen after a reset
        }
        const container = document.getElementById('medicines-container');
        if (container) container.innerHTML = '';
        addMedicineRow();
      }, 0);
    });
  }
}

function populatePatientSelect() {
  const patientSelect = document.getElementById('visit-patient');
  if (!patientSelect) return;

  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  let html = '<option value="">Select Patient</option>';
  patients.forEach(p => {
    html += `<option value="${escapeHtml(p.id)}">${escapeHtml(p.id)} - ${escapeHtml(p.name)}</option>`;
  });
  patientSelect.innerHTML = html;
}

/** Opened from a patient's profile: visits.html?patient=SMH-1001 picks that patient. */
function preselectPatientFromLink() {
  const wanted = new URLSearchParams(window.location.search).get('patient');
  const select = document.getElementById('visit-patient');
  if (!wanted || !select) return;
  if (Array.from(select.options).some(o => o.value === wanted)) select.value = wanted;
}

/**
 * Only doctors who are Active can be picked for a new visit. Doctors who are on
 * leave or have left stay in the system (for old visits and reports) but are not listed here.
 */
function populateDoctorSelect() {
  const doctorSelect = document.getElementById('visit-doctor');
  if (!doctorSelect) return;

  const previous = doctorSelect.value;
  const doctors = getDoctors({ bookableOnly: true });
  let html = '<option value="">Select Doctor</option>';
  doctors.forEach(d => {
    html += `<option value="${escapeHtml(d.id)}">${escapeHtml(d.name)} (${escapeHtml(d.specialty)})</option>`;
  });
  doctorSelect.innerHTML = html;

  if (previous && doctors.some(d => d.id === previous)) {
    doctorSelect.value = previous;
  }
}

function addMedicineRow(name = '', dosage = '', duration = '') {
  const container = document.getElementById('medicines-container');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'med-row';
  row.innerHTML = `
    <input type="text" class="med-name" placeholder="e.g. Tab Napa Extend 665mg" value="${escapeHtml(name)}">
    <input type="text" class="med-dosage" placeholder="e.g. 1+0+1" value="${escapeHtml(dosage)}">
    <input type="text" class="med-duration" placeholder="e.g. 5 days" value="${escapeHtml(duration)}">
    <button type="button" class="btn btn-danger btn-remove-med" style="padding: 0.35rem 0.65rem;" title="Remove">✕</button>
  `;

  row.querySelector('.btn-remove-med').addEventListener('click', () => {
    row.remove();
  });

  container.appendChild(row);
}

function handleVisitSubmit(e) {
  e.preventDefault();

  const patientId = document.getElementById('visit-patient').value;
  const doctorId = document.getElementById('visit-doctor').value;
  const date = document.getElementById('visit-date').value || getToday();
  const fee = parseFloat(document.getElementById('visit-fee').value);
  const complaint = document.getElementById('visit-complaint').value.trim();
  const diagnosis = document.getElementById('visit-diagnosis').value.trim();

  if (!patientId || !doctorId || isNaN(fee)) {
    showVisitAlert('Please complete all required fields.', 'danger');
    return;
  }

  if (isFutureDate(date)) {
    showVisitAlert('The visit date cannot be in the future. Pick today or an earlier date.', 'danger');
    return;
  }

  const tooEarly = dateBeforeRegistrationMessage(patientId, date, 'visit');
  if (tooEarly) {
    showVisitAlert(tooEarly, 'danger');
    return;
  }

  // The doctor list may have changed since this page was opened
  const chosenDoctor = getDoctors().find(d => d.id === doctorId);
  if (!chosenDoctor || chosenDoctor.status !== 'Active') {
    populateDoctorSelect();
    showVisitAlert('This doctor is no longer available for new visits. Please choose another doctor.', 'danger');
    return;
  }

  // Gather medicines
  const medicines = [];
  const rows = document.querySelectorAll('.med-row');
  rows.forEach(r => {
    const medName = r.querySelector('.med-name').value.trim();
    const dosage = r.querySelector('.med-dosage').value.trim();
    const duration = r.querySelector('.med-duration').value.trim();
    if (medName) {
      medicines.push({ name: medName, dosage, duration });
    }
  });

  const visits = getStorage(STORAGE_KEYS.VISITS, []);
  const visitId = generateNextId('SMV-', visits, 'visitId', 5001);

  const newVisit = {
    visitId,
    patientId,
    doctorId,
    date,
    complaint,
    diagnosis,
    medicines,
    visitFee: Math.round(fee)
  };

  visits.push(newVisit);
  setStorage(STORAGE_KEYS.VISITS, visits);

  showVisitAlert(`Visit ${visitId} recorded successfully. Consultation fee Tk ${newVisit.visitFee} billed.`, 'success');

  // Reset form preserving today
  document.getElementById('visit-form').reset();
  document.getElementById('visit-date').value = getToday();
  document.getElementById('visit-date').max = getToday();
  const container = document.getElementById('medicines-container');
  if (container) container.innerHTML = '';
  addMedicineRow();

  renderVisitsTable();
}

function renderVisitsTable() {
  const tbody = document.getElementById('visits-table-body');
  if (!tbody) return;

  const visits = getVisits({ includeCancelled: true }); // cancelled visits stay in the list (struck through)
  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  const doctors = getDoctors();

  const pMap = new Map(patients.map(p => [p.id, p.name]));
  const dMap = new Map(doctors.map(d => [d.id, d]));

  if (visits.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No consultation visits recorded yet.</td></tr>`;
    setVisitCount('');
    return;
  }

  // Search text and date range filters
  const readValue = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const query = readValue('visit-search').trim().toLowerCase();
  const fromDate = readValue('visit-filter-from');
  const toDate = readValue('visit-filter-to');

  if (fromDate && toDate && fromDate > toDate) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">The "From" date is after the "To" date. Change one of them.</td></tr>`;
    setVisitCount('');
    return;
  }

  const matching = visits.filter(v => {
    if (fromDate && v.date < fromDate) return false;
    if (toDate && v.date > toDate) return false;
    if (!query) return true;
    const doc = dMap.get(v.doctorId);
    const text = [v.visitId, v.patientId, pMap.get(v.patientId), doc && doc.name, doc && doc.specialty, v.diagnosis, v.complaint]
      .join(' ').toLowerCase();
    return text.includes(query);
  });

  const filtering = !!(query || fromDate || toDate);
  setVisitCount(filtering ? `Showing ${matching.length} of ${visits.length} visits` : `${visits.length} visits`);

  if (matching.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="empty-state">No visits match your search or dates.</td></tr>`;
    return;
  }

  // Display newest first
  const sorted = [...matching].reverse();
  let html = '';
  sorted.forEach(v => {
    const pName = pMap.get(v.patientId) || 'Unknown';
    const doc = dMap.get(v.doctorId);
    const dName = doc ? doc.name : 'Unknown';
    const dNote = doc && doc.status === 'Left'
      ? ' <span style="font-size: 0.75rem; color: var(--text-muted);">(left)</span>'
      : '';
    const cancelled = v.status === 'Cancelled';
    const fee = Number(v.visitFee || 0).toLocaleString();

    // A cancelled visit shows why, is not billed, and has no prescription to print
    const diagnosisCell = cancelled
      ? `<span style="font-size: 0.8rem; color: var(--text-muted);">Cancelled ${escapeHtml(v.cancelledDate || '')}${v.cancelReason ? ': ' + escapeHtml(v.cancelReason) : ''}</span>`
      : escapeHtml(v.diagnosis || '—');
    const feeCell = cancelled
      ? `<span class="price-old">Tk ${fee}</span>`
      : `Tk ${fee}`;
    const actionCell = cancelled
      ? `<span style="font-size: 0.75rem; color: var(--text-muted);">Not billed</span>`
      : `<div class="row-actions stacked">
          <button type="button" class="btn btn-secondary btn-sm" data-view="${escapeHtml(v.visitId)}">View / print</button>
          <button type="button" class="btn btn-secondary btn-sm" data-cancel="${escapeHtml(v.visitId)}">Cancel</button>
        </div>`;

    html += `
      <tr class="${cancelled ? 'row-voided' : ''}">
        <td>${escapeHtml(v.date)}</td>
        <td><strong>${escapeHtml(v.visitId)}</strong></td>
        <td>${escapeHtml(pName)} <span style="font-size: 0.75rem; color: var(--text-muted);">(${escapeHtml(v.patientId)})</span></td>
        <td>${escapeHtml(dName)}${dNote}</td>
        <td>${diagnosisCell}</td>
        <td style="text-align: right; font-weight: 600;">${feeCell}</td>
        <td style="text-align: right;">${actionCell}</td>
      </tr>
    `;
  });

  tbody.innerHTML = html;
}

function setVisitCount(text) {
  const el = document.getElementById('visits-count');
  if (el) el.textContent = text;
}

/**
 * Cancel a visit that was entered by mistake (wrong patient, wrong doctor, patient did not come).
 * A cancelled visit is never billed and is left out of the reports, but it stays in the
 * history with the reason. If the patient had already paid for it, the extra money shows up
 * as a refundable credit on the Billing page.
 */
function cancelVisit(visitId) {
  const visits = getStorage(STORAGE_KEYS.VISITS, []);
  const visit = visits.find(v => v.visitId === visitId);
  if (!visit) return;
  if (visit.status === 'Cancelled') {
    showVisitAlert(`Visit ${visitId} is already cancelled.`, 'danger');
    return;
  }

  const why = prompt(`Cancel visit ${visit.visitId} (consultation fee Tk ${Number(visit.visitFee || 0).toLocaleString()})?\n\nIt will not be billed any more and will not count in the reports. The record stays in the history. Type the reason:`);
  if (why === null) return;
  if (!why.trim()) {
    showVisitAlert('A reason is needed to cancel a visit.', 'danger');
    return;
  }

  visit.status = 'Cancelled';
  visit.cancelledDate = getToday();
  visit.cancelReason = why.trim();
  setStorage(STORAGE_KEYS.VISITS, visits);

  const credit = patientLedger(visit.patientId).visitCredit;
  if (credit > 0) {
    showVisitAlert(`Visit ${visitId} cancelled. The patient has paid Tk ${credit.toLocaleString()} more than is now owed for visits. Return it from the Billing page (Refund).`, 'info');
  } else {
    showVisitAlert(`Visit ${visitId} cancelled. It will not be billed.`, 'success');
  }
  renderVisitsTable();
}

function showVisitAlert(msg, type = 'success') {
  const alert = document.getElementById('visit-alert');
  if (!alert) return;
  alert.innerHTML = `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
  setTimeout(() => { alert.innerHTML = ''; }, 4500);
}