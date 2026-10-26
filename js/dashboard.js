/* ==========================================================================
   HostelHub — Dashboard (all figures derived from stored demo records)
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const $ = (s) => document.querySelector(s);
  const K = (k) => document.querySelector(`[data-k="${k}"]`);

  const WIDGETS = [
    ["kpis", "Summary cards"], ["meals", "Meal Attendance chart"], ["occupancy", "Hostel Occupancy"], ["menu", "Today's Menu"],
    ["revenue", "Revenue vs Expenses"], ["expenses", "Expense Breakdown"], ["quick", "Quick Actions"],
    ["recentResidents", "Recent Residents"], ["transactions", "Recent Transactions"],
  ];
  const QUICK = [
    { key: "addResident", label: "Add Resident", icon: "bi-person-plus-fill", tone: "qa-blue", href: "pages/residents.html?action=add" },
    { key: "addRoom", label: "Add Room", svg: true, tone: "qa-green", href: "pages/rooms-beds.html?action=add" },
    { key: "attendance", label: "Take Meal Attendance", icon: "bi-fork-knife", tone: "qa-orange", href: "pages/meal-attendance.html#mark" },
    { key: "invoice", label: "Create Invoice", icon: "bi-file-earmark-text-fill", tone: "qa-purple", href: "pages/invoices.html?action=add" },
    { key: "expense", label: "Add Expense", icon: "bi-wallet-fill", tone: "qa-red", href: "pages/expenses.html?action=add" },
    { key: "menu", label: "Add Menu", icon: "bi-list-ul", tone: "qa-yellow", href: "pages/menu-management.html?action=add" },
    { key: "complaint", label: "Raise Complaint", icon: "bi-exclamation-triangle-fill", tone: "qa-pink", href: "pages/complaints.html?action=add" },
    { key: "visitor", label: "Visitor Entry", icon: "bi-people-fill", tone: "qa-indigo", href: "pages/visitors.html?action=add" },
    { key: "payment", label: "Record Payment", icon: "bi-cash-coin", tone: "qa-green", href: "pages/fees-payments.html?action=pay" },
    { key: "ticket", label: "New Repair Ticket", icon: "bi-tools", tone: "qa-orange", href: "pages/maintenance.html?action=add" },
    { key: "notice", label: "Post Notice", icon: "bi-megaphone-fill", tone: "qa-blue", href: "pages/notices.html?action=add" },
    { key: "stock", label: "Stock Purchase", icon: "bi-cart-plus-fill", tone: "qa-purple", href: "pages/kitchen-inventory.html?action=purchase" },
  ];
  const DEFAULT_QA = QUICK.slice(0, 8).map((q) => q.key);

  const state = {
    branch: HH.store.pref("dash:branch", "All"),
    period: HH.store.pref("dash:period", "today"),
    custom: HH.store.pref("dash:custom", null),
  };
  const range = () => U.range(state.period, state.custom);
  const inBranch = (branch) => state.branch === "All" || branch === state.branch;
  const resBranch = (id) => (L.resident(id) || {}).branch;

  /* --------------------------------------------------------- controls --- */
  function initControls() {
    const u = HH.store.settings().currentUser || {};
    $("#welcomeName").textContent = u.name || "Admin";
    document.querySelectorAll("[data-bed-icon]").forEach((el) => (el.innerHTML = HH.svg.bed));
    const sel = $("#branchFilter");
    sel.innerHTML = HH.ui.options(L.branchOptions(true), state.branch);
    sel.addEventListener("change", () => { state.branch = sel.value; HH.store.setPref("dash:branch", state.branch); renderAll(); });

    $("#periodSeg").addEventListener("click", (e) => {
      const b = e.target.closest("[data-period]"); if (!b) return;
      state.period = b.dataset.period; state.custom = null;
      HH.store.setPref("dash:period", state.period); HH.store.setPref("dash:custom", null);
      renderAll();
    });
    const from = $("#rangeFrom"), to = $("#rangeTo"), err = $("#rangeError");
    from.max = to.max = U.todayISO();
    if (state.custom) { from.value = state.custom.from; to.value = state.custom.to; }
    $("#rangeApply").addEventListener("click", () => {
      if (!from.value || !to.value) { err.textContent = "Choose both a start and an end date."; err.style.display = "block"; return; }
      if (from.value > to.value) { err.textContent = "Start date must be on or before the end date."; err.style.display = "block"; return; }
      err.style.display = "none";
      state.period = "custom"; state.custom = { from: from.value, to: to.value };
      HH.store.setPref("dash:period", "custom"); HH.store.setPref("dash:custom", state.custom);
      bootstrap.Dropdown.getOrCreateInstance($("#rangeBtn")).hide();
      renderAll();
    });
    $("#rangeClear").addEventListener("click", () => {
      from.value = ""; to.value = ""; err.style.display = "none";
      state.period = "today"; state.custom = null;
      HH.store.setPref("dash:period", "today"); HH.store.setPref("dash:custom", null);
      bootstrap.Dropdown.getOrCreateInstance($("#rangeBtn")).hide();
      renderAll();
    });
    ["#mealRange", "#revRange", "#expRange"].forEach((id) => {
      const el = $(id); const saved = HH.store.pref("dash:" + id, null);
      if (saved) el.value = saved;
      el.addEventListener("change", () => { HH.store.setPref("dash:" + id, el.value); renderAll(); });
    });
    $("#customizeBtn").addEventListener("click", customize);
    $("#customizeQa").addEventListener("click", customize);
  }

  function syncControls() {
    document.querySelectorAll("#periodSeg [data-period]").forEach((b) => b.classList.toggle("is-active", b.dataset.period === state.period));
    $("#rangeBtn").classList.toggle("is-active", state.period === "custom");
    const r = range();
    $("#periodText").textContent = state.period === "today" ? "today" : state.period === "custom" ? `from ${U.fmtDate(r.from)} to ${U.fmtDate(r.to)}` : r.label.toLowerCase();
    $("#txPeriod").textContent = `· ${r.label}`;
  }

  /* ---------------------------------------------------- customisation --- */
  function prefs() { return HH.store.pref("dash:widgets", Object.fromEntries(WIDGETS.map(([k]) => [k, true]))); }
  function qaPrefs() { return HH.store.pref("dash:quick", DEFAULT_QA); }

  function applyWidgets() {
    const p = prefs();
    document.querySelectorAll("[data-widget]").forEach((el) => (el.hidden = p[el.dataset.widget] === false));
  }

  function customize() {
    const p = prefs(), q = qaPrefs();
    const fields = [
      { type: "section", label: "Visible widgets", icon: "bi-grid-1x2" },
      { name: "widgets", label: "", type: "checks", options: WIDGETS.map(([k, l]) => ({ value: k, label: l })), default: WIDGETS.map(([k]) => k).filter((k) => p[k] !== false) },
      { type: "section", label: "Quick action buttons", icon: "bi-lightning-charge" },
      { name: "quick", label: "", type: "checks", options: QUICK.map((x) => ({ value: x.key, label: x.label })), default: q, validate: (v) => (v.length > 8 ? "Choose up to 8 quick actions." : v.length === 0 ? "Choose at least one quick action." : "") },
    ];
    HH.formModal({
      title: "Customize dashboard", icon: "bi-sliders", size: "lg", fields, values: {}, submitText: "Save layout",
      extraButtons: [{ label: "Restore defaults", icon: "bi-arrow-counterclockwise", left: true, onClick: (ctx) => { HH.store.setPref("dash:widgets", null); HH.store.setPref("dash:quick", DEFAULT_QA); ctx.close(); applyWidgets(); renderAll(); HH.toast("Dashboard layout restored to default.", "info"); } }],
      onSubmit: (data) => {
        HH.store.setPref("dash:widgets", Object.fromEntries(WIDGETS.map(([k]) => [k, data.widgets.includes(k)])));
        HH.store.setPref("dash:quick", data.quick);
        applyWidgets(); renderAll();
        HH.toast("Dashboard layout saved. It will be remembered on this browser.", "success");
        return true;
      },
    });
  }

  /* ----------------------------------------------------------- figures --- */
  function activeOn(date) {
    return HH.store.all("residents").filter((r) => inBranch(r.branch) && r.joinDate <= date && (r.status === "Active" || r.status === "On Leave" || (r.checkOut && r.checkOut > date))).length;
  }
  function pendingAsOf(date) {
    let tot = 0;
    HH.store.all("invoices").forEach((inv) => {
      if (inv.status === "Cancelled" || inv.issueDate > date || !inBranch(resBranch(inv.residentId))) return;
      const t = C.invoiceTotals(inv);
      const paid = U.sum((inv.payments || []).filter((p) => p.date <= date), (p) => p.amount);
      tot += Math.max(0, t.total - paid);
    });
    return tot;
  }
  function mealsOn(date) { return ["Breakfast", "Lunch", "Dinner"].map((m) => C.mealCount(date, m, state.branch)); }
  function trendHTML(pct, invert) {
    if (!isFinite(pct) || pct === 0) return `<span class="text-3" style="font-size:12px;font-weight:600">—</span>`;
    const up = pct > 0; const good = invert ? !up : up;
    return `<span class="trend ${good ? "trend--up" : "trend--down"}" title="vs previous period"><i class="bi ${up ? "bi-arrow-up" : "bi-arrow-down"}"></i>${Math.abs(pct)}%</span>`;
  }
  const change = (now, before) => (before ? Math.round(((now - before) / before) * 100) : now ? 100 : 0);

  function spark(id, data, color) {
    HH.chart("#" + id, {
      type: "line",
      data: { labels: data.map((_, i) => i), datasets: [{ data, borderColor: color, borderWidth: 2, tension: 0.4, pointRadius: 0, fill: false }] },
      options: { plugins: { tooltip: { enabled: false } }, scales: { x: { display: false }, y: { display: false } }, animation: false, events: [] },
    });
  }

  function renderKPIs() {
    const T = U.todayISO();
    const days = U.dateList(U.addDays(T, -13), T);
    const residents = HH.store.all("residents").filter((r) => inBranch(r.branch));
    const active = residents.filter((r) => r.status === "Active" || r.status === "On Leave").length;
    K("residents").textContent = U.fmtNum(residents.length);
    K("active").textContent = active; K("inactive").textContent = residents.length - active;
    K("residentsTrend").outerHTML = `<span data-k="residentsTrend">${trendHTML(change(active, activeOn(U.addDays(T, -30))))}</span>`;
    spark("sparkResidents", days.map(activeOn), HH.colors.blue);

    const occ = C.occupancy(state.branch);
    K("beds").innerHTML = `${occ.occupied}<small> / ${occ.total}</small>`;
    K("bedsPct").innerHTML = `<i class="bi bi-arrow-up"></i>${occ.pct}%`;
    K("vacant").textContent = occ.vacant; K("blocked").textContent = occ.blocked;
    const rooms = HH.store.all("rooms").filter((r) => inBranch(r.branch));
    const roomOf = Object.fromEntries(rooms.map((r) => [r.id, r]));
    spark("sparkBeds", days.map((d) => HH.store.all("residents").filter((r) => roomOf[r.roomId] && r.joinDate <= d && (r.status === "Active" || r.status === "On Leave" || (r.checkOut && r.checkOut > d))).length), HH.colors.green);

    const r = range();
    const span = U.dateList(r.from, r.to > T ? T : r.to);
    const per = [0, 0, 0];
    span.forEach((d) => mealsOn(d).forEach((n, i) => (per[i] += n)));
    const total = per[0] + per[1] + per[2];
    const len = span.length || 1;
    const prev = U.dateList(U.addDays(r.from, -len), U.addDays(r.from, -1));
    const prevTotal = U.sum(prev, (d) => U.sum(mealsOn(d)));
    K("mealsLabel").textContent = state.period === "today" ? "Today's Meals" : `Meals · ${r.label}`;
    K("meals").textContent = U.fmtNum(total);
    K("mB").textContent = U.fmtNum(per[0]); K("mL").textContent = U.fmtNum(per[1]); K("mD").textContent = U.fmtNum(per[2]);
    K("mealsTrend").outerHTML = `<span data-k="mealsTrend">${trendHTML(change(total, prevTotal))}</span>`;
    spark("sparkMeals", days.map((d) => U.sum(mealsOn(d))), HH.colors.red);

    const open = C.openInvoices().filter((i) => inBranch(resBranch(i.residentId)));
    const byCat = {};
    open.forEach((inv) => { const t = C.invoiceTotals(inv); const k = t.total ? t.balance / t.total : 0; (inv.items || []).forEach((it) => (byCat[it.category] = (byCat[it.category] || 0) + it.amount * k)); });
    const pending = U.sum(open, (i) => C.invoiceTotals(i).balance);
    K("pending").textContent = U.fmtMoney(pending);
    K("pHostel").textContent = U.fmtMoney(Math.round(pending - (byCat["Mess Fee"] || 0)));
    K("pMess").textContent = U.fmtMoney(Math.round(byCat["Mess Fee"] || 0));
    K("pendingTrend").outerHTML = `<span data-k="pendingTrend">${trendHTML(change(pending, pendingAsOf(U.addDays(T, -7))), true)}</span>`;
    spark("sparkFees", days.filter((_, i) => i % 2 === 1 || i === days.length - 1).map(pendingAsOf), HH.colors.purple);
  }

  function renderMeals() {
    const T = U.todayISO(); const v = $("#mealRange").value;
    const from = v === "month" ? U.range("month").from : U.addDays(T, -(Number(v) - 1));
    const days = U.dateList(from, T);
    const data = [0, 1, 2].map((i) => days.map((d) => mealsOn(d)[i]));
    const ds = (label, i, color) => ({ label, data: data[i], backgroundColor: color, borderRadius: 3, barPercentage: 0.78, categoryPercentage: 0.62 });
    HH.chart("#chartMeals", {
      type: "bar",
      data: { labels: days.map((d) => { const x = U.parse(d); return `${U.DAYS[x.getDay()]} ${U.pad(x.getDate())}`; }), datasets: [ds("Breakfast", 0, HH.colors.yellow), ds("Lunch", 1, HH.colors.blue), ds("Dinner", 2, HH.colors.green)] },
      options: {
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 5 }, border: { display: false } } },
        plugins: { tooltip: { mode: "index", intersect: false } },
        onClick: (e, els) => { if (els.length) location.href = `pages/meal-attendance.html?date=${days[els[0].index]}#history`; },
        onHover: (e, els) => (e.native.target.style.cursor = els.length ? "pointer" : "default"),
      },
    });
  }

  function renderOccupancy() {
    const o = C.occupancy(state.branch);
    K("occPct").textContent = `${o.pct}%`;
    K("occ1").textContent = o.occupied; K("occ2").textContent = o.vacant; K("occ3").textContent = o.blocked; K("occ4").textContent = o.total;
    HH.chart("#chartOcc", {
      type: "doughnut",
      data: { labels: ["Occupied", "Vacant", "Blocked"], datasets: [{ data: [o.occupied, o.vacant, o.blocked], backgroundColor: [HH.colors.yellow, HH.colors.gray, HH.colors.red], borderWidth: 0, hoverOffset: 4 }] },
      options: { cutout: "72%", onClick: () => (location.href = "pages/rooms-beds.html#occupancy") },
    });
  }

  function renderMenu() {
    const T = U.todayISO();
    const imgs = { Breakfast: "breakfast", Lunch: "lunch", Dinner: "dinner" };
    $("#menuList").innerHTML = HH.store.settings().mealTypes.map((m) => {
      const menu = C.menuFor(T, m.name);
      const cls = m.name === "Lunch" ? "menu-row--lunch" : m.name === "Dinner" ? "menu-row--dinner" : "";
      const href = menu ? `pages/menu-management.html?view=${menu.id}` : `pages/menu-management.html?action=add&date=${T}&meal=${encodeURIComponent(m.name)}`;
      return `<a class="menu-row ${cls} ${menu ? "" : "menu-row--empty"}" href="${href}">
        <span><span class="menu-row__meal d-block">${esc(m.name)}</span><span class="menu-row__time d-block">${U.fmtTime(menu ? menu.start : m.start)} - ${U.fmtTime(menu ? menu.end : m.end)}</span></span>
        <img class="menu-row__img" src="assets/images/food/${imgs[m.name] || "lunch"}.svg" alt="">
        <span class="menu-row__items">${menu ? esc(menu.items) : "No menu planned yet — click to add"}</span>
        <i class="bi bi-chevron-right text-2"></i></a>`;
    }).join("");
  }

  function renderRevenue() {
    const v = $("#revRange").value; const now = new Date();
    const months = [];
    if (v === "year") for (let m = 0; m < 12; m++) months.push(`${now.getFullYear()}-${U.pad(m + 1)}`);
    else for (let m = Number(v) - 1; m >= 0; m--) { const d = new Date(now.getFullYear(), now.getMonth() - m, 1); months.push(`${d.getFullYear()}-${U.pad(d.getMonth() + 1)}`); }
    const rev = Object.fromEntries(months.map((m) => [m, 0])), exp = Object.fromEntries(months.map((m) => [m, 0]));
    C.payments().forEach((p) => { const k = U.monthKey(p.date); if (k in rev && inBranch(resBranch(p.residentId))) rev[k] += p.amount; });
    C.expenses().forEach((e) => { const k = U.monthKey(e.date); if (k in exp && inBranch(e.branch)) exp[k] += e.amount; });
    HH.chart("#chartRev", {
      type: "bar",
      data: { labels: months.map((m) => U.MONTHS[+m.slice(5) - 1]), datasets: [
        { label: "Revenue", data: months.map((m) => rev[m]), backgroundColor: HH.colors.yellow, borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.6 },
        { label: "Expenses", data: months.map((m) => exp[m]), backgroundColor: HH.colors.blue, borderRadius: 3, barPercentage: 0.7, categoryPercentage: 0.6 }] },
      options: {
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (x) => U.fmtCompact(x) } } },
        plugins: { tooltip: { mode: "index", intersect: false, callbacks: { label: (c) => `${c.dataset.label}: ${U.fmtMoney(c.raw)}`, footer: (items) => `Net: ${U.fmtMoney((items[0]?.raw || 0) - (items[1]?.raw || 0))}` } } },
        onClick: () => (location.href = "pages/reports.html#finance"),
      },
    });
  }

  function renderExpenses() {
    const v = $("#expRange").value;
    const r = v === "dash" ? range() : U.range(v);
    const cats = HH.store.settings().expenseCategories;
    const list = C.expenses(r).filter((e) => inBranch(e.branch));
    const total = U.sum(list, (e) => e.amount);
    const by = cats.map((c, i) => ({ name: c.name, color: c.color || HH.palette[i % HH.palette.length], amt: U.sum(list.filter((e) => e.category === c.name), (e) => e.amount) }));
    const other = U.sum(list.filter((e) => !cats.some((c) => c.name === e.category)), (e) => e.amount);
    if (other) by.push({ name: "Uncategorised", color: "#94A3B8", amt: other });
    K("expTotal").textContent = U.fmtMoney(total);
    $("#expLegend").innerHTML = total ? by.filter((b) => b.amt).map((b) => `<li title="${U.fmtMoney(b.amt)}"><i style="background:${b.color}"></i><span>${esc(b.name)}</span><b>${U.pct(b.amt, total)}%</b></li>`).join("")
      : `<li style="grid-template-columns:1fr"><span class="text-2">No approved expenses in ${esc(r.label.toLowerCase())}.</span></li>`;
    const shown = by.filter((b) => b.amt);
    HH.chart("#chartExp", {
      type: "doughnut",
      data: { labels: total ? shown.map((b) => b.name) : ["None"], datasets: [{ data: total ? shown.map((b) => b.amt) : [1], backgroundColor: total ? shown.map((b) => b.color) : [HH.colors.gray], borderWidth: 0 }] },
      options: { cutout: "68%", plugins: { tooltip: { enabled: !!total, callbacks: { label: (c) => `${c.label}: ${U.fmtMoney(c.raw)}` } } }, onClick: () => (location.href = "pages/expenses.html") },
    });
  }

  function renderQuick() {
    const keys = qaPrefs();
    $("#qaGrid").innerHTML = keys.map((k) => QUICK.find((q) => q.key === k)).filter(Boolean).map((q) =>
      `<a class="tile-btn ${q.tone}" href="${q.href}">${q.svg ? `<span style="font-size:1.6rem;color:var(--green)">${HH.svg.bed}</span>` : `<i class="bi ${q.icon}"></i>`}<span>${esc(q.label)}</span></a>`).join("");
  }

  function renderRecentResidents() {
    const list = HH.store.all("residents").filter((r) => inBranch(r.branch)).slice().sort((a, b) => b.joinDate.localeCompare(a.joinDate) || b.id.localeCompare(a.id)).slice(0, 5);
    $("#recentResidents").innerHTML = `<thead><tr><th>#</th><th>Name</th><th>Room / Bed</th><th>Contact</th><th>Status</th><th>Joined On</th><th class="t-center">Action</th></tr></thead><tbody>
      ${list.map((r, i) => `<tr class="is-clickable" data-res="${r.id}"><td>${U.pad(i + 1)}</td><td><div class="person"><img class="avatar avatar--sm" src="${U.avatar(r.name, r.photo)}" alt=""><span class="person__name">${esc(r.name)}</span></div></td>
        <td class="nowrap">${r.roomId ? esc(L.bedLabel(r.roomId, r.bed)) : "—"}</td><td class="nowrap" style="color:var(--blue)">${esc(r.phone)}</td><td>${HH.ui.badge(r.status)}</td><td class="nowrap">${U.fmtDate(r.joinDate)}</td>
        <td class="t-center"><button type="button" class="row-menu-btn" data-res-menu="${r.id}" aria-label="Actions for ${esc(r.name)}"><i class="bi bi-three-dots"></i></button></td></tr>`).join("") || `<tr><td colspan="7">${HH.ui.empty("No residents yet")}</td></tr>`}</tbody>`;
  }

  function transactions() {
    const r = range();
    const pays = C.payments(r).filter((p) => inBranch(resBranch(p.residentId))).map((p) => ({
      kind: "payment", id: p.id, ref: p.invoiceId, date: p.date, amount: p.amount, type: "Income", status: "Paid",
      desc: `${(p.items && p.items.length > 1 ? "Hostel & Mess Fee" : (p.items && p.items[0] && p.items[0].category) || "Fee")} - ${L.residentName(p.residentId)}`, method: p.method, raw: p,
    }));
    const exps = HH.store.all("expenses").filter((e) => U.inRange(e.date, r) && inBranch(e.branch) && e.status !== "Rejected").map((e) => ({
      kind: "expense", id: e.id, ref: e.id, date: e.date, amount: e.amount, type: "Expense", status: e.status === "Approved" ? "Paid" : "Pending", desc: e.description, method: e.method, raw: e,
    }));
    return pays.concat(exps).sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));
  }

  function renderTx() {
    const list = transactions().slice(0, 5);
    $("#recentTx").innerHTML = `<thead><tr><th>#</th><th>Date</th><th>Description</th><th>Type</th><th class="t-right">Amount</th><th class="t-center">Status</th></tr></thead><tbody>
      ${list.map((t, i) => `<tr class="is-clickable" data-tx="${i}"><td>${U.pad(i + 1)}</td><td class="nowrap">${U.fmtDate(t.date)}</td><td><span class="truncate d-inline-block" style="max-width:240px">${esc(t.desc)}</span></td>
        <td>${HH.ui.badge(t.type)}</td><td class="t-right money cell-strong">${U.fmtMoney(t.amount)}</td><td class="t-center">${HH.ui.badge(t.status, t.status === "Pending" ? "yellow" : "green")}</td></tr>`).join("")
      || `<tr><td colspan="6">${HH.ui.empty(`No transactions ${state.period === "today" ? "today" : "in this period"}`, "bi-receipt", "Try a wider period such as This Month.")}</td></tr>`}</tbody>`;
    $("#recentTx")._rows = list;
  }

  function txDetails(t) {
    const body = t.kind === "payment"
      ? HH.ui.kv([["Payment ID", esc(t.id)], ["Invoice", esc(t.ref)], ["Resident", esc(L.residentName(t.raw.residentId))], ["Date", U.fmtDate(t.date)], ["Amount", `<span class="money">${U.fmtMoney(t.amount)}</span>`], ["Method", esc(t.method)], ["Reference", esc(t.raw.reference || "—")], ["Type", HH.ui.badge("Income")]])
      : HH.ui.kv([["Expense ID", esc(t.id)], ["Category", esc(t.raw.category)], ["Description", esc(t.desc), true], ["Date", U.fmtDate(t.date)], ["Amount", `<span class="money">${U.fmtMoney(t.amount)}</span>`], ["Vendor", esc(t.raw.vendor)], ["Method", esc(t.method)], ["Approval", HH.ui.badge(t.raw.status)], ["Branch", esc(L.branchName(t.raw.branch))]]);
    HH.modal({
      title: t.kind === "payment" ? "Payment details" : "Expense details", icon: t.kind === "payment" ? "bi-cash-coin" : "bi-receipt", body,
      footer: [
        { label: t.kind === "payment" ? "Open invoice" : "Open expense", icon: "bi-box-arrow-up-right", onClick: () => (location.href = t.kind === "payment" ? `pages/invoices.html?view=${t.ref}` : `pages/expenses.html?view=${t.id}`) },
        { label: "Close", cls: "btn-hh--dark", close: true },
      ],
    });
  }

  function wireTables() {
    $("#recentResidents").addEventListener("click", (e) => {
      const m = e.target.closest("[data-res-menu]");
      if (m) {
        const id = m.dataset.resMenu;
        HH.menu.open(m, [
          { label: "View profile", icon: "bi-person-vcard", onClick: () => (location.href = `pages/resident-details.html?id=${id}`) },
          { label: "Edit resident", icon: "bi-pencil", onClick: () => (location.href = `pages/residents.html?edit=${id}`) },
          { label: "Create invoice", icon: "bi-file-earmark-plus", onClick: () => (location.href = `pages/invoices.html?action=add&resident=${id}`) },
        ]);
        return;
      }
      const tr = e.target.closest("[data-res]");
      if (tr) location.href = `pages/resident-details.html?id=${tr.dataset.res}`;
    });
    $("#recentTx").addEventListener("click", (e) => { const tr = e.target.closest("[data-tx]"); if (tr) txDetails($("#recentTx")._rows[+tr.dataset.tx]); });
  }

  function renderAll() {
    syncControls();
    const p = prefs();
    const run = (key, fn) => { if (p[key] !== false) { try { fn(); } catch (err) { console.error(`Dashboard widget ${key} failed`, err); } } };
    run("kpis", renderKPIs); run("meals", renderMeals); run("occupancy", renderOccupancy); run("menu", renderMenu);
    run("revenue", renderRevenue); run("expenses", renderExpenses); run("quick", renderQuick);
    run("recentResidents", renderRecentResidents); run("transactions", renderTx);
  }

  initControls();
  applyWidgets();
  wireTables();
  renderAll();
  window.addEventListener("hh:datachange", U.debounce(renderAll, 200));
})();
