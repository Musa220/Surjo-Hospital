/**
 * Dashboard extras: 7-day collection chart and recent payments list.
 * Reads the same data and the same report functions as everything else
 * (dailyCollection from reports-logic.js). Called by dashboard.js after
 * every render, so it also refreshes after "Load sample data" / "Clear all data".
 */

function renderDashboardExtras() {
  renderCollectionChart();
  renderRecentPayments();
  renderPaymentMix();
  renderLabQueue();
  renderTopDoctors();
  renderDues();
}

function dxEscape(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dxMoney(n) {
  return 'Tk ' + Number(n || 0).toLocaleString();
}

/** 7600 -> "7.6k", 26000 -> "26k", 450 -> "450", 0 -> "" */
function dxCompact(n) {
  const v = Number(n || 0);
  if (v <= 0) return '';
  if (v < 1000) return String(v);
  const k = v / 1000;
  return (k >= 10 ? Math.round(k) : Math.round(k * 10) / 10) + 'k';
}

/** Local YYYY-MM-DD for "today minus offset days" (never UTC). */
function dxDateOffset(offsetDays) {
  const d = new Date();
  d.setDate(d.getDate() - offsetDays);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return { iso: `${d.getFullYear()}-${month}-${day}`, date: d };
}

function renderCollectionChart() {
  const host = document.getElementById('collection-chart');
  const totalEl = document.getElementById('chart-total');
  if (!host) return;

  const days = [];
  for (let i = 6; i >= 0; i--) {
    const { iso, date } = dxDateOffset(i);
    const report = dailyCollection(iso, iso);
    days.push({
      weekday: date.toLocaleDateString(undefined, { weekday: 'short' }),
      dayNum: date.getDate(),
      visit: report.totalVisitAmount,
      lab: report.totalLabAmount,
      total: report.totalCollected
    });
  }

  const max = Math.max.apply(null, days.map(d => d.total));
  const weekTotal = days.reduce((sum, d) => sum + d.total, 0);
  renderSparkline(days.map(d => d.total));

  host.classList.toggle('is-empty', max === 0);
  if (max === 0) {
    host.innerHTML = '<div class="empty-state">No payments in the last 7 days. Load sample data or collect a payment to see this chart.</div>';
    if (totalEl) totalEl.innerHTML = '';
    return;
  }

  host.innerHTML = days.map(d => {
    // The tallest bar fills 80% of its track; the rest of the track holds its value label.
    const pct = Math.max((d.total / max) * 80, d.total > 0 ? 5 : 0);
    const visitShare = d.total ? (d.visit / d.total) * 100 : 0;
    const labShare = d.total ? (d.lab / d.total) * 100 : 0;
    const label = `${d.weekday} ${d.dayNum}: ${dxMoney(d.total)} (visits ${dxMoney(d.visit)}, lab ${dxMoney(d.lab)})`;
    const stack = d.total === 0
      ? '<div class="bar-stack is-empty"></div>'
      : `<div class="bar-stack" style="height: ${pct.toFixed(1)}%;">
           <div class="bar-visit" style="height: ${visitShare.toFixed(1)}%;"></div>
           <div class="bar-lab" style="height: ${labShare.toFixed(1)}%;"></div>
         </div>`;
    return `
      <div class="bar-col" role="img" aria-label="${dxEscape(label)}" title="${dxEscape(label)}">
        <div class="bar-track"><span class="bar-value">${dxCompact(d.total)}</span>${stack}</div>
        <div class="bar-label"><b>${dxEscape(d.weekday)}</b>${d.dayNum}</div>
      </div>`;
  }).join('');

  if (totalEl) {
    totalEl.innerHTML = `Collected over these 7 days: <strong>${dxMoney(weekTotal)}</strong>`;
  }
}

function dxInitials(name) {
  const parts = String(name || '').replace(/^(dr|mr|mrs|ms)\.?\s+/i, '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0].charAt(0);
  const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
  return (first + last).toUpperCase();
}

function renderRecentPayments() {
  const host = document.getElementById('recent-payments');
  if (!host) return;

  const payments = getPayments();
  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);

  if (payments.length === 0) {
    host.innerHTML = '<li class="empty-state">No payments yet. Collect one from Billing and it will show up here.</li>';
    return;
  }

  const nameById = new Map(patients.map(p => [p.id, p.name]));

  // Newest date first; later entries win ties because payments are appended over time.
  const recent = payments
    .map((p, index) => ({ p, index }))
    .sort((a, b) => {
      if (a.p.date !== b.p.date) return a.p.date < b.p.date ? 1 : -1;
      return b.index - a.index;
    })
    .slice(0, 5)
    .map(x => x.p);

  host.innerHTML = recent.map(p => {
    const name = nameById.get(p.patientId) || p.patientId || 'Unknown patient';
    const amount = (Number(p.visitAmount) || 0) + (Number(p.labAmount) || 0);
    return `
      <li class="recent-item">
        <span class="avatar" aria-hidden="true">${dxEscape(dxInitials(name))}</span>
        <span class="recent-main">
          <strong>${dxEscape(name)}</strong>
          <small>${p.isRefund ? 'Refund via ' : ''}${dxEscape(p.paymentMethod || 'Cash')} on ${dxEscape(p.date)}</small>
        </span>
        <span class="recent-amount${amount < 0 ? ' is-due' : ''}">${amount < 0 ? '-' : ''}${dxMoney(Math.abs(amount))}</span>
      </li>`;
  }).join('');
}

/* ---------- Sparkline inside the "Money collected today" card ---------- */
function renderSparkline(values) {
  const svg = document.getElementById('kpi-spark');
  if (!svg) return;
  const max = Math.max.apply(null, values);
  if (!(max > 0)) {
    svg.innerHTML = '';
    return;
  }
  const W = 340;
  const H = 52;
  const top = 10;
  const bottom = 4;
  const step = W / (values.length - 1);
  const pts = values.map((v, i) => [i * step, H - bottom - (v / max) * (H - top - bottom)]);
  const f = n => n.toFixed(1);

  let d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] || pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] || p2;
    d += ' C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) +
         ' ' + f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) +
         ' ' + f(p2[0]) + ' ' + f(p2[1]);
  }
  const last = pts[pts.length - 1];
  svg.innerHTML =
    '<path class="area" d="' + d + ' L' + f(last[0]) + ' ' + H + ' L0 ' + H + ' Z"/>' +
    '<path class="line" vector-effect="non-scaling-stroke" d="' + d + '"/>';
}

