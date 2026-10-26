/**
 * Single Source of Truth for Hospital Financial & Operational Calculations.
 * Pure calculation functions reading directly from localStorage models.
 */

/**
 * Helper to test if a date string falls within [from, to] inclusive.
 * Empty from/to implies an open boundary.
 */
function isDateInRange(dateStr, from, to) {
  if (!dateStr) return false;
  if (from && dateStr < from) return false;
  if (to && dateStr > to) return false;
  return true;
}

/**
 * 1. dailyCollection(from, to)
 * Computes revenue collections broken down by payment methods, revenue buckets,
 * and list of payments within the date range.
 * Always calculates paid = visitAmount + labAmount, ignoring amountPaid.
 * Voided payments are ignored; refunds (negative payments) are subtracted, so
 * totalCollected is the net amount. totalRefunded shows how much of it went back.
 * Includes totalDue reflecting current outstanding hospital dues.
 *
 * @param {string} [from] - Start date "YYYY-MM-DD"
 * @param {string} [to] - End date "YYYY-MM-DD"
 * @param {{skipDues?: boolean}} [opts] - skipDues leaves totalDue out (0) for callers that
 *        never show it and call this many times (the AI chat asks for 60+ single days)
 * @returns {Object}
 */
function dailyCollection(from, to, opts) {
  // Voided payments are left out. Refunds are stored as negative payments,
  // so every total below is the NET money kept by the hospital.
  const payments = getPayments();

  let totalVisitAmount = 0;
  let totalLabAmount = 0;
  let totalRefunded = 0;
  let refundCount = 0;

  const byMethod = {
    Cash: 0,
    Card: 0,
    bKash: 0
  };

  const filteredPayments = payments.filter(p => {
    if (!isDateInRange(p.date, from, to)) return false;

    const visitAmt = Number(p.visitAmount) || 0;
    const labAmt = Number(p.labAmount) || 0;
    const paid = visitAmt + labAmt;

    if (p.isRefund || paid < 0) {
      totalRefunded += Math.abs(paid);
      refundCount += 1;
    }

    totalVisitAmount += visitAmt;
    totalLabAmount += labAmt;

    const method = p.paymentMethod || 'Cash';
    byMethod[method] = (byMethod[method] || 0) + paid;

    return true;
  });

  const totalCollected = totalVisitAmount + totalLabAmount;
  const currentDues = opts && opts.skipDues ? { totalOutstanding: 0 } : outstandingDues();

  return {
    from: from || null,
    to: to || null,
    count: filteredPayments.length,
    totalRefunded,
    refundCount,
    totalCollected,
    totalVisitAmount,
    totalLabAmount,
    totalDue: currentDues.totalOutstanding,
    byMethod,
    payments: filteredPayments
  };
}

/**
 * 2. patientsRegistered(from, to)
 * Returns patients registered between given dates and demographic counts.
 *
 * @param {string} [from]
 * @param {string} [to]
 * @returns {Object}
 */
function patientsRegistered(from, to) {
  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);

  let male = 0;
  let female = 0;
  let other = 0;

  const filtered = patients.filter(p => {
    if (!isDateInRange(p.registeredAt, from, to)) return false;

    const s = (p.sex || '').toLowerCase();
    if (s === 'male') male++;
    else if (s === 'female') female++;
    else other++;

    return true;
  });

  return {
    from: from || null,
    to: to || null,
    total: filtered.length,
    genderSplit: { male, female, other },
    patients: filtered
  };
}

/**
 * 3. doctorWise(from, to)
 * Groups visits and generated consultation revenue by doctor,
 * sorted by visitCount descending.
 *
 * @param {string} [from]
 * @param {string} [to]
 * @returns {Array} List of doctors sorted by visitCount descending
 */
