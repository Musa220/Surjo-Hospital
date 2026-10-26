SURJO MEDICAL HOSPITAL - Hospital Website with AI Report Chat
ChatterMate Campus Ambassador Task

Name  : S M Musa Taluckdar
Email : smmusa220@gmail.com


1. WHAT THIS IS
---------------
A simple hospital website made with plain HTML, CSS and JavaScript (no
frameworks). All data is saved in the browser (localStorage). All names, phone
numbers and the hospital name are made up ("Surjo Medical Hospital").

Pages
  - Dashboard        : today's patients, money collected and pending lab tests,
                       plus the "Load sample data" and "Clear all data" buttons
  - Patients         : register a patient (auto ID SMH-1001...), searchable list,
                       Edit, Delete (only when the patient has no records yet).
                       Phone must be a Bangladeshi mobile number (01XXXXXXXXX or
                       +880...); the same name + phone cannot be registered twice.
  - Patient profile  : click a patient's name/ID. One page with the details, the
                       money summary (charges, discount, paid, due, credit), all
                       visits (with prescription), lab orders (with lab report),
                       payments, refunds and discounts, and quick links to add a
                       visit, a lab order or a payment for that patient.
  - Doctor Visits    : pick patient + doctor, problem, medicines, visit fee.
                       Every visit has a "View / print" button = printable
                       prescription (complaint, diagnosis, medicines, doctor).
                       A visit entered by mistake can be cancelled with a reason:
                       it is not billed and not counted in reports, but it stays
                       in the list (struck through) and in the patient's profile.
                       The history list has a search box (patient, visit ID, doctor,
                       diagnosis) and a from/to date filter.
                       Tab "Manage doctors": add a new doctor, edit fee/room,
                       mark a doctor On leave or Left, delete (only if no visits)
  - Lab Orders       : order tests from the price list, Pending/Completed/Cancelled,
                       a search box for the orders list (patient, order ID, test), results. A completed result can be corrected (Edit result)
                       and printed (Print report). A pending order can be cancelled
                       with a reason: it is not billed and not counted in reports.
                       Tab "Test catalog & pricing": add new tests, edit prices,
                       give a test (or a whole category) a discount, disable tests
  - Billing & Ledger : charges, discount, paid and due per patient; give a
                       discount (percent or fixed, with reason and approver);
                       take Cash / Card / bKash. A payment entered by mistake can
                       be voided (reason saved). If a patient has paid more than
                       is owed (for example a paid lab order was cancelled) a
                       "Refund" form appears: amount, method, approver, reason;
                       it prints a refund voucher.
  - Reports          : Daily Collection, Patient List, Doctor-wise, Lab Tests,
                       Discounts, Outstanding Dues. Each has a from/to date filter
                       (Outstanding Dues is always "as of today"), a total row, an
                       Export CSV button (opens in Excel) and a Print button.
  - AI Assistant     : ask questions about the reports in plain words; answers
                       come from the ChatterMate API. It remembers the last few
                       messages, so follow-ups like "and yesterday?" work. The
                       "Clear chat" button starts a new conversation. It can answer
                       about today, yesterday, the last 7 days, this month, last month
                       and any single date of the last 62 days, plus lab test prices,
                       the visits of the last 7 days, each patient's balance and the
                       recent discounts (with reason and approver).

Rules the program enforces
  - A report date range must not run backwards: if "From" is after "To" the report
    keeps its old figures and shows a message instead.
  - Visit, lab-order, payment, refund and discount dates cannot be in the future,
    and cannot be earlier than the day the patient was registered.
  - Dashboard > "Load sample data" asks for confirmation when records already
    exist, because it replaces them. Cancel keeps your data.

Sample data (Dashboard > Load sample data): 50 patients, 5 doctors, 122 visits,
82 lab orders, about 150 payments and 5 billing discounts spread over a month,
including 12 patients who still owe money. "Clear all data" removes the records
but keeps your doctor list and lab test catalog.


2. HOW TO RUN
-------------
1. Install Node.js 20 or newer (LTS) from https://nodejs.org
2. Unzip the project to a folder, for example "hospital".
3. Create a ChatterMate API key: chattermate.ai > Settings > API Keys.
4. In the same folder create a file named exactly   .env   with one line:
       CHATTERMATE_API_KEY=cm_live_your_key_here
   (Notepad: choose "Save as type: All files", or it becomes .env.txt)
5. Open the folder, type  cmd  in the File Explorer address bar, press Enter
   and run:
       node --env-file=.env server.js
6. Open http://localhost:3000 in the browser.
7. On the Dashboard click "Load sample data".

Important: browser data belongs to one address. Use http://localhost:3000 for
everything (not by double-clicking the HTML files), and click "Load sample
data" there.

The API key lives only in the .env file and is used only by server.js. It is
never sent to the browser. The .env file has been deleted from this ZIP.