/* ---------- Payment methods donut ---------- */
function renderPaymentMix() {
  const host = document.getElementById('payment-mix');
  if (!host) return;

  const payments = getPayments();
  const totals = { Cash: 0, Card: 0, bKash: 0 };
  payments.forEach(p => {
    const method = Object.prototype.hasOwnProperty.call(totals, p.paymentMethod) ? p.paymentMethod : 'Cash';
    totals[method] += (Number(p.visitAmount) || 0) + (Number(p.labAmount) || 0);
  });
  // Refunds are negative payments; a method cannot show less than zero in the chart
  Object.keys(totals).forEach(k => { if (totals[k] < 0) totals[k] = 0; });
  const sum = totals.Cash + totals.Card + totals.bKash;

  if (sum === 0) {
    host.innerHTML = '<div class="empty-state">No payments yet. Collect one from Billing and the split by Cash, Card and bKash appears here.</div>';
    return;
  }

  const colors = { Cash: 'var(--c-cash)', Card: 'var(--c-card)', bKash: 'var(--c-bkash)' };
  let acc = 0;
  const stops = [];
  Object.keys(totals).forEach(key => {
    const pct = (totals[key] / sum) * 100;
    stops.push(colors[key] + ' ' + acc.toFixed(2) + '% ' + (acc + pct).toFixed(2) + '%');
    acc += pct;
  });

  const legend = Object.keys(totals).map(key => {
    const pct = Math.round((totals[key] / sum) * 100);
    return `<li><i style="background:${colors[key]}"></i><span>${key}</span><b>${dxMoney(totals[key])}</b><em>${pct}%</em></li>`;
  }).join('');

  host.innerHTML = `
    <div class="donut" role="img" aria-label="Payments by method: Cash ${dxMoney(totals.Cash)}, Card ${dxMoney(totals.Card)}, bKash ${dxMoney(totals.bKash)}" style="background: conic-gradient(${stops.join(', ')});">
      <div class="donut-center"><strong>Tk ${dxCompact(sum) || sum}</strong><small>collected</small></div>
    </div>
    <ul class="donut-legend">${legend}</ul>`;
}