function doctorWise(from, to) {
  const doctors = getDoctors();
  const visits = getVisits(); // cancelled visits are not counted

  const docMap = {};
  doctors.forEach(d => {
    docMap[d.id] = {
      doctorId: d.id,
      doctorName: d.name,
      specialty: d.specialty,
      room: d.room,
      visitFee: d.visitFee,
      status: d.status,
      visitCount: 0,
      totalRevenue: 0
    };
  });

  visits.forEach(v => {
    if (isDateInRange(v.date, from, to)) {
      const doc = docMap[v.doctorId];
      const fee = Number(v.visitFee) || 0;
      if (doc) {
        doc.visitCount += 1;
        doc.totalRevenue += fee;
      } else {
        if (!docMap[v.doctorId]) {
          docMap[v.doctorId] = {
            doctorId: v.doctorId,
            doctorName: "Unknown Doctor",
            specialty: "N/A",
            room: "N/A",
            visitFee: fee,
            status: "Left",
            visitCount: 0,
            totalRevenue: 0
          };
        }
        docMap[v.doctorId].visitCount += 1;
        docMap[v.doctorId].totalRevenue += fee;
      }
    }
  });

  // Doctors who are on leave or have left only appear when they saw patients in this period.
  return Object.values(docMap)
    .filter(d => d.status === 'Active' || d.visitCount > 0)
    .sort((a, b) => b.visitCount - a.visitCount);
}

/**
 * 4. labTestReport(from, to)
 * Summarizes lab tests ordered in the date range, status counts, and test breakdown.
 * totalValue is what patients are charged (after any test discount);
 * totalDiscount is the test-level discount already taken off those prices.
 * Cancelled orders are not part of any figure; they are only counted in cancelledCount.
 *
 * @param {string} [from]
 * @param {string} [to]
 * @returns {Object}
 */
function labTestReport(from, to) {
  const tests = getStorage(STORAGE_KEYS.LAB_TESTS, []);

  let cancelledCount = 0;
  let pendingCount = 0;
  let completedCount = 0;
  let totalValue = 0;
  let totalDiscount = 0;
  const testTally = {};

  const filtered = tests.filter(t => {
    if (!isDateInRange(t.orderedDate, from, to)) return false;

    // A cancelled order was never billed: count it on its own, keep it out of everything else
    if (t.status === 'Cancelled') {
      cancelledCount++;
      return false;
    }

    const price = Number(t.price) || 0;
    const discount = Number(t.discount) || 0;
    totalValue += price;
    totalDiscount += discount;

    if (t.status === 'Completed') {
      completedCount++;
    } else {
      pendingCount++;
    }

    const code = t.testCode || 'OTHER';
    if (!testTally[code]) {
      testTally[code] = {
        testCode: code,
        testName: t.testName || code,
        count: 0,
        totalPrice: 0,
        totalDiscount: 0
      };
    }
    testTally[code].count += 1;
    testTally[code].totalPrice += price;
    testTally[code].totalDiscount += discount;

    return true;
  });

  return {
    from: from || null,
    to: to || null,
    totalOrders: filtered.length,
    pendingCount,
    completedCount,
    cancelledCount,
    totalValue,
    totalDiscount,
    breakdown: Object.values(testTally),
    tests: filtered
  };
}

/**
 * 5. patientLedger(patientId)
 * Returns the exact financial ledger for ANY patient (even with zero due).
 *
 * - Charges    = visit fees / lab prices as billed (lab prices already include
 *                any test-level discount given when the test was ordered)
 * - Discount   = billing discounts given to the patient (voided ones ignored)
 * - Visit due  = max(0, visit charges - visit discount - visit amount paid)
 * - Lab due    = max(0, lab charges - lab discount - lab amount paid)
 * - Total due  = visit due + lab due
 * - Due is never negative
 * - Credit     = money paid above what is owed (refundable); cancelled lab orders
 *                and voided payments are ignored, refunds count as negative payments
 *
 * @param {string} patientId
 * @returns {Object}
 */
