/* ==========================================================================
   HostelHub — Mess Management module
   #plans          meal plan CRUD
   #subscriptions  resident ↔ plan subscriptions (keeps resident.messPlan in sync)
   #counts         daily meal counts derived from attendance sheets
   #charges        monthly mess charges + "Generate mess invoices"
   Uses HH.residents.logHistory (js/modules/residents.js is loaded first).
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const root = document.getElementById("moduleRoot");
  const today = U.todayISO();
  const meals = () => L.list("mealTypes");
  const SUB_STATUSES = ["Active", "Paused", "Cancelled"];
  const isLive = (r) => r && (r.status === "Active" || r.status === "On Leave");
  const subs = () => HH.store.all("messSubscriptions");
  const activeSubsOf = (planId) => subs().filter((s) => s.planId === planId && s.status === "Active");
  const periodLabel = (ym) => { const [y, m] = ym.split("-"); return `${U.MONTHS[+m - 1]} ${y}`; };
  const monthEnd = (ym) => { const [y, m] = ym.split("-").map(Number); return U.iso(new Date(y, m, 0)); };
  const getSheet = (date, meal) => { const s = C.attendanceSheet(date, meal); return s && s.meal === meal ? s : null; };
  const logHistory = (r, action, note) => (HH.residents && HH.residents.logHistory ? HH.residents.logHistory(r, action, note) : r.history || []);

  /* ------------------------------------------------------------ shell --- */
  root.innerHTML = `
    <div data-ms-stats></div>
    <div class="card-hh card-hh--flush mod-tabs"><div data-ms-tabs></div></div>
    <div class="tab-panel" data-panel="plans"><div id="msPlans" class="stack" style="gap:var(--gutter)"></div></div>
    <div class="tab-panel" data-panel="subscriptions"><div id="msSubs" class="stack" style="gap:var(--gutter)"></div></div>
    <div class="tab-panel stack" data-panel="counts" style="gap:var(--gutter)">
      <section class="card-hh">
        <div class="card-hh__head"><span class="chip-icon tone-orange"><i class="bi bi-bar-chart-line-fill"></i></span>
          <div><h2 class="card-hh__title">Daily meal counts</h2><div class="card-hh__sub">Residents marked present on each saved attendance sheet.</div></div>
          <div class="card-hh__tools">
            <span class="date-range"><span>From</span><input type="date" class="input-hh" data-ct="from" aria-label="From date"><span>to</span><input type="date" class="input-hh" data-ct="to" aria-label="To date"></span>
            <select class="select-hh" data-ct="branch" aria-label="Branch"></select>
            <button type="button" class="btn-hh btn-hh--sm" data-ct-export><i class="bi bi-filetype-csv"></i>Export CSV</button>
            <button type="button" class="btn-hh btn-hh--sm" data-ct-print><i class="bi bi-printer"></i>Print</button>
          </div></div>
        <div class="chart-legend" data-ct-legend style="justify-content:flex-end"></div>
        <div class="chart-box chart-box--lg"><canvas id="msCountChart" role="img" aria-label="Daily meal counts chart"></canvas></div>
      </section>
      <section class="card-hh card-hh--flush"><div class="card-hh__head"><div><h2 class="card-hh__title">Counts by day</h2><div class="card-hh__sub" data-ct-sub></div></div></div><div data-ct-table></div></section>
    </div>
    <div class="tab-panel stack" data-panel="charges" style="gap:var(--gutter)">
      <section class="card-hh card-hh--flush">
        <div class="card-hh__head"><span class="chip-icon tone-green"><i class="bi bi-receipt"></i></span>
          <div><h2 class="card-hh__title">Meal charges</h2><div class="card-hh__sub" data-ch-sub></div></div>
          <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--primary btn-hh--sm" data-ch-generate><i class="bi bi-receipt-cutoff"></i>Generate mess invoices</button></div></div>
        <div class="toolbar" style="padding:var(--sp-4) var(--sp-5)">
          <div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" data-ch="q" placeholder="Search resident or plan…" aria-label="Search charges"></div>
          <input type="month" class="input-hh ms-month" data-ch="month" aria-label="Billing month">
          <select class="select-hh" data-ch="branch" aria-label="Branch"></select>
          <select class="select-hh" data-ch="plan" aria-label="Plan"></select>
          <select class="select-hh" data-ch="inv" aria-label="Invoice status"></select>
          <span class="spacer"></span>
          <button type="button" class="btn-hh btn-hh--sm" data-ch-export><i class="bi bi-filetype-csv"></i>Export CSV</button>
          <button type="button" class="btn-hh btn-hh--sm" data-ch-print><i class="bi bi-printer"></i>Print</button>
        </div>
        <div data-ch-summary class="ms-summary"></div>
        <div data-ch-table></div>
      </section>
    </div>`;
  const $ = (s) => root.querySelector(s);

  /* ------------------------------------------------------------ stats --- */
  function avgAttendance(days) {
    const from = U.addDays(today, -(days - 1));
    let P = 0, M = 0;
    HH.store.all("attendance").filter((s) => s.date >= from && s.date <= today).forEach((s) => Object.values(s.marks || {}).forEach((v) => { if (v === "P") { P++; M++; } else if (v === "A") M++; }));
    return U.pct(P, M);
  }
  function renderStats() {
    const act = subs().filter((s) => s.status === "Active");
    const revenue = U.sum(act, (s) => (L.plan(s.planId) || {}).monthlyCharge);
    const noPlan = C.activeResidents().filter((r) => !act.some((s) => s.residentId === r.id)).length;
    const cards = [
      { label: "Active Subscribers", value: U.fmtNum(act.length), icon: "bi-people-fill", tone: "blue", meta: `${subs().filter((s) => s.status === "Paused").length} paused`, onClick: () => { tabs.set("subscriptions"); subsPage.setFilter("status", "Active"); } },
      { label: "Monthly Plan Revenue", value: U.fmtMoney(revenue), icon: "bi-currency-rupee", tone: "green", meta: "Sum of active plan charges", onClick: () => tabs.set("charges") },
      { label: "Avg Attendance (30 days)", value: `${avgAttendance(30)}%`, icon: "bi-graph-up-arrow", tone: "purple", meta: "Present ÷ (present + absent)", onClick: () => tabs.set("counts") },
      { label: "Residents Without Plan", value: U.fmtNum(noPlan), icon: "bi-person-dash-fill", tone: "orange", meta: "Active residents, no subscription", onClick: () => { tabs.set("subscriptions"); subsPage.openForm(); } },
    ];
    const host = $("[data-ms-stats]"); host.innerHTML = HH.ui.statCards(cards); HH.ui.bindStatCards(host, cards);
  }

  /* ------------------------------------------------------------ plans ---- */
  const plansPage = HH.CrudPage({
    mount: "#msPlans", actionsHost: "inline", collection: "messPlans", entity: "Meal plan", entityPlural: "Meal plans", icon: "bi-fork-knife",
    searchKeys: ["id", "name", "description", (p) => (p.meals || []).join(" ")],
    filters: [{ key: "status", label: "Any status", options: ["Active", "Inactive"] }],
    defaultSort: { key: "name", dir: "asc" },
    columns: [
      { key: "name", label: "Plan", render: (p) => `<div class="cell-strong">${esc(p.name)}</div><div class="cell-muted">${p.id}</div>` },
      { key: "meals", label: "Meals", value: (p) => (p.meals || []).join(", "), render: (p) => `<div class="row-flex">${(p.meals || []).map((m) => `<span class="badge-hh tone-navy">${esc(m)}</span>`).join("")}</div>` },
      { key: "monthlyCharge", label: "Monthly charge", value: (p) => Number(p.monthlyCharge) || 0, render: (p) => `<span class="money cell-strong">${U.fmtMoney(p.monthlyCharge)}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "subs", label: "Active subscribers", value: (p) => activeSubsOf(p.id).length, cls: "t-center", thCls: "t-center" },
      { key: "revenue", label: "Monthly revenue", value: (p) => activeSubsOf(p.id).length * (Number(p.monthlyCharge) || 0), render: (p) => `<span class="money">${U.fmtMoney(activeSubsOf(p.id).length * (Number(p.monthlyCharge) || 0))}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "description", label: "Description", render: (p) => `<span class="truncate d-inline-block" style="max-width:240px">${esc(p.description || "—")}</span>` },
      { key: "status", label: "Status", render: (p) => HH.ui.badge(p.status) },
    ],
    fields: (rec) => [
      { name: "name", label: "Plan name", required: true, col: 8, maxlength: 60, placeholder: "e.g. Full Board",
        validate: (v) => { const d = HH.store.all("messPlans").find((p) => p.id !== (rec && rec.id) && p.name.trim().toLowerCase() === v.trim().toLowerCase()); return d ? `A plan named “${d.name}” already exists (${d.id}).` : ""; } },
      { name: "status", label: "Status", type: "select", required: true, col: 4, options: ["Active", "Inactive"], default: "Active" },
      { name: "meals", label: "Meals included", type: "checks", required: true, col: 12, options: meals() },
      { name: "monthlyCharge", label: "Monthly charge (₹)", type: "number", required: true, col: 6, min: 0, max: 100000, step: 50 },
      { type: "html", col: 6, html: `<div class="field-help" style="padding-top:28px">Charged on mess invoices as fee category “Mess Fee”.</div>` },
      { name: "description", label: "Description", type: "textarea", rows: 2, col: 12, maxlength: 300 },
    ],
    formSize: "lg",
    defaults: () => ({ status: "Active", meals: meals().slice(), monthlyCharge: 3000 }),
    beforeSave: (d, prev) => {
      d.name = d.name.trim(); d.monthlyCharge = Number(d.monthlyCharge) || 0;
      if (!d.meals || !d.meals.length) return "Select at least one meal.";
      const n = prev ? activeSubsOf(prev.id).length : 0;
      if (prev && d.status === "Inactive" && n) return `${n} active subscription(s) use “${prev.name}”. Move or cancel them before deactivating the plan.`;
    },
    afterSave: () => { renderStats(); subsPage.refresh(); },
    beforeDelete: (p) => { const n = activeSubsOf(p.id).length; return n ? `“${p.name}” has ${n} active subscription(s). Cancel or move them before deleting the plan.` : undefined; },
    deleteMessage: (p) => `Delete meal plan <b>${esc(p.name)}</b>? ${subs().filter((s) => s.planId === p.id).length} past subscription(s) keep the plan id for history.`,
    afterDelete: () => renderStats(),
    view: (p) => {
      const act = activeSubsOf(p.id);
      return `<div class="stack">
        <div class="detail-head"><span class="chip-icon chip-icon--lg tone-orange"><i class="bi bi-fork-knife"></i></span><div><h3>${esc(p.name)}</h3><div class="text-2">${esc(p.description || "")}</div></div><div>${HH.ui.badge(p.status)}</div></div>
        ${HH.ui.kv([["Meals", (p.meals || []).map((m) => `<span class="badge-hh tone-navy">${esc(m)}</span>`).join(" ")], ["Monthly charge", U.fmtMoney(p.monthlyCharge)], ["Active subscribers", act.length], ["Monthly revenue", U.fmtMoney(act.length * (Number(p.monthlyCharge) || 0))]])}
        <div class="detail-block"><div class="detail-block__title">Active subscribers (${act.length})</div>${act.length ? `<div class="ms-names">${act.slice(0, 60).map((s) => `<a href="resident-details.html?id=${s.residentId}">${esc(L.residentName(s.residentId))}</a>`).join("")}${act.length > 60 ? `<span class="text-2">+${act.length - 60} more</span>` : ""}</div>` : '<span class="text-3">No active subscribers</span>'}</div>
      </div>`;
    },
    viewFooter: () => [{ label: "View subscriptions", icon: "bi-people", left: true, onClick: (p, ctx) => { ctx.close(); tabs.set("subscriptions"); subsPage.setFilter("plan", p.id); } }],
    actions: [{ label: "View subscriptions", icon: "bi-people", handler: (p) => { tabs.set("subscriptions"); subsPage.setFilter("plan", p.id); } }],
    exportName: "meal-plans", printTitle: "Meal plans",
  });

  /* ----------------------------------------------------- subscriptions --- */
  function syncResident(resId) {
    const r = L.resident(resId); if (!r) return;
    const act = subs().filter((s) => s.residentId === resId && s.status === "Active").sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    const plan = act ? act.planId : "";
    if ((r.messPlan || "") === plan) return;
    HH.store.update("residents", r.id, { messPlan: plan, history: logHistory(r, "Mess plan changed", `${r.messPlan ? L.planName(r.messPlan) : "none"} → ${plan ? L.planName(plan) : "none"}`) });
  }
  function subFields(rec) {
    const resOpts = L.residentOptions((r) => isLive(r) || (rec && r.id === rec.residentId));
    const planOpts = HH.store.all("messPlans").filter((p) => p.status === "Active" || (rec && p.id === rec.planId)).map((p) => ({ value: p.id, label: `${p.name} · ${U.fmtMoney(p.monthlyCharge)}/month${p.status !== "Active" ? " (inactive)" : ""}` }));
    return [
      { name: "residentId", label: "Resident", type: "select", required: true, col: 12, options: resOpts, disabled: !!rec, help: rec ? "The resident of an existing subscription can't be changed — create a new subscription instead." : "Only active residents are listed." },
      { name: "planId", label: "Meal plan", type: "select", required: true, col: 6, options: planOpts },
      { name: "status", label: "Status", type: "select", required: true, col: 6, options: SUB_STATUSES, default: "Active" },
      { name: "startDate", label: "Start date", type: "date", required: true, col: 6, default: today },
      { name: "endDate", label: "End date", type: "date", col: 6, help: "Leave empty for an open-ended subscription.", validate: (v, vals) => (vals.startDate && v && v < vals.startDate ? "End date cannot be before the start date." : "") },
      { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12, maxlength: 300 },
    ];
  }
  const subsPage = HH.CrudPage({
    mount: "#msSubs", actionsHost: "inline", collection: "messSubscriptions", entity: "Subscription", icon: "bi-person-check",
    search: (s) => { const r = L.resident(s.residentId) || {}; return [s.id, r.name, r.id, L.planName(s.planId), s.status, s.notes].join(" "); },
    filters: [
      { key: "plan", label: "All plans", options: () => HH.store.all("messPlans").map((p) => ({ value: p.id, label: p.name })), match: (s, v) => s.planId === v },
      { key: "status", label: "Any status", options: SUB_STATUSES },
      { key: "branch", label: "All branches", options: () => L.branchOptions(), match: (s, v) => (L.resident(s.residentId) || {}).branch === v },
    ],
    dateFilter: { key: "startDate", label: "Started" },
    defaultSort: { key: "startDate", dir: "desc" },
    columns: [
      { key: "resident", label: "Resident", value: (s) => L.residentName(s.residentId), render: (s) => { const r = L.resident(s.residentId); return r ? HH.ui.person(r.name, `${r.id} · ${r.roomId ? L.bedLabel(r.roomId, r.bed) : "no bed"}`, r.photo) : `<span class="text-3">${esc(s.residentId)} (removed)</span>`; } },
      { key: "branch", label: "Branch", value: (s) => L.branchName((L.resident(s.residentId) || {}).branch), cls: "nowrap" },
      { key: "plan", label: "Plan", value: (s) => L.planName(s.planId), render: (s) => `<span class="cell-strong">${esc(L.planName(s.planId))}</span><div class="cell-muted">${U.fmtMoney((L.plan(s.planId) || {}).monthlyCharge)}/month</div>` },
      { key: "startDate", label: "Start", render: (s) => U.fmtDate(s.startDate), cls: "nowrap" },
      { key: "endDate", label: "End", render: (s) => (s.endDate ? U.fmtDate(s.endDate) : '<span class="text-3">Open</span>'), cls: "nowrap" },
      { key: "status", label: "Status", render: (s) => HH.ui.badge(s.status, s.status === "Paused" ? "orange" : null) },
    ],
    csvColumns: [
      ["Subscription", (s) => s.id], ["Resident ID", (s) => s.residentId], ["Resident", (s) => L.residentName(s.residentId)], ["Branch", (s) => L.branchName((L.resident(s.residentId) || {}).branch)],
      ["Plan", (s) => L.planName(s.planId)], ["Monthly charge", (s) => (L.plan(s.planId) || {}).monthlyCharge], ["Start", (s) => s.startDate], ["End", (s) => s.endDate], ["Status", (s) => s.status], ["Notes", (s) => s.notes],
    ].map(([label, value]) => ({ label, value })),
    fields: subFields, formSize: "lg",
    defaults: () => ({ status: "Active", startDate: today, endDate: "", notes: "", planId: (HH.store.all("messPlans").find((p) => p.status === "Active") || {}).id }),
    presetsFromQuery: (p) => { const o = {}; if (p.resident) o.residentId = p.resident; if (p.residentId) o.residentId = p.residentId; if (p.plan) o.planId = p.plan; return o; },
    beforeSave: (d, prev) => {
      if (prev) d.residentId = prev.residentId;
      const r = L.resident(d.residentId); const plan = L.plan(d.planId);
      if (!r) return "Choose a resident.";
      if (!plan) return "Choose a meal plan.";
      if (d.endDate && d.endDate < d.startDate) return "End date cannot be before the start date.";
      if (d.status === "Active") {
        if (!isLive(r)) return `${r.name} is ${r.status.toLowerCase()} — only active residents can have an active subscription.`;
        if (plan.status !== "Active" && (!prev || prev.planId !== d.planId || prev.status !== "Active")) return `“${plan.name}” is inactive. Choose an active plan.`;
        const other = subs().find((s) => s.residentId === r.id && s.status === "Active" && (!prev || s.id !== prev.id));
        if (other) return `${r.name} already has an active subscription (${other.id} · ${L.planName(other.planId)}). Cancel or pause it first.`;
        if (d.endDate && d.endDate < today) return "The end date has already passed — set the status to Cancelled instead.";
      }
      if (d.status === "Cancelled" && !d.endDate) d.endDate = today;
    },
    afterSave: (s, isNew, prev) => { syncResident(s.residentId); if (prev && prev.residentId !== s.residentId) syncResident(prev.residentId); renderStats(); plansPage.refresh(); },
    afterDelete: (s) => { syncResident(s.residentId); renderStats(); plansPage.refresh(); },
    deleteMessage: (s) => `Delete subscription <b>${s.id}</b> of <b>${esc(L.residentName(s.residentId))}</b> (${esc(L.planName(s.planId))})? ${s.status === "Active" ? "The resident's mess plan will be cleared. " : ""}Tip: use “Cancel” to keep the history.`,
    titleOf: (s) => `${s.id}`,
    view: (s) => { const r = L.resident(s.residentId) || {}; const p = L.plan(s.planId) || {}; return `<div class="stack">
        <div class="detail-head"><img class="avatar avatar--lg" src="${U.avatar(r.name || "?", r.photo)}" alt=""><div><h3>${esc(r.name || s.residentId)}</h3><div class="text-2">${esc(r.id || "")} · ${r.roomId ? esc(L.bedLabel(r.roomId, r.bed)) : "no bed"} · ${esc(L.branchName(r.branch))}</div></div><div>${HH.ui.badge(s.status, s.status === "Paused" ? "orange" : null)}</div></div>
        ${HH.ui.kv([["Plan", esc(p.name || "—")], ["Monthly charge", U.fmtMoney(p.monthlyCharge)], ["Meals", (p.meals || []).join(", ")], ["Subscription", s.id], ["Start date", U.fmtDate(s.startDate)], ["End date", s.endDate ? U.fmtDate(s.endDate) : "Open-ended"], ["Notes", esc(s.notes), true]])}
      </div>`; },
    viewFooter: () => [{ label: "Resident profile", icon: "bi-person", left: true, onClick: (s) => (location.href = `resident-details.html?id=${s.residentId}`) }],
    actions: [
      { label: "Pause", icon: "bi-pause-circle", show: (s) => s.status === "Active", handler: (s) => quickStatus(s, "Paused") },
      { label: "Resume", icon: "bi-play-circle", show: (s) => s.status === "Paused", handler: (s) => quickStatus(s, "Active") },
      { label: "Cancel subscription", icon: "bi-x-circle", show: (s) => s.status !== "Cancelled", handler: (s) => quickStatus(s, "Cancelled") },
    ],
    bulkActions: [{ label: "Cancel selected", icon: "bi-x-circle", handler: (rows) => bulkCancel(rows) }],
    exportName: "mess-subscriptions", printTitle: "Mess subscriptions",
  });

  async function quickStatus(s, status) {
    const r = L.resident(s.residentId);
    if (status === "Active") {
      if (!isLive(r)) return HH.toast("Only active residents can resume a subscription.", "error");
      const other = subs().find((x) => x.residentId === s.residentId && x.status === "Active" && x.id !== s.id);
      if (other) return HH.toast(`${esc(r.name)} already has an active subscription (${other.id}).`, "error");
      const p = L.plan(s.planId); if (!p || p.status !== "Active") return HH.toast("This plan is inactive — edit the subscription and pick an active plan.", "error");
    }
    const verb = { Paused: "Pause", Active: "Resume", Cancelled: "Cancel" }[status];
    const ok = await HH.confirm(`${verb} subscription <b>${s.id}</b> for <b>${esc(L.residentName(s.residentId))}</b>?`, { title: `${verb} subscription`, okText: verb, danger: status === "Cancelled" });
    if (!ok) return;
    const patch = { status };
    if (status === "Cancelled") patch.endDate = s.endDate && s.endDate <= today ? s.endDate : today;
    if (status === "Active" && s.endDate && s.endDate < today) patch.endDate = "";
    HH.store.update("messSubscriptions", s.id, patch);
    syncResident(s.residentId);
    HH.toast(`Subscription ${s.id} ${status === "Active" ? "resumed" : status.toLowerCase()}.`, "success");
    refreshAll();
  }
  async function bulkCancel(rows) {
    const list = rows.filter((s) => s.status !== "Cancelled");
    if (!list.length) return HH.toast("The selected subscriptions are already cancelled.", "warning");
    const ok = await HH.confirm(`Cancel <b>${list.length}</b> subscription(s)? End date will be set to today.`, { title: "Cancel subscriptions", danger: true, okText: "Cancel them" });
    if (!ok) return;
    list.forEach((s) => { HH.store.update("messSubscriptions", s.id, { status: "Cancelled", endDate: s.endDate && s.endDate <= today ? s.endDate : today }); syncResident(s.residentId); });
    subsPage.table.clearSelection();
    HH.toast(`${list.length} subscription(s) cancelled.`, "success");
    refreshAll();
  }

  /* ------------------------------------------------------------ counts --- */
  const ct = { from: U.addDays(today, -6), to: today, branch: "" };
  let ctTable = null;
  const MEAL_COLORS = [HH.colors.yellow, HH.colors.blue, HH.colors.green, HH.colors.purple, HH.colors.pink];
  function countRows() {
    return U.dateList(ct.from, ct.to).map((d) => {
      const row = { id: d, date: d, total: 0, sheets: 0 };
      meals().forEach((m) => { const s = getSheet(d, m); row[m] = s ? C.mealCount(d, m, ct.branch) : null; if (s) { row.sheets++; row.total += row[m]; } });
      return row;
    });
  }
  function countColumns() {
    return [
      { key: "date", label: "Date", cls: "nowrap", render: (r) => `<div class="cell-strong">${U.fmtDate(r.date)}</div><div class="cell-muted">${U.DAYS[U.parse(r.date).getDay()]}</div>` },
      ...meals().map((m) => ({ key: m, label: m, value: (r) => (r[m] == null ? -1 : r[m]), cls: "t-center", thCls: "t-center", render: (r) => (r[m] == null ? `<a class="text-3" href="meal-attendance.html?date=${r.date}&meal=${encodeURIComponent(m)}#mark" title="No sheet — mark attendance">—</a>` : `<a class="link-hh" href="meal-attendance.html?date=${r.date}#history">${r[m]}</a>`) })),
      { key: "total", label: "Total meals", cls: "t-center cell-strong", thCls: "t-center" },
    ];
  }
  function renderCounts() {
    $('[data-ct="from"]').value = ct.from; $('[data-ct="to"]').value = ct.to; $('[data-ct="from"]').max = today; $('[data-ct="to"]').max = today;
    $('[data-ct="branch"]').innerHTML = HH.ui.options(L.branchOptions(), ct.branch, "All branches");
    const rows = countRows();
    const cols = countColumns();
    const footer = (all) => {
      const withSheets = (m) => all.filter((r) => r[m] != null);
      return `<tr><td>Total · avg / day</td>${meals().map((m) => { const xs = withSheets(m); const t = U.sum(xs, (r) => r[m]); return `<td class="t-center">${t} <span class="cell-muted">· ${xs.length ? Math.round(t / xs.length) : 0}</span></td>`; }).join("")}<td class="t-center">${U.sum(all, (r) => r.total)}</td></tr>`;
    };
    if (!ctTable) ctTable = new HH.Table($("[data-ct-table]"), { id: "ms-counts", columns: cols, rows, paginate: false, sort: { key: "date", dir: "desc" }, footerRow: footer, empty: "No days in this range" });
    else { ctTable.o.columns = cols; ctTable.setRows(rows); }
    $("[data-ct-sub]").textContent = `${U.fmtDate(ct.from)} – ${U.fmtDate(ct.to)} · ${ct.branch ? L.branchName(ct.branch) : "All branches"} · “—” = no sheet saved`;
    $("[data-ct-legend]").innerHTML = meals().map((m, i) => `<span><i style="background:${MEAL_COLORS[i % MEAL_COLORS.length]}"></i>${esc(m)}</span>`).join("");
    if (root.querySelector('[data-panel="counts"]').hidden) return;
    const asc = rows.slice().sort((a, b) => a.date.localeCompare(b.date));
    HH.chart("#msCountChart", {
      type: "bar",
      data: { labels: asc.map((r) => { const x = U.parse(r.date); return `${U.DAYS[x.getDay()]} ${U.pad(x.getDate())}`; }), datasets: meals().map((m, i) => ({ label: m, data: asc.map((r) => r[m] || 0), backgroundColor: MEAL_COLORS[i % MEAL_COLORS.length], borderRadius: 3, barPercentage: 0.8, categoryPercentage: 0.7, maxBarThickness: 22 })) },
      options: {
        scales: { x: { grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 6 }, border: { display: false } } },
        plugins: { tooltip: { mode: "index", intersect: false } },
        onClick: (e, els) => { if (els.length) location.href = `meal-attendance.html?date=${asc[els[0].index].date}#history`; },
        onHover: (e, els) => (e.native.target.style.cursor = els.length ? "pointer" : "default"),
      },
    });
  }
  const countCSV = () => [{ label: "Date", value: (r) => r.date }, ...meals().map((m) => ({ label: m, value: (r) => (r[m] == null ? "" : r[m]) })), { label: "Total", value: (r) => r.total }];
  const ctPanel = root.querySelector('[data-panel="counts"]');
  ctPanel.addEventListener("change", (e) => {
    const k = e.target.dataset.ct; if (!k) return;
    const v = e.target.value;
    if (k === "branch") ct.branch = v;
    else {
      if (!v) { e.target.value = ct[k]; return HH.toast("Choose a date.", "error"); }
      if (v > today) { e.target.value = ct[k]; return HH.toast("Counts are only available up to today.", "error"); }
      const next = Object.assign({}, ct, { [k]: v });
      if (next.from > next.to) { e.target.value = ct[k]; return HH.toast("The start date must be on or before the end date.", "error"); }
      if (U.daysBetween(next.from, next.to) > 92) { e.target.value = ct[k]; return HH.toast("Choose a range of up to 93 days.", "warning"); }
      ct[k] = v;
    }
    renderCounts();
  });
  ctPanel.addEventListener("click", (e) => {
    if (e.target.closest("[data-ct-export]")) HH.exportCSV(`meal-counts-${ct.from}-to-${ct.to}.csv`, countCSV(), ctTable.sortedRows());
    if (e.target.closest("[data-ct-print]")) HH.printTable("Daily meal counts", countCSV(), ctTable.sortedRows(), `${U.fmtDate(ct.from)} – ${U.fmtDate(ct.to)} · ${ct.branch ? L.branchName(ct.branch) : "All branches"}`);
  });

  /* ----------------------------------------------------------- charges --- */
  const ch = { month: U.monthKey(today), branch: "", plan: "", inv: "", q: "" };
  let chTable = null;
  function messInvoice(resId, period) {
    return HH.store.all("invoices").find((i) => i.residentId === resId && i.period === period && i.status !== "Cancelled" && (i.items || []).some((it) => it.category === "Mess Fee"));
  }
  function chargeRows() {
    const ms = `${ch.month}-01`, me = monthEnd(ch.month), period = periodLabel(ch.month);
    const latest = {};
    subs().forEach((s) => {
      if (s.status === "Paused") return;
      if (s.status === "Cancelled" && !s.endDate) return;
      if (s.startDate > me || (s.endDate && s.endDate < ms)) return;
      if (!latest[s.residentId] || latest[s.residentId].startDate < s.startDate) latest[s.residentId] = s;
    });
    return Object.values(latest).map((s) => {
      const r = L.resident(s.residentId) || { id: s.residentId, name: "(removed)", branch: "" };
      const p = L.plan(s.planId) || { name: "(removed plan)", meals: [], monthlyCharge: 0 };
      const a = [ms, s.startDate, r.joinDate || ms].sort().pop();
      const b = [me, s.endDate || me, today].sort()[0];
      let avail = 0, taken = 0;
      if (a <= b) U.dateList(a, b).forEach((d) => (p.meals || []).forEach((m) => { const sh = getSheet(d, m); if (!sh) return; avail++; if (sh.marks[r.id] === "P") taken++; }));
      const inv = messInvoice(r.id, period);
      return { id: r.id, sub: s, resident: r, plan: p, charge: Number(p.monthlyCharge) || 0, avail, taken, pct: U.pct(taken, avail), invoice: inv ? inv.id : "", perMeal: taken ? Math.round((Number(p.monthlyCharge) || 0) / taken) : 0 };
    });
  }
  function filteredCharges() {
    const q = ch.q.toLowerCase();
    return chargeRows().filter((x) => (!ch.branch || x.resident.branch === ch.branch) && (!ch.plan || x.sub.planId === ch.plan) &&
      (!ch.inv || (ch.inv === "yes" ? !!x.invoice : !x.invoice)) && (!q || [x.resident.name, x.resident.id, x.plan.name].join(" ").toLowerCase().includes(q)));
  }
  const chColumns = [
    { key: "name", label: "Resident", value: (x) => x.resident.name, render: (x) => HH.ui.person(x.resident.name, `${x.resident.id} · ${L.branchName(x.resident.branch)}`, x.resident.photo) },
    { key: "plan", label: "Plan", value: (x) => x.plan.name, cls: "nowrap", render: (x) => `<span class="cell-strong">${esc(x.plan.name)}</span><div class="cell-muted">${x.sub.id} · ${x.sub.status}</div>` },
    { key: "charge", label: "Plan charge", value: (x) => x.charge, render: (x) => `<span class="money cell-strong">${U.fmtMoney(x.charge)}</span>`, cls: "t-right", thCls: "t-right" },
    { key: "taken", label: "Meals taken / available", value: (x) => x.taken, render: (x) => `<span class="nowrap"><b>${x.taken}</b> / ${x.avail}</span>`, cls: "t-center", thCls: "t-center" },
    { key: "pct", label: "Consumption", value: (x) => x.pct, render: (x) => `<div class="ms-pct"><b>${x.pct}%</b>${HH.ui.progress(x.pct, "var(--green)")}</div>` },
    { key: "perMeal", label: "Effective / meal", value: (x) => x.perMeal, render: (x) => (x.taken ? `<span class="money">${U.fmtMoney(x.perMeal)}</span>` : '<span class="text-3">—</span>'), cls: "t-right", thCls: "t-right" },
    { key: "invoice", label: "Invoice", value: (x) => x.invoice, render: (x) => (x.invoice ? `<a class="badge-hh tone-green" href="invoices.html?view=${x.invoice}">${x.invoice}</a>` : '<span class="badge-hh tone-orange">Not invoiced</span>') },
  ];
  const chCSV = () => [
    { label: "Resident ID", value: (x) => x.resident.id }, { label: "Resident", value: (x) => x.resident.name }, { label: "Branch", value: (x) => L.branchName(x.resident.branch) },
    { label: "Plan", value: (x) => x.plan.name }, { label: "Subscription", value: (x) => x.sub.id }, { label: "Plan charge", value: (x) => x.charge },
    { label: "Meals taken", value: (x) => x.taken }, { label: "Meals available", value: (x) => x.avail }, { label: "Consumption %", value: (x) => x.pct }, { label: "Invoice", value: (x) => x.invoice || "Not invoiced" },
  ];
  function renderCharges() {
    $('[data-ch="month"]').value = ch.month; $('[data-ch="month"]').max = U.monthKey(U.addDays(monthEnd(U.monthKey(today)), 1));
    $('[data-ch="branch"]').innerHTML = HH.ui.options(L.branchOptions(), ch.branch, "All branches");
    $('[data-ch="plan"]').innerHTML = HH.ui.options(HH.store.all("messPlans").map((p) => ({ value: p.id, label: p.name })), ch.plan, "All plans");
    $('[data-ch="inv"]').innerHTML = HH.ui.options([{ value: "yes", label: "Invoiced" }, { value: "no", label: "Not invoiced" }], ch.inv, "Any invoice status");
    const rows = filteredCharges();
    const total = U.sum(rows, (x) => x.charge), pending = rows.filter((x) => !x.invoice);
    const tk = U.sum(rows, (x) => x.taken), av = U.sum(rows, (x) => x.avail);
    $("[data-ch-sub]").textContent = `${periodLabel(ch.month)} · plan charge per subscriber plus consumption from attendance sheets`;
    $("[data-ch-summary]").innerHTML = [
      ["Subscribers billed", U.fmtNum(rows.length)], ["Plan charges", U.fmtMoney(total)], ["Not yet invoiced", `${pending.length} · ${U.fmtMoney(U.sum(pending, (x) => x.charge))}`],
      ["Meals taken", `${U.fmtNum(tk)} of ${U.fmtNum(av)}`], ["Avg consumption", `${U.pct(tk, av)}%`],
    ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join("");
    const footer = (all) => `<tr><td>Total (${all.length})</td><td></td><td class="t-right">${U.fmtMoney(U.sum(all, (x) => x.charge))}</td><td class="t-center">${U.sum(all, (x) => x.taken)} / ${U.sum(all, (x) => x.avail)}</td><td>${U.pct(U.sum(all, (x) => x.taken), U.sum(all, (x) => x.avail))}%</td><td></td><td>${all.filter((x) => x.invoice).length} invoiced</td></tr>`;
    if (!chTable) chTable = new HH.Table($("[data-ch-table]"), { id: "ms-charges", columns: chColumns, rows, pageSize: 10, sort: { key: "name", dir: "asc" }, footerRow: footer, empty: "No mess subscribers for this month", onRowClick: (x) => (location.href = `resident-details.html?id=${x.resident.id}`) });
    else chTable.setRows(rows, true);
    $("[data-ch-generate]").disabled = !pending.length;
  }
  async function generateInvoices() {
    const period = periodLabel(ch.month);
    const todo = filteredCharges().filter((x) => !x.invoice && x.charge > 0 && L.resident(x.resident.id));
    if (!todo.length) return HH.toast(`Every listed resident already has a Mess Fee invoice for ${period}.`, "info");
    const total = U.sum(todo, (x) => x.charge);
    const filt = ch.branch || ch.plan || ch.q || ch.inv;
    const ok = await HH.confirm(`Create <b>${todo.length}</b> mess invoice(s) for <b>${period}</b> totalling <b>${U.fmtMoney(total)}</b>?${filt ? " Only residents matching the current filters are included." : ""} Residents who already have a Mess Fee invoice for this period are skipped.`, { title: "Generate mess invoices", okText: "Generate invoices", icon: "bi-receipt-cutoff" });
    if (!ok) return;
    const s = HH.store.settings();
    const ms = `${ch.month}-01`;
    const issue = ch.month === U.monthKey(today) ? today : ms;
    const dueStd = `${ch.month}-${U.pad(Math.min(28, s.invoiceDueDay || 10))}`;
    const due = issue > dueStd ? U.addDays(issue, 7) : dueStd;
    let n = 0;
    todo.forEach((x) => {
      if (messInvoice(x.resident.id, period)) return; // re-check (no duplicates)
      const inv = {
        residentId: x.resident.id, issueDate: issue, dueDate: due, period,
        items: [{ category: "Mess Fee", description: `${x.plan.name} — ${period}`, amount: x.charge }],
        discount: 0, taxRate: Number(s.taxRate) || 0, lateFee: 0,
        notes: `Generated from Mess Management (${x.sub.id}). Meals taken: ${x.taken}/${x.avail}.`, status: "Unpaid", payments: [],
      };
      inv.status = C.invoiceStatus(inv);
      HH.store.insert("invoices", inv);
      n++;
    });
    HH.toast(`${n} mess invoice(s) created for ${period} (${U.fmtMoney(total)}). <a href="invoices.html" style="color:#FFD21F">Open invoices</a>`, "success", 6000);
    renderCharges();
  }
  const chPanel = root.querySelector('[data-panel="charges"]');
  chPanel.addEventListener("change", (e) => {
    const k = e.target.dataset.ch; if (!k || k === "q") return;
    if (k === "month") { if (!e.target.value) { e.target.value = ch.month; return; } ch.month = e.target.value; }
    else ch[k] = e.target.value;
    renderCharges();
  });
  chPanel.addEventListener("input", U.debounce((e) => { if (e.target.dataset.ch === "q") { ch.q = e.target.value.trim(); renderCharges(); } }, 180));
  chPanel.addEventListener("click", (e) => {
    if (e.target.closest("[data-ch-generate]")) generateInvoices();
    if (e.target.closest("[data-ch-export]")) { const rows = chTable.sortedRows(); if (!rows.length) return HH.toast("Nothing to export.", "warning"); HH.exportCSV(`mess-charges-${ch.month}.csv`, chCSV(), rows); }
    if (e.target.closest("[data-ch-print]")) HH.printTable(`Mess charges · ${periodLabel(ch.month)}`, chCSV(), chTable.sortedRows(), ch.branch ? L.branchName(ch.branch) : "All branches");
  });

  /* -------------------------------------------------------------- tabs --- */
  let current = "plans";
  function refreshAll() {
    renderStats(); plansPage.refresh(); subsPage.refresh();
    if (current === "counts") renderCounts();
    if (current === "charges") renderCharges();
  }
  const tabs = HH.ui.tabs($("[data-ms-tabs]"), [
    { key: "plans", label: "Meal Plans", icon: "bi-fork-knife" },
    { key: "subscriptions", label: "Subscriptions", icon: "bi-person-check" },
    { key: "counts", label: "Daily Meal Counts", icon: "bi-bar-chart-line" },
    { key: "charges", label: "Meal Charges", icon: "bi-receipt" },
  ], (k) => { current = k; HH.ui.panels(root, k); if (k === "counts") renderCounts(); if (k === "charges") renderCharges(); }, { hash: true });
  renderStats();
  window.addEventListener("hh:datachange", U.debounce(() => { renderStats(); if (current === "counts") renderCounts(); if (current === "charges") renderCharges(); }, 80));
})();