/* ---------- Pending lab queue ---------- */
function renderLabQueue() {
  const host = document.getElementById('lab-queue');
  if (!host) return;

  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  const nameById = new Map(patients.map(p => [p.id, p.name]));
  const pending = getStorage(STORAGE_KEYS.LAB_TESTS, [])
    .filter(o => o.status === 'Pending')
    .sort((a, b) => String(a.orderDate || a.date || '').localeCompare(String(b.orderDate || b.date || '')))
    .slice(0, 5);

  if (pending.length === 0) {
    host.innerHTML = '<li class="empty-state">No pending lab tests. Every order has a result.</li>';
    return;
  }

  host.innerHTML = pending.map(o => {
    const name = nameById.get(o.patientId) || o.patientId || 'Unknown patient';
    const date = o.orderDate || o.date || '';
    return `
      <li class="recent-item">
        <span class="avatar" aria-hidden="true">${dxEscape(dxInitials(name))}</span>
        <span class="recent-main">
          <strong>${dxEscape(o.testName || o.testCode || 'Lab test')}</strong>
          <small>${dxEscape(name)}${date ? ', ordered ' + dxEscape(date) : ''}</small>
        </span>
        <span class="badge badge-pending">Pending</span>
      </li>`;
  }).join('');
}

/* ---------- Busiest doctors (last 30 days) ---------- */
function renderTopDoctors() {
  const host = document.getElementById('top-doctors');
  if (!host) return;

  const from = dxDateOffset(29).iso;
  const doctors = getStorage(STORAGE_KEYS.DOCTORS, []);
  const info = new Map(doctors.map(d => [d.id, d]));
  const counts = new Map();
  getVisits().forEach(v => {
    if (v.date && v.date >= from) counts.set(v.doctorId, (counts.get(v.doctorId) || 0) + 1);
  });

  const rows = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  if (rows.length === 0) {
    host.innerHTML = '<li class="empty-state">No visits in the last 30 days. Log a doctor visit to see who is busiest.</li>';
    return;
  }

  const top = rows[0][1];
  host.innerHTML = rows.map(([id, count]) => {
    const doc = info.get(id) || {};
    const name = doc.name || id || 'Unknown doctor';
    return `
      <li class="recent-item">
        <span class="avatar" aria-hidden="true">${dxEscape(dxInitials(name))}</span>
        <span class="recent-main">
          <strong>${dxEscape(name)}</strong>
          <small>${dxEscape(doc.specialty || 'Doctor')}</small>
          <span class="meter" aria-hidden="true"><i style="width:${Math.round((count / top) * 100)}%"></i></span>
        </span>
        <span class="recent-amount">${count} ${count === 1 ? 'visit' : 'visits'}</span>
      </li>`;
  }).join('');
}

/* ---------- Outstanding dues: KPI card and top-five list ---------- */
function renderDues() {
  const host = document.getElementById('top-dues');
  const kpi = document.getElementById('kpi-dues');
  const kpiSub = document.getElementById('kpi-dues-sub');
  if (!host && !kpi) return;

  const dues = outstandingDues();

  if (kpi) kpi.textContent = dxMoney(dues.totalOutstanding);
  if (kpiSub) {
    kpiSub.textContent = dues.debtorCount === 0
      ? 'No patient owes money'
      : dues.debtorCount + (dues.debtorCount === 1 ? ' patient owes money' : ' patients owe money');
  }
  if (!host) return;

  const top = dues.debtors.slice(0, 5);
  if (top.length === 0) {
    host.innerHTML = '<li class="empty-state">No outstanding dues. Every balance is settled.</li>';
    return;
  }

  host.innerHTML = top.map(d => {
    const name = d.name || d.patientId || 'Unknown patient';
    return `
      <li class="recent-item">
        <span class="avatar" aria-hidden="true">${dxEscape(dxInitials(name))}</span>
        <span class="recent-main">
          <strong>${dxEscape(name)}</strong>
          <small>Visit ${dxMoney(d.visitDue)}, lab ${dxMoney(d.labDue)}</small>
        </span>
        <span class="recent-amount is-due">${dxMoney(d.totalDue)}</span>
      </li>`;
  }).join('');
}
