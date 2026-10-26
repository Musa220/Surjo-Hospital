(function () {
  const chatMessages = document.getElementById('chatMessages');
  const chatInput = document.getElementById('chatInput');
  const sendBtn = document.getElementById('sendBtn');
  const emptyDataNotice = document.getElementById('emptyDataNotice');
  const promptChips = document.querySelectorAll('.prompt-chip');

  const chatHistory = [];
  const clearBtn = document.getElementById('clearChatBtn');
  const greetingHtml = chatMessages ? chatMessages.innerHTML : '';

  // How much of the earlier conversation is sent with a new question, so that a
  // follow-up such as "And yesterday?" is understood. Errors are never sent.
  const HISTORY_TURNS = 6;
  const HISTORY_CHARS = 1200;

  function historyForServer() {
    return chatHistory
      .filter(m => !m.error && typeof m.content === 'string' && m.content.trim())
      .slice(-HISTORY_TURNS)
      .map(m => ({ role: m.role, content: m.content.slice(0, HISTORY_CHARS) }));
  }

  function checkEmptyState() {
    const patients = getStorage(STORAGE_KEYS.PATIENTS);
    if (!patients || !Array.isArray(patients) || patients.length === 0) {
      if (emptyDataNotice) {
        emptyDataNotice.style.display = 'block';
      }
    } else if (emptyDataNotice) {
      emptyDataNotice.style.display = 'none';
    }
  }

  function formatLocalDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function buildReportData() {
    const todayStr = getToday();
    const parts = todayStr.split('-').map(Number);
    const year = parts[0];
    const month = parts[1] - 1;
    const day = parts[2];

    const todayDate = new Date(year, month, day);

    const yesterdayDate = new Date(year, month, day - 1);
    const yesterdayStr = formatLocalDate(yesterdayDate);

    const sevenDaysAgoDate = new Date(year, month, day - 6);
    const sevenDaysAgoStr = formatLocalDate(sevenDaysAgoDate);

    const monthStartDate = new Date(year, month, 1);
    const monthStartStr = formatLocalDate(monthStartDate);

    // Previous calendar month (new Date(y, m, 0) is the last day of the month before m)
    const lastMonthStartStr = formatLocalDate(new Date(year, month - 1, 1));
    const lastMonthEndStr = formatLocalDate(new Date(year, month, 0));

    const periods = {
      today: [todayStr, todayStr],
      yesterday: [yesterdayStr, yesterdayStr],
      last7Days: [sevenDaysAgoStr, todayStr],
      thisMonth: [monthStartStr, todayStr],
      lastMonth: [lastMonthStartStr, lastMonthEndStr]
    };

    const allPatients = getStorage(STORAGE_KEYS.PATIENTS) || [];
    const allVisits = getVisits(); // cancelled visits are not counted
    const allLabOrders = getLabOrders(); // cancelled orders are not counted (same as the reports)

    const patientMap = {};
    if (Array.isArray(allPatients)) {
      for (const p of allPatients) {
        if (p && p.id) {
          patientMap[p.id] = p.name || 'Unknown Patient';
        }
      }
    }

    const hospital = {
      name: 'Surjo Medical Hospital',
      totalPatientsEver: allPatients.length,
      totalVisitsEver: allVisits.length,
      totalLabOrdersEver: allLabOrders.length
    };

    function mapCollection(res) {
        return {
        totalCollected: res.totalCollected,
        totalRefunded: res.totalRefunded,
        totalVisitAmount: res.totalVisitAmount,
        totalLabAmount: res.totalLabAmount,
        byMethod: res.byMethod,
        paymentCount: res.count
      };
    }

    const collection = {
      today: mapCollection(dailyCollection(periods.today[0], periods.today[1], { skipDues: true })),
      yesterday: mapCollection(dailyCollection(periods.yesterday[0], periods.yesterday[1], { skipDues: true })),
      last7Days: mapCollection(dailyCollection(periods.last7Days[0], periods.last7Days[1], { skipDues: true })),
      thisMonth: mapCollection(dailyCollection(periods.thisMonth[0], periods.thisMonth[1], { skipDues: true })),
      lastMonth: mapCollection(dailyCollection(periods.lastMonth[0], periods.lastMonth[1], { skipDues: true }))
    };

    // One row per day for the last 62 days, so a question about a single date
    // ("on 15 October") can be answered. Every figure comes from the report functions.
    const collectionByDay = [];
    for (let i = 0; i < 62; i++) {
      const d = new Date(year, month, day - i);
      const dStr = formatLocalDate(d);
      const dayRes = dailyCollection(dStr, dStr, { skipDues: true });
      collectionByDay.push({
        date: dStr,
        totalCollected: dayRes.totalCollected,
        totalVisitAmount: dayRes.totalVisitAmount,
        totalLabAmount: dayRes.totalLabAmount,
        visits: allVisits.filter(v => v.date === dStr).length,
        newPatients: patientsRegistered(dStr, dStr).total,
        labOrdersPlaced: labTestReport(dStr, dStr).totalOrders
      });
    }

    const regToday = patientsRegistered(periods.today[0], periods.today[1]);
    const regYesterday = patientsRegistered(periods.yesterday[0], periods.yesterday[1]);
    const reg7Days = patientsRegistered(periods.last7Days[0], periods.last7Days[1]);
    const regMonth = patientsRegistered(periods.thisMonth[0], periods.thisMonth[1]);
    const regLastMonth = patientsRegistered(periods.lastMonth[0], periods.lastMonth[1]);

    function mapPatientSummary(pList) {
      if (!Array.isArray(pList)) return [];
      return pList.map(p => ({
        id: p.id,
        name: p.name,
        age: p.age,
        sex: p.sex,
        registeredAt: p.registeredAt
      }));
    }

    const newPatients = {
      today: {
        total: regToday.total,
        genderSplit: regToday.genderSplit,
        patients: mapPatientSummary(regToday.patients)
      },
      yesterday: {
        total: regYesterday.total,
        genderSplit: regYesterday.genderSplit,
        patients: mapPatientSummary(regYesterday.patients)
      },
      last7Days: {
        total: reg7Days.total,
        genderSplit: reg7Days.genderSplit,
        patients: mapPatientSummary(reg7Days.patients)
      },
      thisMonth: {
        total: regMonth.total,
        genderSplit: regMonth.genderSplit
      },
      lastMonth: {
        total: regLastMonth.total,
        genderSplit: regLastMonth.genderSplit
      }
    };

    const doctors = {
      today: doctorWise(periods.today[0], periods.today[1]),
      yesterday: doctorWise(periods.yesterday[0], periods.yesterday[1]),
      last7Days: doctorWise(periods.last7Days[0], periods.last7Days[1]),
      thisMonth: doctorWise(periods.thisMonth[0], periods.thisMonth[1]),
      lastMonth: doctorWise(periods.lastMonth[0], periods.lastMonth[1])
    };

    function mapLab(res) {
      return {
        totalOrders: res.totalOrders,
        pendingCount: res.pendingCount,
        completedCount: res.completedCount,
        cancelledCount: res.cancelledCount,
        totalValue: res.totalValue,
        breakdown: res.breakdown
      };
    }

    const labAllTime = labTestReport();
    const labToday = labTestReport(periods.today[0], periods.today[1]);
    const labYesterday = labTestReport(periods.yesterday[0], periods.yesterday[1]);
    const lab7Days = labTestReport(periods.last7Days[0], periods.last7Days[1]);
    const labMonth = labTestReport(periods.thisMonth[0], periods.thisMonth[1]);
    const labLastMonth = labTestReport(periods.lastMonth[0], periods.lastMonth[1]);

    const pendingOrders = [];
    if (Array.isArray(labAllTime.tests)) {
      for (const t of labAllTime.tests) {
        if (t.status === 'Pending') {
          const patId = t.patientId || '';
          const patName = t.patientName || patientMap[patId] || 'Unknown Patient';
          pendingOrders.push({
            orderId: t.id || t.orderId,
            patientId: patId,
            patientName: patName,
            testName: t.testName,
            orderedDate: t.orderedDate || t.date
          });
        }
      }
    }

    const labTests = {
      allTime: mapLab(labAllTime),
      today: mapLab(labToday),
      yesterday: mapLab(labYesterday),
      last7Days: mapLab(lab7Days),
      thisMonth: mapLab(labMonth),
      lastMonth: mapLab(labLastMonth),
      pendingOrders: pendingOrders
    };

    // Lab price list: what each test costs today (after any running test discount)
    const labCatalog = getTestCatalog().map(t => ({
      code: t.code,
      name: t.name,
      category: t.category,
      listPrice: t.price,
      priceToday: netTestPrice(t),
      discountPercentToday: activeTestDiscountPercent(t),
      available: t.active
    }));

    const dues = outstandingDues();

    // Money the hospital chose not to collect (never part of "collected")
    function mapDiscount(res) {
      return {
        billingDiscountTotal: res.billDiscountTotal,
        billingDiscountCount: res.billingDiscountCount,
        labTestDiscountTotal: res.labTestDiscountTotal,
        totalDiscount: res.totalDiscount
      };
    }

    const discounts = {
      today: mapDiscount(discountReport(periods.today[0], periods.today[1])),
      yesterday: mapDiscount(discountReport(periods.yesterday[0], periods.yesterday[1])),
      last7Days: mapDiscount(discountReport(periods.last7Days[0], periods.last7Days[1])),
      thisMonth: mapDiscount(discountReport(periods.thisMonth[0], periods.thisMonth[1])),
      lastMonth: mapDiscount(discountReport(periods.lastMonth[0], periods.lastMonth[1])),
      allTime: mapDiscount(discountReport()),
      // Billing discounts of the last 62 days with who approved them and why (voided ones left out)
      recent: getDiscounts()
        .filter(d => !d.voided && d.date >= collectionByDay[collectionByDay.length - 1].date)
        .sort((a, b) => String(b.date).localeCompare(String(a.date)))
        .slice(0, 60)
        .map(d => ({
          date: d.date,
          patientId: d.patientId,
          patientName: patientMap[d.patientId] || 'Unknown Patient',
          amount: d.amount,
          reason: d.reason || '',
          approvedBy: d.approvedBy || ''
        }))
    };

    // Doctor visits of the last 7 days with patient and doctor names
    const doctorNameById = {};
    getDoctors().forEach(d => { doctorNameById[d.id] = d.name; });
    const recentVisits = allVisits
      .filter(v => v.date >= periods.last7Days[0] && v.date <= periods.last7Days[1])
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.visitId).localeCompare(String(a.visitId)))
      .slice(0, 150)
      .map(v => ({
        date: v.date,
        visitId: v.visitId,
        patientId: v.patientId,
        patientName: patientMap[v.patientId] || 'Unknown Patient',
        doctorName: doctorNameById[v.doctorId] || 'Unknown Doctor',
        visitFee: Number(v.visitFee) || 0
      }));

    // One line per patient: what they were charged, discounted, paid (net of refunds) and still owe
    const visitCountByPatient = {};
    allVisits.forEach(v => { visitCountByPatient[v.patientId] = (visitCountByPatient[v.patientId] || 0) + 1; });
    const labCountByPatient = {};
    allLabOrders.forEach(o => { labCountByPatient[o.patientId] = (labCountByPatient[o.patientId] || 0) + 1; });
    const patientSummaries = allPatients.slice(0, 300).map(p => {
      const l = patientLedger(p.id);
      return {
        id: p.id,
        name: p.name,
        visits: visitCountByPatient[p.id] || 0,
        labOrders: labCountByPatient[p.id] || 0,
        charges: l.totalVisitCharges + l.totalLabCharges,
        discount: l.totalDiscount,
        paid: l.paidVisitAmount + l.paidLabAmount,
        due: l.totalDue,
        credit: l.totalCredit
      };
    });

    // Who works here now (status: Active, On Leave or Left)
    const doctorRoster = getDoctors().map(d => ({
      name: d.name,
      specialty: d.specialty,
      status: d.status
    }));

    return {
      today: todayStr,
      periods: periods,
      hospital: hospital,
      collection: collection,
      collectionByDay: collectionByDay,
      newPatients: newPatients,
      doctors: doctors,
      labTests: labTests,
      labCatalog: labCatalog,
      dues: dues,
      discounts: discounts,
      recentVisits: recentVisits,
      patientSummaries: patientSummaries,
      doctorRoster: doctorRoster
    };
  }

  function escapeHTML(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function renderFormattedAnswer(rawText) {
    const escaped = escapeHTML(rawText);
    const withBold = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    const lines = withBold.split('\n');

    let html = '';
    let inList = false;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        if (!inList) {
          html += '<ul>';
          inList = true;
        }
        const itemContent = trimmed.slice(2).trim();
        html += '<li>' + itemContent + '</li>';
      } else {
        if (inList) {
          html += '</ul>';
          inList = false;
        }
        if (trimmed === '') {
          html += '<br>';
        } else {
          html += (i > 0 && !html.endsWith('<br>') && !html.endsWith('</ul>') ? '<br>' : '') + line;
        }
      }
    }

    if (inList) {
      html += '</ul>';
    }

    return html;
  }

  function appendMessageBubble(sender, content, isError = false) {
    const bubble = document.createElement('div');
    bubble.className = 'chat-bubble ' + sender + (isError ? ' error-bubble' : '');

    if (sender === 'user') {
      bubble.textContent = content;
    } else if (isError) {
      bubble.textContent = content;
    } else {
      bubble.innerHTML = renderFormattedAnswer(content);
    }

    chatMessages.appendChild(bubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return bubble;
  }

  let thinkingBubble = null;

  function showThinking() {
    thinkingBubble = document.createElement('div');
    thinkingBubble.className = 'chat-bubble thinking';
    thinkingBubble.textContent = 'Thinking...';
    chatMessages.appendChild(thinkingBubble);
    chatMessages.scrollTop = chatMessages.scrollHeight;

    chatInput.disabled = true;
    sendBtn.disabled = true;
    if (clearBtn) clearBtn.disabled = true;
    promptChips.forEach(chip => (chip.disabled = true));
  }

  function hideThinking() {
    if (thinkingBubble && thinkingBubble.parentNode) {
      thinkingBubble.parentNode.removeChild(thinkingBubble);
    }
    thinkingBubble = null;

    chatInput.disabled = false;
    sendBtn.disabled = false;
    if (clearBtn) clearBtn.disabled = false;
    promptChips.forEach(chip => (chip.disabled = false));
    chatInput.focus();
  }

  async function handleSend(customText) {
    const text = typeof customText === 'string' ? customText : chatInput.value;
    const trimmed = text.trim();
    if (!trimmed) return;

    // Earlier turns go along with the new question (taken BEFORE this question is added)
    const earlierTurns = historyForServer();

    chatInput.value = '';
    appendMessageBubble('user', trimmed);
    chatHistory.push({ role: 'user', content: trimmed });

    showThinking();

    const dataPayload = buildReportData();

    try {
      const response = await fetch('/ask', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          question: trimmed,
          data: dataPayload,
          history: earlierTurns
        })
      });

      const json = await response.json().catch(() => ({ error: 'Unable to parse server response.' }));

      hideThinking();

      if (!response.ok || json.error) {
        const errorMsg = json.error || 'Server error occurred.';
        appendMessageBubble('assistant', errorMsg, true);
        chatHistory.push({ role: 'assistant', error: true, content: errorMsg });
      } else {
        const answer = json.answer || 'No answer returned.';
        appendMessageBubble('assistant', answer, false);
        chatHistory.push({ role: 'assistant', content: answer });
      }
    } catch {
      hideThinking();
      const failMsg = 'Network failure. Please check server connection.';
      appendMessageBubble('assistant', failMsg, true);
      chatHistory.push({ role: 'assistant', error: true, content: failMsg });
    }
  }

  sendBtn.addEventListener('click', () => handleSend());

  // Clear chat: forget the conversation and show the greeting again
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (thinkingBubble) return;
      chatHistory.length = 0;
      chatMessages.innerHTML = greetingHtml;
      chatInput.value = '';
      chatInput.focus();
    });
  }

  chatInput.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  });

  promptChips.forEach(chip => {
    chip.addEventListener('click', () => {
      const q = chip.getAttribute('data-question');
      if (q) {
        handleSend(q);
      }
    });
  });

  checkEmptyState();
})();