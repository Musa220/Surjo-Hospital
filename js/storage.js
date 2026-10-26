/**
 * Storage Layer & System Utilities
 * Safe LocalStorage wrappers with strict JSON parsing and local date helpers.
 */

const STORAGE_KEYS = {
  PATIENTS: 'smh_patients',
  DOCTORS: 'smh_doctors',
  PRICE_LIST: 'smh_testPriceList',
  VISITS: 'smh_visits',
  LAB_TESTS: 'smh_labTests',
  PAYMENTS: 'smh_payments',
  DISCOUNTS: 'smh_discounts'
};

/**
 * Returns today's date formatted as YYYY-MM-DD using local time (never UTC).
 * Avoids UTC boundary shift bugs caused by toISOString().
 * @returns {string} e.g. "2025-05-10"
 */
function getToday() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Safe getItem wrapper with JSON parse and fallback.
 * @param {string} key
 * @param {*} defaultValue
 * @returns {*}
 */
function getStorage(key, defaultValue = []) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null || raw === undefined) {
      return defaultValue;
    }
    return JSON.parse(raw);
  } catch (err) {
    console.error(`Error parsing localStorage key "${key}":`, err);
    return defaultValue;
  }
}

/**
 * Safe setItem wrapper.
 * @param {string} key
 * @param {*} value
 */
function setStorage(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    console.error(`Error writing to localStorage key "${key}":`, err);
  }
}

/**
 * Generates an auto-incrementing ID based on existing items in a list.
 * Example: generateId('SMH-', patients, 'id', 1001) -> "SMH-1001", "SMH-1002"
 * @param {string} prefix - e.g. "SMH-"
 * @param {Array} list - collection to inspect
 * @param {string} idField - field name holding the ID
 * @param {number} startNumber - base counter start
 * @returns {string}
 */
function generateNextId(prefix, list, idField, startNumber = 1001) {
  if (!Array.isArray(list) || list.length === 0) {
    return `${prefix}${startNumber}`;
  }

  let maxNum = startNumber - 1;
  list.forEach(item => {
    const val = item[idField];
    if (typeof val === 'string' && val.startsWith(prefix)) {
      const numPart = parseInt(val.replace(prefix, ''), 10);
      if (!isNaN(numPart) && numPart > maxNum) {
        maxNum = numPart;
      }
    }
  });

  return `${prefix}${maxNum + 1}`;
}

/**
 * Default Seed Catalog for Doctors (seeded once if not present).
 * status: "Active" (can be booked) | "On Leave" (temporarily not bookable) | "Left" (kept for history).
 */
const DEFAULT_DOCTORS = [
  { id: "DOC-01", name: "Dr. Anisur Rahman",  specialty: "General Medicine",        room: "Room 101", visitFee: 500, status: "Active" },
  { id: "DOC-02", name: "Dr. Nusrat Jahan",   specialty: "Cardiology",              room: "Room 203", visitFee: 800, status: "Active" },
  { id: "DOC-03", name: "Dr. Tanvir Ahmed",   specialty: "Pediatrics",              room: "Room 108", visitFee: 600, status: "Active" },
  { id: "DOC-04", name: "Dr. Farhana Yasmin", specialty: "Gynecology & Obstetrics", room: "Room 302", visitFee: 700, status: "Active" },
  { id: "DOC-05", name: "Dr. Tariqul Islam",  specialty: "Orthopedics",             room: "Room 210", visitFee: 650, status: "Active" }
];

/**
 * Default Seed Catalog for Lab Tests (seeded once if not present).
 * price          = list price in Tk
 * discountPercent/discountUntil = optional standing discount (0-100 %), stops after discountUntil
 * active         = false hides the test from new orders (old orders keep working)
 */
const DEFAULT_TEST_PRICES = [
  { code: "CBC",   name: "Complete Blood Count",           category: "Hematology",  price: 400, discountPercent: 0, discountUntil: "", active: true },
  { code: "RBS",   name: "Random Blood Sugar",             category: "Biochemistry", price: 150, discountPercent: 0, discountUntil: "", active: true },
  { code: "URINE", name: "Urine Routine Examination (RE)", category: "Pathology",   price: 250, discountPercent: 0, discountUntil: "", active: true },
  { code: "LIPID", name: "Lipid Profile",                  category: "Biochemistry", price: 900, discountPercent: 0, discountUntil: "", active: true },
  { code: "XRAY",  name: "Chest X-Ray Digital",            category: "Radiology",   price: 750, discountPercent: 0, discountUntil: "", active: true },
  { code: "SGPT",  name: "Serum ALT / SGPT (Liver)",       category: "Biochemistry", price: 350, discountPercent: 0, discountUntil: "", active: true },
  { code: "CREAT", name: "Serum Creatinine (Kidney)",      category: "Biochemistry", price: 300, discountPercent: 0, discountUntil: "", active: true }
];

