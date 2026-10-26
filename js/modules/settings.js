/* ==========================================================================
   HostelHub — Settings module
   Settings live in one object (HH.store.settings()). Every write deep-copies
   the cached object, modifies the copy and saves it with saveSettings().
   Tabs: #profile #branches #lookups #preferences #roles #data
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const root = document.getElementById("moduleRoot");

  const S = () => HH.store.settings();
  const copy = () => JSON.parse(JSON.stringify(S()));
  const all = (c) => HH.store.all(c);
  const P = (p) => U.page(p);
  const plural = (n, w, pl) => `${U.fmtNum(n)} ${n === 1 ? w : pl || w + "s"}`;
  const norm = (s) => String(s || "").trim().toLowerCase();

  function nextId(list, prefix) {
    let max = 0;
    (list || []).forEach((x) => { if (x && typeof x.id === "string" && x.id.startsWith(prefix)) { const n = parseInt(x.id.slice(prefix.length), 10); if (!isNaN(n) && n > max) max = n; } });
    return prefix + (max + 1);
  }
  function reloadWith(msg) { sessionStorage.setItem("hh:flash", msg); location.reload(); }

  /** Render an inline (non-modal) form with Save / Reset. */
  function inlineForm(host, fields, values, onSave, opts = {}) {
    host.innerHTML = `${HH.form.build(fields, values)}<div class="set-actions"><button type="button" class="btn-hh btn-hh--ghost" data-reset><i class="bi bi-arrow-counterclockwise"></i>Reset</button><button type="button" class="btn-hh btn-hh--primary" data-save><i class="bi bi-check2"></i>${esc(opts.saveText || "Save changes")}</button></div>`;
    const formEl = host.querySelector("form");
    HH.form.wire(formEl, fields, values);
    const submit = () => {
      if (!HH.validate.form(formEl, fields)) { HH.toast("Please fix the highlighted fields.", "error"); return; }
      const res = onSave(HH.form.read(formEl, fields), formEl);
      if (typeof res === "string") HH.toast(res, "error");
    };
    formEl.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    formEl.addEventListener("change", (e) => {
      const f = fields.find((x) => x.name === e.target.name);
      if (f && f.onChange) f.onChange(e.target.value, formEl);
      if (f && e.target.closest(".field.has-error")) HH.validate.field(formEl, f);
    });
    formEl.addEventListener("input", (e) => { const f = fields.find((x) => x.name === e.target.name); if (f && f.onInput) f.onInput(e.target.value, formEl); });
    host.querySelector("[data-save]").addEventListener("click", submit);
    host.querySelector("[data-reset]").addEventListener("click", () => { inlineForm(host, fields, typeof opts.values === "function" ? opts.values() : values, onSave, opts); opts.onReady && opts.onReady(host.querySelector("form")); HH.toast("Form reset to the saved values.", "info"); });
    opts.onReady && opts.onReady(formEl);
    return formEl;
  }
  function blockedModal(title, html) {
    HH.modal({ title, icon: "bi-shield-exclamation", size: "md", body: `<div class="stack">${html}</div>`, footer: [{ label: "OK, got it", cls: "btn-hh--dark", close: true }] });
  }
  const usageHTML = (usage) => `<ul class="set-usage">${usage.filter((u) => u.count).map((u) => `<li><span class="chip-icon tone-orange"><i class="bi ${u.icon || "bi-link-45deg"}"></i></span><span><b>${plural(u.count, u.label, u.plural)}</b>${u.href ? ` · <a class="link-hh" href="${P(u.href)}">Open ${esc(u.page || "page")}</a>` : ""}</span></li>`).join("")}</ul>`;
  const usageText = (usage) => { const u = usage.filter((x) => x.count); return u.length ? u.map((x) => plural(x.count, x.label, x.plural)).join(" · ") : ""; };

  /* ================================================================ UI === */
  const TABS = [
    { key: "profile", label: "Hostel Profile", icon: "bi-building" },
    { key: "branches", label: "Branches", icon: "bi-diagram-3" },
    { key: "lookups", label: "Lookups & Categories", icon: "bi-list-ul" },
    { key: "preferences", label: "Preferences", icon: "bi-sliders" },
    { key: "roles", label: "Users & Roles", icon: "bi-people" },
    { key: "data", label: "Demo Data", icon: "bi-database" },
  ];
  root.innerHTML = `<section class="card-hh card-hh--flush"><div data-tabs style="padding:0 var(--sp-5)"></div></section>
    ${TABS.map((t) => `<div class="stack set-panel" data-panel="${t.key}" hidden style="gap:var(--gutter)"></div>`).join("")}`;
  const panel = (k) => root.querySelector(`[data-panel="${k}"]`);
  const RENDER = { profile: renderProfile, branches: renderBranches, lookups: renderLookups, preferences: renderPreferences, roles: renderRoles, data: renderData };
  let currentTab = null;

  /* ============================================================ profile === */
  function renderProfile() {
    const p = panel("profile");
    const s = S(), h = s.hostel || {}, u = s.currentUser || {};
    p.innerHTML = `<div class="set-grid">
      <section class="card-hh"><div class="card-hh__head"><span class="chip-icon"><i class="bi bi-building"></i></span><div><div class="card-hh__title">Hostel profile</div><div class="card-hh__sub">Shown on invoices, receipts, printed reports and the sidebar.</div></div></div><div data-hostel-form></div></section>
      <div class="stack" style="gap:var(--gutter)">
        <section class="card-hh set-brand"><div class="card-hh__head"><span class="chip-icon tone-blue"><i class="bi bi-eye"></i></span><div class="card-hh__title">Document header preview</div></div>
          <div class="set-brand__box"><img src="${P("assets/images/logo/hostelhub-logo.svg")}" alt=""><div><b data-pv="name">${esc(h.name)}</b><span data-pv="tagline">${esc(h.tagline)}</span><small data-pv="contact">${esc(h.address)} · ${esc(h.phone)}</small></div></div>
          <div class="set-brand__foot" data-pv="footer">${esc(h.invoiceFooter || "")}</div></section>
        <section class="card-hh"><div class="card-hh__head"><span class="chip-icon tone-purple"><i class="bi bi-person-circle"></i></span><div><div class="card-hh__title">My profile</div><div class="card-hh__sub">Signed in as ${esc(u.role || "—")}. The header updates after saving.</div></div></div><div data-me-form></div></section>
      </div></div>`;
    const hostelFields = [
      { name: "name", label: "Hostel name", required: true, col: 6, maxlength: 60, onInput: (v) => pv("name", v) },
      { name: "tagline", label: "Tagline", col: 6, maxlength: 80, onInput: (v) => pv("tagline", v) },
      { name: "email", label: "Email", type: "email", required: true, col: 6 },
      { name: "phone", label: "Phone", type: "tel", required: true, col: 6, onInput: () => pvContact() },
      { name: "address", label: "Address", type: "textarea", rows: 2, required: true, col: 12, onInput: () => pvContact() },
      { name: "gstin", label: "GSTIN", col: 6, placeholder: "e.g. 32ABCDE1234F1Z5", pattern: "[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]", patternMsg: "GSTIN must be 15 characters, e.g. 32ABCDE1234F1Z5 (capital letters).", help: "Leave blank if not registered." },
      { name: "website", label: "Website", col: 6, placeholder: "www.example.com", pattern: "(https?://)?[\\w.-]+\\.[a-zA-Z]{2,}(/\\S*)?", patternMsg: "Enter a valid website, e.g. www.hostelhub.demo" },
      { name: "invoiceFooter", label: "Invoice footer", type: "textarea", rows: 2, col: 12, maxlength: 200, help: "Printed at the bottom of invoices, receipts and reports.", onInput: (v) => pv("footer", v) },
    ];
    const pv = (k, v) => { const el = p.querySelector(`[data-pv="${k}"]`); if (el) el.textContent = v; };
    const pvContact = () => { const f = p.querySelector("[data-hostel-form] form"); pv("contact", `${f.elements.address.value} · ${f.elements.phone.value}`); };
    inlineForm(p.querySelector("[data-hostel-form]"), hostelFields, Object.assign({}, h), (d) => {
      const s2 = copy(); s2.hostel = Object.assign({}, s2.hostel, d, { gstin: d.gstin.toUpperCase() });
      HH.store.saveSettings(s2);
      HH.toast("Hostel profile saved.", "success");
    }, { values: () => Object.assign({}, S().hostel), saveText: "Save profile" });

    const meFields = [
      { name: "name", label: "Display name", required: true, col: 12, maxlength: 40 },
      { name: "email", label: "Email", type: "email", required: true, col: 12 },
      { name: "role", label: "Role", col: 12, readonly: true, help: "Change roles from Users & Roles." },
    ];
    inlineForm(p.querySelector("[data-me-form]"), meFields, Object.assign({}, u), (d) => {
      const s2 = copy(); const old = s2.currentUser || {};
      const clash = (s2.users || []).find((x) => norm(x.email) === norm(d.email) && norm(x.email) !== norm(old.email));
      if (clash) return `${d.email} already belongs to demo user ${clash.name}.`;
      s2.users = (s2.users || []).map((x) => (norm(x.email) === norm(old.email) ? Object.assign({}, x, { name: d.name, email: d.email }) : x));
      s2.currentUser = Object.assign({}, old, { name: d.name, email: d.email });
      HH.store.saveSettings(s2);
      reloadWith("Your profile has been updated.");
    }, { values: () => Object.assign({}, S().currentUser), saveText: "Save my profile" });
  }

  /* =========================================================== branches === */
  function branchUsage(id) {
    return [
      { label: "room", count: all("rooms").filter((r) => r.branch === id).length, icon: "bi-door-open", href: "pages/rooms-beds.html", page: "Rooms & Beds" },
      { label: "resident", count: all("residents").filter((r) => r.branch === id).length, icon: "bi-people", href: "pages/residents.html", page: "Residents" },
      { label: "staff member", count: all("staff").filter((r) => r.branch === id).length, icon: "bi-person-badge", href: "pages/staff-management.html", page: "Staff" },
    ];
  }
  let branchTable = null;
  function renderBranches() {
    const p = panel("branches");
    p.innerHTML = `<section class="card-hh card-hh--flush list-card">
      <div class="card-hh__head"><span class="chip-icon"><i class="bi bi-diagram-3"></i></span><div><div class="card-hh__title">Hostel branches</div><div class="card-hh__sub">Branches with rooms, residents or staff cannot be deleted.</div></div>
      <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--primary" data-add-branch><i class="bi bi-plus-lg"></i>Add branch</button></div></div><div data-table></div></section>`;
    const rows = () => (S().branches || []).map((b) => { const u = branchUsage(b.id); return Object.assign({}, b, { rooms: u[0].count, residents: u[1].count, staff: u[2].count, active: C.activeResidents().filter((r) => r.branch === b.id).length, occ: C.occupancy(b.id) }); });
    branchTable = new HH.Table(p.querySelector("[data-table]"), {
      id: "set:branches", rows: rows(), pageSize: 10, sort: { key: "id", dir: "asc" },
      columns: [
        { key: "id", label: "ID", cls: "nowrap", render: (r) => `<span class="mono">${esc(r.id)}</span>` },
        { key: "name", label: "Branch", render: (r) => `<div class="cell-strong">${esc(r.name)}</div><div class="cell-muted">${esc(r.address)}</div>` },
        { key: "warden", label: "Warden", render: (r) => esc(r.warden || "—") },
        { key: "phone", label: "Phone", cls: "nowrap", render: (r) => esc(r.phone || "—") },
        { key: "rooms", label: "Rooms", cls: "t-right", thCls: "t-right" },
        { key: "residents", label: "Residents", cls: "t-right", thCls: "t-right", render: (r) => `${U.fmtNum(r.residents)} <span class="cell-muted">(${r.active} active)</span>` },
        { key: "staff", label: "Staff", cls: "t-right", thCls: "t-right" },
        { key: "occ", label: "Occupancy", value: (r) => r.occ.pct, render: (r) => (r.occ.total ? `<div class="set-meter">${HH.ui.progress(r.occ.pct, "var(--yellow-600)")}<b>${r.occ.pct}%</b></div>` : '<span class="text-3">No beds</span>') },
      ],
      onRowClick: (r) => branchForm(r.id),
      rowActions: (r) => [
        { label: "Edit branch", icon: "bi-pencil", onClick: () => branchForm(r.id) },
        { label: "View rooms", icon: "bi-door-open", onClick: () => (location.href = P(`pages/rooms-beds.html?branch=${r.id}`)) },
        { divider: true },
        { label: "Delete branch", icon: "bi-trash", danger: true, onClick: () => deleteBranch(r.id) },
      ],
    });
    p.querySelector("[data-add-branch]").addEventListener("click", () => branchForm());
    branchTable.refresh = () => branchTable.setRows(rows(), true);
  }
  function branchForm(id) {
    const list = S().branches || []; const rec = id ? list.find((b) => b.id === id) : null;
    HH.formModal({
      title: rec ? `Edit branch · ${rec.id}` : "Add branch", icon: "bi-diagram-3", size: "lg", values: rec ? Object.assign({}, rec) : {},
      submitText: rec ? "Save changes" : "Add branch",
      fields: [
        { name: "name", label: "Branch name", required: true, col: 6, maxlength: 50, validate: (v) => (list.some((b) => b.id !== id && norm(b.name) === norm(v)) ? "Another branch already has this name." : "") },
        { name: "warden", label: "Warden in charge", col: 6, maxlength: 50, required: true },
        { name: "address", label: "Address", type: "textarea", rows: 2, required: true, col: 12 },
        { name: "phone", label: "Phone", type: "tel", required: true, col: 6 },
      ],
      onSubmit: (d) => {
        const s2 = copy();
        if (rec) s2.branches = s2.branches.map((b) => (b.id === id ? Object.assign({}, b, d) : b));
        else s2.branches.push(Object.assign({ id: nextId(s2.branches, "BR-") }, d));
        HH.store.saveSettings(s2);
        HH.toast(rec ? `Branch ${d.name} updated.` : `Branch ${d.name} added as ${s2.branches[s2.branches.length - 1].id}.`, "success");
        renderBranches();
        return true;
      },
    });
  }
  async function deleteBranch(id) {
    const b = (S().branches || []).find((x) => x.id === id); if (!b) return;
    const usage = branchUsage(id);
    if (usage.some((u) => u.count)) return blockedModal("Branch can't be deleted", `<p><b>${esc(b.name)}</b> is still in use by:</p>${usageHTML(usage)}<div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span>Move or remove these records first, then delete the branch.</span><span></span></div>`);
    if ((S().branches || []).length <= 1) return HH.toast("At least one branch is required.", "error");
    const ok = await HH.confirm(`Delete branch <b>${esc(b.name)}</b> (${esc(b.id)})? This cannot be undone.`, { title: "Delete branch", danger: true });
    if (!ok) return;
    const s2 = copy(); s2.branches = s2.branches.filter((x) => x.id !== id); HH.store.saveSettings(s2);
    HH.toast(`Branch ${b.name} deleted.`, "success");
    renderBranches();
  }

  /* ============================================================ lookups === */
  const mapInvoices = (fn) => HH.store.setAll("invoices", all("invoices").map((i) => fn(JSON.parse(JSON.stringify(i)))));
  const LOOKUPS = [
    {
      key: "roomTypes", label: "Room types", icon: "bi-door-closed", prefix: "RT-", entity: "room type",
      fields: () => [{ name: "name", label: "Name", required: true, col: 12, maxlength: 30 }, { name: "capacity", label: "Beds per room", type: "number", required: true, min: 1, max: 12, step: 1, col: 6 }, { name: "rent", label: "Default rent / bed (₹)", type: "number", required: true, min: 0, step: 100, col: 6 }],
      columns: [{ key: "capacity", label: "Beds", cls: "t-right", thCls: "t-right" }, { key: "rent", label: "Default rent", cls: "t-right money", thCls: "t-right", render: (r) => U.fmtMoney(r.rent) }],
      usage: (n) => [{ label: "room", count: all("rooms").filter((r) => r.type === n).length, icon: "bi-door-open", href: "pages/rooms-beds.html", page: "Rooms & Beds" }],
      rename: (o, n) => HH.store.setAll("rooms", all("rooms").map((r) => (r.type === o ? Object.assign({}, r, { type: n }) : r))),
    },
    {
      key: "feeCategories", label: "Fee categories", icon: "bi-tags", prefix: "FC-", entity: "fee category",
      fields: () => [{ name: "name", label: "Name", required: true, col: 8, maxlength: 30 }, { name: "amount", label: "Default amount (₹)", type: "number", min: 0, step: 50, col: 4, default: 0, required: true }],
      columns: [{ key: "amount", label: "Default amount", cls: "t-right money", thCls: "t-right", render: (r) => (r.amount ? U.fmtMoney(r.amount) : '<span class="text-3">Varies</span>') }],
      usage: (n) => [{ label: "invoice", count: all("invoices").filter((i) => (i.items || []).some((it) => it.category === n)).length, icon: "bi-file-earmark-text", href: "pages/invoices.html", page: "Invoices" }],
      rename: (o, n) => mapInvoices((i) => { i.items = (i.items || []).map((it) => (it.category === o ? Object.assign(it, { category: n }) : it)); return i; }),
    },
    {
      key: "expenseCategories", label: "Expense categories", icon: "bi-receipt", prefix: "EC-", entity: "expense category",
      fields: () => [{ name: "name", label: "Name", required: true, col: 8, maxlength: 30 }, { name: "color", label: "Chart colour", type: "color", col: 4, default: "#1683FF" }],
      columns: [{ key: "color", label: "Colour", render: (r) => `<span class="set-swatch" style="background:${esc(r.color || "#94A3B8")}"></span><span class="mono cell-muted">${esc(r.color || "—")}</span>` }],
      usage: (n) => [{ label: "expense", count: all("expenses").filter((e) => e.category === n).length, icon: "bi-receipt", href: "pages/expenses.html", page: "Expenses" }],
      rename: (o, n) => HH.store.setAll("expenses", all("expenses").map((e) => (e.category === o ? Object.assign({}, e, { category: n }) : e))),
    },
    {
      key: "mealTypes", label: "Meal types", icon: "bi-egg-fried", prefix: "ML-", entity: "meal type",
      fields: (rec, list) => [
        { name: "name", label: "Name", required: true, col: 6, maxlength: 20, validate: (v) => { const c = list.find((m) => (!rec || m.id !== rec.id) && norm(m.name)[0] === norm(v)[0] && norm(m.name) !== norm(v)); return c ? `Meal names must start with different letters (attendance sheets are keyed by the first letter) — "${c.name}" already uses "${c.name[0]}".` : ""; } },
        { name: "rate", label: "Rate per meal (₹)", type: "number", required: true, min: 0, step: 1, col: 6 },
        { name: "start", label: "Serving starts", type: "time", required: true, col: 6 },
        { name: "end", label: "Serving ends", type: "time", required: true, col: 6, validate: (v, vals) => (vals.start && v <= vals.start ? "End time must be after the start time." : "") },
      ],
      columns: [{ key: "start", label: "Serving time", cls: "nowrap", render: (r) => `${U.fmtTime(r.start)} – ${U.fmtTime(r.end)}` }, { key: "rate", label: "Rate", cls: "t-right money", thCls: "t-right", render: (r) => U.fmtMoney(r.rate) }],
      usage: (n) => [
        { label: "menu", count: all("menus").filter((m) => m.meal === n).length, icon: "bi-journal-text", href: "pages/menu-management.html", page: "Menu Management" },
        { label: "attendance sheet", count: all("attendance").filter((a) => a.meal === n).length, icon: "bi-clipboard-check", href: "pages/meal-attendance.html#history", page: "Meal Attendance" },
        { label: "meal plan", count: all("messPlans").filter((p) => (p.meals || []).includes(n)).length, icon: "bi-card-checklist", href: "pages/mess-management.html#plans", page: "Mess Management" },
      ],
      renameBlock: (o, n) => (o[0].toUpperCase() !== n[0].toUpperCase() && all("attendance").some((a) => a.meal === o) ? `"${o}" has attendance sheets stored under the letter "${o[0].toUpperCase()}". Rename it to a name starting with "${o[0].toUpperCase()}", or add a new meal type instead.` : ""),
      rename: (o, n) => {
        HH.store.setAll("menus", all("menus").map((m) => (m.meal === o ? Object.assign({}, m, { meal: n }) : m)));
        HH.store.setAll("attendance", all("attendance").map((a) => (a.meal === o ? Object.assign({}, a, { meal: n }) : a)));
        HH.store.setAll("messPlans", all("messPlans").map((p) => ((p.meals || []).includes(o) ? Object.assign({}, p, { meals: p.meals.map((x) => (x === o ? n : x)) }) : p)));
      },
    },
    {
      key: "paymentMethods", label: "Payment methods", icon: "bi-credit-card", prefix: "PM-", entity: "payment method",
      fields: () => [{ name: "name", label: "Name", required: true, col: 12, maxlength: 30 }],
      columns: [],
      usage: (n) => [
        { label: "payment", count: all("invoices").reduce((s, i) => s + (i.payments || []).filter((p) => p.method === n).length, 0), icon: "bi-cash-coin", href: "pages/fees-payments.html#payments", page: "Payment History" },
        { label: "expense", count: all("expenses").filter((e) => e.method === n).length, icon: "bi-receipt", href: "pages/expenses.html", page: "Expenses" },
        { label: "salary slip", count: all("salaries").filter((x) => x.method === n).length, icon: "bi-wallet2", href: "pages/staff-management.html#salary", page: "Salary Records" },
      ],
      rename: (o, n) => {
        mapInvoices((i) => { i.payments = (i.payments || []).map((p) => (p.method === o ? Object.assign(p, { method: n }) : p)); return i; });
        HH.store.setAll("expenses", all("expenses").map((e) => (e.method === o ? Object.assign({}, e, { method: n }) : e)));
        HH.store.setAll("salaries", all("salaries").map((x) => (x.method === o ? Object.assign({}, x, { method: n }) : x)));
      },
    },
    {
      key: "designations", label: "Staff designations", icon: "bi-person-badge", prefix: "DG-", entity: "designation",
      fields: () => [{ name: "name", label: "Designation", required: true, col: 6, maxlength: 40 }, { name: "department", label: "Department", type: "select", required: true, col: 6, options: L.list("departments") }],
      columns: [{ key: "department", label: "Department" }],
      usage: (n) => [{ label: "staff member", count: all("staff").filter((s) => s.designation === n).length, icon: "bi-people", href: "pages/staff-management.html", page: "Staff" }],
      rename: (o, n) => HH.store.setAll("staff", all("staff").map((s) => (s.designation === o ? Object.assign({}, s, { designation: n }) : s))),
    },
    {
      key: "departments", label: "Departments", icon: "bi-diagram-2", strings: true, entity: "department",
      fields: () => [{ name: "name", label: "Department", required: true, col: 12, maxlength: 40 }],
      columns: [],
      usage: (n) => [
        { label: "staff member", count: all("staff").filter((s) => s.department === n).length, icon: "bi-people", href: "pages/staff-management.html", page: "Staff" },
        { label: "designation", count: (S().designations || []).filter((d) => d.department === n).length, icon: "bi-person-badge" },
      ],
      rename: (o, n, s2) => {
        HH.store.setAll("staff", all("staff").map((s) => (s.department === o ? Object.assign({}, s, { department: n }) : s)));
        s2.designations = (s2.designations || []).map((d) => (d.department === o ? Object.assign({}, d, { department: n }) : d));
      },
    },
  ];
  const lkItems = (def) => (S()[def.key] || []).map((x, i) => (typeof x === "string" ? { id: x, name: x, _i: i } : Object.assign({}, x, { _i: i })));
  let lkKey = HH.store.pref("set:lookup", "roomTypes");

  function renderLookups() {
    const p = panel("lookups");
    if (!LOOKUPS.some((d) => d.key === lkKey)) lkKey = LOOKUPS[0].key;
    p.innerHTML = `<div class="set-lk">
      <nav class="card-hh set-lk__nav" aria-label="Lookup lists">${LOOKUPS.map((d) => `<button type="button" class="set-lk__btn ${d.key === lkKey ? "is-active" : ""}" data-lk="${d.key}"><i class="bi ${d.icon}"></i><span>${esc(d.label)}</span><span class="badge-hh tone-gray">${(S()[d.key] || []).length}</span></button>`).join("")}</nav>
      <section class="card-hh card-hh--flush list-card" data-lk-card></section></div>`;
    p.querySelector(".set-lk__nav").addEventListener("click", (e) => { const b = e.target.closest("[data-lk]"); if (!b) return; lkKey = b.dataset.lk; HH.store.setPref("set:lookup", lkKey); renderLookups(); });
    const def = LOOKUPS.find((d) => d.key === lkKey);
    const card = p.querySelector("[data-lk-card]");
    card.innerHTML = `<div class="card-hh__head"><span class="chip-icon"><i class="bi ${def.icon}"></i></span><div><div class="card-hh__title">${esc(def.label)}</div><div class="card-hh__sub">Values in use can't be deleted; renaming offers to update the linked records.</div></div>
      <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--primary" data-lk-add><i class="bi bi-plus-lg"></i>Add ${esc(def.entity)}</button></div></div><div data-lk-table></div>`;
    const rows = lkItems(def).map((x) => Object.assign(x, { _usage: def.usage(x.name) }));
    new HH.Table(card.querySelector("[data-lk-table]"), {
      id: "set:lk:" + def.key, rows, pageSize: 10, compact: true,
      columns: [
        ...(def.strings ? [] : [{ key: "id", label: "ID", cls: "nowrap", render: (r) => `<span class="mono">${esc(r.id)}</span>` }]),
        { key: "name", label: "Name", render: (r) => `<span class="cell-strong">${esc(r.name)}</span>` },
        ...def.columns,
        { key: "_usage", label: "Used by", value: (r) => U.sum(r._usage, (u) => u.count), render: (r) => { const t = usageText(r._usage); return t ? `<span class="badge-hh tone-orange"><i class="bi bi-link-45deg"></i>${esc(t)}</span>` : '<span class="badge-hh tone-gray">Not used</span>'; } },
      ],
      onRowClick: (r) => lookupForm(def, r),
      rowActions: (r) => [{ label: "Edit", icon: "bi-pencil", onClick: () => lookupForm(def, r) }, { divider: true }, { label: "Delete", icon: "bi-trash", danger: true, onClick: () => deleteLookup(def, r) }],
    });
    card.querySelector("[data-lk-add]").addEventListener("click", () => lookupForm(def));
  }

  function lookupForm(def, rec) {
    const list = lkItems(def);
    const base = def.fields(rec, list);
    const fields = base.map((f) => (f.name !== "name" ? f : Object.assign({}, f, { validate: (v, vals) => (list.some((x) => (!rec || x._i !== rec._i) && norm(x.name) === norm(v)) ? `"${v}" already exists in ${def.label.toLowerCase()}.` : f.validate ? f.validate(v, vals) : "") })));
    HH.formModal({
      title: rec ? `Edit ${def.entity} · ${rec.name}` : `Add ${def.entity}`, icon: def.icon, size: fields.length > 1 ? "lg" : "md",
      fields, values: rec ? Object.assign({}, rec) : {}, submitText: rec ? "Save changes" : `Add ${def.entity}`,
      onSubmit: async (d) => {
        const s2 = copy();
        const arr = (s2[def.key] || []).slice();
        if (rec && rec.name !== d.name) {
          const usage = def.usage(rec.name); const n = U.sum(usage, (u) => u.count);
          if (n) {
            const blk = def.renameBlock && def.renameBlock(rec.name, d.name);
            if (blk) return blk;
            const ok = await HH.confirm(`<b>${esc(rec.name)}</b> is used by ${esc(usageText(usage))}.<br>Update all of them to <b>${esc(d.name)}</b>?`, { title: `Rename ${def.entity}?`, okText: "Rename & update records", icon: "bi-arrow-repeat" });
            if (!ok) return `Rename cancelled — "${rec.name}" is still used by ${usageText(usage)}. Keep the old name or confirm updating the records.`;
            def.rename(rec.name, d.name, s2);
          }
        }
        if (def.strings) { if (rec) arr[rec._i] = d.name; else arr.push(d.name); }
        else {
          const clean = Object.assign({}, d); ["capacity", "rent", "amount", "rate"].forEach((k) => { if (k in clean) clean[k] = Number(clean[k]) || 0; });
          if (rec) arr[rec._i] = Object.assign({}, arr[rec._i], clean); else arr.push(Object.assign({ id: nextId(arr, def.prefix) }, clean));
        }
        s2[def.key] = arr;
        HH.store.saveSettings(s2);
        HH.toast(rec ? `${cap(def.entity)} "${d.name}" saved${rec.name !== d.name ? " and linked records updated" : ""}.` : `${cap(def.entity)} "${d.name}" added.`, "success");
        renderLookups();
        return true;
      },
    });
  }
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  async function deleteLookup(def, rec) {
    const usage = def.usage(rec.name);
    if (usage.some((u) => u.count)) return blockedModal(`Can't delete "${rec.name}"`, `<p>This ${esc(def.entity)} is in use by:</p>${usageHTML(usage)}<div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span>Reassign those records to another value first, or rename this value instead.</span><span></span></div>`);
    if ((S()[def.key] || []).length <= 1) return HH.toast(`Keep at least one ${def.entity}.`, "error");
    const ok = await HH.confirm(`Delete ${esc(def.entity)} <b>${esc(rec.name)}</b>? It is not used by any record.`, { title: `Delete ${def.entity}`, danger: true });
    if (!ok) return;
    const s2 = copy(); s2[def.key] = (s2[def.key] || []).filter((_, i) => i !== rec._i); HH.store.saveSettings(s2);
    HH.toast(`${cap(def.entity)} "${rec.name}" deleted.`, "success");
    renderLookups();
  }

  /* ======================================================== preferences === */
  const NOTIF = { lowStock: "Low stock alerts", expiry: "Expiry alerts", fees: "Overdue fee alerts", maintenance: "Overdue maintenance tickets", complaints: "High-priority complaints", notices: "Unread notices", visitors: "Visitors still inside" };
  const DATE_FORMATS = ["DD MMM YYYY", "DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"];
  function renderPreferences() {
    const p = panel("preferences");
    const s = S();
    const notifKeys = Object.keys(Object.assign({}, NOTIF, s.notifications || {}));
    const values = { dateFormat: s.dateFormat || "DD MMM YYYY", currency: s.currency || "INR", currencySymbol: s.currencySymbol || "₹", taxRate: s.taxRate ?? 0, lateFeeAmount: s.lateFeeAmount ?? 0, invoiceDueDay: s.invoiceDueDay ?? 10, sidebarCollapsed: s.sidebarCollapsed ?? HH.store.pref("sidebarCollapsed", false) };
    notifKeys.forEach((k) => (values["n_" + k] = (s.notifications || {})[k] !== false));
    p.innerHTML = `<section class="card-hh"><div class="card-hh__head"><span class="chip-icon"><i class="bi bi-sliders"></i></span><div><div class="card-hh__title">Preferences</div><div class="card-hh__sub">Applied across every module of this demo.</div></div></div><div data-pref-form></div></section>`;
    const preview = () => `<div class="set-preview" data-preview></div>`;
    const fields = [
      { type: "section", label: "Date & currency", icon: "bi-calendar3" },
      { name: "dateFormat", label: "Date format", type: "select", required: true, col: 4, options: DATE_FORMATS.map((f) => ({ value: f, label: `${f}  —  ${U.fmtDate(U.todayISO(), f)}` })), onChange: () => upd() },
      { name: "currency", label: "Currency code", required: true, col: 4, maxlength: 3, pattern: "[A-Za-z]{3}", patternMsg: "Use a 3-letter ISO code, e.g. INR.", onInput: () => upd() },
      { name: "currencySymbol", label: "Currency symbol", required: true, col: 4, maxlength: 4, onInput: () => upd() },
      { type: "html", col: 12, html: preview },
      { type: "section", label: "Billing defaults", icon: "bi-receipt" },
      { name: "taxRate", label: "Default tax rate (%)", type: "number", required: true, min: 0, max: 28, step: 0.01, col: 4, help: "Pre-filled on new invoices." },
      { name: "lateFeeAmount", label: "Late fee amount (₹)", type: "number", required: true, min: 0, max: 100000, step: 1, col: 4 },
      { name: "invoiceDueDay", label: "Invoice due day of month", type: "number", required: true, min: 1, max: 28, step: 1, col: 4, help: "1–28 so it exists in every month." },
      { type: "section", label: "Header notifications", icon: "bi-bell" },
      ...notifKeys.map((k) => ({ name: "n_" + k, label: NOTIF[k] || k, type: "switch", switchLabel: "Show in the bell", col: 4 })),
      { type: "section", label: "Layout", icon: "bi-layout-sidebar" },
      { name: "sidebarCollapsed", label: "Sidebar", type: "switch", switchLabel: "Start with the sidebar collapsed (desktop)", col: 12 },
    ];
    let formEl;
    const upd = () => {
      if (!formEl) return;
      const fmt = formEl.elements.dateFormat.value || "DD MMM YYYY", sym = formEl.elements.currencySymbol.value || "₹";
      const amt = Math.abs(123456.5).toLocaleString("en-IN", { maximumFractionDigits: 0 });
      formEl.querySelector("[data-preview]").innerHTML = `<i class="bi bi-eye"></i><span>Preview: <b>${esc(U.fmtDate(U.todayISO(), fmt))}</b> · <b>${esc(U.fmtDate("2026-03-05", fmt))}</b> · <b>${esc(sym)}${amt}</b> <span class="text-2">(${esc((formEl.elements.currency.value || "").toUpperCase())})</span></span>`;
    };
    formEl = inlineForm(p.querySelector("[data-pref-form]"), fields, values, (d) => {
      const s2 = copy();
      Object.assign(s2, { dateFormat: d.dateFormat, currency: d.currency.toUpperCase(), currencySymbol: d.currencySymbol, taxRate: Number(d.taxRate), lateFeeAmount: Number(d.lateFeeAmount), invoiceDueDay: Number(d.invoiceDueDay), sidebarCollapsed: !!d.sidebarCollapsed });
      s2.notifications = Object.assign({}, s2.notifications);
      notifKeys.forEach((k) => (s2.notifications[k] = !!d["n_" + k]));
      HH.store.saveSettings(s2);
      HH.store.setPref("sidebarCollapsed", !!d.sidebarCollapsed);
      const shell = document.getElementById("appShell");
      if (shell && innerWidth > 1100) { shell.classList.toggle("is-collapsed", !!d.sidebarCollapsed); setTimeout(() => window.dispatchEvent(new Event("resize")), 340); }
      HH.toast(`Preferences saved. Dates now show as ${U.fmtDate(U.todayISO())}.`, "success");
      renderPreferences();
    }, { values: () => values, saveText: "Save preferences", onReady: (f) => { formEl = f; upd(); } });
  }

  /* ============================================================== roles === */
  const MODULES = [
    ["all", "Full access (all modules)"], ["residents", "Residents"], ["rooms", "Rooms & Beds"], ["mess", "Mess Management"], ["attendance", "Meal Attendance"], ["menu", "Menu Management"],
    ["kitchen", "Kitchen & Inventory"], ["fees", "Fees & Payments"], ["invoices", "Invoices"], ["expenses", "Expenses"], ["staff", "Staff Management"], ["maintenance", "Maintenance"],
    ["visitors", "Visitors"], ["complaints", "Complaints"], ["reports", "Reports"], ["notices", "Notices"], ["settings", "Settings"],
  ];
  const modLabel = (k) => (MODULES.find((m) => m[0] === k) || [k, k])[1];
  function renderRoles() {
    const p = panel("roles");
    const s = S(); const me = s.currentUser || {};
    p.innerHTML = `<div class="alert-hh tone-yellow"><i class="bi bi-shield-lock"></i><span><b>Demo roles — no real access control.</b> Users and permissions are stored for demonstration only; every signed-in user can open every module.</span><span></span></div>
      <section class="card-hh card-hh--flush list-card"><div class="card-hh__head"><span class="chip-icon tone-blue"><i class="bi bi-people"></i></span><div><div class="card-hh__title">Demo users</div><div class="card-hh__sub">Available on the sign-in screen.</div></div>
        <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--primary" data-add-user><i class="bi bi-person-plus"></i>Add user</button></div></div><div data-users></div></section>
      <section class="card-hh card-hh--flush list-card"><div class="card-hh__head"><span class="chip-icon tone-purple"><i class="bi bi-shield-check"></i></span><div><div class="card-hh__title">Roles & permissions</div><div class="card-hh__sub">Roles assigned to users can't be deleted.</div></div>
        <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--primary" data-add-role><i class="bi bi-plus-lg"></i>Add role</button></div></div><div data-roles></div></section>`;
    new HH.Table(p.querySelector("[data-users]"), {
      id: "set:users", rows: (s.users || []).slice(), pageSize: 10, sort: { key: "id", dir: "asc" },
      columns: [
        { key: "name", label: "User", render: (u) => `${HH.ui.person(u.name, u.email)}` },
        { key: "role", label: "Role", render: (u) => HH.ui.badge(u.role, "purple") },
        { key: "status", label: "Status", render: (u) => HH.ui.badge(u.status || "Active") },
        { key: "me", label: "", sortable: false, value: () => "", render: (u) => (norm(u.email) === norm(me.email) ? HH.ui.badge("You", "blue") : "") },
      ],
      onRowClick: (u) => userForm(u.id),
      rowActions: (u) => [{ label: "Edit user", icon: "bi-pencil", onClick: () => userForm(u.id) }, { divider: true }, { label: "Delete user", icon: "bi-trash", danger: true, onClick: () => deleteUser(u.id) }],
    });
    new HH.Table(p.querySelector("[data-roles]"), {
      id: "set:roles", rows: (s.roles || []).map((r) => Object.assign({}, r, { users: (s.users || []).filter((u) => u.role === r.name).length })), pageSize: 10, sort: { key: "id", dir: "asc" },
      columns: [
        { key: "name", label: "Role", render: (r) => `<div style="min-width:150px"><div class="cell-strong">${esc(r.name)}</div><div class="cell-muted">${esc(r.description || "")}</div></div>` },
        { key: "permissions", label: "Permissions", sortable: false, render: (r) => `<div class="set-chips">${(r.permissions || []).includes("all") ? HH.ui.badge("All modules", "green") : (r.permissions || []).map((k) => HH.ui.badge(modLabel(k), "gray")).join("")}</div>` },
        { key: "users", label: "Users", cls: "t-right", thCls: "t-right" },
      ],
      onRowClick: (r) => roleForm(r.id),
      rowActions: (r) => [{ label: "Edit role", icon: "bi-pencil", onClick: () => roleForm(r.id) }, { divider: true }, { label: "Delete role", icon: "bi-trash", danger: true, onClick: () => deleteRole(r.id) }],
    });
    p.querySelector("[data-add-user]").addEventListener("click", () => userForm());
    p.querySelector("[data-add-role]").addEventListener("click", () => roleForm());
  }
  const activeAdmins = (users, exceptId) => users.filter((u) => u.id !== exceptId && u.role === "Super Admin" && (u.status || "Active") === "Active").length;
  function userForm(id) {
    const s = S(); const users = s.users || []; const rec = id ? users.find((u) => u.id === id) : null;
    HH.formModal({
      title: rec ? `Edit user · ${rec.name}` : "Add demo user", icon: "bi-person-gear", size: "lg", values: rec ? Object.assign({}, rec) : { status: "Active" }, submitText: rec ? "Save changes" : "Add user",
      fields: [
        { name: "name", label: "Full name", required: true, col: 6, maxlength: 40 },
        { name: "email", label: "Email", type: "email", required: true, col: 6, validate: (v) => (users.some((u) => u.id !== id && norm(u.email) === norm(v)) ? "Another user already uses this email." : "") },
        { name: "role", label: "Role", type: "select", required: true, col: 6, options: (s.roles || []).map((r) => r.name) },
        { name: "status", label: "Status", type: "select", required: true, col: 6, options: ["Active", "Inactive"] },
      ],
      onSubmit: (d) => {
        const s2 = copy(); const me = s2.currentUser || {};
        if (rec && rec.role === "Super Admin" && (d.role !== "Super Admin" || d.status !== "Active") && !activeAdmins(s2.users, rec.id)) return "At least one active Super Admin is required.";
        if (rec && norm(rec.email) === norm(me.email) && d.status !== "Active") return "You can't deactivate the user you are signed in as.";
        if (rec) s2.users = s2.users.map((u) => (u.id === id ? Object.assign({}, u, d) : u));
        else s2.users.push(Object.assign({ id: nextId(s2.users, "USR-") }, d));
        const isMe = rec && norm(rec.email) === norm(me.email);
        if (isMe) s2.currentUser = Object.assign({}, me, { name: d.name, email: d.email, role: d.role });
        HH.store.saveSettings(s2);
        if (isMe) { reloadWith("Your user account was updated."); return true; }
        HH.toast(rec ? `User ${d.name} updated.` : `User ${d.name} added.`, "success");
        renderRoles(); return true;
      },
    });
  }
  async function deleteUser(id) {
    const s = S(); const u = (s.users || []).find((x) => x.id === id); if (!u) return;
    if (norm(u.email) === norm((s.currentUser || {}).email)) return HH.toast("You can't delete the user you are signed in as.", "error");
    if (u.role === "Super Admin" && !activeAdmins(s.users, id)) return HH.toast("At least one active Super Admin is required.", "error");
    if (!(await HH.confirm(`Delete demo user <b>${esc(u.name)}</b> (${esc(u.email)})?`, { title: "Delete user", danger: true }))) return;
    const s2 = copy(); s2.users = s2.users.filter((x) => x.id !== id); HH.store.saveSettings(s2);
    HH.toast(`User ${u.name} deleted.`, "success"); renderRoles();
  }
  function roleForm(id) {
    const s = S(); const roles = s.roles || []; const rec = id ? roles.find((r) => r.id === id) : null;
    HH.formModal({
      title: rec ? `Edit role · ${rec.name}` : "Add role", icon: "bi-shield-check", size: "lg", values: rec ? Object.assign({}, rec) : { permissions: [] }, submitText: rec ? "Save changes" : "Add role",
      fields: [
        { name: "name", label: "Role name", required: true, col: 6, maxlength: 30, validate: (v) => (roles.some((r) => r.id !== id && norm(r.name) === norm(v)) ? "A role with this name already exists." : "") },
        { name: "description", label: "Description", col: 6, maxlength: 80 },
        { type: "section", label: "Module permissions (demo only)", icon: "bi-ui-checks-grid" },
        { name: "permissions", label: "", type: "checks", required: true, col: 12, options: MODULES.map(([v, l]) => ({ value: v, label: l })), validate: (v) => (!v.length ? "Choose at least one module." : "") },
      ],
      onSubmit: async (d) => {
        const s2 = copy();
        const perms = d.permissions.includes("all") ? ["all"] : d.permissions;
        if (rec && rec.name === "Super Admin" && d.name !== "Super Admin") return "The Super Admin role can't be renamed.";
        if (rec && rec.name !== d.name) {
          const n = (s2.users || []).filter((u) => u.role === rec.name).length;
          if (n) {
            const ok = await HH.confirm(`<b>${plural(n, "user")}</b> have the role <b>${esc(rec.name)}</b>. Update them to <b>${esc(d.name)}</b>?`, { title: "Rename role?", okText: "Rename & update users", icon: "bi-arrow-repeat" });
            if (!ok) return `Rename cancelled — ${plural(n, "user")} still use "${rec.name}".`;
            s2.users = s2.users.map((u) => (u.role === rec.name ? Object.assign({}, u, { role: d.name }) : u));
            if (s2.currentUser && s2.currentUser.role === rec.name) s2.currentUser = Object.assign({}, s2.currentUser, { role: d.name });
          }
        }
        if (rec) s2.roles = s2.roles.map((r) => (r.id === id ? Object.assign({}, r, d, { permissions: perms }) : r));
        else s2.roles.push(Object.assign({ id: nextId(s2.roles, "RL-") }, d, { permissions: perms }));
        HH.store.saveSettings(s2);
        HH.toast(rec ? `Role ${d.name} saved.` : `Role ${d.name} added.`, "success");
        renderRoles(); return true;
      },
    });
  }
  async function deleteRole(id) {
    const s = S(); const r = (s.roles || []).find((x) => x.id === id); if (!r) return;
    const users = (s.users || []).filter((u) => u.role === r.name);
    if (r.name === "Super Admin") return HH.toast("The Super Admin role can't be deleted.", "error");
    if (users.length) return blockedModal(`Can't delete "${r.name}"`, `<p>This role is assigned to:</p><ul class="set-usage">${users.map((u) => `<li><span class="chip-icon tone-blue"><i class="bi bi-person"></i></span><span><b>${esc(u.name)}</b> · ${esc(u.email)}</span></li>`).join("")}</ul><div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span>Give these users another role first.</span><span></span></div>`);
    if (!(await HH.confirm(`Delete role <b>${esc(r.name)}</b>?`, { title: "Delete role", danger: true }))) return;
    const s2 = copy(); s2.roles = s2.roles.filter((x) => x.id !== id); HH.store.saveSettings(s2);
    HH.toast(`Role ${r.name} deleted.`, "success"); renderRoles();
  }

  /* =============================================================== data === */
  const COL_INFO = {
    residents: ["Residents", "pages/residents.html", "bi-people"], rooms: ["Rooms", "pages/rooms-beds.html", "bi-door-open"], messPlans: ["Meal plans", "pages/mess-management.html#plans", "bi-card-checklist"],
    messSubscriptions: ["Mess subscriptions", "pages/mess-management.html#subscriptions", "bi-person-check"], attendance: ["Meal attendance sheets", "pages/meal-attendance.html#history", "bi-clipboard-check"],
    menus: ["Menus", "pages/menu-management.html", "bi-journal-text"], vendors: ["Vendors", "pages/kitchen-inventory.html#vendors", "bi-truck"], inventory: ["Stock items", "pages/kitchen-inventory.html", "bi-box-seam"],
    stockTx: ["Stock transactions", "pages/kitchen-inventory.html#history", "bi-arrow-left-right"], invoices: ["Invoices", "pages/invoices.html", "bi-file-earmark-text"], expenses: ["Expenses", "pages/expenses.html", "bi-receipt"],
    staff: ["Staff", "pages/staff-management.html", "bi-person-badge"], staffAttendance: ["Staff attendance days", "pages/staff-management.html#attendance", "bi-calendar2-check"], salaries: ["Salary slips", "pages/staff-management.html#salary", "bi-wallet2"],
    maintenance: ["Maintenance tickets", "pages/maintenance.html", "bi-tools"], visitors: ["Visitor entries", "pages/visitors.html", "bi-person-badge"], complaints: ["Complaints", "pages/complaints.html", "bi-chat-square-text"], notices: ["Notices", "pages/notices.html", "bi-megaphone"],
  };
  function renderData() {
    const p = panel("data");
    const meta = HH.store.meta() || {};
    const counts = HH.store.COLLECTIONS.map((c) => ({ id: c, key: c, label: (COL_INFO[c] || [c])[0], href: (COL_INFO[c] || [])[1], icon: (COL_INFO[c] || [])[2] || "bi-database", count: all(c).length }));
    const payments = all("invoices").reduce((s, i) => s + (i.payments || []).length, 0);
    const total = U.sum(counts, (c) => c.count);
    p.innerHTML = `<div class="set-grid">
      <section class="card-hh set-demo"><div class="card-hh__head"><span class="chip-icon"><i class="bi bi-database-check"></i></span><div><div class="card-hh__title">Demo mode</div><div class="card-hh__sub">All data is stored in this browser's localStorage only.</div></div></div>
        ${HH.ui.kv([["Storage used", `<b>${U.fmtNum(HH.store.usageKB())} KB</b> <span class="text-2">of ~5 MB</span>`], ["Records", `${U.fmtNum(total)} <span class="text-2">+ ${U.fmtNum(payments)} payments</span>`], ["Sample data seeded on", meta.seededOn ? U.fmtDate(meta.seededOn) : "—"], ["Data version", esc(meta.version != null ? "v" + meta.version : "—")], ["Persistence", HH.store.isMemoryOnly() ? HH.ui.badge("Memory only", "red") : HH.ui.badge("Saved in browser", "green")], ["Collections", U.fmtNum(counts.length)]])}
        ${HH.ui.progress(Math.min(100, Math.round((HH.store.usageKB() / 5120) * 100)), "var(--blue)")}
        <div class="set-actions set-actions--start"><button type="button" class="btn-hh btn-hh--soft-blue" data-demo-act="load"><i class="bi bi-cloud-download"></i>Load sample data</button><button type="button" class="btn-hh btn-hh--danger" data-demo-act="reset"><i class="bi bi-arrow-repeat"></i>Reset demo data</button></div>
        <p class="field-help">Load sample data replaces records but keeps display preferences. Reset restores everything to the original demo state.</p></section>
      <section class="card-hh"><div class="card-hh__head"><span class="chip-icon tone-green"><i class="bi bi-hdd-stack"></i></span><div><div class="card-hh__title">Backup & restore</div><div class="card-hh__sub">Download everything as JSON or restore an earlier backup.</div></div></div>
        <div class="set-backup">
          <button type="button" class="tile-btn tone-green" data-export-json><i class="bi bi-filetype-json"></i><span>Export all data<small class="d-block text-2">settings + ${counts.length} collections</small></span></button>
          <button type="button" class="tile-btn tone-blue" data-import-json><i class="bi bi-upload"></i><span>Import JSON backup<small class="d-block text-2">replaces current data</small></span></button>
        </div><input type="file" accept="application/json,.json" hidden data-import-file>
        <div class="alert-hh tone-orange"><i class="bi bi-exclamation-triangle"></i><span>Importing overwrites all records and settings in this browser. Export a backup first if you want to keep the current data.</span><span></span></div></section>
      </div>
      <section class="card-hh card-hh--flush list-card"><div class="card-hh__head"><span class="chip-icon tone-navy"><i class="bi bi-table"></i></span><div><div class="card-hh__title">Records per collection</div><div class="card-hh__sub">${U.fmtNum(total)} records in ${counts.length} collections</div></div></div><div data-counts></div></section>`;
    new HH.Table(p.querySelector("[data-counts]"), {
      id: "set:counts", rows: counts, paginate: false, compact: true, sort: { key: "label", dir: "asc" },
      columns: [
        { key: "label", label: "Collection", cls: "nowrap", render: (r) => `<span class="row-flex"><i class="bi ${r.icon} text-2"></i><b>${esc(r.label)}</b></span>` },
        { key: "key", label: "Storage key", render: (r) => `<span class="mono cell-muted">hh:${esc(r.key)}</span>` },
        { key: "count", label: "Records", cls: "t-right", thCls: "t-right", render: (r) => U.fmtNum(r.count) },
        { key: "href", label: "", sortable: false, cls: "t-right", render: (r) => (r.href ? `<a class="link-hh" href="${P(r.href)}">Open <i class="bi bi-arrow-right"></i></a>` : "") },
      ],
      footerRow: (rows) => `<tr><td>Total</td><td></td><td class="t-right">${U.fmtNum(U.sum(rows, (r) => r.count))}</td><td></td></tr>`,
    });
    p.querySelectorAll("[data-demo-act]").forEach((b) => b.addEventListener("click", () => HH.demoAction(b.dataset.demoAct)));
    p.querySelector("[data-export-json]").addEventListener("click", () => {
      const data = HH.store.exportAll(); data.exportedAt = U.nowISO(); data.app = "HostelHub";
      HH.download(`hostelhub-backup-${U.todayISO()}.json`, JSON.stringify(data, null, 2), "application/json");
      HH.toast("Backup downloaded as JSON.", "success");
    });
    const fileInp = p.querySelector("[data-import-file]");
    p.querySelector("[data-import-json]").addEventListener("click", () => fileInp.click());
    fileInp.addEventListener("change", async () => {
      const file = fileInp.files[0]; fileInp.value = ""; if (!file) return;
      if (file.size > 8 * 1024 * 1024) return HH.toast("That file is too large for a HostelHub backup (max 8 MB).", "error");
      let data;
      try { data = JSON.parse(await file.text()); } catch (e) { return HH.toast("The file is not valid JSON.", "error"); }
      const errs = validateBackup(data);
      if (errs.length) return blockedModal("Invalid backup file", `<p>${esc(file.name)} can't be imported:</p><ul class="set-errors">${errs.slice(0, 8).map((e) => `<li>${esc(e)}</li>`).join("")}${errs.length > 8 ? `<li>…and ${errs.length - 8} more</li>` : ""}</ul>`);
      const sum = HH.store.COLLECTIONS.reduce((s, c) => s + data[c].length, 0);
      const ok = await HH.confirm(`Import <b>${esc(file.name)}</b>?<br>${U.fmtNum(sum)} records in ${HH.store.COLLECTIONS.length} collections${data.meta && data.meta.seededOn ? ` (seeded ${esc(U.fmtDate(data.meta.seededOn))})` : ""}. <b>All current data will be replaced.</b>`, { title: "Import backup?", danger: true, okText: "Replace & import", icon: "bi-upload" });
      if (!ok) return;
      HH.store.COLLECTIONS.forEach((c) => HH.store.setAll(c, data[c]));
      HH.store.saveSettings(data.settings);
      reloadWith(`Backup imported — ${U.fmtNum(sum)} records restored.`);
    });
  }
  function validateBackup(d) {
    const errs = [];
    if (!d || typeof d !== "object" || Array.isArray(d)) return ["The file must contain a JSON object exported from HostelHub."];
    const s = d.settings;
    if (!s || typeof s !== "object" || Array.isArray(s)) errs.push('Missing "settings" object.');
    else {
      if (!s.hostel || typeof s.hostel !== "object") errs.push('settings.hostel is missing.');
      ["branches", "roomTypes", "mealTypes", "paymentMethods", "expenseCategories", "feeCategories"].forEach((k) => { if (!Array.isArray(s[k]) || !s[k].length) errs.push(`settings.${k} must be a non-empty list.`); });
    }
    HH.store.COLLECTIONS.forEach((c) => {
      if (!Array.isArray(d[c])) { errs.push(`Collection "${c}" is missing or not a list.`); return; }
      const ids = new Set();
      for (let i = 0; i < d[c].length; i++) {
        const r = d[c][i];
        if (!r || typeof r !== "object" || typeof r.id !== "string" || !r.id) { errs.push(`${c}[${i}] has no valid "id".`); break; }
        if (ids.has(r.id)) { errs.push(`${c} contains duplicate id ${r.id}.`); break; }
        ids.add(r.id);
      }
    });
    return errs;
  }

  // Initialise tabs last so every renderer and constant above is defined
  HH.ui.tabs(root.querySelector("[data-tabs]"), TABS, (k) => { currentTab = k; HH.ui.panels(root, k); RENDER[k](); }, { hash: true });

  // Keep the visible tab in sync with changes made in other browser tabs
  window.addEventListener("hh:datachange", (e) => { if ((e.detail.external || e.detail.col === "*") && currentTab) RENDER[currentTab](); });
})();
