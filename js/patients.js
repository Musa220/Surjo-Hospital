/**
 * Patient Management Controller
 * Auto-increment ID (SMH-1001), registration with phone and duplicate checks,
 * real-time search, edit, delete (only when the patient has no records), and
 * links to the full patient profile (patient.html).
 */

document.addEventListener('DOMContentLoaded', () => {
  renderPatientsTable();
  setupRegistrationForm();
  setupSearchFilter();
  setupEditDelete();
  openEditFromLink();
});

/**
 * Up to two initials for the avatar circle, e.g. "Rahim Uddin" -> "RU"
 * @param {string} name
 * @returns {string}
 */
function getInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

/** How many records each patient has (visits, lab orders, payments, discounts). */
function patientRecordCounts() {
  const counts = {};
  const bump = (id, key) => {
    if (!id) return;
    if (!counts[id]) counts[id] = { visits: 0, labs: 0, payments: 0, discounts: 0, total: 0 };
    counts[id][key] += 1;
    counts[id].total += 1;
  };
  getStorage(STORAGE_KEYS.VISITS, []).forEach(v => bump(v.patientId, 'visits'));
  getStorage(STORAGE_KEYS.LAB_TESTS, []).forEach(o => bump(o.patientId, 'labs'));
  getStorage(STORAGE_KEYS.PAYMENTS, []).forEach(p => bump(p.patientId, 'payments'));
  getDiscounts().forEach(d => bump(d.patientId, 'discounts'));
  return counts;
}

/**
 * Loads patients from localStorage and populates the table
 * @param {string} filterText
 */
function renderPatientsTable(filterText = '') {
  const tbody = document.getElementById('patients-table-body');
  if (!tbody) return;

  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  const counts = patientRecordCounts();
  const query = filterText.trim().toLowerCase();

  const filtered = patients.filter(p => {
    if (!query) return true;
    const nameMatch = (p.name || '').toLowerCase().includes(query);
    const idMatch = (p.id || '').toLowerCase().includes(query);
    const phoneMatch = (p.phone || '').toLowerCase().includes(query);
    return nameMatch || idMatch || phoneMatch;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="8" class="empty-state">
          ${query ? 'No patients matched your search query.' : 'No patients registered yet. Use the form above to add one.'}
        </td>
      </tr>
    `;
    return;
  }

  // Sort descending by ID so newest is first
  filtered.sort((a, b) => b.id.localeCompare(a.id, undefined, { numeric: true }));

  tbody.innerHTML = filtered.map(p => {
    const rec = counts[p.id];
    const hasRecords = !!(rec && rec.total > 0);
    const del = hasRecords
      ? `<small class="cell-sub" title="Visits: ${rec.visits}, lab orders: ${rec.labs}, payments: ${rec.payments}, discounts: ${rec.discounts}">has records</small>`
      : `<button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="${escapeHtml(p.id)}">Delete</button>`;
    return `
    <tr>
      <td><a class="badge badge-id" href="patient.html?id=${encodeURIComponent(p.id)}">${escapeHtml(p.id)}</a></td>
      <td>
        <div class="person">
          <span class="avatar" aria-hidden="true">${escapeHtml(getInitials(p.name))}</span>
          <a class="person-link" href="patient.html?id=${encodeURIComponent(p.id)}"><strong>${escapeHtml(p.name)}</strong></a>
        </div>
      </td>
      <td style="white-space: nowrap;">${p.age} yrs / ${escapeHtml(p.sex)}</td>
      <td>
        ${p.bloodGroup ? `<span class="badge badge-blood">${escapeHtml(p.bloodGroup)}</span>` : '<span style="color:var(--text-muted)">-</span>'}
      </td>
      <td style="white-space: nowrap;">${escapeHtml(p.phone)}</td>
      <td>${escapeHtml(p.address)}</td>
      <td style="white-space: nowrap;">${escapeHtml(p.registeredAt)}</td>
      <td style="text-align: right;">
        <div class="row-actions stacked">
          <button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="${escapeHtml(p.id)}">Edit</button>
          ${del}
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ==========================================================================
   Validation shared by "register" and "edit"
   ========================================================================== */

function cleanName(raw) {
  return String(raw || '').trim().replace(/\s+/g, ' ');
}

/** Another patient with the same name AND the same phone number (family members may share a phone). */
function findDuplicatePatient(name, phone, ignoreId) {
  const wantName = cleanName(name).toLowerCase();
  const wantPhone = normalizePhone(phone);
  return getStorage(STORAGE_KEYS.PATIENTS, []).find(p =>
    p.id !== ignoreId &&
    cleanName(p.name).toLowerCase() === wantName &&
    normalizePhone(p.phone) === wantPhone
  ) || null;
}

/** Returns an error message, or '' when the details are fine. */
function validatePatientDetails(d, ignoreId) {
  if (!d.name || isNaN(d.age) || !d.sex || !d.phone || !d.address) {
    return 'Please fill out all required fields.';
  }
  if (d.age < 0 || d.age > 130) {
    return 'Age must be between 0 and 130 years.';
  }
  if (!isValidPhone(d.phone)) {
    return 'Enter a valid mobile number: 11 digits starting with 01, for example 01711-000111.';
  }
  const dup = findDuplicatePatient(d.name, d.phone, ignoreId);
  if (dup) {
    return `${dup.name} (${dup.id}) is already registered with this phone number. Open that profile instead of adding a duplicate.`;
  }
  return '';
}

/**
 * Handles submission of new patient form with auto-increment ID (SMH-1001)
 */
function setupRegistrationForm() {
  const form = document.getElementById('patient-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const details = {
      name: cleanName(document.getElementById('patient-name').value),
      age: parseInt(document.getElementById('patient-age').value, 10),
      sex: document.getElementById('patient-sex').value,
      phone: document.getElementById('patient-phone').value.trim(),
      bloodGroup: document.getElementById('patient-blood').value.trim(),
      address: document.getElementById('patient-address').value.trim()
    };

    const problem = validatePatientDetails(details, null);
    if (problem) {
      showPatientNotification(problem, 'danger');
      return;
    }

    const patients = getStorage(STORAGE_KEYS.PATIENTS, []);

    // Auto-increment ID starting from SMH-1001
    const nextId = generateNextId('SMH-', patients, 'id', 1001);

    const newPatient = {
      id: nextId,
      name: details.name,
      age: details.age,
      sex: details.sex,
      phone: details.phone,
      bloodGroup: details.bloodGroup || undefined,
      address: details.address,
      registeredAt: getToday() // Local YYYY-MM-DD
    };

    patients.push(newPatient);
    setStorage(STORAGE_KEYS.PATIENTS, patients);

    form.reset();
    showPatientNotification(`Patient registered successfully with ID: ${newPatient.id}`);
    renderPatientsTable(currentSearchText());
  });
}

/**
 * Connects instant search field to table rendering
 */
function setupSearchFilter() {
  const searchInput = document.getElementById('patient-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', (e) => {
    renderPatientsTable(e.target.value);
  });
}

function currentSearchText() {
  const input = document.getElementById('patient-search');
  return input ? input.value : '';
}

/* ==========================================================================
   Edit and delete
   - Edit changes the details only; ID and registration date stay.
   - Delete is only offered for a patient with no visits, lab orders, payments
     or discounts. A patient with history is never deleted.
   ========================================================================== */

function setupEditDelete() {
  const body = document.getElementById('patients-table-body');
  const form = document.getElementById('patient-edit-form');
  if (!body || !form) return;

  body.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const id = btn.getAttribute('data-id');
    if (btn.getAttribute('data-action') === 'edit') openEditForm(id);
    else if (btn.getAttribute('data-action') === 'delete') deletePatient(id);
  });

  document.getElementById('btn-patient-cancel').addEventListener('click', () => SMH.closeModal('patient-modal'));
  form.addEventListener('submit', handleEditSubmit);
}

