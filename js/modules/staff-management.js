/* ==========================================================================
   HostelHub — Staff Management module
   Tabs: #staff (directory) · #attendance (daily sheet + monthly summary) · #salary (payroll)
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, esc = U.esc;
  const S = () => HH.store.settings();
  const me = () => (S().currentUser || {}).name || "Admin";
  const STATUSES = ["Active", "On Leave", "Resigned"];
  const SHIFTS = ["Morning", "Evening", "Night", "General"];
  const MARKS = [
    { k: "P", label: "Present", icon: "bi-check-lg" },
    { k: "A", label: "Absent", icon: "bi-x-lg" },
    { k: "L", label: "Leave", icon: "bi-airplane" },
    { k: "H", label: "Holiday", icon: "bi-sun" },
  ];
  const MARK_LABEL = Object.fromEntries(MARKS.map((m) => [m.k, m.label]));
  const SHIFT_TONE = { Morning: "yellow", Evening: "orange", Night: "navy", General: "blue" };
  const curMonth = () => U.todayISO().slice(0, 7);
  const prevMonth = (m) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 2, 1); return `${d.getFullYear()}-${U.pad(d.getMonth() + 1)}`; };
  const deptOf = (desig) => ((S().designations || []).find((d) => (typeof d === "string" ? d : d.name) === desig) || {}).department || "";
  const isCurrent = (s) => s.status !== "Resigned";
  const digits = (v) => String(v || "").replace(/\D/g, "");
  const sheetId = (date) => `SA-${date.replace(/-/g, "")}`;
  const byName = (a, b) => a.name.localeCompare(b.name);
  const shiftBadge = (s) => HH.ui.badge(s || "—", SHIFT_TONE[s] || "gray");
  const money = (v) => `<span class="money">${U.fmtMoney(v)}</span>`;
  const OPEN_TICKET = (t) => !["Resolved", "Closed"].includes(t.status);
  const OPEN_CMP = (c) => ["Open", "In Progress"].includes(c.status);

  /* ------------------------------------------------------------ layout --- */
  const root = document.getElementById("moduleRoot");
  root.innerHTML = `
    <div class="card-hh sm-tabbar"><div id="smTabs"></div></div>
    <div class="tab-panel stack" data-panel="staff" style="gap:var(--gutter)"><div id="staffRoot" class="stack" style="gap:var(--gutter)"></div></div>
    <div class="tab-panel stack" data-panel="attendance" style="gap:var(--gutter)" hidden><div id="attRoot" class="stack" style="gap:var(--gutter)"></div></div>
    <div class="tab-panel stack" data-panel="salary" style="gap:var(--gutter)" hidden><div id="salRoot" class="stack" style="gap:var(--gutter)"></div></div>`;
  let curTab = "staff";
  let tabs = null;
  const goTab = (k) => (tabs ? tabs.set(k) : null);

  /* ===================================================== STAFF DIRECTORY == */
  function staffFields(rec) {
    const id = rec && rec.id;
    return [
      { type: "section", label: "Profile", icon: "bi-person" },
      { name: "name", label: "Full name", required: true, col: 8, maxlength: 80, placeholder: "e.g. Manoj George" },
      { name: "gender", label: "Gender", type: "select", required: true, col: 4, options: ["Male", "Female", "Other"] },
      { name: "photo", label: "Photo", type: "photo", col: 12 },
      { name: "phone", label: "Phone", type: "tel", required: true, col: 4, placeholder: "98765 43210",
        validate: (v, vals) => {
          if (vals && vals.status === "Resigned") return "";
          const dup = HH.store.all("staff").find((x) => x.id !== id && isCurrent(x) && digits(x.phone) === digits(v));
          return dup ? `Phone already used by ${dup.name} (${dup.id}).` : "";
        } },
      { name: "email", label: "Email", type: "email", col: 4, placeholder: "name@hostelhub.demo" },
      { name: "joinDate", label: "Joining date", type: "date", required: true, col: 4, max: U.todayISO() },
      { name: "address", label: "Address", type: "textarea", rows: 2, col: 12 },
      { type: "section", label: "Role, shift & pay", icon: "bi-briefcase" },
      { name: "designation", label: "Designation", type: "select", required: true, col: 4, options: L.list("designations"),
        onChange: (v, f) => { const d = deptOf(v); if (d && f.elements.department) f.elements.department.value = d; } },
      { name: "department", label: "Department", type: "select", required: true, col: 4, options: L.list("departments"), help: "Auto-filled from the designation." },
      { name: "branch", label: "Branch", type: "select", required: true, col: 4, options: L.branchOptions() },
      { name: "salary", label: "Monthly salary (₹)", type: "number", required: true, col: 4, min: 0, step: 100 },
      { name: "shift", label: "Shift", type: "select", required: true, col: 4, options: SHIFTS },
      { name: "status", label: "Status", type: "select", required: true, col: 4, options: STATUSES },
      { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12, placeholder: "Skills, emergency contact, ID details…" },
    ];
  }

  function staffBeforeSave(d, prev) {
    if (!d.department) d.department = deptOf(d.designation);
    d.salary = Number(d.salary) || 0;
    if (d.salary < 0) return "Salary cannot be negative.";
    if (d.joinDate > U.todayISO()) return "Joining date cannot be in the future.";
    if (d.status !== "Resigned") {
      const dup = HH.store.all("staff").find((x) => x.id !== (prev && prev.id) && isCurrent(x) && digits(x.phone) === digits(d.phone));
      if (dup) return `Phone ${d.phone} is already used by ${dup.name} (${dup.id}).`;
    }
    if (d.status === "Resigned" && (!prev || prev.status !== "Resigned")) d.resignedOn = U.todayISO();
    if (d.status !== "Resigned") d.resignedOn = "";
  }

  function attStrip(s) {
    const days = U.dateList(U.addDays(U.todayISO(), -13), U.todayISO());
    const cells = days.map((d) => { const sh = HH.store.get("staffAttendance", sheetId(d)); return { d, m: sh && sh.marks ? sh.marks[s.id] || "" : "" }; });
    const cnt = (k) => cells.filter((c) => c.m === k).length;
    return `<div class="row-between"><div class="detail-block__title">Last 14 days attendance</div>
        <span class="text-2 small">P ${cnt("P")} · A ${cnt("A")} · L ${cnt("L")} · H ${cnt("H")}</span></div>
      <div class="sa-strip">${cells.map((c) => { const dt = U.parse(c.d); return `<div class="sa-strip__day" title="${esc(U.fmtDate(c.d))}: ${c.m ? MARK_LABEL[c.m] : "Not marked"}"><span class="sa-cell sa-${c.m || "none"}">${c.m || "–"}</span><small>${U.DAYS[dt.getDay()].slice(0, 2)} ${dt.getDate()}</small></div>`; }).join("")}</div>`;
  }

  function staffView(s) {
    const sal = HH.store.all("salaries").filter((x) => x.staffId === s.id).sort((a, b) => b.month.localeCompare(a.month));
    const tickets = HH.store.all("maintenance").filter((t) => t.assignedTo === s.id && OPEN_TICKET(t));
    const cmps = HH.store.all("complaints").filter((c) => c.assignedTo === s.id && OPEN_CMP(c));
    return `<div class="stack">
      <div class="detail-head">
        <img class="avatar avatar--lg" src="${U.avatar(s.name, s.photo)}" alt="">
        <div style="min-width:0"><h3>${esc(s.name)}</h3>
          <div class="text-2">${esc(s.designation)} · ${esc(s.department)} · ${esc(L.branchName(s.branch))}</div>
          <div class="row-flex mt-2">${HH.ui.badge(s.status)} ${shiftBadge(s.shift)} <span class="badge-hh tone-gray">${esc(s.id)}</span></div></div>
        <div class="sm-salary-tag"><div class="kv__label">Monthly salary</div><div class="money fw-800">${U.fmtMoney(s.salary)}</div></div>
      </div>
      <div class="detail-block"><div class="detail-block__title">Contact & employment</div>
        ${HH.ui.kv([
          ["Phone", `<a class="link-hh" href="tel:${esc(digits(s.phone))}">${esc(s.phone)}</a>`],
          ["Email", s.email ? `<a class="link-hh" href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : "—"],
          ["Gender", esc(s.gender)],
          ["Joined on", `${U.fmtDate(s.joinDate)} <span class="text-2 small">(${tenure(s.joinDate)})</span>`],
          ["Shift", esc(s.shift)],
          ["Branch", esc(L.branchName(s.branch))],
          s.status === "Resigned" ? ["Resigned on", U.fmtDate(s.resignedOn)] : null,
          ["Address", esc(s.address), true],
          ["Notes", esc(s.notes), true],
        ], 3)}</div>
      <div class="grid grid-2">
        <div class="detail-block">${attStrip(s)}</div>
        <div class="detail-block"><div class="row-between"><div class="detail-block__title">Salary history</div><span class="text-2 small">${sal.length} record(s)</span></div>
          ${sal.length ? `<div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>Month</th><th class="t-right">Net</th><th>Status</th><th>Paid on</th></tr></thead><tbody>
            ${sal.slice(0, 6).map((x) => `<tr><td class="nowrap">${U.monthLabel(x.month)}</td><td class="t-right">${money(x.net)}</td><td>${HH.ui.badge(x.status)}</td><td class="nowrap">${U.fmtDate(x.paidOn)}</td></tr>`).join("")}
          </tbody></table></div>` : HH.ui.empty("No salary records yet", "bi-cash-stack")}</div>
      </div>
      <div class="grid grid-2">
        <div class="detail-block"><div class="row-between"><div class="detail-block__title">Open maintenance tickets</div><span class="badge-hh tone-gray">${tickets.length}</span></div>
          ${tickets.length ? `<ul class="sm-linklist">${tickets.map((t) => `<li><a class="link-hh" href="maintenance.html?view=${esc(t.id)}">${esc(t.id)} · ${esc(t.title)}</a><span>${HH.ui.badge(t.priority)} ${HH.ui.badge(t.status)}</span></li>`).join("")}</ul>` : `<div class="text-2 small">No open tickets assigned.</div>`}</div>
        <div class="detail-block"><div class="row-between"><div class="detail-block__title">Open complaints</div><span class="badge-hh tone-gray">${cmps.length}</span></div>
          ${cmps.length ? `<ul class="sm-linklist">${cmps.map((c) => `<li><a class="link-hh" href="complaints.html?view=${esc(c.id)}">${esc(c.id)} · ${esc(c.subject)}</a><span>${HH.ui.badge(c.status)}</span></li>`).join("")}</ul>` : `<div class="text-2 small">No open complaints assigned.</div>`}</div>
      </div>
    </div>`;
  }
  function tenure(d) {
    if (!d) return "—";
    const days = U.daysBetween(d, U.todayISO());
    if (days < 31) return `${days} day(s)`;
    const m = Math.floor(days / 30.44); const y = Math.floor(m / 12);
    return y ? `${y} yr ${m % 12} mo` : `${m} mo`;
  }

  function changeStatus(s) {
    const open = HH.store.all("maintenance").filter((t) => t.assignedTo === s.id && OPEN_TICKET(t)).length + HH.store.all("complaints").filter((c) => c.assignedTo === s.id && OPEN_CMP(c)).length;
    HH.formModal({
      title: `Change status · ${s.name}`, icon: "bi-toggles", size: "md", values: {}, submitText: "Update status",
      fields: [
        { name: "status", label: "New status", type: "select", required: true, options: STATUSES, default: s.status },
        { name: "note", label: "Reason / note", type: "textarea", rows: 2 },
        open ? { type: "html", html: `<div class="alert-hh tone-orange"><i class="bi bi-exclamation-triangle"></i><span>${open} open ticket(s)/complaint(s) are assigned to ${esc(s.name)}. Reassign them if this person is leaving.</span><span></span></div>` } : null,
      ].filter(Boolean),
      onSubmit: (d) => {
        if (d.status === s.status) return "Status is unchanged.";
        const patch = { status: d.status, resignedOn: d.status === "Resigned" ? U.todayISO() : "" };
        if (d.note) patch.notes = [s.notes, `${U.fmtDate(U.todayISO())}: ${s.status} → ${d.status} — ${d.note}`].filter(Boolean).join("\n");
        if (d.status !== "Resigned") {
          const dup = HH.store.all("staff").find((x) => x.id !== s.id && isCurrent(x) && digits(x.phone) === digits(s.phone));
          if (dup) return `Cannot reactivate: phone ${s.phone} is now used by ${dup.name} (${dup.id}).`;
        }
        HH.store.update("staff", s.id, patch);
        HH.toast(`${s.name} is now ${d.status}.`, "success");
        refreshAll();
        return true;
      },
    });
  }

  const staffCsv = [
    ["Staff ID", "id"], ["Name", "name"], ["Gender", "gender"], ["Phone", "phone"], ["Email", "email"], ["Designation", "designation"], ["Department", "department"],
    ["Branch", (s) => L.branchName(s.branch)], ["Shift", "shift"], ["Monthly Salary", "salary"], ["Joining Date", "joinDate"], ["Status", "status"], ["Address", "address"], ["Notes", "notes"],
  ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] }));

  const staffPage = HH.CrudPage({
    mount: "#staffRoot", actionsHost: "inline", deepLinks: false,
    collection: "staff", entity: "Staff Member", entityPlural: "Staff", icon: "bi-person-badge", addLabel: "Add Staff", viewIcon: "bi-person-badge",
    searchPlaceholder: "Search name, ID, phone, designation…",
    searchKeys: ["id", "name", "phone", "email", "designation", "department"],
    filters: [
      { key: "department", label: "All departments", options: () => L.list("departments") },
      { key: "designation", label: "All designations", options: () => L.list("designations") },
      { key: "branch", label: "All branches", options: () => L.branchOptions() },
      { key: "shift", label: "All shifts", options: SHIFTS },
      { key: "status", label: "Any status", options: STATUSES },
    ],
    dateFilter: { key: "joinDate", label: "Joined" },
    defaultSort: { key: "name", dir: "asc" },
    columns: [
      { key: "name", label: "Staff", render: (s) => HH.ui.person(s.name, s.id, s.photo) },
      { key: "designation", label: "Designation", render: (s) => `<div class="fw-semibold nowrap">${esc(s.designation)}</div><div class="text-2 small nowrap">${esc(s.department)}</div>` },
      { key: "branch", label: "Branch", value: (s) => L.branchName(s.branch), cls: "nowrap" },
      { key: "phone", label: "Contact", cls: "nowrap" },
      { key: "shift", label: "Shift", render: (s) => shiftBadge(s.shift) },
      { key: "joinDate", label: "Joined", render: (s) => U.fmtDate(s.joinDate), cls: "nowrap" },
      { key: "salary", label: "Salary", value: (s) => Number(s.salary) || 0, render: (s) => money(s.salary), cls: "t-right", thCls: "t-right" },
      { key: "status", label: "Status", render: (s) => HH.ui.badge(s.status) },
    ],
    csvColumns: staffCsv,
    exportName: "staff", printTitle: "Staff Directory",
    stats: (all) => {
      const cur = all.filter(isCurrent);
      return [
        { label: "Total Staff", value: cur.length, icon: "bi-people-fill", tone: "blue", meta: `${new Set(cur.map((s) => s.department)).size} departments · excl. resigned`, onClick: () => staffPage.setFilter("status", "") },
        { label: "Active", value: all.filter((s) => s.status === "Active").length, icon: "bi-person-check-fill", tone: "green", meta: "On the duty roster", onClick: () => staffPage.setFilter("status", "Active") },
        { label: "On Leave", value: all.filter((s) => s.status === "On Leave").length, icon: "bi-airplane-fill", tone: "orange", meta: "Currently away", onClick: () => staffPage.setFilter("status", "On Leave") },
        { label: "Resigned", value: all.filter((s) => s.status === "Resigned").length, icon: "bi-person-dash-fill", tone: "red", meta: "Past employees", onClick: () => staffPage.setFilter("status", "Resigned") },
        { label: "Monthly Payroll", value: U.fmtMoney(U.sum(cur, (s) => s.salary)), icon: "bi-cash-stack", tone: "purple", meta: "Basic salary of current staff", onClick: () => goTab("salary") },
      ];
    },
    before: (pg) => {
      const cur = HH.store.all("staff").filter(isCurrent);
      const active = pg.state.filters.department;
      const g = U.groupBy(cur, (s) => s.department || "Unassigned");
      const depts = Object.keys(g).sort((a, b) => g[b].length - g[a].length);
      return `<section class="card-hh sm-dept">
        <div class="card-hh__head"><span class="chip-icon tone-navy"><i class="bi bi-diagram-3"></i></span><div><div class="card-hh__title">Staff by department</div><div class="card-hh__sub">Click a department to filter the directory</div></div></div>
        <div class="sm-dept__grid">${depts.map((d) => `<button type="button" class="sm-dept__item ${active === d ? "is-active" : ""}" data-dept="${esc(d)}"><span class="sm-dept__name">${esc(d)}</span><b>${g[d].length}</b><small>${U.fmtMoney(U.sum(g[d], (s) => s.salary))}/mo</small></button>`).join("")}</div>
      </section>`;
    },
    fields: staffFields, formSize: "xl",
    defaults: () => ({ status: "Active", shift: "General", branch: (L.branches()[0] || {}).id || "", joinDate: U.todayISO(), salary: 12000 }),
    beforeSave: staffBeforeSave,
    afterSave: () => refreshAll(),
    view: staffView, viewSize: "xl",
    viewFooter: () => [
      { label: "Salary records", icon: "bi-cash-coin", onClick: (r, ctx) => { ctx.close(); goTab("salary"); salPage.setFilter("staffId", r.id); } },
      { label: "Change status", icon: "bi-toggles", onClick: (r, ctx) => { ctx.close(); setTimeout(() => changeStatus(r), 320); } },
    ],
    actions: [
      { label: "Change status", icon: "bi-toggles", handler: (r) => changeStatus(r) },
      { label: "Add salary record", icon: "bi-cash-coin", show: isCurrent, handler: (r) => { goTab("salary"); salPage.openForm(null, { staffId: r.id, basic: r.salary }); } },
      { label: "Salary history", icon: "bi-clock-history", handler: (r) => { goTab("salary"); salPage.setFilter("staffId", r.id); } },
      { label: "Mark attendance", icon: "bi-calendar-check", show: isCurrent, handler: () => goTab("attendance") },
    ],
    beforeDelete: (s) => {
      const t = HH.store.all("maintenance").filter((x) => x.assignedTo === s.id && OPEN_TICKET(x)).length;
      const c = HH.store.all("complaints").filter((x) => x.assignedTo === s.id && OPEN_CMP(x)).length;
      if (t || c) return `${s.name} has ${t} open ticket(s) and ${c} open complaint(s) assigned. Reassign them before deleting, or mark the staff member as Resigned.`;
    },
    deleteMessage: (s) => `Delete <b>${esc(s.name)}</b> (${s.id})? Their salary and attendance records are kept for audit. Consider marking them <b>Resigned</b> instead.`,
    afterDelete: () => refreshAll(),
  });
  document.getElementById("staffRoot").addEventListener("click", (e) => {
    const b = e.target.closest("[data-dept]");
    if (b) staffPage.setFilter("department", staffPage.state.filters.department === b.dataset.dept ? "" : b.dataset.dept);
  });

  /* ========================================================= ATTENDANCE == */
  const att = { date: U.todayISO(), branch: "", dept: "", q: "", marks: {}, dirty: false, month: curMonth() };
  let summaryTable = null;

  function attRoster(date) {
    const sheet = HH.store.get("staffAttendance", sheetId(date));
    const marked = (sheet && sheet.marks) || {};
    return HH.store.all("staff").filter((s) => marked[s.id] || ((isCurrent(s) || (s.resignedOn && s.resignedOn > date)) && (!s.joinDate || s.joinDate <= date))).sort(byName);
  }
  function loadSheet() {
    const sheet = HH.store.get("staffAttendance", sheetId(att.date));
    const marks = Object.assign({}, (sheet && sheet.marks) || {});
    attRoster(att.date).forEach((s) => { if (!marks[s.id]) marks[s.id] = s.status === "On Leave" ? "L" : "P"; });
    att.marks = marks; att.dirty = false;
  }
  const visibleRoster = () => attRoster(att.date).filter((s) => (!att.branch || s.branch === att.branch) && (!att.dept || s.department === att.dept) && (!att.q || `${s.name} ${s.id} ${s.designation}`.toLowerCase().includes(att.q.toLowerCase())));

  function renderAttendance() {
    const host = document.getElementById("attRoot");
    host.innerHTML = `
      <section class="card-hh">
        <div class="card-hh__head"><span class="chip-icon tone-blue"><i class="bi bi-calendar-check"></i></span>
          <div><div class="card-hh__title">Daily staff attendance</div><div class="card-hh__sub" data-att-status></div></div>
          <div class="card-hh__tools">
            <button type="button" class="btn-hh btn-hh--sm btn-hh--icon" data-att-shift="-1" aria-label="Previous day"><i class="bi bi-chevron-left"></i></button>
            <input type="date" class="input-hh sa-date" data-att-date value="${att.date}" max="${U.todayISO()}" aria-label="Attendance date">
            <button type="button" class="btn-hh btn-hh--sm btn-hh--icon" data-att-shift="1" aria-label="Next day"><i class="bi bi-chevron-right"></i></button>
            <button type="button" class="btn-hh btn-hh--sm" data-att-today>Today</button>
          </div></div>
        <div class="sa-summary" data-att-summary></div>
        <div class="toolbar sa-toolbar">
          <div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" data-att-q placeholder="Search staff…" value="${esc(att.q)}" aria-label="Search staff"></div>
          <select class="select-hh" data-att-branch aria-label="Branch">${HH.ui.options(L.branchOptions(), att.branch, "All branches")}</select>
          <select class="select-hh" data-att-dept aria-label="Department">${HH.ui.options(L.list("departments"), att.dept, "All departments")}</select>
          <span class="spacer"></span>
          <span class="text-2 small">Mark all shown:</span>
          ${MARKS.map((m) => `<button type="button" class="btn-hh btn-hh--sm sa-bulk sa-bulk--${m.k}" data-att-bulk="${m.k}"><i class="bi ${m.icon}"></i>${m.label}</button>`).join("")}
        </div>
        <div data-att-grid></div>
        <div class="row-between sa-actions">
          <span class="text-2 small" data-att-dirty></span>
          <span class="row-flex"><button type="button" class="btn-hh" data-att-reset><i class="bi bi-arrow-counterclockwise"></i><span>Discard changes</span></button>
          <button type="button" class="btn-hh btn-hh--primary" data-att-save><i class="bi bi-check2"></i><span>Save attendance</span></button></span>
        </div>
      </section>
      <section class="card-hh card-hh--flush">
        <div class="card-hh__head"><span class="chip-icon tone-green"><i class="bi bi-bar-chart-line"></i></span>
          <div><div class="card-hh__title">Monthly attendance summary</div><div class="card-hh__sub" data-sum-sub></div></div>
          <div class="card-hh__tools">
            <input type="month" class="input-hh sa-month" data-sum-month value="${att.month}" max="${curMonth()}" aria-label="Summary month">
            <button type="button" class="btn-hh btn-hh--sm" data-sum-export><i class="bi bi-filetype-csv"></i>Export CSV</button>
            <button type="button" class="btn-hh btn-hh--sm" data-sum-print><i class="bi bi-printer"></i>Print</button>
          </div></div>
        <div data-sum-table></div>
      </section>`;
    renderGrid();
    summaryTable = new HH.Table(host.querySelector("[data-sum-table]"), { id: "staffAttSummary", columns: summaryColumns(), rows: [], pageSize: 10, sort: { key: "name", dir: "asc" }, compact: true });
    renderSummary();
  }

  function renderGrid() {
    const host = document.getElementById("attRoot");
    const sheet = HH.store.get("staffAttendance", sheetId(att.date));
    const list = visibleRoster();
    host.querySelector("[data-att-status]").innerHTML = `${U.fmtDate(att.date)} (${U.DAYS[U.parse(att.date).getDay()]}) · ${sheet ? `Saved sheet <b>${sheet.id}</b>${sheet.updatedAt ? ` · last updated ${U.fmtDateTime(sheet.updatedAt)}` : ""}` : `<span style="color:var(--orange)">Not saved yet — defaults shown</span>`}`;
    host.querySelector("[data-att-grid]").innerHTML = list.length ? `<div class="table-wrap"><table class="table-hh sa-table"><thead><tr><th>Staff</th><th>Designation</th><th>Shift</th><th>Branch</th><th class="t-right">Mark</th></tr></thead><tbody>
      ${list.map((s) => `<tr data-sid="${esc(s.id)}"><td>${HH.ui.person(s.name, s.id + (s.status !== "Active" ? " · " + s.status : ""), s.photo)}</td><td class="nowrap">${esc(s.designation)}</td><td>${shiftBadge(s.shift)}</td><td class="nowrap">${esc(L.branchName(s.branch))}</td>
        <td class="t-right"><div class="sa-toggle" role="radiogroup" aria-label="Attendance for ${esc(s.name)}">${toggleHTML(s.id)}</div></td></tr>`).join("")}
      </tbody></table></div>` : HH.ui.empty("No staff for this date / filter", "bi-people", "Staff who joined after this date are not listed.");
    updateSummaryChips();
  }
  const toggleHTML = (id) => MARKS.map((m) => `<button type="button" role="radio" aria-checked="${att.marks[id] === m.k}" class="sa-btn sa-btn--${m.k} ${att.marks[id] === m.k ? "is-active" : ""}" data-mark="${m.k}" data-staff="${esc(id)}" title="${m.label}">${m.k}</button>`).join("");

  function updateSummaryChips() {
    const host = document.getElementById("attRoot");
    const roster = attRoster(att.date);
    const cnt = (k) => roster.filter((s) => att.marks[s.id] === k).length;
    host.querySelector("[data-att-summary]").innerHTML = `
      <div class="sa-chip"><span class="sa-cell sa-P">P</span><div><b>${cnt("P")}</b><small>Present</small></div></div>
      <div class="sa-chip"><span class="sa-cell sa-A">A</span><div><b>${cnt("A")}</b><small>Absent</small></div></div>
      <div class="sa-chip"><span class="sa-cell sa-L">L</span><div><b>${cnt("L")}</b><small>Leave</small></div></div>
      <div class="sa-chip"><span class="sa-cell sa-H">H</span><div><b>${cnt("H")}</b><small>Holiday</small></div></div>
      <div class="sa-chip"><span class="chip-icon tone-blue"><i class="bi bi-percent"></i></span><div><b>${U.pct(cnt("P"), roster.length - cnt("H"))}%</b><small>Present of ${roster.length} staff</small></div></div>`;
    host.querySelector("[data-att-dirty]").innerHTML = att.dirty ? `<i class="bi bi-exclamation-circle" style="color:var(--orange)"></i> Unsaved changes` : "All changes saved";
  }

  async function confirmDiscard() {
    if (!att.dirty) return true;
    return HH.confirm("You have unsaved attendance changes for this date. Discard them?", { title: "Discard changes?", danger: true, okText: "Discard" });
  }
  async function setDate(d) {
    if (!d) return;
    if (d > U.todayISO()) { HH.toast("Attendance cannot be marked for a future date.", "error"); d = U.todayISO(); }
    if (d === att.date) { document.querySelector("[data-att-date]").value = d; return; }
    if (!(await confirmDiscard())) { document.querySelector("[data-att-date]").value = att.date; return; }
    att.date = d; loadSheet();
    document.querySelector("[data-att-date]").value = d;
    renderGrid();
  }

  function saveSheet() {
    if (att.date > U.todayISO()) return HH.toast("Attendance cannot be saved for a future date.", "error");
    const roster = attRoster(att.date);
    if (!roster.length) return HH.toast("No staff to mark for this date.", "warning");
    const marks = {};
    roster.forEach((s) => { if (att.marks[s.id]) marks[s.id] = att.marks[s.id]; });
    const existed = !!HH.store.get("staffAttendance", sheetId(att.date));
    HH.store.upsert("staffAttendance", { id: sheetId(att.date), date: att.date, marks, updatedAt: U.nowISO(), updatedBy: me() });
    att.dirty = false;
    renderGrid(); renderSummary();
    HH.toast(`Attendance ${existed ? "updated" : "saved"} for ${U.fmtDate(att.date)} (${Object.keys(marks).length} staff).`, "success");
  }

  function summaryRows() {
    const m = att.month;
    const sheets = HH.store.all("staffAttendance").filter((s) => s.date && s.date.startsWith(m));
    const ids = new Set();
    sheets.forEach((s) => Object.keys(s.marks || {}).forEach((id) => ids.add(id)));
    HH.store.all("staff").filter(isCurrent).forEach((s) => { if (!s.joinDate || s.joinDate.slice(0, 7) <= m) ids.add(s.id); });
    return [...ids].map((id) => {
      const s = L.staff(id) || { id, name: "(removed)", designation: "", department: "", branch: "" };
      const c = { P: 0, A: 0, L: 0, H: 0 };
      sheets.forEach((sh) => { const v = (sh.marks || {})[id]; if (c[v] != null) c[v]++; });
      const recorded = c.P + c.A + c.L + c.H;
      const working = recorded - c.H;
      return { id, name: s.name, photo: s.photo, designation: s.designation, department: s.department, branch: s.branch, status: s.status, ...c, recorded, pct: working ? U.pct(c.P, working) : 0 };
    });
  }
  function summaryColumns() {
    return [
      { key: "name", label: "Staff", render: (r) => HH.ui.person(r.name, `${r.id} · ${r.designation}`, r.photo) },
      { key: "department", label: "Department", cls: "nowrap" },
      { key: "P", label: "Present", cls: "t-right", thCls: "t-right" },
      { key: "A", label: "Absent", cls: "t-right", thCls: "t-right" },
      { key: "L", label: "Leave", cls: "t-right", thCls: "t-right" },
      { key: "H", label: "Holiday", cls: "t-right", thCls: "t-right" },
      { key: "recorded", label: "Days recorded", cls: "t-right", thCls: "t-right" },
      { key: "pct", label: "Present %", render: (r) => `<div class="sa-pct">${HH.ui.progress(r.pct, r.pct >= 90 ? "var(--green)" : r.pct >= 75 ? "var(--yellow-600)" : "var(--red)")}<b>${r.recorded ? r.pct + "%" : "—"}</b></div>` },
    ];
  }
  function renderSummary() {
    if (!summaryTable) return;
    const rows = summaryRows();
    const sheets = HH.store.all("staffAttendance").filter((s) => s.date && s.date.startsWith(att.month)).length;
    const avg = rows.filter((r) => r.recorded).length ? Math.round(U.sum(rows.filter((r) => r.recorded), (r) => r.pct) / rows.filter((r) => r.recorded).length) : 0;
    document.querySelector("[data-sum-sub]").textContent = `${U.monthLabel(att.month)} · ${sheets} day sheet(s) recorded · average present ${avg}% · Present % excludes holidays`;
    summaryTable.setRows(rows, true);
  }
  const summaryCsv = () => [
    { label: "Staff ID", value: (r) => r.id }, { label: "Name", value: (r) => r.name }, { label: "Designation", value: (r) => r.designation }, { label: "Department", value: (r) => r.department },
    { label: "Branch", value: (r) => L.branchName(r.branch) }, { label: "Present", value: (r) => r.P }, { label: "Absent", value: (r) => r.A }, { label: "Leave", value: (r) => r.L },
    { label: "Holiday", value: (r) => r.H }, { label: "Days Recorded", value: (r) => r.recorded }, { label: "Present %", value: (r) => (r.recorded ? r.pct + "%" : "") },
  ];

  const attRootEl = document.getElementById("attRoot");
  attRootEl.addEventListener("click", (e) => {
    const mk = e.target.closest("[data-mark]");
    if (mk) {
      att.marks[mk.dataset.staff] = mk.dataset.mark; att.dirty = true;
      mk.closest(".sa-toggle").innerHTML = toggleHTML(mk.dataset.staff);
      updateSummaryChips(); return;
    }
    const bulk = e.target.closest("[data-att-bulk]");
    if (bulk) {
      const list = visibleRoster();
      if (!list.length) return HH.toast("No staff shown to mark.", "warning");
      list.forEach((s) => (att.marks[s.id] = bulk.dataset.attBulk));
      att.dirty = true; renderGrid();
      HH.toast(`${list.length} staff marked ${MARK_LABEL[bulk.dataset.attBulk]}. Remember to save.`, "info"); return;
    }
    const sh = e.target.closest("[data-att-shift]");
    if (sh) { setDate(U.addDays(att.date, +sh.dataset.attShift)); return; }
    if (e.target.closest("[data-att-today]")) { setDate(U.todayISO()); return; }
    if (e.target.closest("[data-att-save]")) { saveSheet(); return; }
    if (e.target.closest("[data-att-reset]")) {
      if (!att.dirty) return HH.toast("There are no unsaved changes.", "info");
      confirmDiscard().then((ok) => { if (ok) { loadSheet(); renderGrid(); HH.toast("Changes discarded.", "info"); } }); return;
    }
    if (e.target.closest("[data-sum-export]")) {
      const rows = summaryTable.sortedRows();
      if (!rows.length) return HH.toast("Nothing to export for this month.", "warning");
      HH.exportCSV(`staff-attendance-${att.month}.csv`, summaryCsv(), rows); return;
    }
    if (e.target.closest("[data-sum-print]")) HH.printTable(`Staff Attendance · ${U.monthLabel(att.month)}`, summaryCsv(), summaryTable.sortedRows(), document.querySelector("[data-sum-sub]").textContent);
  });
  attRootEl.addEventListener("change", (e) => {
    if (e.target.matches("[data-att-date]")) setDate(e.target.value);
    if (e.target.matches("[data-att-branch]")) { att.branch = e.target.value; renderGrid(); }
    if (e.target.matches("[data-att-dept]")) { att.dept = e.target.value; renderGrid(); }
    if (e.target.matches("[data-sum-month]")) {
      let v = e.target.value || curMonth();
      if (v > curMonth()) { HH.toast("Summary month cannot be in the future.", "error"); v = curMonth(); e.target.value = v; }
      att.month = v; renderSummary();
    }
  });
  attRootEl.addEventListener("input", U.debounce((e) => { if (e.target.matches("[data-att-q]")) { att.q = e.target.value.trim(); renderGrid(); } }, 180));
  window.addEventListener("beforeunload", (e) => { if (att.dirty) { e.preventDefault(); e.returnValue = ""; } });

  /* ============================================================ SALARY === */
  let recordExpenseOnSave = false;
  function salFields(rec) {
    const staffOpts = HH.store.all("staff").filter((s) => isCurrent(s) || (rec && rec.staffId === s.id)).sort(byName).map((s) => ({ value: s.id, label: `${s.name} — ${s.designation}${s.status !== "Active" ? " (" + s.status + ")" : ""}` }));
    const wasPaid = rec && rec.status === "Paid";
    return [
      { name: "staffId", label: "Staff member", type: "select", required: true, col: 8, options: staffOpts,
        onChange: (v, f) => { const s = L.staff(v); if (s) { f.elements.basic.value = s.salary; const last = lastSalary(s.id); if (last) { f.elements.allowances.value = last.allowances || 0; f.elements.deductions.value = last.deductions || 0; } recalc(f); } } },
      { name: "month", label: "Salary month", type: "month", required: true, col: 4, max: curMonth(), validate: (v) => (v > curMonth() ? "Salary month cannot be in the future." : "") },
      { name: "basic", label: "Basic (₹)", type: "number", required: true, col: 3, min: 0, step: 100 },
      { name: "allowances", label: "Allowances (₹)", type: "number", col: 3, min: 0, step: 100 },
      { name: "deductions", label: "Deductions (₹)", type: "number", col: 3, min: 0, step: 100 },
      { name: "net", label: "Net pay (₹)", type: "number", col: 3, readonly: true, help: "Basic + allowances − deductions" },
      { name: "status", label: "Status", type: "select", required: true, col: 4, options: ["Pending", "Paid"],
        onChange: (v, f) => { if (v === "Paid") { if (!f.elements.paidOn.value) f.elements.paidOn.value = U.todayISO(); if (!f.elements.method.value) f.elements.method.value = L.list("paymentMethods").includes("Bank Transfer") ? "Bank Transfer" : L.list("paymentMethods")[0] || ""; } } },
      { name: "paidOn", label: "Paid on", type: "date", col: 4, max: U.todayISO(), help: "Required when status is Paid." },
      { name: "method", label: "Payment method", type: "select", col: 4, options: L.list("paymentMethods") },
      wasPaid ? null : { name: "recordExpense", label: "Expense entry", type: "switch", col: 12, default: true, switchLabel: "When saved as Paid, also record a “Staff Salary” expense (Approved)" },
    ].filter(Boolean);
  }
  const lastSalary = (staffId) => HH.store.all("salaries").filter((x) => x.staffId === staffId).sort((a, b) => b.month.localeCompare(a.month))[0];
  function recalc(f) {
    const n = (k) => Number(f.elements[k].value) || 0;
    f.elements.net.value = n("basic") + n("allowances") - n("deductions");
  }
  function salBeforeSave(d, prev) {
    const wantExpense = !!d.recordExpense; delete d.recordExpense;
    if (!L.staff(d.staffId)) return "Select a valid staff member.";
    if (d.month > curMonth()) return "Salary month cannot be in the future.";
    const dup = HH.store.all("salaries").find((x) => x.id !== (prev && prev.id) && x.staffId === d.staffId && x.month === d.month);
    if (dup) return `${L.staffName(d.staffId)} already has a salary record for ${U.monthLabel(d.month)} (${dup.id}). Edit that record instead.`;
    ["basic", "allowances", "deductions"].forEach((k) => (d[k] = Number(d[k]) || 0));
    if (d.basic <= 0) return "Basic salary must be greater than zero.";
    d.net = d.basic + d.allowances - d.deductions;
    if (d.net < 0) return "Deductions cannot exceed basic + allowances.";
    if (d.status === "Paid") {
      if (!d.paidOn) return "Enter the payment date for a paid salary.";
      if (!d.method) return "Select the payment method for a paid salary.";
      if (d.paidOn < d.month + "-01") return `Payment date cannot be before ${U.monthLabel(d.month)} starts.`;
      if (d.paidOn > U.todayISO()) return "Payment date cannot be in the future.";
    } else { d.paidOn = ""; d.method = ""; }
    recordExpenseOnSave = wantExpense && d.status === "Paid" && (!prev || prev.status !== "Paid");
  }

  function createExpense(recs, paidOn, method) {
    const total = U.sum(recs, (r) => r.net);
    const months = [...new Set(recs.map((r) => r.month))].sort();
    const branches = [...new Set(recs.map((r) => (L.staff(r.staffId) || {}).branch).filter(Boolean))];
    const cats = L.list("expenseCategories");
    const cat = cats.includes("Staff Salary") ? "Staff Salary" : cats.find((c) => /salar/i.test(c)) || "Staff Salary";
    const exp = HH.store.insert("expenses", {
      date: paidOn, category: cat, amount: total, vendor: "Payroll", method, attachment: null,
      description: `Staff salary — ${months.map(U.monthLabel).join(", ")} (${recs.length} staff)`,
      branch: branches.length === 1 ? branches[0] : (L.branches()[0] || {}).id || "", status: "Approved", approvedBy: me(),
      notes: `Auto-created from salary records: ${recs.map((r) => r.id).join(", ")}`,
    });
    recs.forEach((r) => HH.store.update("salaries", r.id, { expenseId: exp.id }));
    return exp;
  }

  function markPaid(rows) {
    const pend = rows.filter((r) => r.status === "Pending");
    if (!pend.length) return HH.toast("The selected salary record(s) are already paid.", "warning");
    const total = U.sum(pend, (r) => r.net);
    const methods = L.list("paymentMethods");
    HH.formModal({
      title: pend.length === 1 ? `Mark paid · ${pend[0].id}` : `Mark ${pend.length} salaries paid`, icon: "bi-check2-circle", size: "md", values: {}, submitText: "Mark as paid",
      fields: [
        { type: "html", html: `<div class="alert-hh tone-blue"><i class="bi bi-cash-stack"></i><span><b>${pend.length}</b> pending record(s) · total net <b>${U.fmtMoney(total)}</b>${pend.length === 1 ? ` · ${esc(L.staffName(pend[0].staffId))}, ${U.monthLabel(pend[0].month)}` : ""}${rows.length > pend.length ? ` · ${rows.length - pend.length} already paid record(s) skipped` : ""}</span><span></span></div>` },
        { name: "paidOn", label: "Paid on", type: "date", required: true, col: 6, default: U.todayISO(), max: U.todayISO() },
        { name: "method", label: "Payment method", type: "select", required: true, col: 6, options: methods, default: methods.includes("Bank Transfer") ? "Bank Transfer" : methods[0] },
        { name: "recordExpense", label: "Expense entry", type: "switch", default: true, switchLabel: `Record one “Staff Salary” expense (Approved) for ${U.fmtMoney(total)}` },
        { type: "html", html: `<div class="text-2 small"><i class="bi bi-info-circle"></i> Demo mode — no money is transferred. The expense appears in Expenses and the finance reports.</div>` },
      ],
      onSubmit: (d) => {
        const early = pend.find((r) => d.paidOn < r.month + "-01");
        if (early) return `Payment date cannot be before ${U.monthLabel(early.month)} starts (${early.id}).`;
        const updated = pend.map((r) => HH.store.update("salaries", r.id, { status: "Paid", paidOn: d.paidOn, method: d.method }));
        let exp = null;
        if (d.recordExpense) exp = createExpense(updated, d.paidOn, d.method);
        salPage.table.clearSelection();
        salPage.refresh();
        HH.toast(`${updated.length} salary record(s) marked paid (${U.fmtMoney(total)}).${exp ? ` Expense ${exp.id} recorded.` : ""}`, "success");
        return true;
      },
    });
  }

  function eligibleFor(month, branch) {
    const have = new Set(HH.store.all("salaries").filter((r) => r.month === month).map((r) => r.staffId));
    return HH.store.all("staff").filter((s) => isCurrent(s) && (!branch || branch === "All" || s.branch === branch) && (!s.joinDate || s.joinDate.slice(0, 7) <= month) && !have.has(s.id));
  }
  function generatePayroll() {
    HH.formModal({
      title: "Generate payroll", icon: "bi-magic", size: "md", values: {}, submitText: "Generate records",
      fields: [
        { name: "month", label: "Salary month", type: "month", required: true, col: 6, default: curMonth(), max: curMonth(), validate: (v) => (v > curMonth() ? "Salary month cannot be in the future." : "") },
        { name: "branch", label: "Branch", type: "select", required: true, col: 6, options: L.branchOptions(true), default: "All" },
        { type: "html", html: `<div class="alert-hh tone-blue" data-gen-preview></div>` },
      ],
      onReady: (f) => {
        const upd = () => {
          const m = f.elements.month.value; const box = f.querySelector("[data-gen-preview]");
          if (!m) { box.innerHTML = `<i class="bi bi-info-circle"></i><span>Choose a month.</span><span></span>`; return; }
          const list = eligibleFor(m, f.elements.branch.value);
          box.className = `alert-hh ${list.length ? "tone-blue" : "tone-green"}`;
          box.innerHTML = list.length
            ? `<i class="bi bi-people"></i><span><b>${list.length}</b> active staff have no record for ${U.monthLabel(m)} · basic total <b>${U.fmtMoney(U.sum(list, (s) => s.salary))}</b>. Pending records will be created using each person's current salary; allowances and deductions are carried forward from their previous record.</span><span></span>`
            : `<i class="bi bi-check-circle"></i><span>Every eligible staff member already has a salary record for ${U.monthLabel(m)}.</span><span></span>`;
        };
        f.addEventListener("change", upd); f.addEventListener("input", upd); upd();
      },
      onSubmit: (d) => {
        if (d.month > curMonth()) return "Salary month cannot be in the future.";
        const list = eligibleFor(d.month, d.branch);
        if (!list.length) return `Every eligible staff member already has a salary record for ${U.monthLabel(d.month)}.`;
        list.forEach((s) => {
          const last = lastSalary(s.id) || {};
          const basic = Number(s.salary) || 0, allowances = Number(last.allowances) || 0, deductions = Number(last.deductions) || 0;
          HH.store.insert("salaries", { staffId: s.id, month: d.month, basic, allowances, deductions, net: Math.max(0, basic + allowances - deductions), status: "Pending", paidOn: "", method: "" });
        });
        HH.toast(`${list.length} pending salary record(s) generated for ${U.monthLabel(d.month)}.`, "success");
        salPage.state.filters.status = "";
        salPage.setFilter("month", d.month);
        return true;
      },
    });
  }

  function printPayslip(r) {
    const s = L.staff(r.staffId) || { name: L.staffName(r.staffId) };
    HH.printHTML(`Payslip · ${U.monthLabel(r.month)}`, `
      <div class="grid"><div class="box"><div class="lbl">Employee</div><div class="val">${esc(s.name)} (${esc(r.staffId)})</div><div class="muted">${esc(s.designation || "")} · ${esc(s.department || "")} · ${esc(L.branchName(s.branch))}</div></div>
      <div class="box"><div class="lbl">Pay period</div><div class="val">${U.monthLabel(r.month)}</div><div class="muted">Slip ${esc(r.id)} · ${r.status === "Paid" ? `Paid on ${U.fmtDate(r.paidOn)} via ${esc(r.method)}` : "Payment pending"}</div></div></div>
      <table><thead><tr><th>Component</th><th class="r">Amount</th></tr></thead><tbody>
        <tr><td>Basic salary</td><td class="r">${U.fmtMoney(r.basic)}</td></tr>
        <tr><td>Allowances</td><td class="r">${U.fmtMoney(r.allowances)}</td></tr>
        <tr><td>Deductions</td><td class="r">- ${U.fmtMoney(r.deductions)}</td></tr>
        <tr class="tot"><td>Net pay</td><td class="r">${U.fmtMoney(r.net)}</td></tr></tbody></table>
      <p style="margin-top:16px"><span class="stamp" style="color:${r.status === "Paid" ? "#10B981" : "#FF8A1F"}">${r.status.toUpperCase()}</span></p>`, { subtitle: `${s.name} · ${U.monthLabel(r.month)}` });
  }

  function salaryReport() {
    const rows = salPage.table.sortedRows();
    if (!rows.length) return HH.toast("No salary records match the current filters.", "warning");
    const g = U.groupBy(rows, (r) => r.month);
    const months = Object.keys(g).sort().reverse();
    const tot = (list, k) => U.sum(list, (r) => r[k]);
    const paid = rows.filter((r) => r.status === "Paid"), pend = rows.filter((r) => r.status === "Pending");
    const byDept = U.groupBy(rows, (r) => (L.staff(r.staffId) || {}).department || "—");
    HH.printHTML("Salary Report", `
      <div class="cards"><div class="card"><span class="muted">Records</span><b>${rows.length}</b></div><div class="card"><span class="muted">Net payroll</span><b>${U.fmtMoney(tot(rows, "net"))}</b></div>
      <div class="card"><span class="muted">Paid</span><b>${U.fmtMoney(tot(paid, "net"))}</b></div><div class="card"><span class="muted">Pending</span><b>${U.fmtMoney(tot(pend, "net"))}</b></div></div>
      <h2>By month</h2><table><thead><tr><th>Month</th><th class="r">Staff</th><th class="r">Basic</th><th class="r">Allowances</th><th class="r">Deductions</th><th class="r">Net</th><th class="r">Paid</th><th class="r">Pending</th></tr></thead><tbody>
      ${months.map((m) => { const l = g[m]; return `<tr><td>${U.monthLabel(m)}</td><td class="r">${l.length}</td><td class="r">${U.fmtMoney(tot(l, "basic"))}</td><td class="r">${U.fmtMoney(tot(l, "allowances"))}</td><td class="r">${U.fmtMoney(tot(l, "deductions"))}</td><td class="r">${U.fmtMoney(tot(l, "net"))}</td><td class="r">${U.fmtMoney(tot(l.filter((r) => r.status === "Paid"), "net"))}</td><td class="r">${U.fmtMoney(tot(l.filter((r) => r.status === "Pending"), "net"))}</td></tr>`; }).join("")}
      <tr class="tot"><td>Total</td><td class="r">${rows.length}</td><td class="r">${U.fmtMoney(tot(rows, "basic"))}</td><td class="r">${U.fmtMoney(tot(rows, "allowances"))}</td><td class="r">${U.fmtMoney(tot(rows, "deductions"))}</td><td class="r">${U.fmtMoney(tot(rows, "net"))}</td><td class="r">${U.fmtMoney(tot(paid, "net"))}</td><td class="r">${U.fmtMoney(tot(pend, "net"))}</td></tr></tbody></table>
      <h2>By department</h2><table><thead><tr><th>Department</th><th class="r">Records</th><th class="r">Net</th></tr></thead><tbody>
      ${Object.keys(byDept).sort().map((d) => `<tr><td>${esc(d)}</td><td class="r">${byDept[d].length}</td><td class="r">${U.fmtMoney(tot(byDept[d], "net"))}</td></tr>`).join("")}</tbody></table>
      <h2>Records</h2><table><thead><tr><th>ID</th><th>Staff</th><th>Month</th><th class="r">Net</th><th>Status</th><th>Paid on</th><th>Method</th></tr></thead><tbody>
      ${rows.map((r) => `<tr><td>${esc(r.id)}</td><td>${esc(L.staffName(r.staffId))}</td><td>${U.monthLabel(r.month)}</td><td class="r">${U.fmtMoney(r.net)}</td><td>${esc(r.status)}</td><td>${U.fmtDate(r.paidOn)}</td><td>${esc(r.method || "—")}</td></tr>`).join("")}</tbody></table>`,
    { subtitle: salPage.filterSummary() });
  }

  const salCsv = [
    ["Salary ID", (r) => r.id], ["Staff ID", (r) => r.staffId], ["Staff", (r) => L.staffName(r.staffId)], ["Designation", (r) => (L.staff(r.staffId) || {}).designation || ""],
    ["Department", (r) => (L.staff(r.staffId) || {}).department || ""], ["Month", (r) => r.month], ["Basic", (r) => r.basic], ["Allowances", (r) => r.allowances],
    ["Deductions", (r) => r.deductions], ["Net", (r) => r.net], ["Status", (r) => r.status], ["Paid On", (r) => r.paidOn], ["Method", (r) => r.method], ["Expense", (r) => r.expenseId || ""],
  ].map(([label, value]) => ({ label, value }));

  const salPage = HH.CrudPage({
    mount: "#salRoot", actionsHost: "inline", deepLinks: false, tableId: "-list",
    collection: "salaries", entity: "Salary Record", entityPlural: "Salary records", icon: "bi-cash-coin", addLabel: "Add Salary", viewIcon: "bi-cash-coin",
    searchPlaceholder: "Search staff, ID, month…",
    search: (r) => `${r.id} ${L.staffName(r.staffId)} ${r.staffId} ${r.month} ${U.monthLabel(r.month)} ${r.method || ""}`,
    filters: [
      { key: "month", label: "All months", options: () => [...new Set(HH.store.all("salaries").map((r) => r.month))].sort().reverse().map((m) => ({ value: m, label: U.monthLabel(m) })) },
      { key: "staffId", label: "All staff", options: () => HH.store.all("staff").slice().sort(byName).map((s) => ({ value: s.id, label: s.name })) },
      { key: "dept", label: "All departments", options: () => L.list("departments"), match: (r, v) => (L.staff(r.staffId) || {}).department === v },
      { key: "status", label: "Any status", options: ["Paid", "Pending"] },
    ],
    dateFilter: { key: "paidOn", label: "Paid on" },
    defaultSort: { key: "month", dir: "desc" },
    columns: [
      { key: "staffId", label: "Staff", value: (r) => L.staffName(r.staffId), render: (r) => { const s = L.staff(r.staffId); return HH.ui.person(L.staffName(r.staffId), s ? `${r.id} · ${s.designation}` : r.id, s && s.photo); } },
      { key: "month", label: "Month", render: (r) => U.monthLabel(r.month), cls: "nowrap" },
      { key: "basic", label: "Basic", render: (r) => money(r.basic), cls: "t-right", thCls: "t-right" },
      { key: "allowances", label: "Allow.", render: (r) => money(r.allowances), cls: "t-right", thCls: "t-right" },
      { key: "deductions", label: "Deduct.", render: (r) => money(r.deductions), cls: "t-right", thCls: "t-right" },
      { key: "net", label: "Net Pay", render: (r) => `<b>${money(r.net)}</b>`, cls: "t-right", thCls: "t-right" },
      { key: "status", label: "Status", render: (r) => HH.ui.badge(r.status) },
      { key: "paidOn", label: "Paid On", render: (r) => U.fmtDate(r.paidOn), cls: "nowrap" },
      { key: "method", label: "Method", render: (r) => esc(r.method || "—"), cls: "nowrap" },
    ],
    footerRow: (rows) => `<tr><td></td><td colspan="2">Total · ${rows.length} record(s)</td><td class="t-right">${money(U.sum(rows, (r) => r.basic))}</td><td class="t-right">${money(U.sum(rows, (r) => r.allowances))}</td><td class="t-right">${money(U.sum(rows, (r) => r.deductions))}</td><td class="t-right">${money(U.sum(rows, (r) => r.net))}</td><td colspan="4"></td></tr>`,
    csvColumns: salCsv, exportName: "salaries", printTitle: "Salary Records",
    stats: (all) => {
      const m = curMonth(), lm = prevMonth(m), y = U.todayISO().slice(0, 4);
      const thisM = all.filter((r) => r.month === m);
      const pend = all.filter((r) => r.status === "Pending");
      const lastPaid = all.filter((r) => r.month === lm && r.status === "Paid");
      const missing = eligibleFor(m).length;
      return [
        { label: `Payroll · ${U.monthLabel(m)}`, value: U.fmtMoney(U.sum(thisM, (r) => r.net)), icon: "bi-calendar3", tone: "blue", meta: `${thisM.length} record(s) this month`, onClick: () => salPage.setFilter("month", m) },
        { label: "Pending Payouts", value: U.fmtMoney(U.sum(pend, (r) => r.net)), icon: "bi-hourglass-split", tone: "orange", meta: `${pend.length} record(s) awaiting payment`, onClick: () => salPage.setFilter("status", "Pending") },
        { label: `Paid · ${U.monthLabel(lm)}`, value: U.fmtMoney(U.sum(lastPaid, (r) => r.net)), icon: "bi-check2-circle", tone: "green", meta: `${lastPaid.length} staff paid`, onClick: () => salPage.setFilter("month", lm) },
        { label: `Paid in ${y}`, value: U.fmtMoney(U.sum(all.filter((r) => r.status === "Paid" && String(r.paidOn).startsWith(y)), (r) => r.net)), icon: "bi-wallet2", tone: "purple", meta: "Net salary disbursed" },
        { label: "Missing This Month", value: missing, icon: "bi-person-exclamation", tone: missing ? "red" : "green", meta: missing ? "Click to generate payroll" : "All staff covered", onClick: () => generatePayroll() },
      ];
    },
    fields: salFields, formSize: "lg",
    defaults: () => ({ month: curMonth(), status: "Pending", allowances: 0, deductions: 0 }),
    presetsFromQuery: (p) => { const out = {}; const sid = p.staff || p.staffId; if (sid && L.staff(sid)) { const s = L.staff(sid); out.staffId = sid; out.basic = s.salary; } if (p.month) out.month = p.month; return out; },
    onFormReady: (f, ctx, rec) => {
      if (!rec && f.elements.staffId.value && !f.elements.basic.value) { const s = L.staff(f.elements.staffId.value); if (s) f.elements.basic.value = s.salary; }
      if (!rec && f.elements.staffId.value) { const last = lastSalary(f.elements.staffId.value); if (last && f.elements.allowances.value === "0" && f.elements.deductions.value === "0") { f.elements.allowances.value = last.allowances || 0; f.elements.deductions.value = last.deductions || 0; } }
      recalc(f);
      f.addEventListener("input", (e) => { if (["basic", "allowances", "deductions"].includes(e.target.name)) recalc(f); });
    },
    beforeSave: salBeforeSave,
    afterSave: (saved) => {
      if (recordExpenseOnSave) { const exp = createExpense([saved], saved.paidOn, saved.method); HH.toast(`Expense ${exp.id} recorded under Staff Salary.`, "info"); }
      recordExpenseOnSave = false;
    },
    view: (r) => {
      const s = L.staff(r.staffId);
      return `<div class="stack">
        <div class="detail-head"><img class="avatar avatar--lg" src="${U.avatar(L.staffName(r.staffId), s && s.photo)}" alt="">
          <div style="min-width:0"><h3>${esc(L.staffName(r.staffId))}</h3><div class="text-2">${s ? `${esc(s.designation)} · ${esc(s.department)} · ${esc(L.branchName(s.branch))}` : esc(r.staffId)}</div><div class="row-flex mt-2">${HH.ui.badge(r.status)} <span class="badge-hh tone-gray">${U.monthLabel(r.month)}</span></div></div>
          <div class="sm-salary-tag"><div class="kv__label">Net pay</div><div class="money fw-800">${U.fmtMoney(r.net)}</div></div></div>
        <div class="detail-block">${HH.ui.kv([
          ["Basic", U.fmtMoney(r.basic)], ["Allowances", U.fmtMoney(r.allowances)], ["Deductions", U.fmtMoney(r.deductions)],
          ["Status", HH.ui.badge(r.status)], ["Paid on", U.fmtDate(r.paidOn)], ["Method", esc(r.method || "—")],
          ["Expense entry", r.expenseId ? `<a class="link-hh" href="expenses.html?view=${esc(r.expenseId)}">${esc(r.expenseId)}</a>` : "—"],
          ["Staff profile", s ? `<a class="link-hh" href="staff-management.html?view=${esc(s.id)}#staff">${esc(s.id)}</a>` : "—"],
        ], 3)}</div></div>`;
    },
    viewFooter: (r) => [
      ...(r.status === "Pending" ? [{ label: "Mark paid", icon: "bi-check2-circle", cls: "btn-hh--green", onClick: (rec, ctx) => { ctx.close(); setTimeout(() => markPaid([rec]), 320); } }] : []),
      { label: "Print payslip", icon: "bi-printer", onClick: (rec) => printPayslip(rec) },
    ],
    actions: [
      { label: "Mark paid", icon: "bi-check2-circle", show: (r) => r.status === "Pending", handler: (r) => markPaid([r]) },
      { label: "Print payslip", icon: "bi-printer", handler: (r) => printPayslip(r) },
      { label: "Open staff profile", icon: "bi-person", show: (r) => !!L.staff(r.staffId), handler: (r) => { goTab("staff"); staffPage.openView(r.staffId); } },
    ],
    toolbarButtons: [
      { label: "Generate payroll", icon: "bi-magic", cls: "btn-hh--soft-blue", handler: () => generatePayroll() },
      { label: "Salary report", icon: "bi-file-earmark-bar-graph", handler: () => salaryReport() },
    ],
    bulkActions: [
      { label: "Mark paid", icon: "bi-check2-circle", handler: (rows) => markPaid(rows) },
      { label: "Export selected", icon: "bi-filetype-csv", handler: (rows) => HH.exportCSV(`salaries-selected-${U.todayISO()}.csv`, salCsv, rows) },
    ],
    deleteMessage: (r) => `Delete salary record <b>${esc(r.id)}</b> for ${esc(L.staffName(r.staffId))}, ${U.monthLabel(r.month)}?${r.expenseId ? ` The linked expense ${esc(r.expenseId)} is <b>not</b> removed — adjust it in Expenses if needed.` : ""}`,
  });

  /* ------------------------------------------------------- tabs & sync --- */
  function refreshAll() {
    staffPage.refresh();
    salPage.setFilter("staffId", salPage.state.filters.staffId || "");
    if (!att.dirty) { loadSheet(); renderGrid(); }
    renderSummary();
  }
  window.addEventListener("hh:datachange", U.debounce((e) => {
    const col = e.detail && e.detail.col;
    if (col === "*" || (e.detail && e.detail.external)) refreshAll();
  }, 200));

  loadSheet();
  renderAttendance();
  tabs = HH.ui.tabs(document.getElementById("smTabs"), [
    { key: "staff", label: "Staff Directory", icon: "bi-people" },
    { key: "attendance", label: "Attendance", icon: "bi-calendar-check" },
    { key: "salary", label: "Salary Records", icon: "bi-cash-coin" },
  ], (k) => { curTab = k; HH.ui.panels(root, k); }, { hash: true });

  // Deep links: ?view=STF-…/SAL-…, ?edit=…, ?action=add (tab-aware; &staff=STF-… opens a salary form)
  setTimeout(() => {
    const v = U.qs("view"), ed = U.qs("edit"), act = U.qs("action");
    const presets = {};
    new URLSearchParams(location.search).forEach((val, key) => { if (!["action", "view", "edit", "q"].includes(key)) presets[key] = val; });
    if (v && HH.store.get("staff", v)) { goTab("staff"); staffPage.openView(v); }
    else if (v && HH.store.get("salaries", v)) { goTab("salary"); salPage.openView(v); }
    else if (ed && HH.store.get("staff", ed)) { goTab("staff"); staffPage.openForm(ed); }
    else if (ed && HH.store.get("salaries", ed)) { goTab("salary"); salPage.openForm(ed); }
    else if (act === "add") {
      if (curTab === "salary" || presets.staff) { goTab("salary"); salPage.openForm(null, salPage.cfg.presetsFromQuery(presets)); }
      else if (curTab === "attendance") { if (presets.date && presets.date <= U.todayISO()) setDate(presets.date); }
      else staffPage.openForm(null, presets);
    }
    if (v || ed || act) U.setQS({ view: null, edit: null, action: null, staff: null });
  }, 60);
})();