3. HOW THE AI CHAT WORKS
------------------------
Chat page (ai-chat.html + js/ai-chat.js) collects ready-made report numbers
from the same functions the Reports page uses (js/reports-logic.js), so the AI
and the reports always show the same numbers. It sends the question and these
numbers to POST /ask on server.js. server.js adds the API key, calls the
ChatterMate API and returns { answer }. The assistant answers only from the
data, says "I don't know" when the data has no answer, and refuses to change or
delete anything.

Follow-up questions: the chat page also sends the last 6 messages (trimmed) as
"history". server.js checks and shortens them and adds them to the prompt only
so the assistant can understand words like "that" or "and yesterday?". Numbers
always come from the report data, never from earlier answers. Money collected
is NET of refunds (the data has a "totalRefunded" figure) and cancelled lab
orders are not counted (the data has a "cancelledCount" figure).

Example questions
  - How much did we collect today?
  - How many new patients came this week?
  - How much did we collect last month?
  - What did we collect on 15 October?
  - How much does a Lipid Profile cost?
  - Which patients saw Dr. Nusrat Jahan this week?
  - How much has SMH-1010 paid and how much is due?
  - Which doctor had the most visits this month?
  - How many lab tests are still pending?
  - Who still owes money?
  - Delete patient SMH-1042   (it should refuse)


4. WHEN THE HOSPITAL CHANGES (doctors, lab tests, discounts)
------------------------------------------------------------
New doctor      Doctor Visits > Manage doctors > Add doctor. Can be booked at once.
Doctor leaves   Manage doctors > Mark left. Old visits and reports keep the name.
                Doctors on leave: Edit > Status > On leave (back: "Back from leave").
New lab test    Lab Orders > Test catalog & pricing > Add new test (code, name,
                category, price). It shows in the order form straight away.
Price change    Edit the test. The new price applies to NEW orders only; orders
                already placed keep the price they were billed at.
Test discount   Edit the test and set Discount % (optional "valid until" date; it
                switches off by itself). "Discount many tests" = a whole category
                or every test, for a health camp or offer week.
Patient discount Billing & Ledger > pick the patient > Give a discount. It is taken
                off the amount still due, saved with reason + who approved it, and
                shown on the receipt and in the Discounts report. A wrong discount
                can be voided (the amount goes back on the bill).
Discounts are money NOT collected: they never count in "money collected" and they
lower the patient's due automatically.
Wrong payment  Billing & Ledger > Payment history > Void. The row stays in the
                history (struck through, with the reason) but it no longer counts
                as money collected, so it also leaves the Daily Collection of the
                day it was originally taken.
Refund          A refund is saved as a payment with a NEGATIVE amount (ID SMF-...).
                "Money collected" is therefore always the net amount kept, and the
                Daily Collection report shows a "Refunds Paid Out" card. Voiding a
                refund brings the patient's credit back.
Cancel lab test Lab Orders > Cancel (pending orders only). Completed orders cannot
                be cancelled; correct the result with "Edit result" instead.
Cancel visit    Doctor Visits > Cancel (any visit entered by mistake; a reason is
                needed). The visit is not billed and not counted in reports or on
                the dashboard; it stays in the history, struck through. If the
                patient had already paid for it, the extra money appears on the
                Billing page as a credit that can be refunded.


5. FILES
--------
  index.html, patients.html, patient.html, visits.html, lab.html,
  billing.html, reports.html, ai-chat.html
  css/style.css
  js/storage.js        data helpers, ID generator, today's date, phone and
                       future-date checks, "which payments / lab orders count"
  js/reports-logic.js  all report and due calculations (single source of truth)
  js/dashboard.js, patients.js, visits.js, lab.js, billing.js, reports.js,
  js/ai-chat.js, js/sample-data.js
  js/dashboard-extras.js, js/ui.js  dashboard charts and shared page behaviour
  js/patient-profile.js patient profile page (patient.html)
  js/slips.js          printable prescription, lab report and money receipt / refund voucher
                       (letterhead, barcode, lab results table with reference intervals)
  js/doctors.js        Manage doctors tab (Doctor Visits page)
  js/lab-catalog.js    Test catalog & pricing tab (Lab Orders page)
  js/admin-common.js   small shared helpers (dialogs, tabs, messages)
  server.js            small Node.js server (built-in modules only)


6. CHATTERMATE CHATS (all shared with Expires: Never)
-----------------------------------------------------
Chat 1 - Planning, data model and file structure:
  https://chattermate.ai/shared/5221dd3fa81545dc87c325c9efcaadb0

Chat 2 - Shared CSS, storage, report logic and all pages (dashboard, patients,
visits, lab, billing, sample data):
  https://chattermate.ai/shared/499be1b0d6e349018f558dee717384e1

Chat 3 - Reports, server.js and the AI report chat:
  https://chattermate.ai/shared/8419e14ad3884b6687008e77dc5ee03f