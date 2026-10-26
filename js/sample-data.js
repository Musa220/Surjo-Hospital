/**
 * Sample Data Generator & Storage Management
 * Generates deterministic, relational hospital test data with relative dates.
 */

function clearAllData() {
  localStorage.removeItem(STORAGE_KEYS.PATIENTS);
  localStorage.removeItem(STORAGE_KEYS.VISITS);
  localStorage.removeItem(STORAGE_KEYS.LAB_TESTS);
  localStorage.removeItem(STORAGE_KEYS.PAYMENTS);
  localStorage.removeItem(STORAGE_KEYS.DISCOUNTS);
}

function loadSampleData() {
  // Simple deterministic seeded pseudo-random number generator (Mulberry32)
  let seed = 19840507;
  function rand() {
    let t = (seed += 0x6D2B79F5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  function randInt(min, max) {
    return Math.floor(rand() * (max - min + 1)) + min;
  }

  function randChoice(arr) {
    return arr[Math.floor(rand() * arr.length)];
  }

  function parseLocal(str) {
    const a = str.split('-').map(Number);
    return new Date(a[0], a[1] - 1, a[2]);
  }

  // Local date helpers without UTC offset bugs
  const todayStr = getToday();
  const now = parseLocal(todayStr);

  function shiftDate(baseDate, dayOffset) {
    const d = new Date(baseDate.getFullYear(), baseDate.getMonth(), baseDate.getDate() + dayOffset);
    const yr = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, '0');
    const da = String(d.getDate()).padStart(2, '0');
    return `${yr}-${mo}-${da}`;
  }

  // Ensure catalog availability. Sample visits go to doctors who are active now and
  // sample lab orders use tests that are available now, so the data matches whatever
  // doctor list and lab catalog the hospital has set up.
  let doctors = getDoctors({ bookableOnly: true });
  if (doctors.length === 0) doctors = getDoctors();
  if (doctors.length === 0) {
    saveDoctors(DEFAULT_DOCTORS.slice());
    doctors = getDoctors();
  }
  let priceList = getTestCatalog({ activeOnly: true });
  if (priceList.length === 0) priceList = getTestCatalog();
  if (priceList.length === 0) {
    saveTestCatalog(DEFAULT_TEST_PRICES.slice());
    priceList = getTestCatalog();
  }
  // With fewer than five doctors the last one simply takes the remaining share
  const doctorAt = n => doctors[Math.min(n, doctors.length - 1)];

  // Lab price for an order on a given day (applies any running test discount)
  function labPricing(test, date) {
    const net = netTestPrice(test, date);
    if (net === test.price) return { price: net };
    return {
      listPrice: test.price,
      discountPercent: activeTestDiscountPercent(test, date),
      discount: test.price - net,
      price: net
    };
  }

  // 1. Generate 50 Patients (SMH-1001 to SMH-1050)
  const firstNames = [
    'Mohammad', 'Abdul', 'Rahim', 'Karim', 'Fatema', 'Ayesha', 'Nasreen', 'Rokeya',
    'Shahidul', 'Tariq', 'Farhana', 'Tahmina', 'Zakir', 'Anisur', 'Habibur', 'Sharmin',
    'Kamrul', 'Rashed', 'Jannatul', 'Sultana', 'Shirin', 'Mahmud', 'Babar', 'Sayeeda'
  ];
  const lastNames = [
    'Uddin', 'Ahmed', 'Khan', 'Hossain', 'Akhtar', 'Chowdhury', 'Begum', 'Haque',
    'Rahman', 'Islam', 'Sarker', 'Bhuiyan', 'Mia', 'Miah', 'Ali', 'Siddique'
  ];
  const bloodGroups = ['A+', 'A-', 'B+', 'B-', 'O+', 'O-', 'AB+', 'AB-'];
  const locations = [
    'Mirpur-1, Dhaka', 'Mirpur-10, Dhaka', 'Dhanmondi, Dhaka', 'Uttara Sector 4, Dhaka',
    'Uttara Sector 11, Dhaka', 'Mohammadpur, Dhaka', 'Gulshan-1, Dhaka', 'Banani, Dhaka',
    'Badda, Dhaka', 'Farmgate, Dhaka', 'Rampura, Dhaka', 'Khilgaon, Dhaka',
    'Old Dhaka, Dhaka', 'Motijheel, Dhaka', 'Savar, Dhaka'
  ];

  const patients = [];
  for (let i = 1; i <= 50; i++) {
    const id = `SMH-${1000 + i}`;
    const name = `${randChoice(firstNames)} ${randChoice(lastNames)}`;
    const age = randInt(4, 76);
    const sex = rand() > 0.48 ? 'Male' : (rand() > 0.04 ? 'Female' : 'Other');
    const phone = `01700-000${String(100 + i).slice(-3)}`;
    const bloodGroup = randChoice(bloodGroups);
    const address = randChoice(locations);

    // Date registration distribution:
    // SMH-1048, 1049, 1050 registered today
    // SMH-1040..1047 registered in the last 1..6 days (this week)
    // Earlier patients spread across past 7..30 days
    let dayOffset = 0;
    if (i >= 48) {
      dayOffset = 0; // Today
    } else if (i >= 40) {
      dayOffset = -randInt(1, 6); // This week
    } else {
      dayOffset = -randInt(7, 30);
    }

    patients.push({
      id,
      name,
      age,
      sex,
      phone,
      bloodGroup,
      address,
      registeredAt: shiftDate(now, dayOffset)
    });
  }

  // 2. Doctor Visits (~120 records, SMV-5001+)
  // DOC-01 (Dr. Anisur Rahman) will be heavily weighted to dominate the current month
  const complaints = [
    { c: 'Persistent dry cough and low-grade fever', d: 'Acute Bronchitis', meds: [{ name: 'Tab Azithrocin 500mg', dosage: '1+0+0', duration: '5 days' }, { name: 'Syr Tusca 100ml', dosage: '2 tsp x 3', duration: '5 days' }] },
    { c: 'Sudden high fever with severe joint pain', d: 'Viral Syndrome (Probable Dengue)', meds: [{ name: 'Tab Napa 500mg', dosage: '1+1+1', duration: '3 days' }, { name: 'Oral Rehydration Salts', dosage: '1 pkt in 500ml water', duration: 'Daily' }] },
    { c: 'Chest tightness and shortness of breath on exertion', d: 'Exertional Angina Pectoris', meds: [{ name: 'Tab Angilock 50mg', dosage: '0+0+1', duration: '14 days' }, { name: 'Tab Nitrocontin 2.6mg', dosage: '1+0+1', duration: '14 days' }] },
    { c: 'Severe pain and stiffness in left knee joint', d: 'Osteoarthritis Knee Joint', meds: [{ name: 'Tab Deflamat 50mg', dosage: '1+0+1', duration: '7 days' }, { name: 'Cap Seclo 20mg', dosage: '1+0+1', duration: '14 days' }] },
    { c: 'Lower abdominal cramping and frequent loose stools', d: 'Acute Gastroenteritis', meds: [{ name: 'Tab Ciprocin 500mg', dosage: '1+0+1', duration: '5 days' }, { name: 'Tab Filmet 400mg', dosage: '1+1+1', duration: '5 days' }] },
    { c: 'Child suffering from runny nose, wheezing and fever', d: 'Pediatric Viral Rhinovirus', meds: [{ name: 'Syr Napa 60ml', dosage: '1 tsp x 3', duration: '3 days' }, { name: 'Syr Fenofex', dosage: '1 tsp x 2', duration: '5 days' }] },
    { c: 'Routine pregnancy consultation and morning sickness', d: 'Antenatal Checkup (16 weeks)', meds: [{ name: 'Tab Folison', dosage: '0+1+0', duration: '30 days' }, { name: 'Tab Doxinate', dosage: '1+0+1', duration: '10 days' }] }
  ];

  const visits = [];
  let visitCounter = 5001;

  // Track each patient's activity for payment generation
  const patientCharges = {};
  patients.forEach(p => {
    patientCharges[p.id] = {
      registeredAt: p.registeredAt,
      visits: [],
      labs: []
    };
  });

  // Guarantee visits today for today's registrants
  for (let i = 47; i < 50; i++) {
    const p = patients[i];
    const doc = doctorAt(0); // first doctor (DOC-01 by default)
    const tpl = randChoice(complaints);
    const vId = `SMV-${visitCounter++}`;
    const vDate = todayStr;
    const v = {
      visitId: vId,
      patientId: p.id,
      doctorId: doc.id,
      date: vDate,
      complaint: tpl.c,
      diagnosis: tpl.d,
      medicines: tpl.meds,
      visitFee: doc.visitFee
    };
    visits.push(v);
    patientCharges[p.id].visits.push(v);
  }

  // Remaining visits across all patients
  while (visits.length < 122) {
    const p = randChoice(patients);
    // Weighted doctor choice: DOC-01 gets ~45% of visits
    let doc;
    const rDoc = rand();
    if (rDoc < 0.45) {
      doc = doctorAt(0); // first doctor (DOC-01 by default)
    } else if (rDoc < 0.60) {
      doc = doctorAt(1);
    } else if (rDoc < 0.75) {
      doc = doctorAt(2);
    } else if (rDoc < 0.88) {
      doc = doctorAt(3);
    } else {
      doc = doctorAt(4);
    }

    // Determine visit date: between patient's registeredAt and today
    const pRegDate = parseLocal(p.registeredAt);
    const diffDays = Math.round((now - pRegDate) / (1000 * 60 * 60 * 24));
    const offsetFromReg = diffDays > 0 ? randInt(0, diffDays) : 0;
    const vDate = shiftDate(pRegDate, offsetFromReg);

    const tpl = randChoice(complaints);
    const v = {
      visitId: `SMV-${visitCounter++}`,
      patientId: p.id,
      doctorId: doc.id,
      date: vDate,
      complaint: tpl.c,
      diagnosis: tpl.d,
      medicines: tpl.meds,
      visitFee: doc.visitFee
    };

    visits.push(v);
    patientCharges[p.id].visits.push(v);
  }

  // 3. Lab Orders (~80 records, SML-8001+)
  const labResultsMap = {
    CBC: {
      result: 'Hb: 14.1 g/dL, WBC: 7,800 /cu mm, Platelets: 220,000 /cu mm',
      remarks: 'Parameters within normal physiological range'
    },
    RBS: {
      result: 'RBS: 8.6 mmol/L',
      remarks: 'Mild postprandial hyperglycemia'
    },
    URINE: {
      result: 'Pus cells 8-10 /HPF, Epithelial 2-4 /HPF',
      remarks: 'Indicative of mild urinary tract infection'
    },
    LIPID: {
      result: 'Total Cholesterol: 245 mg/dL, Triglycerides: 210 mg/dL',
      remarks: 'Borderline hyperlipidemia noted'
    },
    XRAY: {
      result: 'Lungs clear, cardiothoracic ratio normal',
      remarks: 'No active pulmonary lesion'
    },
    SGPT: {
      result: 'Serum ALT: 48 U/L',
      remarks: 'Liver enzyme within normal clinical range'
    },
    CREAT: {
      result: 'Serum Creatinine: 1.1 mg/dL',
      remarks: 'Normal kidney function'
    }
  };

  const labTests = [];
  let labCounter = 8001;

  // Give lab orders to today's patients (Pending)
  for (let i = 47; i < 50; i++) {
    const p = patients[i];
    const test = priceList[i % priceList.length];
    const order = {
      orderId: `SML-${labCounter++}`,
      patientId: p.id,
      testCode: test.code,
      testName: test.name,
      ...labPricing(test, todayStr),
      orderedDate: todayStr,
      status: 'Pending',
      result: '',
      remarks: 'Sample collected, in testing'
    };
    labTests.push(order);
    patientCharges[p.id].labs.push(order);
  }

  while (labTests.length < 82) {
    const p = randChoice(patients);
    const test = randChoice(priceList);

    const pRegDate = parseLocal(p.registeredAt);
    const diffDays = Math.round((now - pRegDate) / (1000 * 60 * 60 * 24));
    const offsetFromReg = diffDays > 0 ? randInt(0, diffDays) : 0;
    const lDate = shiftDate(pRegDate, offsetFromReg);

    // Orders in recent days have higher probability of pending (~25% overall pending rate)
    const daysFromToday = Math.round((now - parseLocal(lDate)) / (1000 * 60 * 60 * 24));
    const isPending = daysFromToday <= 2
      ? rand() < 0.70
      : (daysFromToday <= 6 ? rand() < 0.35 : rand() < 0.10);

    let status = isPending ? 'Pending' : 'Completed';
    let result = '';
    let remarks = 'Sample drawn, awaiting laboratory report';

    if (status === 'Completed') {
      const match = labResultsMap[test.code] || {
        result: 'Report verified',
        remarks: 'Within normal limits'
      };
      result = match.result;
      remarks = match.remarks;
    }

    const order = {
      orderId: `SML-${labCounter++}`,
      patientId: p.id,
      testCode: test.code,
      testName: test.name,
      ...labPricing(test, lDate),
      orderedDate: lDate,
      status: status,
      result: result,
      remarks: remarks
    };
    // A finished report carries the date it was reported (same day as the order in the sample data)
    if (status === 'Completed') order.completedDate = lDate;

    labTests.push(order);
    patientCharges[p.id].labs.push(order);
  }

  // 4. Select Exactly 12 Debtors from Data in Patient ID Order
  // Prefer patients registered at least 3 days ago so today's patients stay fully paid
  const debtors = {};
  const pickedDebtors = new Set();

  function getDaysSinceReg(p) {
    return Math.round((now - parseLocal(p.registeredAt)) / (1000 * 60 * 60 * 24));
  }

  // Pick 4 "both" patients (have visit AND lab)
  let bothCount = 0;
  for (let i = 0; i < patients.length && bothCount < 4; i++) {
    const p = patients[i];
    const info = patientCharges[p.id];
    if (getDaysSinceReg(p) >= 3 && info.visits.length > 0 && info.labs.length > 0 && !pickedDebtors.has(p.id)) {
      const totV = info.visits.reduce((acc, v) => acc + v.visitFee, 0);
      const totL = info.labs.reduce((acc, l) => acc + l.price, 0);
      debtors[p.id] = {
        type: 'both',
        visitLeftover: Math.min(600, totV),
        labLeftover: Math.min(500, totL)
      };
      pickedDebtors.add(p.id);
      bothCount++;
    }
  }

  // Pick 4 "visit-only" patients (have visit)
  let visitOnlyCount = 0;
  for (let i = 0; i < patients.length && visitOnlyCount < 4; i++) {
    const p = patients[i];
    const info = patientCharges[p.id];
    if (getDaysSinceReg(p) >= 3 && info.visits.length > 0 && !pickedDebtors.has(p.id)) {
      const totV = info.visits.reduce((acc, v) => acc + v.visitFee, 0);
      debtors[p.id] = {
        type: 'visit-only',
        visitLeftover: Math.min(500, totV),
        labLeftover: 0
      };
      pickedDebtors.add(p.id);
      visitOnlyCount++;
    }
  }

  // Pick 4 "lab-only" patients (have lab)
  let labOnlyCount = 0;
  for (let i = 0; i < patients.length && labOnlyCount < 4; i++) {
    const p = patients[i];
    const info = patientCharges[p.id];
    if (getDaysSinceReg(p) >= 3 && info.labs.length > 0 && !pickedDebtors.has(p.id)) {
      const totL = info.labs.reduce((acc, l) => acc + l.price, 0);
      debtors[p.id] = {
        type: 'lab-only',
        visitLeftover: 0,
        labLeftover: Math.min(400, totL)
      };
      pickedDebtors.add(p.id);
      labOnlyCount++;
    }
  }

  // 5. Generate Payments Grouped by Date Across the Month
  const paymentMethods = ['Cash', 'bKash', 'Card'];
  const allPayments = [];

  patients.forEach(p => {
    const pInfo = patientCharges[p.id];
    const chargesByDate = {};

    pInfo.visits.forEach(v => {
      if (!chargesByDate[v.date]) chargesByDate[v.date] = { visitAmount: 0, labAmount: 0 };
      chargesByDate[v.date].visitAmount += v.visitFee;
    });

    pInfo.labs.forEach(l => {
      if (!chargesByDate[l.orderedDate]) chargesByDate[l.orderedDate] = { visitAmount: 0, labAmount: 0 };
      chargesByDate[l.orderedDate].labAmount += l.price;
    });

    const dates = Object.keys(chargesByDate).sort();
    if (dates.length === 0) return;

    const patientPayments = dates.map(d => {
      const method = randChoice(paymentMethods);
      const isCardOrBkash = method === 'Card' || method === 'bKash';
      const trxId = isCardOrBkash ? `TXN${randInt(100000, 999999)}B` : '';
      return {
        patientId: p.id,
        date: d,
        visitAmount: chargesByDate[d].visitAmount,
        labAmount: chargesByDate[d].labAmount,
        paymentMethod: method,
        trxId: trxId,
        notes: 'Payment received'
      };
    });

    // Subtract planned leftover due for debtors starting from the latest payment backwards
    const debtorInfo = debtors[p.id];
    if (debtorInfo) {
      let remVisitDue = debtorInfo.visitLeftover;
      let remLabDue = debtorInfo.labLeftover;

      for (let idx = patientPayments.length - 1; idx >= 0; idx--) {
        const pay = patientPayments[idx];
        let reduced = false;

        if (remVisitDue > 0 && pay.visitAmount > 0) {
          const sub = Math.min(pay.visitAmount, remVisitDue);
          pay.visitAmount -= sub;
          remVisitDue -= sub;
          reduced = true;
        }

        if (remLabDue > 0 && pay.labAmount > 0) {
          const sub = Math.min(pay.labAmount, remLabDue);
          pay.labAmount -= sub;
          remLabDue -= sub;
          reduced = true;
        }

        if (reduced) {
          pay.notes = 'Partial payment, balance due';
        }
      }
    }

    // Skip any payments that became 0 in both buckets
    patientPayments.forEach(pay => {
      const totalPaid = pay.visitAmount + pay.labAmount;
      if (totalPaid > 0) {
        pay.amountPaid = totalPaid;
        allPayments.push(pay);
      }
    });
  });

  // Sort payments chronologically, then by patientId
  allPayments.sort((a, b) => {
    if (a.date !== b.date) {
      return a.date.localeCompare(b.date);
    }
    return a.patientId.localeCompare(b.patientId);
  });

  // Assign sequential SMR receipt IDs in exact chronological order
  let receiptCounter = 9001;
  allPayments.forEach(pay => {
    pay.receiptId = `SMR-${receiptCounter++}`;
  });

  // 6. A few billing discounts so the discount reports have something to show.
  // Each is a partial waiver (about 30% of the amount still due) for a patient who
  // already owes money, so the number of patients who owe stays the same.
  const discountReasons = ['Poor / needy patient', 'Senior citizen', 'Hospital staff or family', 'Freedom fighter family', 'Regular patient'];
  const discountApprovers = ['Accounts Manager', 'Hospital Director'];
  const sampleDiscounts = [];

  Object.keys(debtors).forEach((pid, idx) => {
    if (idx % 2 !== 0 || sampleDiscounts.length >= 5) return;

    const info = patientCharges[pid];
    const paid = allPayments.filter(pay => pay.patientId === pid);
    const visitDue = info.visits.reduce((a, v) => a + v.visitFee, 0) - paid.reduce((a, pay) => a + pay.visitAmount, 0);
    const labDue = info.labs.reduce((a, l) => a + l.price, 0) - paid.reduce((a, pay) => a + pay.labAmount, 0);

    const visitDisc = visitDue >= 100 ? Math.floor(visitDue * 0.3 / 10) * 10 : 0;
    const labDisc = labDue >= 100 ? Math.floor(labDue * 0.3 / 10) * 10 : 0;
    if (visitDisc + labDisc <= 0) return;

    const dates = info.visits.map(v => v.date).concat(info.labs.map(l => l.orderedDate)).sort();
    const n = sampleDiscounts.length;
    sampleDiscounts.push({
      discountId: `SMD-${3001 + n}`,
      patientId: pid,
      date: dates[dates.length - 1] || todayStr,
      bucket: visitDisc > 0 && labDisc > 0 ? 'both' : (visitDisc > 0 ? 'visit' : 'lab'),
      mode: 'fixed',
      value: visitDisc + labDisc,
      visitAmount: visitDisc,
      labAmount: labDisc,
      amount: visitDisc + labDisc,
      reason: discountReasons[n % discountReasons.length],
      approvedBy: discountApprovers[n % discountApprovers.length],
      notes: '',
      voided: false
    });
  });

  // Save generated records into LocalStorage
  setStorage(STORAGE_KEYS.DISCOUNTS, sampleDiscounts);
  setStorage(STORAGE_KEYS.PATIENTS, patients);
  setStorage(STORAGE_KEYS.VISITS, visits);
  setStorage(STORAGE_KEYS.LAB_TESTS, labTests);
  setStorage(STORAGE_KEYS.PAYMENTS, allPayments);
}