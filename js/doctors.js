/**
 * Manage Doctors (Doctor Visits page, "Manage doctors" tab)
 *
 * A hospital's doctors change: new doctors join, fees change, doctors go on
 * leave or leave for good. This screen lets the front desk handle all of that.
 *
 * Rules that keep old records correct:
 *  - A doctor who has seen patients is never deleted. Mark them "Left" instead;
 *    old visits, bills and reports keep showing the right name.
 *  - Changing a visit fee only affects NEW visits (each saved visit stores the
 *    fee it was billed at).
 *  - Only "Active" doctors appear in the New consultation form.
 */
(function () {
  'use strict';

  var esc = SMH.esc;
  var state = { filter: 'Active', query: '' };

  var COMMON_SPECIALTIES = [
    'General Medicine', 'Cardiology', 'Pediatrics', 'Gynecology & Obstetrics', 'Orthopedics',
    'Neurology', 'Dermatology', 'ENT', 'Ophthalmology', 'Urology', 'Gastroenterology',
    'Psychiatry', 'Surgery', 'Dentistry', 'Medicine & Diabetes', 'Pulmonology', 'Nephrology'
  ];

  document.addEventListener('DOMContentLoaded', function () {
    if (!document.getElementById('pane-doctors')) return;

    SMH.initTabs();
    fillSpecialtyList();
    bindEvents();
    render();
  });

  /* ---------- data helpers ---------- */

  // Cancelled visits are left out of the shown count, but they are still history:
  // pass true to include them (used to stop a doctor with any visit record being deleted).
  function visitCounts(includeCancelled) {
    var counts = {};
    getVisits({ includeCancelled: !!includeCancelled }).forEach(function (v) {
      counts[v.doctorId] = (counts[v.doctorId] || 0) + 1;
    });
    return counts;
  }

  function fillSpecialtyList() {
    var list = document.getElementById('doctor-specialty-list');
    if (!list) return;
    var seen = {};
    var names = COMMON_SPECIALTIES.slice();
    getDoctors().forEach(function (d) {
      if (d.specialty && names.indexOf(d.specialty) === -1) names.push(d.specialty);
    });
    list.innerHTML = names.filter(function (n) {
      if (seen[n]) return false;
      seen[n] = true;
      return true;
    }).map(function (n) { return '<option value="' + esc(n) + '"></option>'; }).join('');
  }

  /* ---------- events ---------- */

  function bindEvents() {
    document.getElementById('btn-add-doctor').addEventListener('click', function () { openForm(null); });
    document.getElementById('btn-doctor-cancel').addEventListener('click', function () { SMH.closeModal('doctor-modal'); });
    document.getElementById('doctor-form').addEventListener('submit', handleSave);

    document.getElementById('doctor-status').addEventListener('change', syncStatusFields);

    document.getElementById('doctor-search').addEventListener('input', function (e) {
      state.query = e.target.value.trim().toLowerCase();
      render();
    });

    document.querySelectorAll('#doctor-filter .filter-btn').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('#doctor-filter .filter-btn').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
        state.filter = btn.getAttribute('data-doc-filter');
        render();
      });
    });

    document.getElementById('doctors-table-body').addEventListener('click', function (e) {
      var btn = e.target.closest('button[data-action]');
      if (!btn) return;
      var id = btn.getAttribute('data-id');
      var action = btn.getAttribute('data-action');
      if (action === 'edit') openForm(id);
      else if (action === 'left') setStatus(id, 'Left');
      else if (action === 'activate') setStatus(id, 'Active');
      else if (action === 'delete') removeDoctor(id);
    });
  }

  /* ---------- table ---------- */

  function statusBadge(status) {
    if (status === 'Active') return '<span class="badge badge-completed">Active</span>';
    if (status === 'On Leave') return '<span class="badge badge-pending">On leave</span>';
    return '<span class="badge badge-muted">Left</span>';
  }

  function render() {
    var doctors = getDoctors();
    var counts = visitCounts();
    var allCounts = visitCounts(true);

    // Tab and filter counts
    var tally = { All: doctors.length, Active: 0, 'On Leave': 0, Left: 0 };
    doctors.forEach(function (d) { tally[d.status] += 1; });
    document.querySelectorAll('#doctor-filter [data-count-for]').forEach(function (el) {
      el.textContent = tally[el.getAttribute('data-count-for')];
    });
    SMH.setTabCount('doctors', tally.Active);

    var rows = doctors.filter(function (d) {
      if (state.filter !== 'All' && d.status !== state.filter) return false;
      if (!state.query) return true;
      return (d.name + ' ' + d.specialty + ' ' + d.room + ' ' + d.id).toLowerCase().indexOf(state.query) !== -1;
    });

    var tbody = document.getElementById('doctors-table-body');
    if (rows.length === 0) {
      var msg = doctors.length === 0
        ? 'No doctors yet. Click "Add doctor" to add the first one.'
        : 'No doctors match this filter.';
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">' + msg + '</td></tr>';
      return;
    }

    tbody.innerHTML = rows.map(function (d) {
      var n = counts[d.id] || 0;
      var secondary = '';
      if (d.status === 'Active') {
        secondary = '<button type="button" class="btn btn-secondary btn-sm" data-action="left" data-id="' + esc(d.id) + '">Mark left</button>';
      } else if (d.status === 'On Leave') {
        secondary = '<button type="button" class="btn btn-secondary btn-sm" data-action="activate" data-id="' + esc(d.id) + '">Back from leave</button>';
      } else {
        secondary = '<button type="button" class="btn btn-secondary btn-sm" data-action="activate" data-id="' + esc(d.id) + '">Reactivate</button>';
      }
      var del = (allCounts[d.id] || 0) === 0
        ? '<button type="button" class="btn btn-danger btn-sm" data-action="delete" data-id="' + esc(d.id) + '">Delete</button>'
        : '';

      var note = '';
      if (d.status === 'Left' && d.leftDate) note = '<small class="cell-sub">Left on ' + esc(d.leftDate) + '</small>';
      else if (d.joinedDate) note = '<small class="cell-sub">Joined ' + esc(d.joinedDate) + '</small>';

      var visitsNote = n + (n === 1 ? ' visit' : ' visits');
      return '<tr>' +
        '<td data-label="Doctor" class="cell-wrap"><div><strong>' + esc(d.name) + '</strong><small class="cell-sub">' + esc(d.id) + ' &middot; ' + visitsNote + '</small></div></td>' +
        '<td data-label="Specialty" class="cell-wrap">' + esc(d.specialty) + '</td>' +
        '<td data-label="Room">' + esc(d.room || '—') + '</td>' +
        '<td data-label="Visiting days / time" class="cell-wrap"><div>' + esc(d.schedule || '—') + note + '</div></td>' +
        '<td data-label="Fee (Tk)" style="text-align: right;">' + Number(d.visitFee).toLocaleString() + '</td>' +
        '<td data-label="Status">' + statusBadge(d.status) + '</td>' +
        '<td data-label="Actions" style="text-align: right;"><div class="row-actions">' +
          '<button type="button" class="btn btn-secondary btn-sm" data-action="edit" data-id="' + esc(d.id) + '">Edit</button>' +
          secondary + del +
        '</div></td>' +
        '</tr>';
    }).join('');
  }

  /* ---------- add / edit form ---------- */

  function syncStatusFields() {
    var status = document.getElementById('doctor-status').value;
    var leftGroup = document.getElementById('doctor-left-group');
    leftGroup.style.display = status === 'Left' ? '' : 'none';
    if (status === 'Left' && !document.getElementById('doctor-left').value) {
      document.getElementById('doctor-left').value = getToday();
    }
  }

  function showError(msg) {
    var el = document.getElementById('doctor-form-error');
    el.textContent = msg || '';
    el.style.display = msg ? 'block' : 'none';
  }

  function openForm(id) {
    var form = document.getElementById('doctor-form');
    form.reset();
    showError('');
    document.getElementById('doctor-edit-id').value = id || '';

    var doc = id ? getDoctors().find(function (d) { return d.id === id; }) : null;
    if (id && !doc) return;

    document.getElementById('doctor-modal-title').textContent = doc ? 'Edit doctor' : 'Add doctor';
    document.getElementById('doctor-modal-desc').textContent = doc
      ? doc.id + (doc.status === 'Active' ? '' : ' (currently ' + doc.status.toLowerCase() + ')')
      : 'Fill in the details. The doctor can be booked for visits straight away.';
    document.getElementById('btn-doctor-save').textContent = doc ? 'Save changes' : 'Add doctor';

    // Status only makes sense for an existing doctor; a new doctor is Active
    document.getElementById('doctor-status-group').style.display = doc ? '' : 'none';
    document.getElementById('doctor-fee-hint').style.display = doc ? 'block' : 'none';

    if (doc) {
      document.getElementById('doctor-name').value = doc.name;
      document.getElementById('doctor-specialty').value = doc.specialty;
      document.getElementById('doctor-room').value = doc.room;
      document.getElementById('doctor-fee').value = doc.visitFee;
      document.getElementById('doctor-schedule').value = doc.schedule;
      document.getElementById('doctor-joined').value = doc.joinedDate;
      document.getElementById('doctor-status').value = doc.status;
      document.getElementById('doctor-left').value = doc.leftDate;
    } else {
      document.getElementById('doctor-joined').value = getToday();
      document.getElementById('doctor-status').value = 'Active';
    }
    syncStatusFields();
    SMH.openModal('doctor-modal');
  }

  function handleSave(e) {
    e.preventDefault();

    var editId = document.getElementById('doctor-edit-id').value;
    var name = document.getElementById('doctor-name').value.trim().replace(/\s+/g, ' ');
    var specialty = document.getElementById('doctor-specialty').value.trim();
    var room = document.getElementById('doctor-room').value.trim();
    var feeRaw = document.getElementById('doctor-fee').value;
    var fee = Math.round(parseFloat(feeRaw));
    var schedule = document.getElementById('doctor-schedule').value.trim();
    var joined = document.getElementById('doctor-joined').value;
    var status = editId ? document.getElementById('doctor-status').value : 'Active';
    var leftDate = status === 'Left' ? (document.getElementById('doctor-left').value || getToday()) : '';

    if (!name) return showError('Please enter the doctor\'s name.');
    if (!specialty) return showError('Please enter the specialty.');
    if (feeRaw === '' || isNaN(fee) || fee < 0) return showError('Please enter a valid visit fee (0 or more).');
    if (joined && leftDate && leftDate < joined) return showError('The last working day cannot be before the joining date.');

    var doctors = getDoctors();
    var clash = doctors.some(function (d) {
      return d.id !== editId && d.name.toLowerCase() === name.toLowerCase() && d.specialty.toLowerCase() === specialty.toLowerCase();
    });
    if (clash) return showError('A doctor with this name and specialty already exists.');

    if (editId) {
      var idx = doctors.findIndex(function (d) { return d.id === editId; });
      if (idx === -1) return showError('This doctor no longer exists.');
      doctors[idx] = Object.assign({}, doctors[idx], {
        name: name, specialty: specialty, room: room, visitFee: fee,
        schedule: schedule, joinedDate: joined, status: status, leftDate: leftDate
      });
      saveDoctors(doctors);
      SMH.toast('visit-alert', name + ' updated.', 'success');
    } else {
      var id = nextDoctorId(doctors);
      doctors.push({
        id: id, name: name, specialty: specialty, room: room, visitFee: fee,
        schedule: schedule, joinedDate: joined, status: 'Active', leftDate: ''
      });
      saveDoctors(doctors);
      SMH.toast('visit-alert', name + ' added as ' + id + '. They can now be booked for visits.', 'success');
    }

    SMH.closeModal('doctor-modal');
    afterChange();
  }

  /* ---------- quick actions ---------- */

  function setStatus(id, status) {
    var doctors = getDoctors();
    var idx = doctors.findIndex(function (d) { return d.id === id; });
    if (idx === -1) return;
    var doc = doctors[idx];

    if (status === 'Left') {
      var ok = confirm(doc.name + ' will no longer appear when booking visits. Old visits and reports are kept.\n\nMark this doctor as left?');
      if (!ok) return;
      doc.status = 'Left';
      doc.leftDate = getToday();
      SMH.toast('visit-alert', doc.name + ' marked as left.', 'info');
    } else {
      doc.status = 'Active';
      doc.leftDate = '';
      SMH.toast('visit-alert', doc.name + ' is active again and can be booked.', 'success');
    }
    saveDoctors(doctors);
    afterChange();
  }

  function removeDoctor(id) {
    var doc = getDoctors().find(function (d) { return d.id === id; });
    if (!doc) return;
    // A doctor with visit history must never be deleted
    if ((visitCounts(true)[id] || 0) > 0) {
      SMH.toast('visit-alert', doc.name + ' has visit history. Mark them as left instead of deleting.', 'danger');
      return;
    }
    if (!confirm('Delete ' + doc.name + ' (' + doc.id + ')? This doctor has no visits, so nothing else is affected.')) return;
    saveDoctors(getDoctors().filter(function (d) { return d.id !== id; }));
    SMH.toast('visit-alert', doc.name + ' deleted.', 'info');
    afterChange();
  }

  function afterChange() {
    fillSpecialtyList();
    render();
    // Keep the consultation form's doctor list in step
    if (typeof populateDoctorSelect === 'function') populateDoctorSelect();
    if (typeof renderVisitsTable === 'function') renderVisitsTable();
  }
})();
