/**
 * Printable slips: prescription (from a doctor visit), laboratory report (from a
 * completed lab order) and the money receipt / refund voucher (Billing page).
 * Used by the Doctor Visits, Lab Orders, Billing and Patient profile pages.
 *
 * The layouts follow what real hospitals and diagnostic labs print:
 *  - a letterhead (logo, name, address) with a title bar under it
 *  - a two-column patient / document details block
 *  - a barcode of the document number
 *  - lab results as a table: Test name | Result | Flag | Units | Reference interval
 *    (abnormal values in bold with H / L), radiology as Findings + Impression
 *  - "End of report", signature lines and the usual "important instructions"
 *
 * Needs storage.js (getStorage, getDoctors, getTestCatalog) and admin-common.js
 * (SMH.esc, SMH.printSheet, SMH.openModal). It only reads records; it never changes them.
 */
(function () {
  'use strict';

  var SMH = window.SMH = window.SMH || {};
  var esc = SMH.esc;

  var HOSPITAL_NAME = 'Surjo Medical Hospital';
  var HOSPITAL_ADDRESS = 'Mirpur, Dhaka, Bangladesh';
  var HOSPITAL_PHONE = 'Hotline: +880 9610-000000';

  /* ---------- small helpers ---------- */

  function findPatient(id) {
    return getStorage(STORAGE_KEYS.PATIENTS, []).find(function (p) { return p.id === id; }) || {};
  }

  function findDoctor(id) {
    return getDoctors().find(function (d) { return d.id === id; }) || null;
  }

  function findTest(code) {
    var list = typeof getTestCatalog === 'function' ? getTestCatalog() : [];
    return list.find(function (t) { return t.code === code; }) || null;
  }

  function blank(v) {
    return v === '' || v === undefined || v === null;
  }

  function ageSex(p) {
    if (p.age === undefined || p.age === null || p.age === '') return '';
    return p.age + ' Years' + (p.sex ? ' / ' + p.sex : '');
  }

  /** "2026-10-09" -> "09 Oct 2026" (falls back to the raw text if it is not a date). */
  function niceDate(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(s || ''));
    if (!m) return String(s || '');
    var mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][Number(m[2]) - 1];
    return m[3] + ' ' + mon + ' ' + m[1];
  }

  function money(n) {
    return Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  /** One "Label : value" line of the details block. */
  function field(label, value, strong) {
    var v = blank(value) ? '&mdash;' : esc(value);
    return '<div class="slip-f"><span class="slip-k">' + esc(label) + '</span>' +
      '<span class="slip-c">:</span><span class="slip-v' + (strong ? ' slip-strong' : '') + '">' + v + '</span></div>';
  }

  /* ---------- logo ---------- */

  var LOGO_SVG =
    '<svg class="slip-logo" viewBox="0 0 48 48" aria-hidden="true">' +
      '<circle cx="24" cy="24" r="10" fill="#0b6b69"/>' +
      '<g stroke="#0b6b69" stroke-width="3" stroke-linecap="round">' +
        '<line x1="24" y1="10" x2="24" y2="4"/><line x1="33.9" y1="14.1" x2="38.1" y2="9.9"/>' +
        '<line x1="38" y1="24" x2="44" y2="24"/><line x1="33.9" y1="33.9" x2="38.1" y2="38.1"/>' +
        '<line x1="24" y1="38" x2="24" y2="44"/><line x1="14.1" y1="33.9" x2="9.9" y2="38.1"/>' +
        '<line x1="10" y1="24" x2="4" y2="24"/><line x1="14.1" y1="14.1" x2="9.9" y2="9.9"/>' +
      '</g>' +
      '<path d="M24 19v10M19 24h10" stroke="#fff" stroke-width="2.6" stroke-linecap="round"/>' +
    '</svg>';

  /**
   * Letterhead + title bar used by every slip.
   * @param {string} title   e.g. "LABORATORY REPORT"
   * @param {string} [dept]  optional line under the title, e.g. "Department of Biochemistry"
   */
  SMH.letterhead = function (title, dept) {
    return '<div class="slip-lh">' +
        '<div class="slip-brand">' + LOGO_SVG +
          '<div class="slip-name">' + esc(HOSPITAL_NAME) + '</div>' +
        '</div>' +
        '<div class="slip-contact">' + esc(HOSPITAL_ADDRESS) + '<br>' + esc(HOSPITAL_PHONE) + '</div>' +
      '</div>' +
      '<div class="slip-title">' + esc(title) + '</div>' +
      (dept ? '<div class="slip-dept">' + esc(dept) + '</div>' : '');
  };

  /* ---------- Code 128 barcode (subset B), drawn as inline SVG ---------- */

  var C128 = [
    '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
    '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
    '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
    '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
    '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
    '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
    '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
    '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
    '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
    '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
    '114131', '311141', '411131', '211412', '211214', '211232', '2331112'
  ];

  /** Barcode of a document number (letters, digits and punctuation only). */
  SMH.barcodeSvg = function (text) {
    var s = String(text || '').replace(/[^\x20-\x7e]/g, '');
    if (!s) return '';
    var codes = [104]; // start code B
    var sum = 104;
    for (var i = 0; i < s.length; i++) {
      var v = s.charCodeAt(i) - 32;
      codes.push(v);
      sum += v * (i + 1);
    }
    codes.push(sum % 103);
    codes.push(106); // stop

    var x = 10; // quiet zone, in modules
    var bars = '';
    codes.forEach(function (c) {
      var w = C128[c];
      for (var j = 0; j < w.length; j++) {
        var n = Number(w.charAt(j));
        if (j % 2 === 0) bars += '<rect x="' + x + '" y="0" width="' + n + '" height="40"/>';
        x += n;
      }
    });
    var width = x + 10;
    return '<div class="slip-barcode">' +
      '<svg viewBox="0 0 ' + width + ' 40" preserveAspectRatio="none" shape-rendering="crispEdges" ' +
        'role="img" aria-label="Barcode ' + esc(s) + '"><g fill="#000">' + bars + '</g></svg>' +
      '<div class="slip-barcode-text">' + esc(s) + '</div>' +
    '</div>';
  };

  /* ---------- amount in words (Bangladeshi lakh / crore system) ---------- */

  var ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten', 'Eleven',
    'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  var TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function below100(n) {
    return n < 20 ? ONES[n] : TENS[Math.floor(n / 10)] + (n % 10 ? '-' + ONES[n % 10] : '');
  }

  function below1000(n) {
    var h = Math.floor(n / 100);
    var r = n % 100;
    return (h ? ONES[h] + ' Hundred' + (r ? ' ' : '') : '') + (r ? below100(r) : '');
  }

  /** 125000 -> "Taka One Lakh Twenty-Five Thousand Only" */
  SMH.amountInWords = function (amount) {
    var n = Math.round(Math.abs(Number(amount) || 0));
    if (n === 0) return 'Taka Zero Only';
    var parts = [];
    var crore = Math.floor(n / 10000000); n %= 10000000;
    var lakh = Math.floor(n / 100000); n %= 100000;
    var thousand = Math.floor(n / 1000); n %= 1000;
    if (crore) parts.push(below100(crore) + ' Crore');
    if (lakh) parts.push(below100(lakh) + ' Lakh');
    if (thousand) parts.push(below100(thousand) + ' Thousand');
    if (n) parts.push(below1000(n));
    return 'Taka ' + parts.join(' ') + ' Only';
  };

  /* ---------- lab: reference intervals and result parsing ----------
     Typical adult intervals, matched by analyte name. A lab should replace these with
     the intervals validated for its own analysers. Analytes not listed here are printed
     without an interval and without a flag. */

  function sexIs(p, letter) {
    return String(p.sex || '').charAt(0).toUpperCase() === letter;
  }

  var REF = [
    { re: /^(hb|haemoglobin|hemoglobin)$/i, name: 'Haemoglobin (Hb)', unit: 'g/dL', dp: 1,
      range: function (p) { return sexIs(p, 'F') ? { lo: 12.0, hi: 15.0 } : sexIs(p, 'M') ? { lo: 13.0, hi: 17.0 } : { lo: 12.0, hi: 17.0 }; } },
    { re: /^(wbc|tlc|total wbc( count)?)$/i, name: 'Total WBC count', unit: '/cu mm',
      range: function () { return { lo: 4000, hi: 11000 }; } },
    { re: /^(platelets?|platelet count)$/i, name: 'Platelet count', unit: '/cu mm',
      range: function () { return { lo: 150000, hi: 450000 }; } },
    { re: /^(rbs|random blood sugar|random blood glucose)$/i, name: 'Random blood sugar (RBS)', unit: 'mmol/L',
      range: function () { return { hi: 7.8 }; } },
    { re: /^total cholesterol$/i, name: 'Total cholesterol', unit: 'mg/dL',
      range: function () { return { hi: 200 }; } },
    { re: /^(triglycerides?)$/i, name: 'Triglycerides', unit: 'mg/dL',
      range: function () { return { hi: 150 }; } },
    { re: /^(serum )?(alt|sgpt)( \(sgpt\))?$/i, name: 'Serum ALT (SGPT)', unit: 'U/L',
      range: function () { return { hi: 50 }; } },
    { re: /^(serum )?creatinine$/i, name: 'Serum creatinine', unit: 'mg/dL', dp: 1,
      range: function (p) { return sexIs(p, 'F') ? { lo: 0.6, hi: 1.1 } : sexIs(p, 'M') ? { lo: 0.7, hi: 1.3 } : { lo: 0.6, hi: 1.3 }; } },
    { re: /^pus cells?$/i, name: 'Pus cells', unit: '/HPF',
      range: function () { return { lo: 0, hi: 5 }; } },
    { re: /^epithelial( cells?)?$/i, name: 'Epithelial cells', unit: '/HPF',
      range: function () { return { lo: 0, hi: 5 }; } }
  ];

  var SPECIMEN = {
    CBC: 'EDTA whole blood',
    RBS: 'Fluoride plasma',
    URINE: 'Urine (random)',
    LIPID: 'Serum',
    SGPT: 'Serum',
    CREAT: 'Serum'
  };

  function refText(r, dp) {
    if (!r) return '';
    var f = function (n) {
      return Number(n).toLocaleString('en-US', {
        minimumFractionDigits: dp || 0,
        maximumFractionDigits: dp !== undefined ? dp : 3
      });
    };
    if (r.lo !== undefined && r.hi !== undefined) return f(r.lo) + ' - ' + f(r.hi);
    if (r.hi !== undefined) return '< ' + f(r.hi);
    if (r.lo !== undefined) return '> ' + f(r.lo);
    return '';
  }

  function toNum(s) {
    var n = parseFloat(String(s).replace(/,/g, ''));
    return isNaN(n) ? null : n;
  }

  /** Returns 'H', 'L' or '' for a value (a number or a "8-10" style range) against an interval. */
  function flagFor(valueText, r) {
    if (!r) return '';
    var m = /^([<>]?)\s*([\d.,]+)(?:\s*-\s*([\d.,]+))?$/.exec(String(valueText).trim());
    if (!m) return '';
    var low = toNum(m[2]);
    var high = m[3] !== undefined ? toNum(m[3]) : low;
    if (low === null || high === null) return '';
    if (r.hi !== undefined && high > r.hi) return 'H';
    if (r.lo !== undefined && low < r.lo) return 'L';
    return '';
  }

  /**
   * Turn the stored result text ("Hb: 14.1 g/dL, WBC: 7,800 /cu mm" or "Pus cells 8-10 /HPF")
   * into table rows. Returns null when the text is not made of "name value unit" parts, so the
   * caller can print it as plain findings instead.
   */
  function parseResult(text, patient) {
    var parts = String(text || '').split(/,\s*(?=[A-Za-z])/);
    var rows = [];
    for (var i = 0; i < parts.length; i++) {
      var seg = parts[i].trim();
      if (!seg) continue;
      var name, value, unit;
      var m = /^([^:]+):\s*([<>]?\s*[\d.,]+(?:\s*-\s*[\d.,]+)?)\s*(.*)$/.exec(seg);
      if (!m) m = /^(.*?[A-Za-z])\s+([<>]?\s*[\d.,]+(?:\s*-\s*[\d.,]+)?)\s*(\S.*)?$/.exec(seg);
      if (!m) return null;
      name = m[1].trim();
      value = m[2].replace(/\s+/g, '');
      unit = (m[3] || '').trim();

      var known = null;
      for (var k = 0; k < REF.length; k++) {
        if (REF[k].re.test(name)) { known = REF[k]; break; }
      }
      var range = known ? known.range(patient) : null;
      rows.push({
        name: known ? known.name : name,
        value: value,
        unit: unit || (known ? known.unit : ''),
        ref: refText(range, known && known.dp),
        flag: flagFor(value, range)
      });
    }
    return rows.length ? rows : null;
  }

  function departmentOf(category) {
    var map = {
      Hematology: 'Department of Haematology',
      Biochemistry: 'Department of Biochemistry',
      Pathology: 'Department of Pathology',
      Radiology: 'Department of Radiology & Imaging',
      Ultrasound: 'Department of Radiology & Imaging',
      Microbiology: 'Department of Microbiology',
      Immunology: 'Department of Immunology',
      Hormones: 'Department of Biochemistry'
    };
    return map[category] || 'Department of Laboratory Medicine';
  }

  function paragraph(text) {
    return esc(text).replace(/\n/g, '<br>');
  }

  /* ---------- prescription ---------- */

  /** HTML of the prescription slip for one saved visit. */
  SMH.prescriptionHtml = function (visit) {
    var p = findPatient(visit.patientId);
    var d = findDoctor(visit.doctorId);
    var meds = Array.isArray(visit.medicines) ? visit.medicines : [];

    var medsHtml;
    if (meds.length === 0) {
      medsHtml = '<p class="slip-none">No medicines were prescribed on this visit.</p>';
    } else {
      medsHtml = '<table class="slip-table"><thead><tr><th class="c-n">#</th><th>Medicine</th><th>Dosage</th><th>Duration</th></tr></thead><tbody>' +
        meds.map(function (m, i) {
          return '<tr><td class="c-n">' + (i + 1) + '</td><td>' + esc(m.name) + '</td><td>' + esc(m.dosage || '—') + '</td><td>' + esc(m.duration || '—') + '</td></tr>';
        }).join('') + '</tbody></table>';
    }

    return '<div class="print-sheet slip">' +
      SMH.letterhead('PRESCRIPTION') +
      '<div class="slip-meta">' +
        '<div>' +
          field('Patient', p.name || 'Unknown', true) +
          field('Patient ID', visit.patientId) +
          field('Age / Sex', ageSex(p)) +
          field('Phone', p.phone) +
          field('Blood group', p.bloodGroup) +
        '</div>' +
        '<div>' +
          field('Visit ID', visit.visitId, true) +
          field('Date', niceDate(visit.date)) +
          field('Doctor', d ? d.name : 'Unknown doctor') +
          field('Specialty', d ? d.specialty : '') +
          field('Room', d ? d.room : '') +
        '</div>' +
      '</div>' +
      '<div class="slip-sec"><div class="slip-sec-h">Chief complaints</div><div>' + (visit.complaint ? paragraph(visit.complaint) : '&mdash;') + '</div></div>' +
      '<div class="slip-sec"><div class="slip-sec-h">Clinical diagnosis</div><div>' + (visit.diagnosis ? paragraph(visit.diagnosis) : '&mdash;') + '</div></div>' +
      '<div class="slip-sec"><div class="slip-sec-h">Rx &mdash; Prescribed medicines</div>' + medsHtml + '</div>' +
      '<div class="slip-sign-row">' +
        '<div class="slip-note-line">Consultation fee billed: <b>Tk ' + money(visit.visitFee) + '</b></div>' +
        '<div class="slip-sign"><span>Doctor&rsquo;s signature</span></div>' +
      '</div>' +
    '</div>';
  };

  /* ---------- laboratory report ---------- */

  /** HTML of the laboratory report for one lab order. */
  SMH.labReportHtml = function (order) {
    var p = findPatient(order.patientId);
    var test = findTest(order.testCode);
    var category = test ? test.category : '';
    var isImaging = category === 'Radiology' || category === 'Ultrasound';

    var reported = order.completedDate || order.editedDate || order.orderedDate;
    var status = order.editedDate ? 'Final (corrected ' + niceDate(order.editedDate) + ')' : 'Final';
    var specimen = SPECIMEN[order.testCode] || '';

    var details =
      '<div class="slip-meta">' +
        '<div>' +
          field('Name', p.name || 'Unknown', true) +
          field('Age / Sex', ageSex(p)) +
          field('Patient ID', order.patientId) +
          field('Phone', p.phone) +
          field('Ref. by', 'Self') +
        '</div>' +
        '<div>' +
          field('Lab No.', order.orderId, true) +
          field('Registered', niceDate(order.orderedDate)) +
          field('Reported', niceDate(reported)) +
          field('Specimen', specimen) +
          field('Report status', status) +
        '</div>' +
      '</div>';

    var body;
    var rows = isImaging ? null : parseResult(order.result, p);
    if (rows) {
      var anyFlag = false;
      var trs = rows.map(function (r) {
        if (r.flag) anyFlag = true;
        return '<tr' + (r.flag ? ' class="abn"' : '') + '>' +
          '<td>' + esc(r.name) + '</td>' +
          '<td class="c-r">' + esc(r.value) + '</td>' +
          '<td class="c-f">' + esc(r.flag) + '</td>' +
          '<td>' + esc(r.unit) + '</td>' +
          '<td>' + (r.ref ? esc(r.ref) : '&mdash;') + '</td>' +
        '</tr>';
      }).join('');
      body =
        '<table class="slip-table lab">' +
          '<thead><tr><th>Test name</th><th class="c-r">Result</th><th class="c-f">Flag</th><th>Units</th><th>Reference interval</th></tr></thead>' +
          '<tbody><tr class="panel"><td colspan="5">' + esc(String(order.testName).toUpperCase()) + '</td></tr>' + trs + '</tbody>' +
        '</table>' +
        (anyFlag ? '<div class="slip-legend">H = above reference interval &nbsp;&middot;&nbsp; L = below reference interval</div>' : '');
    } else {
      body =
        '<div class="slip-sec"><div class="slip-sec-h">' + esc(String(order.testName).toUpperCase()) + '</div>' +
        '<div class="slip-sec-h2">' + (isImaging ? 'Findings' : 'Result') + '</div>' +
        '<div>' + (order.result ? paragraph(order.result) : '&mdash;') + '</div></div>';
    }

    var comment = order.remarks
      ? '<div class="slip-sec"><div class="slip-sec-h">' + (isImaging ? 'Impression' : 'Comments') + '</div><div>' + paragraph(order.remarks) + '</div></div>'
      : '';

    return '<div class="print-sheet slip">' +
      SMH.letterhead('LABORATORY REPORT', departmentOf(category)) +
      '<div class="slip-top">' + details + SMH.barcodeSvg(order.orderId) + '</div>' +
      body +
      comment +
      '<div class="slip-end">End of report</div>' +
      '<div class="slip-sign-row two">' +
        '<div class="slip-sign"><span>Medical technologist<br><small>Name &amp; signature</small></span></div>' +
        '<div class="slip-sign"><span>Consultant pathologist<br><small>Name, BMDC reg. no. &amp; signature</small></span></div>' +
      '</div>' +
      '<div class="slip-instr"><b>Important instructions</b>' +
        '<ol>' +
          '<li>Results relate only to the specimen received. Please correlate clinically.</li>' +
          '<li>Reference intervals are for adults; they may differ with age, sex and method.</li>' +
          '<li>This report is not valid for medico-legal purposes and is valid only with the hospital seal.</li>' +
        '</ol>' +
      '</div>' +
      '<div class="slip-pagefoot"><span>Lab No. ' + esc(order.orderId) + '</span><span>Page 1 of 1</span></div>' +
    '</div>';
  };

  /* ---------- money receipt / refund voucher ---------- */

  /**
   * HTML of a payment receipt or refund voucher.
   * @param {Object} receipt  a record from the payments list
   * @param {Object} [ctx]    { ledger: patientLedger(...), voidBanner: '<div>..</div>' }
   */
  SMH.receiptHtml = function (receipt, ctx) {
    ctx = ctx || {};
    var p = findPatient(receipt.patientId);
    var isRefund = !!receipt.isRefund;
    var visitAmt = Math.abs(Number(receipt.visitAmount || 0));
    var labAmt = Math.abs(Number(receipt.labAmount || 0));
    var total = visitAmt + labAmt;

    var items = [];
    if (visitAmt > 0) items.push(['Doctor consultation (OPD visit charges)', visitAmt]);
    if (labAmt > 0) items.push(['Diagnostic laboratory services', labAmt]);
    var itemRows = items.map(function (it, i) {
      return '<tr><td class="c-n">' + (i + 1) + '</td><td>' + esc(it[0]) + '</td><td class="c-amt">' + money(it[1]) + '</td></tr>';
    }).join('');

    var method = receipt.paymentMethod || '';

    var l = ctx.ledger;
    var summary = '';
    if (!isRefund && l) {
      var billed = (l.totalVisitCharges || 0) + (l.totalLabCharges || 0);
      var received = (l.paidVisitAmount || 0) + (l.paidLabAmount || 0);
      var credit = (l.visitCredit || 0) + (l.labCredit || 0);
      summary =
        '<table class="slip-sum">' +
          '<caption>Account summary (as of today)</caption>' +
          '<tr><td>Total billed</td><td class="c-amt">' + money(billed) + '</td></tr>' +
          (l.totalDiscount > 0 ? '<tr><td>Less: discount allowed</td><td class="c-amt">' + money(l.totalDiscount) + '</td></tr>' : '') +
          '<tr><td>Total received to date</td><td class="c-amt">' + money(received) + '</td></tr>' +
          (credit > 0
            ? '<tr class="strong"><td>Credit on account</td><td class="c-amt">' + money(credit) + '</td></tr>'
            : '<tr class="strong"><td>Balance due</td><td class="c-amt">' + money(l.totalDue) + '</td></tr>') +
        '</table>';
    }

    var approved = isRefund && receipt.approvedBy ? field('Approved by', receipt.approvedBy) : '';
    var remark = receipt.notes || (isRefund ? 'Refund' : '');

    return '<div class="slip">' +
      SMH.letterhead(isRefund ? 'REFUND VOUCHER' : 'MONEY RECEIPT') +
      (ctx.voidBanner || '') +
      '<div class="slip-top">' +
        '<div class="slip-meta">' +
          '<div>' +
            field('Patient', p.name || 'N/A', true) +
            field('Patient ID', receipt.patientId) +
            field('Age / Sex', ageSex(p)) +
            field('Phone', p.phone) +
          '</div>' +
          '<div>' +
            field(isRefund ? 'Voucher No.' : 'Receipt No.', receipt.receiptId, true) +
            field('Date', niceDate(receipt.date)) +
            field(isRefund ? 'Paid back by' : 'Payment mode', method) +
            (receipt.trxId ? field('Trx ID', receipt.trxId) : '') +
            approved +
          '</div>' +
        '</div>' +
        SMH.barcodeSvg(receipt.receiptId) +
      '</div>' +
      '<table class="slip-table">' +
        '<thead><tr><th class="c-n">SL</th><th>Particulars</th><th class="c-amt">Amount (Tk)</th></tr></thead>' +
        '<tbody>' + itemRows + '</tbody>' +
        '<tfoot><tr><td colspan="2" class="c-tot">' + (isRefund ? 'Total refunded' : 'Total received') + '</td><td class="c-amt c-tot">' + money(total) + '</td></tr></tfoot>' +
      '</table>' +
      '<div class="slip-words"><span>In words:</span> ' + esc(SMH.amountInWords(total)) + '</div>' +
      (remark ? '<div class="slip-remark"><span>' + (isRefund ? 'Reason' : 'Remarks') + ':</span> ' + esc(remark) + '</div>' : '') +
      summary +
      '<div class="slip-sign-row two">' +
        '<div class="slip-sign"><span>' + (isRefund ? 'Received by (patient)' : 'Received by (collector)') + '</span></div>' +
        '<div class="slip-sign"><span>Authorised signatory &amp; seal</span></div>' +
      '</div>' +
      '<div class="slip-instr slim">' + (isRefund
        ? 'Computer-generated voucher. Valid only with signature and seal.'
        : 'Computer-generated receipt. Please keep it for report collection and any future query. Valid only with signature and seal.') +
      '</div>' +
    '</div>';
  };

  /* ---------- preview dialog ---------- */

  /** Show a slip in a preview dialog with a Print button. */
  SMH.openSlip = function (title, html) {
    var modal = document.getElementById('slip-modal');
    if (!modal) {
      modal = document.createElement('div');
      modal.className = 'modal-backdrop';
      modal.id = 'slip-modal';
      modal.innerHTML =
        '<div class="modal-card slip-card" role="dialog" aria-modal="true" aria-labelledby="slip-modal-title">' +
          '<h2 id="slip-modal-title"></h2>' +
          '<div id="slip-content"></div>' +
          '<div class="form-actions">' +
            '<button type="button" class="btn btn-secondary" id="btn-slip-close">Close</button>' +
            '<button type="button" class="btn btn-primary" id="btn-slip-print">Print</button>' +
          '</div>' +
        '</div>';
      document.body.appendChild(modal);
      document.getElementById('btn-slip-close').addEventListener('click', function () { SMH.closeModal('slip-modal'); });
      document.getElementById('btn-slip-print').addEventListener('click', function () {
        SMH.printSheet(document.getElementById('slip-content').innerHTML);
      });
    }
    document.getElementById('slip-modal-title').textContent = title;
    document.getElementById('slip-content').innerHTML = html;
    SMH.openModal('slip-modal');
    document.getElementById('btn-slip-print').focus();
  };

  SMH.showPrescription = function (visitId) {
    var visit = getStorage(STORAGE_KEYS.VISITS, []).find(function (v) { return v.visitId === visitId; });
    // A cancelled visit was entered by mistake: it has no valid prescription to print
    if (visit && visit.status !== 'Cancelled') SMH.openSlip('Prescription ' + visit.visitId, SMH.prescriptionHtml(visit));
  };

  SMH.showLabReport = function (orderId) {
    var order = getStorage(STORAGE_KEYS.LAB_TESTS, []).find(function (o) { return o.orderId === orderId; });
    if (order && order.status === 'Completed') SMH.openSlip('Lab report ' + order.orderId, SMH.labReportHtml(order));
  };
})();