function patientLedger(patientId) {
  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);
  const visits = getVisits();           // cancelled visits are never billed
  const labTests = getLabOrders();      // cancelled orders are never billed
  const payments = getPayments();       // voided payments do not count; refunds are negative
  const discounts = getDiscounts();

  const patient = patients.find(p => p.id === patientId) || {};

  let totalVisitCharges = 0;
  visits.forEach(v => {
    if (v.patientId === patientId) {
      totalVisitCharges += (Number(v.visitFee) || 0);
    }
  });

  let totalLabCharges = 0;
  let labTestDiscount = 0;
  labTests.forEach(l => {
    if (l.patientId === patientId) {
      totalLabCharges += (Number(l.price) || 0);
      labTestDiscount += (Number(l.discount) || 0);
    }
  });

  let paidVisitAmount = 0;
  let paidLabAmount = 0;
  payments.forEach(pay => {
    if (pay.patientId === patientId) {
      paidVisitAmount += (Number(pay.visitAmount) || 0);
      paidLabAmount += (Number(pay.labAmount) || 0);
    }
  });

  let visitDiscount = 0;
  let labDiscount = 0;
  discounts.forEach(d => {
    if (d.patientId === patientId && !d.voided) {
      visitDiscount += (Number(d.visitAmount) || 0);
      labDiscount += (Number(d.labAmount) || 0);
    }
  });

  // What the patient really has to pay (a discount can never go below zero)
  const visitNet = Math.max(0, totalVisitCharges - visitDiscount);
  const labNet = Math.max(0, totalLabCharges - labDiscount);

  const visitDue = Math.max(0, visitNet - paidVisitAmount);
  const labDue = Math.max(0, labNet - paidLabAmount);
  const totalDue = visitDue + labDue;

  // Paid more than owed (for example a paid lab test was cancelled): this money can be refunded
  const visitCredit = Math.max(0, paidVisitAmount - visitNet);
  const labCredit = Math.max(0, paidLabAmount - labNet);

  return {
    patientId,
    name: patient.name || '',
    phone: patient.phone || '',
    totalVisitCharges,
    totalLabCharges,
    visitDiscount,
    labDiscount,
    totalDiscount: visitDiscount + labDiscount,
    labTestDiscount,
    paidVisitAmount,
    paidLabAmount,
    visitDue,
    labDue,
    totalDue,
    visitCredit,
    labCredit,
    totalCredit: visitCredit + labCredit
  };
}

/**
 * 6. outstandingDues()
 * Evaluates patient financial ledgers building directly upon patientLedger(id)
 * so individual ledgers and aggregate outstanding dues always agree.
 *
 * @returns {Object}
 */
function outstandingDues() {
  const patients = getStorage(STORAGE_KEYS.PATIENTS, []);

  let grandTotalDue = 0;
  let grandVisitDue = 0;
  let grandLabDue = 0;
  const debtorsList = [];

  patients.forEach(p => {
    const ledger = patientLedger(p.id);

    grandVisitDue += ledger.visitDue;
    grandLabDue += ledger.labDue;
    grandTotalDue += ledger.totalDue;

    if (ledger.totalDue > 0) {
      debtorsList.push(ledger);
    }
  });

  return {
    totalOutstanding: grandTotalDue,
    visitDueTotal: grandVisitDue,
    labDueTotal: grandLabDue,
    debtorCount: debtorsList.length,
    debtors: debtorsList.sort((a, b) => b.totalDue - a.totalDue)
  };
}

/**
 * 7. discountReport(from, to)
 * Money the hospital chose NOT to collect, in the date range.
 *  - Billing discounts: waivers given to a patient on the Billing page
 *    (counted on the day they were given; voided ones are ignored).
 *  - Lab test discounts: price reductions given when a test was ordered
 *    (counted on the order date).
 * Discounts are never counted as money collected.
 *
 * @param {string} [from]
 * @param {string} [to]
 * @returns {Object}
 */
function discountReport(from, to) {
  const billing = getDiscounts().filter(d => !d.voided && isDateInRange(d.date, from, to));
  const labOrders = getLabOrders().filter(t => isDateInRange(t.orderedDate, from, to));

  let billVisitDiscount = 0;
  let billLabDiscount = 0;
  billing.forEach(d => {
    billVisitDiscount += Number(d.visitAmount) || 0;
    billLabDiscount += Number(d.labAmount) || 0;
  });

  let labTestDiscountTotal = 0;
  let labTestDiscountCount = 0;
  labOrders.forEach(t => {
    const disc = Number(t.discount) || 0;
    if (disc > 0) {
      labTestDiscountTotal += disc;
      labTestDiscountCount += 1;
    }
  });

  const billDiscountTotal = billVisitDiscount + billLabDiscount;

  return {
    from: from || null,
    to: to || null,
    billingDiscountCount: billing.length,
    billVisitDiscount,
    billLabDiscount,
    billDiscountTotal,
    labTestDiscountCount,
    labTestDiscountTotal,
    totalDiscount: billDiscountTotal + labTestDiscountTotal,
    discounts: billing
  };
}
