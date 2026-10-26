/* ==========================================================================
   HostelHub — Fees & Payments
   Tabs: #overview · #payments (history across all invoices) · #outstanding
   Uses HH.invoices (js/modules/invoices.js) for payments, receipts and views.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready || !HH.invoices) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc, INV = HH.invoices;
  const root = document.getElementById("moduleRoot");
  const T = U.todayISO();
  const money = INV.money;
  const resBranch = (id) => (L.resident(id) || {}).branch;
  const fpCard = (icon, tone, title, sub, tools, body) => `<section class="card-hh">
    <div class="card-hh__head"><span class="chip-icon tone-${tone}"><i class="bi ${icon}"></i></span><div><h2 class="card-hh__title">${title}</h2>${sub ? `<div class="card-hh__sub">${sub}</div>` : ""}</div>${tools ? `<div class="card-hh__tools">${tools}</div>` : ""}</div>${body}</section>`;

  root.innerHTML = `
    <nav class="fp-tabs" data-tabs aria-label="Fees sections"></nav>
    <section class="stack" style="gap:var(--gutter)" data-panel="overview">
      <div data-ov-stats></div>
      <div class="fp-grid">
        ${fpCard("bi-bar-chart-fill", "yellow", "Collections by month", "Payments received (simulated)", `<select class="select-hh" data-ov-range style="height:34px;width:auto" aria-label="Collections range"><option value="6">Last 6 months</option><option value="12">Last 12 months</option></select>`, `<div class="chart-box chart-box--lg"><canvas id="fpChartMonth" role="img" aria-label="Collections by month bar chart"></canvas></div>`)}
        ${fpCard("bi-pie-chart-fill", "blue", "By payment method", "Same period as the monthly chart", "", `<div class="donut-wrap fp-donut"><div class="donut"><canvas id="fpChartMethod" role="img" aria-label="Collections by payment method"></canvas><div class="donut__center"><strong data-ov-mtotal>₹0</strong><small>Collected</small></div></div><ul class="donut-legend" data-ov-mlegend></ul></div>`)}
      </div>
      <div class="grid grid-2">
        ${fpCard("bi-hourglass-split", "orange", "Outstanding by fee category", "Remaining balance split proportionally across invoice items", `<a class="link-hh" href="#outstanding">Outstanding report <i class="bi bi-arrow-right"></i></a>`, `<div data-ov-cats></div>`)}
        ${fpCard("bi-clock-history", "green", "Recent payments", "", `<a class="link-hh" href="#payments">All payments <i class="bi bi-arrow-right"></i></a>`, `<div data-ov-recent></div>`)}
      </div>
    </section>
    <section class="stack" style="gap:var(--gutter)" data-panel="payments" hidden>
      <div data-pay-stats></div>
      <section class="card-hh card-hh--flush list-card">
        <div class="toolbar">
          <div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" data-pq placeholder="Search payment, invoice, resident, reference…" aria-label="Search payments"></div>
          <select class="select-hh" data-pf="method" aria-label="Payment method"></select>
          <select class="select-hh" data-pf="branch" aria-label="Branch"></select>
          <span class="date-range"><span>Paid</span><input type="date" class="input-hh" data-pf="from" aria-label="From date"><span>to</span><input type="date" class="input-hh" data-pf="to" aria-label="To date"></span>
          <button type="button" class="btn-hh btn-hh--ghost btn-hh--sm" data-pclear><i class="bi bi-x-circle"></i>Clear</button>
          <span class="spacer"></span>
          <span class="row-flex"><button type="button" class="btn-hh" data-pexport><i class="bi bi-filetype-csv"></i><span>Export CSV</span></button><button type="button" class="btn-hh" data-pprint><i class="bi bi-printer"></i><span>Print</span></button></span>
        </div>
        <div data-pay-table></div>
      </section>
    </section>
    <section class="stack" style="gap:var(--gutter)" data-panel="outstanding" hidden>
      <div data-out-stats></div>
      <section class="card-hh card-hh--flush list-card">
        <div class="toolbar">
          <div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" data-oq placeholder="Search resident, ID, room…" aria-label="Search outstanding"></div>
          <select class="select-hh" data-of="branch" aria-label="Branch"></select>
          <select class="select-hh" data-of="age" aria-label="Ageing"></select>
          <button type="button" class="btn-hh btn-hh--ghost btn-hh--sm" data-oclear><i class="bi bi-x-circle"></i>Clear</button>
          <span class="spacer"></span>
          <span class="row-flex"><button type="button" class="btn-hh" data-olate><i class="bi bi-alarm"></i><span>Apply Late Fees</span></button><button type="button" class="btn-hh" data-oexport><i class="bi bi-filetype-csv"></i><span>Export CSV</span></button><button type="button" class="btn-hh" data-oprint><i class="bi bi-printer"></i><span>Print</span></button></span>
        </div>
        <div data-out-table></div>
      </section>
    </section>`;
  const $ = (s) => root.querySelector(s);

  /* ------------------------------------------------------- overview ---- */
  function monthKeys(n) {
    const d = new Date(); const out = [];
    for (let i = n - 1; i >= 0; i--) out.push(U.iso(new Date(d.getFullYear(), d.getMonth() - i, 1)).slice(0, 7));
    return out;
  }
  function renderOverview() {
    const month = U.range("month");
    const payMonth = C.payments(month);
    const open = C.openInvoices();
    const outstanding = U.sum(open, (i) => C.invoiceTotals(i).balance);
    const overdue = open.filter((i) => INV.statusOf(i) === "Overdue");
    const billedNow = HH.store.all("invoices").filter((i) => i.status !== "Cancelled" && U.inRange(i.issueDate, month));
    const bt = billedNow.map(C.invoiceTotals);
    const billed = U.sum(bt, (t) => t.total), billedPaid = U.sum(bt, (t) => t.paid);
    const cards = [
      { label: "Collected This Month", value: U.fmtMoney(U.sum(payMonth, (p) => p.amount)), icon: "bi-cash-stack", tone: "green", meta: `${payMonth.length} payments · today ${U.fmtMoney(C.revenue(U.range("today")))}`, onClick: () => { setPayRange(month.from, month.to); tabs.set("payments"); } },
      { label: "Outstanding", value: U.fmtMoney(outstanding), icon: "bi-hourglass-split", tone: "orange", meta: `${open.length} open invoices`, onClick: () => tabs.set("outstanding") },
      { label: "Overdue", value: U.fmtMoney(U.sum(overdue, (i) => C.invoiceTotals(i).balance)), icon: "bi-exclamation-octagon", tone: "red", meta: `${overdue.length} invoices past due date`, onClick: () => { $('[data-of="age"]').value = "overdue"; tabs.set("outstanding"); renderOutstanding(); } },
      { label: "Collection Rate", value: `${U.pct(billedPaid, billed)}%`, icon: "bi-graph-up-arrow", tone: "blue", meta: `${U.fmtMoney(billedPaid)} of ${U.fmtMoney(billed)} billed this month` },
    ];
    $("[data-ov-stats]").innerHTML = HH.ui.statCards(cards); HH.ui.bindStatCards($("[data-ov-stats]"), cards);

    const n = Number($("[data-ov-range]").value) || 6;
    const keys = monthKeys(n);
    const range = { from: keys[0] + "-01", to: T };
    const pays = C.payments(range);
    const byMonth = U.groupBy(pays, (p) => U.monthKey(p.date));
    HH.chart("#fpChartMonth", {
      type: "bar",
      data: { labels: keys.map((k) => U.monthLabel(k).slice(0, 3) + " " + k.slice(2, 4)), datasets: [{ label: "Collected", data: keys.map((k) => U.sum(byMonth[k] || [], (p) => p.amount)), backgroundColor: HH.colors.yellow, borderRadius: 4, barPercentage: 0.6 }] },
      options: {
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (x) => U.fmtCompact(x) } } },
        plugins: { tooltip: { callbacks: { label: (c) => `Collected: ${U.fmtMoney(c.raw)} · ${(byMonth[keys[c.dataIndex]] || []).length} payments` } } },
        onClick: (e, els) => { if (!els.length) return; const k = keys[els[0].index]; const to = U.iso(new Date(+k.slice(0, 4), +k.slice(5), 0)); setPayRange(`${k}-01`, to > T ? T : to); tabs.set("payments"); },
        onHover: (e, els) => (e.native.target.style.cursor = els.length ? "pointer" : "default"),
      },
    });
    const methods = L.list("paymentMethods");
    const byMethod = U.groupBy(pays, (p) => p.method || "Other");
    Object.keys(byMethod).forEach((m) => { if (!methods.includes(m)) methods.push(m); });
    const mvals = methods.map((m) => U.sum(byMethod[m] || [], (p) => p.amount));
    const mtotal = U.sum(mvals);
    const colors = methods.map((_, i) => HH.palette[i % HH.palette.length]);
    $("[data-ov-mtotal]").textContent = (HH.store.settings().currencySymbol || "₹") + U.fmtCompact(mtotal);
    $("[data-ov-mlegend]").innerHTML = methods.map((m, i) => `<li><i style="background:${colors[i]}"></i><span>${esc(m)}</span><b>${U.pct(mvals[i], mtotal)}%</b></li>`).join("");
    HH.chart("#fpChartMethod", {
      type: "doughnut",
      data: { labels: mtotal ? methods : ["None"], datasets: [{ data: mtotal ? mvals : [1], backgroundColor: mtotal ? colors : [HH.colors.gray], borderWidth: 0 }] },
      options: { cutout: "70%", plugins: { tooltip: { enabled: !!mtotal, callbacks: { label: (c) => `${c.label}: ${U.fmtMoney(c.raw)}` } } },
        onClick: (e, els) => { if (!els.length || !mtotal) return; $('[data-pf="method"]').value = methods[els[0].index]; setPayRange(range.from, range.to); tabs.set("payments"); } },
    });

    const cats = Object.entries(C.pendingByCategory()).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    const ctot = U.sum(cats, (c) => c[1]);
    $("[data-ov-cats]").innerHTML = cats.length ? `<div class="fp-cats">${cats.map(([k, v], i) => `<div class="fp-cat"><div class="row-between"><span><i class="fp-dot" style="background:${HH.palette[i % HH.palette.length]}"></i>${esc(k)}</span><span><b class="money">${U.fmtMoney(v)}</b> <span class="text-3">${U.pct(v, ctot)}%</span></span></div>${HH.ui.progress(U.pct(v, ctot), HH.palette[i % HH.palette.length])}</div>`).join("")}
      <div class="row-between fp-cat-total"><span>Total outstanding</span><b class="money">${U.fmtMoney(ctot)}</b></div></div>` : HH.ui.empty("Nothing outstanding", "bi-check2-circle", "All invoices are fully paid.");
    const recent = C.payments().slice(0, 7);
    $("[data-ov-recent]").innerHTML = recent.length ? `<ul class="fp-recent">${recent.map((p) => `<li><button type="button" data-view-pay="${esc(p.invoiceId)}|${esc(p.id)}">
        ${HH.ui.person(L.residentName(p.residentId), `${p.invoiceId} · ${p.method} · ${U.fmtDate(p.date)}`, (L.resident(p.residentId) || {}).photo)}<b class="money text-green">+${money(p.amount)}</b></button></li>`).join("")}</ul>` : HH.ui.empty("No payments yet", "bi-cash");
  }
  $("[data-ov-range]").value = String(HH.store.pref("fp:range", 6));
  $("[data-ov-range]").addEventListener("change", (e) => { HH.store.setPref("fp:range", +e.target.value); renderOverview(); });

  /* ------------------------------------------------------- payments ---- */
  const pstate = { q: "", method: "", branch: "", from: "", to: "" };
  $('[data-pf="method"]').innerHTML = HH.ui.options(L.list("paymentMethods"), "", "All methods");
  $('[data-pf="branch"]').innerHTML = HH.ui.options(L.branchOptions(), "", "All branches");
  const payRows = () => {
    const q = pstate.q.toLowerCase();
    return C.payments({ from: pstate.from, to: pstate.to }).filter((p) => {
      if (pstate.method && p.method !== pstate.method) return false;
      if (pstate.branch && resBranch(p.residentId) !== pstate.branch) return false;
      if (q && ![p.id, p.invoiceId, p.residentId, L.residentName(p.residentId), p.reference, p.method, p.note].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  };
  const invOf = (p) => INV.get(p.invoiceId) || {};
  const payCols = [
    { key: "date", label: "Date", value: (p) => p.date + p.id, render: (p) => U.fmtDate(p.date), cls: "nowrap", csv: (p) => p.date },
    { key: "id", label: "Payment", render: (p) => `<b class="nowrap">${esc(p.id)}</b>` },
    { key: "resident", label: "Resident", value: (p) => L.residentName(p.residentId), render: (p) => HH.ui.person(L.residentName(p.residentId), INV.resMeta(p.residentId), (L.resident(p.residentId) || {}).photo) },
    { key: "invoiceId", label: "Invoice", render: (p) => `<span class="nowrap">${esc(p.invoiceId)}</span><span class="inv-sub text-3">${esc(invOf(p).period || "")}</span>` },
    { key: "method", label: "Method", render: (p) => `<span class="badge-hh tone-${{ Cash: "green", UPI: "purple", "Bank Transfer": "blue", Card: "orange" }[p.method] || "gray"}">${esc(p.method)}</span>` },
    { key: "reference", label: "Reference", render: (p) => esc(p.reference || "—"), cls: "nowrap" },
    { key: "amount", label: "Amount", value: (p) => Number(p.amount) || 0, render: (p) => `<b class="money text-green">${money(p.amount)}</b>`, cls: "t-right", thCls: "t-right" },
  ];
  const payCSV = [
    ["Payment ID", "id"], ["Date", "date"], ["Invoice", "invoiceId"], ["Period", (p) => invOf(p).period || ""], ["Resident ID", "residentId"], ["Resident", (p) => L.residentName(p.residentId)],
    ["Branch", (p) => L.branchName(resBranch(p.residentId))], ["Method", "method"], ["Reference", "reference"], ["Amount", "amount"], ["Note", "note"],
  ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] }));
  const payTable = new HH.Table($("[data-pay-table]"), {
    id: "fp-payments", columns: payCols, rows: [], pageSize: 10, sort: { key: "date", dir: "desc" },
    onRowClick: (p) => viewPayment(p.invoiceId, p.id),
    rowActions: (p) => [
      { label: "View payment", icon: "bi-eye", onClick: () => viewPayment(p.invoiceId, p.id) },
      { label: "View invoice", icon: "bi-receipt-cutoff", onClick: () => INV.viewInvoice(p.invoiceId, { onChange: renderAll }) },
      { label: "Print receipt", icon: "bi-printer", onClick: () => INV.printReceipt(p.invoiceId, p.id) },
      L.resident(p.residentId) && { label: "View resident", icon: "bi-person", onClick: () => (location.href = `resident-details.html?id=${p.residentId}#fees`) },
      { divider: true },
      { label: "Delete payment", icon: "bi-trash", danger: true, onClick: () => INV.deletePayment(p.invoiceId, p.id, renderAll) },
    ],
    footerRow: (rows) => `<tr><td colspan="6">Total · ${rows.length} payment(s)</td><td class="t-right money">${money(U.sum(rows, (p) => p.amount))}</td><td></td></tr>`,
    empty: "No payments match your filters",
  });
  function renderPayments() {
    const rows = payRows();
    const total = U.sum(rows, (p) => p.amount);
    const todayRows = rows.filter((p) => p.date === T);
    const top = Object.entries(U.groupBy(rows, (p) => p.method)).map(([m, l]) => [m, U.sum(l, (p) => p.amount)]).sort((a, b) => b[1] - a[1])[0];
    $("[data-pay-stats]").innerHTML = HH.ui.statCards([
      { label: "Collected (filtered)", value: U.fmtMoney(total), icon: "bi-cash-stack", tone: "green", meta: `${U.fmtNum(rows.length)} payments` },
      { label: "Average Payment", value: U.fmtMoney(rows.length ? Math.round(total / rows.length) : 0), icon: "bi-calculator", tone: "blue", meta: "Per transaction" },
      { label: "Received Today", value: U.fmtMoney(U.sum(todayRows, (p) => p.amount)), icon: "bi-calendar-check", tone: "yellow", meta: `${todayRows.length} payment(s) in this view` },
      { label: "Top Method", value: top ? esc(top[0]) : "—", icon: "bi-credit-card", tone: "purple", meta: top ? `${U.fmtMoney(top[1])} · ${U.pct(top[1], total)}%` : "No payments" },
    ]);
    payTable.setRows(rows, true);
  }
  function setPayRange(from, to) {
    pstate.from = from; pstate.to = to;
    $('[data-pf="from"]').value = from; $('[data-pf="to"]').value = to;
    pstate.method = $('[data-pf="method"]').value;
    renderPayments();
  }
  const onPQ = U.debounce(() => { pstate.q = $("[data-pq]").value.trim(); payTable.page = 1; renderPayments(); }, 180);
  $("[data-pq]").addEventListener("input", onPQ);
  root.querySelectorAll("[data-pf]").forEach((el) => el.addEventListener("change", () => {
    const k = el.dataset.pf; pstate[k] = el.value;
    if (pstate.from && pstate.to && pstate.from > pstate.to) { HH.toast("The start date must be on or before the end date.", "warning"); }
    payTable.page = 1; renderPayments();
  }));
  $("[data-pclear]").addEventListener("click", () => {
    Object.keys(pstate).forEach((k) => (pstate[k] = "")); $("[data-pq]").value = "";
    root.querySelectorAll("[data-pf]").forEach((el) => (el.value = "")); renderPayments();
  });
  const paySummary = () => [pstate.q && `Search: "${pstate.q}"`, pstate.method && `Method: ${pstate.method}`, pstate.branch && `Branch: ${L.branchName(pstate.branch)}`, (pstate.from || pstate.to) && `Paid: ${pstate.from || "…"} → ${pstate.to || "…"}`].filter(Boolean).join(" · ") || "All payments";
  $("[data-pexport]").addEventListener("click", () => { const rows = payTable.sortedRows(); if (!rows.length) return HH.toast("Nothing to export with the current filters.", "warning"); HH.exportCSV(`payments-${T}.csv`, payCSV, rows); });
  $("[data-pprint]").addEventListener("click", () => HH.printTable("Payment History", payCSV, payTable.sortedRows(), paySummary()));

  function viewPayment(invId, payId) {
    const inv = INV.get(invId); const p = inv && (inv.payments || []).find((x) => x.id === payId);
    if (!p) return HH.toast("Payment not found.", "error");
    const t = C.invoiceTotals(inv);
    HH.modal({
      title: `Payment · ${p.id}`, icon: "bi-cash-coin", size: "lg",
      body: `<div class="stack"><div class="alert-hh tone-yellow"><i class="bi bi-shield-lock"></i><span>Simulated payment recorded in the demo — no real money was charged.</span><span></span></div>
        ${HH.ui.kv([["Amount", `<b class="text-green" style="font-size:1.1rem">${money(p.amount)}</b>`], ["Payment date", U.fmtDate(p.date)], ["Method", esc(p.method)], ["Reference", esc(p.reference || "")],
          ["Resident", `${esc(L.residentName(inv.residentId))} <span class="text-3">${esc(inv.residentId)}</span>`], ["Invoice", `${esc(inv.id)} · ${esc(inv.period)} ${HH.ui.badge(INV.statusOf(inv))}`],
          ["Invoice total", money(t.total)], ["Invoice balance now", `<b>${money(t.balance)}</b>`], ["Note", esc(p.note || ""), true]])}</div>`,
      footer: [
        { label: "Delete", icon: "bi-trash", cls: "btn-hh--ghost", left: true, onClick: (ctx) => INV.deletePayment(inv.id, p.id, () => { ctx.close(); renderAll(); }) },
        { label: "View invoice", icon: "bi-receipt-cutoff", onClick: (ctx) => { ctx.close(); setTimeout(() => INV.viewInvoice(inv.id, { onChange: renderAll }), 320); } },
        { label: "Print receipt", icon: "bi-printer", cls: "btn-hh--primary", onClick: () => INV.printReceipt(inv.id, p.id) },
        { label: "Close", cls: "btn-hh--dark", close: true },
      ],
    });
  }

  /* ---------------------------------------------------- outstanding ---- */
  const AGES = [{ value: "notdue", label: "Not yet due" }, { value: "overdue", label: "Any overdue" }, { value: "30", label: "1–30 days overdue" }, { value: "60", label: "31–60 days overdue" }, { value: "61", label: "Over 60 days overdue" }];
  const ostate = { q: "", branch: "", age: "" };
  $('[data-of="branch"]').innerHTML = HH.ui.options(L.branchOptions(), "", "All branches");
  $('[data-of="age"]').innerHTML = HH.ui.options(AGES, "", "Any ageing");
  function outRowsAll() {
    return Object.entries(U.groupBy(C.openInvoices(), (i) => i.residentId)).map(([rid, list]) => {
      const r = L.resident(rid) || {};
      const oldest = list.reduce((m, i) => (i.dueDate < m ? i.dueDate : m), "9999-12-31");
      const overdue = list.filter((i) => INV.statusOf(i) === "Overdue");
      return {
        id: rid, name: r.name || L.residentName(rid), photo: r.photo, branch: r.branch, status: r.status || "—", phone: r.phone || "",
        invoices: list.length, invIds: list.map((i) => i.id), oldest, days: oldest < T ? U.daysBetween(oldest, T) : 0, overdue: overdue.length,
        lateEligible: list.filter(INV.lateFeeEligible).map((i) => i.id), balance: U.sum(list, (i) => C.invoiceTotals(i).balance),
      };
    });
  }
  const outRows = () => {
    const q = ostate.q.toLowerCase();
    return outRowsAll().filter((r) => {
      if (ostate.branch && r.branch !== ostate.branch) return false;
      if (ostate.age === "notdue" && r.days > 0) return false;
      if (ostate.age === "overdue" && !r.days) return false;
      if (ostate.age === "30" && !(r.days >= 1 && r.days <= 30)) return false;
      if (ostate.age === "60" && !(r.days > 30 && r.days <= 60)) return false;
      if (ostate.age === "61" && !(r.days > 60)) return false;
      if (q && ![r.id, r.name, r.phone, L.roomLabel((L.resident(r.id) || {}).roomId), r.invIds.join(" ")].join(" ").toLowerCase().includes(q)) return false;
      return true;
    });
  };
  const outCols = [
    { key: "name", label: "Resident", render: (r) => HH.ui.person(r.name, INV.resMeta(r.id), r.photo) },
    { key: "status", label: "Resident Status", render: (r) => HH.ui.badge(r.status) },
    { key: "invoices", label: "Open Invoices", cls: "t-right", thCls: "t-right", render: (r) => `${r.invoices}${r.overdue ? ` <span class="text-red small">(${r.overdue} overdue)</span>` : ""}` },
    { key: "oldest", label: "Oldest Due", render: (r) => U.fmtDate(r.oldest), cls: "nowrap" },
    { key: "days", label: "Days Overdue", value: (r) => r.days, render: (r) => (r.days ? `<span class="badge-hh tone-${r.days > 60 ? "red" : r.days > 30 ? "orange" : "yellow"}">${r.days} days</span>` : `<span class="text-3">Not due</span>`) },
    { key: "balance", label: "Balance", value: (r) => r.balance, render: (r) => `<b class="money">${money(r.balance)}</b>`, cls: "t-right", thCls: "t-right" },
  ];
  const outCSV = [
    ["Resident ID", "id"], ["Resident", "name"], ["Phone", "phone"], ["Branch", (r) => L.branchName(r.branch)], ["Resident Status", "status"], ["Open Invoices", "invoices"],
    ["Invoice IDs", (r) => r.invIds.join(" ")], ["Overdue Invoices", "overdue"], ["Oldest Due Date", "oldest"], ["Days Overdue", "days"], ["Balance", "balance"],
  ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] }));
  async function lateFees(ids, who) {
    const fee = Number(HH.store.settings().lateFeeAmount) || 0;
    const elig = HH.store.all("invoices").filter((i) => ids.includes(i.id) && INV.lateFeeEligible(i));
    if (!elig.length) return HH.toast(`No overdue invoices without a late fee${who ? " for " + who : ""}. Late fees are applied once per invoice.`, "info");
    const ok = await HH.confirm(`Add a late fee of <b>${money(fee)}</b> to <b>${elig.length}</b> overdue invoice(s)${who ? ` of ${esc(who)}` : ""} (total <b>${money(fee * elig.length)}</b>)? Invoices that already carry a late fee are skipped.`, { title: "Apply late fee", okText: "Apply late fee", icon: "bi-alarm" });
    if (!ok) return;
    const n = INV.applyLateFee(elig.map((i) => i.id));
    if (n) HH.toast(`Late fee applied to ${n} invoice(s).`, "success");
    renderAll();
  }
  const outTable = new HH.Table($("[data-out-table]"), {
    id: "fp-outstanding", columns: outCols, rows: [], pageSize: 10, sort: { key: "balance", dir: "desc" },
    onRowClick: (r) => residentDues(r.id),
    rowActions: (r) => [
      { label: "Record payment", icon: "bi-cash-coin", onClick: () => INV.payDialog({ residentId: r.id, onDone: renderAll }) },
      { label: "View open invoices", icon: "bi-receipt-cutoff", onClick: () => residentDues(r.id) },
      { label: `Apply late fee${r.lateEligible.length ? ` (${r.lateEligible.length})` : ""}`, icon: "bi-alarm", disabled: !r.lateEligible.length, onClick: () => lateFees(r.invIds, r.name) },
      L.resident(r.id) && { label: "View resident", icon: "bi-person", onClick: () => (location.href = `resident-details.html?id=${r.id}#fees`) },
      { label: "All invoices of resident", icon: "bi-box-arrow-up-right", onClick: () => (location.href = `invoices.html?q=${encodeURIComponent(r.id)}`) },
    ],
    footerRow: (rows) => `<tr><td colspan="5">Total · ${rows.length} resident(s)</td><td class="t-right money">${money(U.sum(rows, (r) => r.balance))}</td><td></td></tr>`,
    empty: "No outstanding fees match your filters",
  });
  function residentDues(rid) {
    const list = C.openInvoices().filter((i) => i.residentId === rid).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const bal = U.sum(list, (i) => C.invoiceTotals(i).balance);
    const m = HH.modal({
      title: `Outstanding · ${L.residentName(rid)}`, icon: "bi-hourglass-split", size: "lg",
      body: list.length ? `<div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>Invoice</th><th>Period</th><th>Due</th><th>Status</th><th class="t-right">Total</th><th class="t-right">Balance</th><th></th></tr></thead><tbody>
        ${list.map((i) => { const t = C.invoiceTotals(i); return `<tr><td class="nowrap"><b>${esc(i.id)}</b></td><td class="nowrap">${esc(i.period)}</td><td class="nowrap">${U.fmtDate(i.dueDate)}</td><td>${HH.ui.badge(INV.statusOf(i))}</td><td class="t-right money">${money(t.total)}</td><td class="t-right money"><b>${money(t.balance)}</b></td>
          <td class="t-right nowrap"><button type="button" class="btn-hh btn-hh--sm" data-open="${esc(i.id)}">View</button> <button type="button" class="btn-hh btn-hh--sm btn-hh--green" data-pay="${esc(i.id)}">Pay</button></td></tr>`; }).join("")}
        </tbody><tfoot><tr><td colspan="5">Total outstanding</td><td class="t-right money">${money(bal)}</td><td></td></tr></tfoot></table></div>` : HH.ui.empty("No outstanding invoices", "bi-check2-circle"),
      footer: [{ label: "Close", cls: "btn-hh--dark", close: true }],
    });
    m.body.addEventListener("click", (e) => {
      const o = e.target.closest("[data-open]"), p = e.target.closest("[data-pay]");
      if (o) { m.close(); setTimeout(() => INV.viewInvoice(o.dataset.open, { onChange: renderAll }), 320); }
      if (p) { m.close(); setTimeout(() => INV.payDialog({ invoiceId: p.dataset.pay, onDone: renderAll }), 320); }
    });
  }
  function renderOutstanding() {
    ostate.age = $('[data-of="age"]').value;
    const all = outRowsAll(); const rows = outRows();
    const overdueRows = all.filter((r) => r.days > 0);
    const eligible = all.reduce((n, r) => n + r.lateEligible.length, 0);
    $("[data-out-stats]").innerHTML = HH.ui.statCards([
      { label: "Total Outstanding", value: U.fmtMoney(U.sum(all, (r) => r.balance)), icon: "bi-hourglass-split", tone: "orange", meta: `${all.length} residents with dues` },
      { label: "Overdue Residents", value: overdueRows.length, icon: "bi-exclamation-octagon", tone: "red", meta: `${U.fmtMoney(U.sum(overdueRows, (r) => r.balance))} past due date` },
      { label: "Over 60 Days", value: all.filter((r) => r.days > 60).length, icon: "bi-calendar-x", tone: "purple", meta: "Long-pending balances" },
      { label: "Late Fee Eligible", value: eligible, icon: "bi-alarm", tone: "yellow", meta: `Overdue invoices without a late fee (${money(HH.store.settings().lateFeeAmount || 0)} each)` },
    ]);
    outTable.setRows(rows, true);
  }
  const onOQ = U.debounce(() => { ostate.q = $("[data-oq]").value.trim(); outTable.page = 1; renderOutstanding(); }, 180);
  $("[data-oq]").addEventListener("input", onOQ);
  root.querySelectorAll("[data-of]").forEach((el) => el.addEventListener("change", () => { ostate[el.dataset.of] = el.value; outTable.page = 1; renderOutstanding(); }));
  $("[data-oclear]").addEventListener("click", () => { ostate.q = ostate.branch = ostate.age = ""; $("[data-oq]").value = ""; root.querySelectorAll("[data-of]").forEach((el) => (el.value = "")); renderOutstanding(); });
  $("[data-olate]").addEventListener("click", () => lateFees(outTable.sortedRows().flatMap((r) => r.invIds)));
  $("[data-oexport]").addEventListener("click", () => { const rows = outTable.sortedRows(); if (!rows.length) return HH.toast("Nothing to export with the current filters.", "warning"); HH.exportCSV(`outstanding-fees-${T}.csv`, outCSV, rows); });
  $("[data-oprint]").addEventListener("click", () => HH.printTable("Outstanding Fees", outCSV, outTable.sortedRows(), [ostate.branch && L.branchName(ostate.branch), ostate.age && AGES.find((a) => a.value === ostate.age).label, ostate.q && `Search: "${ostate.q}"`].filter(Boolean).join(" · ") || `As of ${U.fmtDate(T)}`));

  /* ------------------------------------------------------- wiring ---- */
  root.addEventListener("click", (e) => {
    const v = e.target.closest("[data-view-pay]");
    if (v) { const [inv, pay] = v.dataset.viewPay.split("|"); viewPayment(inv, pay); }
  });
  let current = "overview";
  function renderAll() {
    renderOverview(); renderPayments(); renderOutstanding();
  }
  const tabs = HH.ui.tabs($("[data-tabs]"), [
    { key: "overview", label: "Fee Overview", icon: "bi-speedometer2" },
    { key: "payments", label: "Payment History", icon: "bi-clock-history" },
    { key: "outstanding", label: "Outstanding Fees", icon: "bi-hourglass-split" },
  ], (k) => { current = k; HH.ui.panels(root, k); if (k === "overview") renderOverview(); }, { hash: true });
  renderAll();
  window.addEventListener("hh:datachange", U.debounce((e) => { if (!e.detail || ["invoices", "*", "residents", "settings"].includes(e.detail.col)) renderAll(); }, 120));

  // Header actions
  const actions = document.getElementById("pageActions");
  actions.innerHTML = `<a class="btn-hh" href="invoices.html"><i class="bi bi-receipt-cutoff"></i><span>Invoices</span></a>
    <button type="button" class="btn-hh" data-gen><i class="bi bi-magic"></i><span>Generate Monthly</span></button>
    <button type="button" class="btn-hh btn-hh--primary" data-pay-btn><i class="bi bi-cash-coin"></i><span>Record Payment</span></button>`;
  actions.querySelector("[data-pay-btn]").addEventListener("click", () => INV.payDialog({ onDone: renderAll }));
  actions.querySelector("[data-gen]").addEventListener("click", () => INV.generateMonthly(renderAll));

  // Deep links: ?action=pay[&resident=RES-…][&invoice=INV-…], ?view=INV-…
  setTimeout(() => {
    const act = U.qs("action"), inv = U.qs("invoice"), res = U.qs("resident"), view = U.qs("view");
    if (act === "pay") {
      if (inv && INV.get(inv)) INV.payDialog({ invoiceId: inv, onDone: renderAll });
      else INV.payDialog({ residentId: res && L.resident(res) ? res : "", onDone: renderAll });
      U.setQS({ action: null, invoice: null, resident: null });
    } else if (view && INV.get(view)) { INV.viewInvoice(view, { onChange: renderAll }); U.setQS({ view: null }); }
  }, 80);
})();