/* ==========================================================================
   Doctors: read / write helpers
   Old data saved before the "status" field existed is treated as Active, so
   nothing breaks for browsers that already have the earlier doctor list.
   ========================================================================== */

const DOCTOR_STATUSES = ['Active', 'On Leave', 'Left'];

function normalizeDoctor(d) {
  const status = DOCTOR_STATUSES.indexOf(d && d.status) !== -1 ? d.status : 'Active';
  return Object.assign({}, d, {
    id: String(d.id),
    name: d.name || '',
    specialty: d.specialty || '',
    room: d.room || '',
    visitFee: Number(d.visitFee) || 0,
    status: status,
    schedule: d.schedule || '',
    joinedDate: d.joinedDate || '',
    leftDate: d.leftDate || ''
  });
}

/**
 * All doctors (any status), or only the ones that can take new patients.
 * @param {{bookableOnly?: boolean}} [opts]
 */
function getDoctors(opts) {
  const raw = getStorage(STORAGE_KEYS.DOCTORS, []);
  const list = (Array.isArray(raw) ? raw : []).filter(d => d && d.id).map(normalizeDoctor);
  return opts && opts.bookableOnly ? list.filter(d => d.status === 'Active') : list;
}

function saveDoctors(list) {
  setStorage(STORAGE_KEYS.DOCTORS, list);
}

/** Next doctor ID in the same style as the seed data: DOC-06, DOC-07 ... */
function nextDoctorId(list) {
  let max = 0;
  (list || []).forEach(d => {
    const m = /^DOC-(\d+)$/.exec(d.id || '');
    if (m && Number(m[1]) > max) max = Number(m[1]);
  });
  return 'DOC-' + String(max + 1).padStart(2, '0');
}

/* ==========================================================================
   Lab test catalog: read / write helpers and pricing rules
   ========================================================================== */

function normalizeTest(t) {
  const def = DEFAULT_TEST_PRICES.find(x => x.code === t.code);
  let pct = Number(t.discountPercent) || 0;
  if (pct < 0) pct = 0;
  if (pct > 100) pct = 100;
  return Object.assign({}, t, {
    code: String(t.code),
    name: t.name || '',
    category: t.category || (def && def.category) || 'General',
    price: Number(t.price) || 0,
    discountPercent: pct,
    discountUntil: t.discountUntil || '',
    active: t.active !== false
  });
}

/**
 * All lab tests in the catalog (active and disabled).
 * @param {{activeOnly?: boolean}} [opts]
 */
function getTestCatalog(opts) {
  const raw = getStorage(STORAGE_KEYS.PRICE_LIST, []);
  const list = (Array.isArray(raw) ? raw : []).filter(t => t && t.code).map(normalizeTest);
  return opts && opts.activeOnly ? list.filter(t => t.active) : list;
}

function saveTestCatalog(list) {
  setStorage(STORAGE_KEYS.PRICE_LIST, list);
}

/** Discount % that applies to this test on the given date (0 when none or expired). */
function activeTestDiscountPercent(test, onDate) {
  const pct = Number(test.discountPercent) || 0;
  if (pct <= 0) return 0;
  const day = onDate || getToday();
  if (test.discountUntil && day > test.discountUntil) return 0;
  return pct;
}

/** Price the patient is charged for this test on the given date. */
function netTestPrice(test, onDate) {
  const pct = activeTestDiscountPercent(test, onDate);
  return Math.max(0, Math.round((Number(test.price) || 0) * (100 - pct) / 100));
}

/* ==========================================================================
   Billing discounts: list of discount records (waivers given to a patient)
   ========================================================================== */

function getDiscounts() {
  const raw = getStorage(STORAGE_KEYS.DISCOUNTS, []);
  return Array.isArray(raw) ? raw : [];
}

