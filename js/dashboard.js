/**
 * Dashboard Controller
 * Updates KPI cards with real hospital metrics using reports-logic.js
 * and wires sample data loading/clearing handlers safely.
 */

document.addEventListener('DOMContentLoaded', () => {
  renderDashboard();
  wireDataManagementButtons();
});

function renderDashboard() {
  const today = getToday();

  // Display human-readable current date
  const dateElem = document.getElementById('current-date-display');
  if (dateElem) {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    const dateObj = new Date();
    dateElem.textContent = dateObj.toLocaleDateString(undefined, options);
  }

  // 1. Patients Registered Today
  const regReport = patientsRegistered(today, today);
  const patientKpi = document.getElementById('kpi-patients-today');
  const patientSub = document.getElementById('kpi-patients-sub');
  if (patientKpi) {
    patientKpi.textContent = regReport.total;
    if (patientSub) {
      patientSub.textContent = `Male: ${regReport.genderSplit.male} | Female: ${regReport.genderSplit.female} | Other: ${regReport.genderSplit.other}`;
    }
  }

  // 2. Money Collected Today
  const collectionReport = dailyCollection(today, today);
  const revKpi = document.getElementById('kpi-revenue-today');
  const revSub = document.getElementById('kpi-revenue-sub');
  if (revKpi) {
    revKpi.textContent = `Tk ${collectionReport.totalCollected.toLocaleString()}`;
    if (revSub) {
      revSub.textContent = `Visits: Tk ${collectionReport.totalVisitAmount.toLocaleString()} | Lab: Tk ${collectionReport.totalLabAmount.toLocaleString()}`;
    }
  }

  // 3. Pending Lab Tests (All pending across system)
  const labReport = labTestReport(); // open range to check all pending backlog
  const pendingKpi = document.getElementById('kpi-pending-lab');
  if (pendingKpi) {
    pendingKpi.textContent = labReport.pendingCount;
  }

  // 4. Chart and recent payments (dashboard-extras.js)
  if (typeof renderDashboardExtras === 'function') {
    renderDashboardExtras();
  }
}

/**
 * Connect sample data actions safely
 */
function wireDataManagementButtons() {
  const loadBtn = document.getElementById('btn-load-sample');
  const clearBtn = document.getElementById('btn-clear-data');

  if (loadBtn) {
    loadBtn.addEventListener('click', () => {
      // Loading sample data REPLACES the records, so ask first when there is something to lose
      const count = key => (getStorage(key, []) || []).length;
      const patients = count(STORAGE_KEYS.PATIENTS);
      const visits = count(STORAGE_KEYS.VISITS);
      const labs = count(STORAGE_KEYS.LAB_TESTS);
      const payments = count(STORAGE_KEYS.PAYMENTS);
      if (patients + visits + labs + payments > 0) {
        const ok = confirm(
          'Loading the sample data will REPLACE the records you have now:\n' +
          patients + ' patients, ' + visits + ' visits, ' + labs + ' lab orders, ' + payments + ' payments.\n\n' +
          'Your doctor list and lab test catalog are kept. This cannot be undone.\n\nContinue?'
        );
        if (!ok) return;
      }

      if (typeof window.loadSampleData === 'function') {
        window.loadSampleData();
        showNotification('Sample hospital dataset loaded successfully!', 'success');
        renderDashboard();
      } else {
        // Fallback in case sample-data.js is still pending implementation
        alert('Notice: sample-data.js is not yet loaded. Please verify the file exists.');
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const confirmPurge = confirm('Are you sure you want to clear all patient, visit, lab, payment, and discount records?\n\nYour doctor list and lab test catalog are kept.');
      if (!confirmPurge) return;

      if (typeof window.clearAllData === 'function') {
        window.clearAllData();
      } else {
        // Safe direct fallback purging hospital keys only
        localStorage.removeItem(STORAGE_KEYS.PATIENTS);
        localStorage.removeItem(STORAGE_KEYS.VISITS);
        localStorage.removeItem(STORAGE_KEYS.LAB_TESTS);
        localStorage.removeItem(STORAGE_KEYS.PAYMENTS);
        localStorage.removeItem(STORAGE_KEYS.DISCOUNTS);
      }

      showNotification('Hospital records cleared.', 'info');
      renderDashboard();
    });
  }
}

function showNotification(msg, type = 'success') {
  const container = document.getElementById('status-alert');
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}">${msg}</div>`;
  setTimeout(() => {
    container.innerHTML = '';
  }, 4000);
}