/** patients.html?edit=SMH-1001 (link from the profile page) opens the edit dialog straight away. */
function openEditFromLink() {
  const id = new URLSearchParams(window.location.search).get('edit');
  if (id) openEditForm(id);
}

function showEditError(msg) {
  const el = document.getElementById('patient-form-error');
  el.textContent = msg || '';
  el.style.display = msg ? 'block' : 'none';
  return false;
}

function openEditForm(id) {
  const patient = getStorage(STORAGE_KEYS.PATIENTS, []).find(p => p.id === id);
  if (!patient) return;

  showEditError('');
  document.getElementById('edit-patient-id').value = patient.id;
  document.getElementById('patient-modal-desc').textContent = `${patient.id}, registered on ${patient.registeredAt}`;
  document.getElementById('edit-name').value = patient.name || '';
  document.getElementById('edit-age').value = patient.age;
  document.getElementById('edit-sex').value = patient.sex || 'Male';
  document.getElementById('edit-phone').value = patient.phone || '';
  document.getElementById('edit-blood').value = patient.bloodGroup || '';
  document.getElementById('edit-address').value = patient.address || '';
  SMH.openModal('patient-modal');
}

function handleEditSubmit(e) {
  e.preventDefault();

  const id = document.getElementById('edit-patient-id').value;
  const details = {
    name: cleanName(document.getElementById('edit-name').value),
    age: parseInt(document.getElementById('edit-age').value, 10),
    sex: document.getElementById('edit-sex').value,
    phone: document.getElementById('edit-phone').value.trim(),
    bloodGroup: document.getElementById('edit-blood').value.trim(),
    address: document.getElementById('edit-address').value.trim()
  };

  const problem = validatePatientDetails(details, id);
  if (problem) return showEditError(problem);

  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  const idx = patients.findIndex(p => p.id === id);
  if (idx === -1) return showEditError('This patient no longer exists.');

  patients[idx] = Object.assign({}, patients[idx], {
    name: details.name,
    age: details.age,
    sex: details.sex,
    phone: details.phone,
    bloodGroup: details.bloodGroup || undefined,
    address: details.address
  });
  setStorage(STORAGE_KEYS.PATIENTS, patients);

  SMH.closeModal('patient-modal');
  showPatientNotification(`${details.name} (${id}) updated.`);
  renderPatientsTable(currentSearchText());
}

function deletePatient(id) {
  const patient = getStorage(STORAGE_KEYS.PATIENTS, []).find(p => p.id === id);
  if (!patient) return;

  const rec = patientRecordCounts()[id];
  if (rec && rec.total > 0) {
    showPatientNotification(`${patient.name} has records (visits: ${rec.visits}, lab orders: ${rec.labs}, payments: ${rec.payments}, discounts: ${rec.discounts}), so the patient cannot be deleted.`, 'danger');
    return;
  }

  if (!confirm(`Delete ${patient.name} (${patient.id})? This patient has no visits, lab orders or payments, so nothing else is affected.`)) return;

  setStorage(STORAGE_KEYS.PATIENTS, getStorage(STORAGE_KEYS.PATIENTS, []).filter(p => p.id !== id));
  showPatientNotification(`${patient.name} (${id}) deleted.`, 'info');
  renderPatientsTable(currentSearchText());
}

function showPatientNotification(msg, type = 'success') {
  const container = document.getElementById('patient-alert');
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}">${escapeHtml(msg)}</div>`;
  clearTimeout(showPatientNotification._timer);
  showPatientNotification._timer = setTimeout(() => {
    container.innerHTML = '';
  }, type === 'danger' ? 7000 : 4000);
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