/* ==========================================================================
   Payments and lab orders: which records count?
   - A payment can be VOIDED (entered by mistake). It stays in the history but
     never counts as money collected and never reduces what the patient owes.
   - A refund is saved as a payment with negative amounts (isRefund: true), so
     "money collected" is always the net amount actually kept.
   - A lab order can be CANCELLED before it is completed. It is never billed
     and never counted in lab reports.
   - A doctor visit entered by mistake can be CANCELLED (reason saved). It is
     never billed and never counted in reports, but stays in the history.
   ========================================================================== */

/** Payments that count (voided ones left out). Pass {includeVoided:true} for the full history. */
function getPayments(opts) {
  const raw = getStorage(STORAGE_KEYS.PAYMENTS, []);
  const list = Array.isArray(raw) ? raw : [];
  return opts && opts.includeVoided ? list : list.filter(p => p && !p.voided);
}

/** Lab orders that count (cancelled ones left out). Pass {includeCancelled:true} for every order. */
function getLabOrders(opts) {
  const raw = getStorage(STORAGE_KEYS.LAB_TESTS, []);
  const list = Array.isArray(raw) ? raw : [];
  return opts && opts.includeCancelled ? list : list.filter(o => o && o.status !== 'Cancelled');
}

/** Doctor visits that count (cancelled ones left out). Pass {includeCancelled:true} for every visit. */
function getVisits(opts) {
  const raw = getStorage(STORAGE_KEYS.VISITS, []);
  const list = Array.isArray(raw) ? raw : [];
  return opts && opts.includeCancelled ? list : list.filter(v => v && v.status !== 'Cancelled');
}

/* ==========================================================================
   Registration date rule
   Nothing can be dated before the patient was registered: a visit, lab order,
   payment, refund or discount for a patient must be on or after the day the
   patient was registered.
   ========================================================================== */

/** Day (YYYY-MM-DD) the patient was registered, or '' when unknown. */
function getPatientRegDate(patientId) {
  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  const p = (Array.isArray(patients) ? patients : []).find(x => x && x.id === patientId);
  return (p && p.registeredAt) || '';
}

/**
 * Returns an error message when `dateStr` is earlier than the patient's
 * registration day, or '' when the date is fine.
 * @param {string} patientId
 * @param {string} dateStr - YYYY-MM-DD
 * @param {string} what - e.g. "visit", "lab order", "payment"
 */
function dateBeforeRegistrationMessage(patientId, dateStr, what) {
  const reg = getPatientRegDate(patientId);
  if (!reg || !dateStr || dateStr >= reg) return '';
  return `This patient (${patientId}) was registered on ${reg}, so the ${what} date cannot be earlier than that.`;
}

/**
 * Sets the "earliest date" of a date input to the patient's registration day
 * (or removes it when no patient is chosen). A date already typed that is now too
 * early is moved up to the registration day.
 */
function limitDateToRegistration(inputEl, patientId) {
  if (!inputEl) return;
  const reg = patientId ? getPatientRegDate(patientId) : '';
  if (reg) {
    inputEl.min = reg;
    if (inputEl.value && inputEl.value < reg) inputEl.value = reg;
  } else {
    inputEl.removeAttribute('min');
  }
}

/* ==========================================================================
   Small input helpers shared by several pages
   ========================================================================== */

/** True when a YYYY-MM-DD date is after today (local time). */
function isFutureDate(dateStr) {
  return !!dateStr && dateStr > getToday();
}

/** Digits only; +880 / 880 prefix turned into a leading 0. "+880 1711-000111" -> "01711000111" */
function normalizePhone(raw) {
  let digits = String(raw || '').replace(/\D/g, '');
  if (digits.length === 13 && digits.startsWith('880')) digits = '0' + digits.slice(3);
  return digits;
}

/** Bangladeshi mobile number: 11 digits, 01[3-9]xxxxxxxx. */
function isValidPhone(raw) {
  return /^01[3-9]\d{8}$/.test(normalizePhone(raw));
}

// Initialize base catalogs if missing
(function initCatalogs() {
  if (!localStorage.getItem(STORAGE_KEYS.DOCTORS)) {
    setStorage(STORAGE_KEYS.DOCTORS, DEFAULT_DOCTORS);
  }
  if (!localStorage.getItem(STORAGE_KEYS.PRICE_LIST)) {
    setStorage(STORAGE_KEYS.PRICE_LIST, DEFAULT_TEST_PRICES);
  }
})();
