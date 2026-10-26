/* ==========================================================================
   HostelHub — Shared utilities, UI helpers and the reusable CRUD engine
   --------------------------------------------------------------------------
   HH.util     formatting / dates / misc
   HH.lookup   id -> name helpers and <select> option builders
   HH.calc     business calculations shared by modules, dashboard & reports
   HH.ui       badges, stat cards, empty states, tabs
   HH.modal    Bootstrap modal factory (HostelHub skin)
   HH.drawer   Bootstrap offcanvas factory
   HH.confirm  promise-based confirm dialog (works on top of open modals)
   HH.menu     floating action menu (row "..." menus)
   HH.form     field-spec form builder / reader
   HH.Table    sortable + paginated table renderer
   HH.CrudPage complete list/add/view/edit/delete page from a config object
   ========================================================================== */
(function () {
  "use strict";
  const HH = (window.HH = window.HH || {});

  /* =========================================================== util ==== */
  const pad = (n, l = 2) => String(n).padStart(l, "0");
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  const util = {
    MONTHS, DAYS, pad,
    esc(s) {
      return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
    },
    iso(d) { d = d instanceof Date ? d : new Date(d); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; },
    todayISO() { return util.iso(new Date()); },
    nowISO() { const d = new Date(); return `${util.iso(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`; },
    parse(s) {
      if (!s) return null;
      if (s instanceof Date) return s;
      const m = /^(\d{4})-(\d{2})-(\d{2})(?:T(\d{2}):(\d{2}))?/.exec(s);
      if (!m) return new Date(s);
      return new Date(+m[1], +m[2] - 1, +m[3], m[4] ? +m[4] : 12, m[5] ? +m[5] : 0);
    },
    addDays(s, n) { const d = util.parse(s) || new Date(); d.setDate(d.getDate() + n); return util.iso(d); },
    daysBetween(a, b) { return Math.round((util.parse(b) - util.parse(a)) / 86400000); },
    monthKey(s) { return String(s || "").slice(0, 7); },
    monthLabel(key) { const [y, m] = key.split("-"); return `${MONTHS[+m - 1]} ${y}`; },
    fmtDate(s, fmt) {
      if (!s) return "—";
      const d = util.parse(s); if (!d || isNaN(d)) return util.esc(s);
      fmt = fmt || (HH.store && HH.store.settings().dateFormat) || "DD MMM YYYY";
      const map = { DD: pad(d.getDate()), MMM: MONTHS[d.getMonth()], MM: pad(d.getMonth() + 1), YYYY: d.getFullYear() };
      return fmt.replace(/YYYY|MMM|MM|DD/g, (t) => map[t]);
    },
    fmtTime(s) {
      if (!s) return "—";
      const t = s.includes("T") ? s.split("T")[1] : s;
      let [h, m] = t.split(":").map(Number);
      const ap = h >= 12 ? "PM" : "AM"; h = h % 12 || 12;
      return `${h}:${pad(m)} ${ap}`;
    },
    fmtDateTime(s) { return s ? `${util.fmtDate(s)}, ${util.fmtTime(s)}` : "—"; },
    fmtNum(n) { return Number(n || 0).toLocaleString("en-IN"); },
    fmtMoney(n, opts = {}) {
      const sym = (HH.store && HH.store.settings().currencySymbol) || "₹";
      const v = Number(n || 0);
      const s = Math.abs(v).toLocaleString("en-IN", { maximumFractionDigits: opts.decimals ?? 0, minimumFractionDigits: opts.decimals ?? 0 });
      return (v < 0 ? "-" : "") + sym + s;
    },
    fmtCompact(n) {
      const v = Number(n || 0);
      if (Math.abs(v) >= 1e7) return (v / 1e7).toFixed(1).replace(/\.0$/, "") + "Cr";
      if (Math.abs(v) >= 1e5) return (v / 1e5).toFixed(1).replace(/\.0$/, "") + "L";
      if (Math.abs(v) >= 1e3) return (v / 1e3).toFixed(0) + "K";
      return String(v);
    },
    pct(a, b) { return b ? Math.round((a / b) * 100) : 0; },
    sum(arr, fn) { return arr.reduce((s, x) => s + (Number(fn ? fn(x) : x) || 0), 0); },
    groupBy(arr, fn) { return arr.reduce((m, x) => { const k = fn(x); (m[k] = m[k] || []).push(x); return m; }, {}); },
    debounce(fn, ms = 200) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; },
    qs(name) { return new URLSearchParams(location.search).get(name); },
    setQS(params) {
      const u = new URL(location.href);
      Object.entries(params).forEach(([k, v]) => (v == null || v === "" ? u.searchParams.delete(k) : u.searchParams.set(k, v)));
      history.replaceState(null, "", u);
    },
    timeAgo(s) {
      const d = util.parse(s); if (!d) return "";
      const diff = (Date.now() - d.getTime()) / 1000;
      if (diff < 60) return "just now";
      if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
      if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
      const days = Math.floor(diff / 86400);
      return days === 1 ? "yesterday" : days < 30 ? `${days} days ago` : util.fmtDate(s);
    },
    initials(name) { return String(name || "?").split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join(""); },
    hashColor(str) {
      const palette = ["#1683FF", "#10B981", "#8B5CF6", "#FF8A1F", "#EC4899", "#14B8A6", "#F04452", "#0EA5E9", "#6366F1", "#D97706"];
      let h = 0; for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
      return palette[h % palette.length];
    },
    avatar(name, photo) {
      if (photo) return photo;
      const bg = util.hashColor(name);
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'><rect width='64' height='64' fill='${bg}'/><text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-family='Segoe UI,Arial' font-size='24' font-weight='700' fill='#fff'>${util.initials(name)}</text></svg>`;
      return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    },
    /** Period helper — returns { from, to, label } in ISO dates (inclusive). */
    range(period, custom) {
      const t = util.todayISO(); const d = new Date();
      switch (period) {
        case "today": return { from: t, to: t, label: "Today" };
        case "week": return { from: util.addDays(t, -6), to: t, label: "This Week" };
        case "month": return { from: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-01`, to: t, label: "This Month" };
        case "lastMonth": { const s = new Date(d.getFullYear(), d.getMonth() - 1, 1); const e = new Date(d.getFullYear(), d.getMonth(), 0); return { from: util.iso(s), to: util.iso(e), label: "Last Month" }; }
        case "year": return { from: `${d.getFullYear()}-01-01`, to: t, label: "This Year" };
        case "custom": return { from: custom.from, to: custom.to, label: `${util.fmtDate(custom.from)} – ${util.fmtDate(custom.to)}` };
        default: return { from: "0000-01-01", to: "9999-12-31", label: "All time" };
      }
    },
    inRange(date, r) { if (!r) return true; const x = String(date || "").slice(0, 10); return (!r.from || x >= r.from) && (!r.to || x <= r.to); },
    dateList(from, to) { const out = []; let x = from; while (x <= to && out.length < 400) { out.push(x); x = util.addDays(x, 1); } return out; },
    root() { return document.body.dataset.root || ""; },
    page(path) { return util.root() + path; },
    readFile(file) {
      return new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = reject; r.readAsDataURL(file); });
    },
    /** Downscale an image file to a small JPEG data URL (keeps localStorage small). */
    async imageToDataURL(file, max = 220) {
      const src = await util.readFile(file);
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
          const k = Math.min(1, max / Math.max(img.width, img.height));
          const c = document.createElement("canvas"); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
          c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
          resolve(c.toDataURL("image/jpeg", 0.82));
        };
        img.onerror = () => resolve(src);
        img.src = src;
      });
    },
    fileSize(b) { return b > 1048576 ? (b / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(b / 1024)) + " KB"; },
  };
  HH.util = util;
  const esc = util.esc;

  /* ========================================================= lookup ==== */
  const S = () => HH.store.settings();
  const lookup = {
    branches: () => S().branches || [],
    branchName(id) { if (!id || id === "All") return "All Branches"; const b = lookup.branches().find((x) => x.id === id); return b ? b.name : id; },
    branchOptions(withAll) { const o = lookup.branches().map((b) => ({ value: b.id, label: b.name })); return withAll ? [{ value: "All", label: "All Branches" }, ...o] : o; },
    list(key) { return (S()[key] || []).map((x) => (typeof x === "string" ? x : x.name)); },
    resident: (id) => HH.store.get("residents", id),
    residentName(id) { const r = lookup.resident(id); return r ? r.name : id ? "(removed)" : "—"; },
    residentOptions(filter) {
      return HH.store.all("residents").filter(filter || ((r) => r.status === "Active" || r.status === "On Leave"))
        .sort((a, b) => a.name.localeCompare(b.name)).map((r) => ({ value: r.id, label: `${r.name} (${r.id})` }));
    },
    room: (id) => HH.store.get("rooms", id),
    roomLabel(id) { const r = lookup.room(id); return r ? r.number : "—"; },
    roomOptions(branch) {
      return HH.store.all("rooms").filter((r) => !branch || r.branch === branch).sort((a, b) => a.number.localeCompare(b.number))
        .map((r) => ({ value: r.id, label: `${r.number} · ${r.type} · ${lookup.branchName(r.branch)}` }));
    },
    bedLabel(roomId, bedId) { const r = lookup.room(roomId); return r && bedId ? `${r.number} / ${(r.beds.find((b) => b.id === bedId) || {}).label || bedId}` : "—"; },
    staff: (id) => HH.store.get("staff", id),
    staffName(id) { const s = lookup.staff(id); return s ? s.name : id ? "(removed)" : "Unassigned"; },
    staffOptions(filter) { return HH.store.all("staff").filter(filter || ((s) => s.status !== "Resigned")).map((s) => ({ value: s.id, label: `${s.name} — ${s.designation}` })); },
    vendorName(id) { const v = HH.store.get("vendors", id); return v ? v.name : id || "—"; },
    vendorOptions() { return HH.store.all("vendors").map((v) => ({ value: v.id, label: v.name })); },
    plan: (id) => HH.store.get("messPlans", id),
    planName(id) { const p = lookup.plan(id); return p ? p.name : "—"; },
  };
  HH.lookup = lookup;

  /* =========================================================== calc ==== */
  const calc = {
    invoiceTotals(inv) {
      const subtotal = util.sum(inv.items || [], (i) => i.amount);
      const discount = Number(inv.discount) || 0;
      const taxable = Math.max(0, subtotal - discount);
      const tax = Math.round(taxable * (Number(inv.taxRate) || 0)) / 100;
      const lateFee = Number(inv.lateFee) || 0;
      const total = taxable + tax + lateFee;
      const paid = util.sum(inv.payments || [], (p) => p.amount);
      return { subtotal, discount, tax, lateFee, total, paid, balance: Math.max(0, Math.round((total - paid) * 100) / 100) };
    },
    invoiceStatus(inv) {
      if (inv.status === "Cancelled") return "Cancelled";
      const t = calc.invoiceTotals(inv);
      if (t.total > 0 && t.paid >= t.total) return "Paid";
      if (t.paid > 0) return inv.dueDate < util.todayISO() ? "Overdue" : "Partial";
      return inv.dueDate < util.todayISO() ? "Overdue" : "Unpaid";
    },
    openInvoices() { return HH.store.all("invoices").filter((i) => i.status !== "Cancelled" && calc.invoiceTotals(i).balance > 0); },
    residentBalance(resId) { return util.sum(calc.openInvoices().filter((i) => i.residentId === resId), (i) => calc.invoiceTotals(i).balance); },
    residentPaymentStatus(resId) {
      const inv = HH.store.all("invoices").filter((i) => i.residentId === resId && i.status !== "Cancelled");
      if (!inv.length) return "No Invoices";
      const open = inv.filter((i) => calc.invoiceTotals(i).balance > 0);
      if (!open.length) return "Paid";
      return open.some((i) => i.dueDate < util.todayISO()) ? "Overdue" : "Due";
    },
    /** Pending amounts split by fee category (proportional to remaining balance). */
    pendingByCategory() {
      const out = {};
      calc.openInvoices().forEach((inv) => {
        const t = calc.invoiceTotals(inv); const ratio = t.total ? t.balance / t.total : 0;
        (inv.items || []).forEach((it) => (out[it.category] = (out[it.category] || 0) + it.amount * ratio));
        if (t.lateFee) out["Late Fee"] = (out["Late Fee"] || 0) + t.lateFee * ratio;
      });
      Object.keys(out).forEach((k) => (out[k] = Math.round(out[k])));
      return out;
    },
    payments(range) {
      const out = [];
      HH.store.all("invoices").forEach((inv) => (inv.payments || []).forEach((p) => { if (util.inRange(p.date, range)) out.push(Object.assign({ invoiceId: inv.id, residentId: inv.residentId, items: inv.items }, p)); }));
      return out.sort((a, b) => b.date.localeCompare(a.date));
    },
    revenue(range) { return util.sum(calc.payments(range), (p) => p.amount); },
    expenses(range, includePending) { return HH.store.all("expenses").filter((e) => (e.status === "Approved" || (includePending && e.status === "Pending")) && util.inRange(e.date, range)); },
    expenseTotal(range) { return util.sum(calc.expenses(range), (e) => e.amount); },
    activeResidents() { return HH.store.all("residents").filter((r) => r.status === "Active" || r.status === "On Leave"); },
    /** Map "roomId|bedId" -> resident for every active resident holding a bed. */
    bedMap() {
      const m = {};
      calc.activeResidents().forEach((r) => { if (r.roomId && r.bed) m[`${r.roomId}|${r.bed}`] = r; });
      return m;
    },
    isBedFree(roomId, bedId, exceptResidentId) {
      const r = calc.bedMap()[`${roomId}|${bedId}`];
      return !r || r.id === exceptResidentId;
    },
    freeBeds(roomId, exceptResidentId) {
      const room = lookup.room(roomId); if (!room || room.status !== "Available") return [];
      const map = calc.bedMap();
      return room.beds.filter((b) => b.status === "Available" && (!map[`${roomId}|${b.id}`] || map[`${roomId}|${b.id}`].id === exceptResidentId));
    },
    roomStats(room, map) {
      map = map || calc.bedMap();
      const occupied = room.beds.filter((b) => map[`${room.id}|${b.id}`]).length;
      const blocked = room.beds.filter((b) => b.status !== "Available" && !map[`${room.id}|${b.id}`]).length;
      const total = room.beds.length;
      const vacant = room.status === "Available" ? total - occupied - blocked : 0;
      return { total, occupied, vacant, blocked: room.status === "Available" ? blocked : total - occupied, pct: util.pct(occupied, total) };
    },
    occupancy(branch) {
      const map = calc.bedMap();
      const rooms = HH.store.all("rooms").filter((r) => !branch || branch === "All" || r.branch === branch);
      const t = { rooms: rooms.length, total: 0, occupied: 0, vacant: 0, blocked: 0 };
      rooms.forEach((r) => { const s = calc.roomStats(r, map); t.total += s.total; t.occupied += s.occupied; t.vacant += s.vacant; t.blocked += s.blocked; });
      t.pct = util.pct(t.occupied, t.total);
      return t;
    },
    attendanceSheet(date, meal) { return HH.store.get("attendance", `ATT-${date.replace(/-/g, "")}-${meal[0]}`); },
    mealCount(date, meal, branch) {
      const s = calc.attendanceSheet(date, meal); if (!s) return 0;
      return Object.entries(s.marks).filter(([id, v]) => v === "P" && (!branch || branch === "All" || (lookup.resident(id) || {}).branch === branch)).length;
    },
    stockValue(item) { return (Number(item.stock) || 0) * (Number(item.price) || 0); },
    isLowStock(item) { return Number(item.stock) <= Number(item.minStock); },
    expiresInDays(item) { return item.expiryDate ? util.daysBetween(util.todayISO(), item.expiryDate) : Infinity; },
    menuFor(date, meal) { return HH.store.all("menus").find((m) => m.date === date && m.meal === meal); },
    isOverdueTicket(t) { return !["Resolved", "Closed"].includes(t.status) && t.dueDate && t.dueDate < util.todayISO(); },
  };
  HH.calc = calc;

  /* ============================================================= ui ==== */
  const TONES = {
    green: ["Active", "Paid", "Approved", "Present", "Resolved", "Available", "Published", "Completed", "In Stock", "Income", "Checked In", "Open Now", "P", "Closed OK"],
    blue: ["In Progress", "Partial", "Assigned", "On Leave", "Draft", "Scheduled", "Low", "Info", "Inside", "L"],
    orange: ["Pending", "Unpaid", "Due", "Medium", "On Hold", "Expiring", "Low Stock", "Unpublished", "Open"],
    red: ["Inactive", "Overdue", "Rejected", "Absent", "Cancelled", "Critical", "High", "Expired", "Out of Stock", "Expense", "Maintenance", "Resigned", "A", "Occupied"],
    gray: ["Checked Out", "Closed", "Archived", "Not Applicable", "NA", "No Invoices", "Vacant", "H"],
    purple: ["Full Board"],
  };
  const toneOf = (s) => { for (const [t, list] of Object.entries(TONES)) if (list.includes(s)) return t; return "gray"; };
  const ui = {
    toneOf,
    badge(text, tone) { return `<span class="badge-hh tone-${tone || toneOf(text)}">${esc(text)}</span>`; },
    person(name, meta, photo) {
      return `<div class="person"><img class="avatar" src="${util.avatar(name, photo)}" alt=""><div style="min-width:0"><div class="person__name">${esc(name)}</div>${meta ? `<div class="person__meta">${esc(meta)}</div>` : ""}</div></div>`;
    },
    statCards(cards) {
      return `<div class="stat-grid">${cards.map((c, i) => {
        const tag = c.href ? "a" : c.onClick ? "button" : "div";
        return `<${tag} class="stat-card" ${c.href ? `href="${c.href}"` : ""} ${c.onClick ? `type="button" data-stat="${i}"` : ""}>
          <span class="chip-icon tone-${c.tone || "blue"}"><i class="bi ${c.icon || "bi-graph-up"}"></i></span>
          <span style="min-width:0"><span class="stat-card__label d-block">${esc(c.label)}</span><span class="stat-card__value d-block">${c.value}</span>${c.meta ? `<span class="stat-card__meta d-block">${c.meta}</span>` : ""}</span>
        </${tag}>`;
      }).join("")}</div>`;
    },
    bindStatCards(root, cards) { root.querySelectorAll("[data-stat]").forEach((b) => b.addEventListener("click", () => cards[+b.dataset.stat].onClick())); },
    empty(text = "No records found", icon = "bi-inbox", sub = "") { return `<div class="empty-state"><i class="bi ${icon}"></i><strong>${esc(text)}</strong>${sub ? `<span>${sub}</span>` : ""}</div>`; },
    kv(items, cols) {
      return `<div class="kv ${cols === 3 ? "kv--3" : ""}">${items.filter(Boolean).map(([k, v, full]) => `<div class="kv__item ${full ? "kv__item--full" : ""}"><div class="kv__label">${esc(k)}</div><div class="kv__value">${v == null || v === "" ? "—" : v}</div></div>`).join("")}</div>`;
    },
    /** Tabs. tabs = [{key,label,icon,count}], options.hash -> sync with location.hash */
    tabs(el, tabs, onChange, options = {}) {
      el.classList.add("tabs-hh");
      el.setAttribute("role", "tablist");
      el.innerHTML = tabs.map((t) => `<button type="button" role="tab" data-tab="${t.key}">${t.icon ? `<i class="bi ${t.icon}"></i>` : ""}${esc(t.label)}${t.count != null ? ` <span class="badge-hh tone-gray">${t.count}</span>` : ""}</button>`).join("");
      const set = (key, silent) => {
        if (!tabs.some((t) => t.key === key)) key = tabs[0].key;
        el.querySelectorAll("button").forEach((b) => b.classList.toggle("is-active", b.dataset.tab === key));
        if (options.hash) history.replaceState(null, "", "#" + key);
        if (!silent) onChange(key);
      };
      el.addEventListener("click", (e) => { const b = e.target.closest("button[data-tab]"); if (b) set(b.dataset.tab); });
      if (options.hash) window.addEventListener("hashchange", () => set(location.hash.slice(1)));
      const initial = (options.hash && location.hash.slice(1)) || options.initial || tabs[0].key;
      set(initial);
      return { set };
    },
    /** Show/hide tab panels [data-panel=key] inside root. */
    panels(root, key) { root.querySelectorAll("[data-panel]").forEach((p) => (p.hidden = p.dataset.panel !== key)); },
    options(list, selected, placeholder) {
      const norm = (list || []).map((o) => (typeof o === "object" ? o : { value: o, label: o }));
      return (placeholder != null ? `<option value="">${esc(placeholder)}</option>` : "") +
        norm.map((o) => `<option value="${esc(o.value)}" ${String(o.value) === String(selected ?? "") ? "selected" : ""}>${esc(o.label)}</option>`).join("");
    },
    progress(pct, tone) { const c = tone || (pct >= 90 ? "var(--red)" : pct >= 70 ? "var(--yellow-600)" : "var(--green)"); return `<div class="progress-hh"><span style="width:${Math.min(100, pct)}%;background:${c}"></span></div>`; },
  };
  HH.ui = ui;

  /* ======================================================== confirm ==== */
  HH.confirm = function (message, opts = {}) {
    return new Promise((resolve) => {
      const tone = opts.tone || (opts.danger ? "red" : "blue");
      const host = document.querySelector(".modal.show") || document.querySelector(".offcanvas.show") || document.body;
      const ov = document.createElement("div");
      ov.className = "confirm-overlay";
      ov.innerHTML = `<div class="confirm-box" role="alertdialog" aria-modal="true">
        <div class="confirm-box__icon tone-${tone}"><i class="bi ${opts.icon || (opts.danger ? "bi-exclamation-triangle" : "bi-question-circle")}"></i></div>
        <h5>${esc(opts.title || "Are you sure?")}</h5>
        <p>${message}</p>
        ${opts.input ? `<div class="field"><label>${esc(opts.input.label || "")}</label><${opts.input.type === "textarea" ? "textarea class='textarea-hh'" : "input class='input-hh' type='" + (opts.input.type || "text") + "'"} data-confirm-input value="${esc(opts.input.value || "")}" placeholder="${esc(opts.input.placeholder || "")}">${opts.input.type === "textarea" ? esc(opts.input.value || "") + "</textarea>" : ""}</div>` : ""}
        <div class="confirm-box__actions">
          <button type="button" class="btn-hh" data-act="no">${esc(opts.cancelText || "Cancel")}</button>
          <button type="button" class="btn-hh ${opts.danger ? "btn-hh--danger" : "btn-hh--primary"}" data-act="yes">${esc(opts.okText || (opts.danger ? "Delete" : "Confirm"))}</button>
        </div></div>`;
      host.appendChild(ov);
      const input = ov.querySelector("[data-confirm-input]");
      (input || ov.querySelector('[data-act="yes"]')).focus();
      const done = (val) => { ov.remove(); document.removeEventListener("keydown", onKey, true); resolve(val); };
      const onKey = (e) => {
        if (e.key === "Escape") { e.stopPropagation(); e.preventDefault(); done(opts.input ? null : false); }
        if (e.key === "Enter" && (!input || input.tagName !== "TEXTAREA")) { e.preventDefault(); ov.querySelector('[data-act="yes"]').click(); }
      };
      document.addEventListener("keydown", onKey, true);
      ov.addEventListener("click", (e) => {
        const b = e.target.closest("[data-act]");
        if (e.target === ov) return done(opts.input ? null : false);
        if (!b) return;
        if (b.dataset.act === "no") return done(opts.input ? null : false);
        if (opts.input) {
          const v = input.value.trim();
          if (opts.input.required && !v) { input.classList.add("is-invalid"); input.style.borderColor = "var(--red)"; input.focus(); return; }
          return done(v);
        }
        done(true);
      });
    });
  };
  HH.prompt = (message, input, opts = {}) => HH.confirm(message, Object.assign({ input, okText: "Save" }, opts));

  /* ========================================================== modal ==== */
  /**
   * HH.modal({ title, icon, body (html|Node), size:'sm'|'lg'|'xl', footer:[{label, cls, icon, onClick(ctx), close}],
   *            onShown(ctx), onHide(ctx) -> false to cancel, onHidden(ctx), static })
   */
  HH.modal = function (o) {
    const el = document.createElement("div");
    el.className = "modal fade hh-modal";
    el.tabIndex = -1;
    el.innerHTML = `<div class="modal-dialog modal-dialog-centered modal-dialog-scrollable ${o.size ? "modal-" + o.size : ""}">
      <div class="modal-content">
        <div class="modal-header"><h5 class="modal-title">${o.icon ? `<span class="chip-icon"><i class="bi ${o.icon}"></i></span>` : ""}<span>${esc(o.title || "")}</span></h5>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>
        <div class="modal-body"></div>
        ${o.footer && o.footer.length ? `<div class="modal-footer"></div>` : ""}
      </div></div>`;
    document.body.appendChild(el);
    const body = el.querySelector(".modal-body");
    if (o.body instanceof Node) body.appendChild(o.body); else body.innerHTML = o.body || "";
    const bs = new bootstrap.Modal(el, { backdrop: o.static ? "static" : true, keyboard: true });
    const ctx = { el, body, bs, close: () => { ctx.force = true; bs.hide(); }, setTitle: (t) => (el.querySelector(".modal-title span:last-child").textContent = t) };
    if (o.footer && o.footer.length) {
      const f = el.querySelector(".modal-footer");
      o.footer.forEach((b) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = `btn-hh ${b.cls || ""}`;
        btn.innerHTML = `${b.icon ? `<i class="bi ${b.icon}"></i>` : ""}<span>${esc(b.label)}</span>`;
        if (b.left) { let l = f.querySelector(".footer-left"); if (!l) { l = document.createElement("div"); l.className = "footer-left"; f.prepend(l); } l.appendChild(btn); } else f.appendChild(btn);
        btn.addEventListener("click", () => { if (b.close) return ctx.close(); b.onClick && b.onClick(ctx, btn); });
        if (b.key) ctx[b.key] = btn;
      });
    }
    el.addEventListener("hide.bs.modal", (e) => {
      if (ctx.force || !o.onHide) return;
      const r = o.onHide(ctx);
      if (r === false) e.preventDefault();
    });
    el.addEventListener("shown.bs.modal", () => { o.onShown && o.onShown(ctx); const f = body.querySelector("input:not([type=hidden]):not([readonly]):not([disabled]), select, textarea"); f && o.autofocus !== false && f.focus(); });
    el.addEventListener("hidden.bs.modal", () => { o.onHidden && o.onHidden(ctx); bs.dispose(); el.remove(); });
    bs.show();
    return ctx;
  };

  /* ========================================================= drawer ==== */
  HH.drawer = function (o) {
    const el = document.createElement("div");
    el.className = "offcanvas offcanvas-end hh-drawer";
    el.tabIndex = -1;
    if (o.width) el.style.setProperty("--bs-offcanvas-width", o.width);
    el.innerHTML = `<div class="offcanvas-header"><h5 class="offcanvas-title">${esc(o.title || "")}</h5><button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button></div>
      <div class="offcanvas-body"></div>${o.footer && o.footer.length ? `<div class="drawer-foot"></div>` : ""}`;
    document.body.appendChild(el);
    const body = el.querySelector(".offcanvas-body");
    if (o.body instanceof Node) body.appendChild(o.body); else body.innerHTML = o.body || "";
    const bs = new bootstrap.Offcanvas(el);
    const ctx = { el, body, bs, close: () => { ctx.force = true; bs.hide(); } };
    (o.footer || []).forEach((b) => {
      const btn = document.createElement("button");
      btn.type = "button"; btn.className = `btn-hh ${b.cls || ""}`;
      btn.innerHTML = `${b.icon ? `<i class="bi ${b.icon}"></i>` : ""}<span>${esc(b.label)}</span>`;
      btn.addEventListener("click", () => (b.close ? ctx.close() : b.onClick && b.onClick(ctx, btn)));
      el.querySelector(".drawer-foot").appendChild(btn);
    });
    el.addEventListener("hide.bs.offcanvas", (e) => { if (!ctx.force && o.onHide && o.onHide(ctx) === false) e.preventDefault(); });
    el.addEventListener("shown.bs.offcanvas", () => o.onShown && o.onShown(ctx));
    el.addEventListener("hidden.bs.offcanvas", () => { o.onHidden && o.onHidden(ctx); bs.dispose(); el.remove(); });
    bs.show();
    return ctx;
  };

  /* =========================================================== menu ==== */
  let openMenu = null;
  HH.menu = {
    /** items: [{label, icon, onClick, danger, divider, disabled}] */
    open(anchor, items) {
      HH.menu.close();
      const m = document.createElement("div");
      m.className = "dropdown-menu hh-menu show";
      m.setAttribute("role", "menu");
      m.style.position = "fixed";
      items.filter(Boolean).forEach((it) => {
        if (it.divider) { m.insertAdjacentHTML("beforeend", '<hr class="dropdown-divider">'); return; }
        const b = document.createElement("button");
        b.type = "button"; b.className = `dropdown-item ${it.danger ? "is-danger" : ""}`; b.disabled = !!it.disabled;
        b.innerHTML = `<i class="bi ${it.icon || "bi-dot"}"></i><span>${esc(it.label)}</span>`;
        b.addEventListener("click", (e) => { e.stopPropagation(); HH.menu.close(); it.onClick && it.onClick(); });
        m.appendChild(b);
      });
      (anchor.closest(".modal.show, .offcanvas.show") || document.body).appendChild(m);
      const r = anchor.getBoundingClientRect();
      const mw = m.offsetWidth, mh = m.offsetHeight;
      let left = r.right - mw; if (left < 8) left = 8;
      let top = r.bottom + 4; if (top + mh > innerHeight - 8) top = Math.max(8, r.top - mh - 4);
      m.style.left = left + "px"; m.style.top = top + "px";
      anchor.setAttribute("aria-expanded", "true");
      openMenu = { m, anchor };
      setTimeout(() => m.querySelector("button:not(:disabled)")?.focus({ preventScroll: true }), 0);
    },
    close() { if (openMenu) { openMenu.m.remove(); openMenu.anchor.setAttribute("aria-expanded", "false"); openMenu = null; } },
  };
  document.addEventListener("click", (e) => { if (openMenu && !openMenu.m.contains(e.target) && !openMenu.anchor.contains(e.target)) HH.menu.close(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") HH.menu.close(); });
  window.addEventListener("scroll", () => HH.menu.close(), true);
  window.addEventListener("resize", () => HH.menu.close());

  /* =========================================================== form ==== */
  /**
   * Field spec:
   *  { name, label, type: text|email|tel|number|date|time|datetime-local|month|select|textarea|checks|switch|file|photo|password|color|section|html,
   *    required, options (array | fn(values)), col (12|8|6|4|3), placeholder, min, max, step, pattern, patternMsg, help,
   *    default (value | fn), readonly, disabled, multiple, accept, rows, validate(value, values) -> msg, onChange(value, form, ctx) }
   */
  const form = {
    build(fields, values = {}) {
      return `<form class="form-grid" novalidate autocomplete="off">${fields.map((f) => form.fieldHTML(f, values)).join("")}<button type="submit" hidden></button></form>`;
    },
    fieldHTML(f, values) {
      if (f.type === "section") return `<div class="form-section-title">${f.icon ? `<i class="bi ${f.icon}"></i>` : ""}${esc(f.label)}</div>`;
      if (f.type === "html") return `<div class="f-col-${f.col || 12}">${typeof f.html === "function" ? f.html(values) : f.html}</div>`;
      let v = values[f.name];
      if (v === undefined) v = typeof f.default === "function" ? f.default(values) : f.default;
      if (v === undefined || v === null) v = f.type === "checks" ? [] : "";
      const id = `f_${f.name}_${Math.random().toString(36).slice(2, 7)}`;
      const attrs = [
        `id="${id}"`, `name="${f.name}"`, f.required ? "required" : "", f.readonly ? "readonly" : "", f.disabled ? "disabled" : "",
        f.placeholder ? `placeholder="${esc(f.placeholder)}"` : "", f.min != null ? `min="${f.min}"` : "", f.max != null ? `max="${f.max}"` : "",
        f.step != null ? `step="${f.step}"` : "", f.pattern ? `pattern="${f.pattern}"` : "", f.maxlength ? `maxlength="${f.maxlength}"` : "",
      ].join(" ");
      const opts = typeof f.options === "function" ? f.options(values) : f.options || [];
      let input;
      switch (f.type) {
        case "select":
          input = `<select class="select-hh" ${attrs} ${f.multiple ? "multiple" : ""}>${ui.options(opts, v, f.multiple ? null : (f.placeholder ?? "Select…"))}</select>`;
          if (f.multiple) input = input.replace(/<option value="([^"]*)"/g, (m, val) => (Array.isArray(v) && v.includes(val) ? `${m} selected` : m));
          break;
        case "textarea": input = `<textarea class="textarea-hh" rows="${f.rows || 3}" ${attrs}>${esc(v)}</textarea>`; break;
        case "checks":
          input = `<div class="check-grid" data-checks="${f.name}">${opts.map((o) => { const val = typeof o === "object" ? o.value : o; const lab = typeof o === "object" ? o.label : o; return `<label class="check-hh"><input type="checkbox" value="${esc(val)}" ${v.includes(val) ? "checked" : ""} ${f.disabled ? "disabled" : ""}> ${esc(lab)}</label>`; }).join("")}</div>`;
          break;
        case "switch": input = `<label class="switch-hh"><input type="checkbox" ${attrs} ${v ? "checked" : ""}> <span>${esc(f.switchLabel || "Enabled")}</span></label>`; break;
        case "file": {
          const files = Array.isArray(v) ? v : v ? [v] : [];
          input = `<input class="input-hh" type="file" ${attrs.replace("required", "")} ${f.multiple ? "multiple" : ""} accept="${f.accept || ""}">
            <div class="file-preview" data-files="${f.name}">${files.map((x, i) => `<span class="file-chip" data-i="${i}"><i class="bi bi-paperclip"></i><span>${esc(x.name)}</span><button type="button" class="btn-close" style="font-size:8px" data-remove-file="${i}" aria-label="Remove"></button></span>`).join("")}</div>`;
          break;
        }
        case "photo":
          input = `<div class="file-preview"><img src="${v || util.avatar(values.name || "New")}" alt="" data-photo-preview="${f.name}"><input class="input-hh" style="flex:1;min-width:0" type="file" accept="image/*" ${attrs.replace("required", "")}>${v ? `<button type="button" class="btn-hh btn-hh--sm" data-photo-clear="${f.name}">Remove</button>` : ""}</div>`;
          break;
        default:
          input = `<input class="input-hh" type="${f.type || "text"}" value="${esc(v)}" ${attrs}>`;
      }
      return `<div class="field f-col-${f.col || 12}" data-field="${f.name}">${f.label && f.type !== "switch" ? `<label for="${id}">${esc(f.label)}${f.required ? '<span class="req">*</span>' : ""}</label>` : f.type === "switch" ? `<span class="field-label">${esc(f.label)}</span>` : ""}${input}${f.help ? `<div class="field-help">${f.help}</div>` : ""}<div class="field-error"></div></div>`;
    },
    /** Attach file/photo behaviour; keeps pending file values on the form element. */
    wire(formEl, fields, values = {}) {
      formEl._files = {};
      fields.forEach((f) => {
        if (f.type === "file") formEl._files[f.name] = Array.isArray(values[f.name]) ? values[f.name].slice() : values[f.name] ? [values[f.name]] : [];
        if (f.type === "photo") formEl._files[f.name] = values[f.name] || "";
      });
      if (formEl._wired) return;
      formEl._wired = true;
      formEl.addEventListener("change", async (e) => {
        const inp = e.target; const f = fields.find((x) => x.name === inp.name);
        if (!f) return;
        if (f.type === "photo" && inp.files && inp.files[0]) {
          formEl._files[f.name] = await util.imageToDataURL(inp.files[0]);
          formEl.querySelector(`[data-photo-preview="${f.name}"]`).src = formEl._files[f.name];
        }
        if (f.type === "file" && inp.files) {
          for (const file of inp.files) {
            const rec = { name: file.name, type: file.type, size: file.size, uploadedOn: util.todayISO() };
            if (file.size <= 350 * 1024) rec.data = file.type.startsWith("image/") ? await util.imageToDataURL(file, 900) : await util.readFile(file);
            if (f.multiple) formEl._files[f.name].push(rec); else formEl._files[f.name] = [rec];
          }
          inp.value = "";
          form.renderFiles(formEl, f.name);
        }
      });
      formEl.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-remove-file]");
        if (rm) { const name = rm.closest("[data-files]").dataset.files; formEl._files[name].splice(+rm.dataset.removeFile, 1); form.renderFiles(formEl, name); formEl.dispatchEvent(new Event("input", { bubbles: true })); }
        const pc = e.target.closest("[data-photo-clear]");
        if (pc) { formEl._files[pc.dataset.photoClear] = ""; formEl.querySelector(`[data-photo-preview="${pc.dataset.photoClear}"]`).src = util.avatar("New"); pc.remove(); formEl.dispatchEvent(new Event("input", { bubbles: true })); }
      });
    },
    renderFiles(formEl, name) {
      const box = formEl.querySelector(`[data-files="${name}"]`);
      box.innerHTML = formEl._files[name].map((x, i) => `<span class="file-chip"><i class="bi bi-paperclip"></i><span>${esc(x.name)}</span><small class="text-2">${util.fileSize(x.size || 0)}</small><button type="button" class="btn-close" style="font-size:8px" data-remove-file="${i}" aria-label="Remove"></button></span>`).join("");
    },
    read(formEl, fields) {
      const out = {};
      fields.forEach((f) => {
        if (!f.name || ["section", "html"].includes(f.type)) return;
        if (f.type === "checks") { out[f.name] = [...formEl.querySelectorAll(`[data-checks="${f.name}"] input:checked`)].map((i) => i.value); return; }
        if (f.type === "file") { out[f.name] = f.multiple ? (formEl._files[f.name] || []) : (formEl._files[f.name] || [])[0] || null; return; }
        if (f.type === "photo") { out[f.name] = formEl._files[f.name] || ""; return; }
        const el = formEl.elements[f.name]; if (!el) return;
        if (f.type === "switch") out[f.name] = el.checked;
        else if (f.type === "select" && f.multiple) out[f.name] = [...el.selectedOptions].map((o) => o.value);
        else if (f.type === "number") out[f.name] = el.value === "" ? "" : Number(el.value);
        else out[f.name] = typeof el.value === "string" ? el.value.trim() : el.value;
      });
      return out;
    },
    /** Replace the <option>s of a select field (dependent dropdowns). */
    setOptions(formEl, name, options, selected, placeholder = "Select…") {
      const el = formEl.elements[name]; if (!el) return;
      el.innerHTML = ui.options(options, selected, placeholder);
    },
  };
  HH.form = form;

  /**
   * HH.formModal({ title, icon, fields, values, size, submitText, onSubmit(data, ctx) -> true|string|Promise,
   *                onReady(formEl, ctx), extraButtons })
   * Handles validation, Save / Reset / Cancel / Close and unsaved-change warnings.
   */
  HH.formModal = function (o) {
    const values = Object.assign({}, o.values || {});
    let dirty = false, saving = false;
    const ctx = HH.modal({
      title: o.title, icon: o.icon, size: o.size || "lg", body: form.build(o.fields, values),
      footer: [
        { label: "Reset", icon: "bi-arrow-counterclockwise", cls: "btn-hh--ghost", left: true, onClick: (c) => reset(c) },
        ...(o.extraButtons || []),
        { label: "Cancel", close: false, onClick: (c) => c.bs.hide() },
        { label: o.submitText || "Save", icon: "bi-check2", cls: "btn-hh--primary", key: "saveBtn", onClick: () => submit() },
      ],
      onHide: (c) => {
        if (!dirty || saving) return true;
        HH.confirm("You have unsaved changes. Close this form and discard them?", { title: "Discard changes?", okText: "Discard", danger: true, icon: "bi-pencil-square" })
          .then((ok) => { if (ok) { dirty = false; c.close(); } });
        return false;
      },
    });
    const formEl = ctx.body.querySelector("form");
    ctx.form = formEl;
    form.wire(formEl, o.fields, values);
    formEl.addEventListener("input", () => (dirty = true));
    formEl.addEventListener("change", (e) => {
      dirty = true;
      const f = o.fields.find((x) => x.name === e.target.name);
      if (f && f.onChange) f.onChange(e.target.value, formEl, ctx);
      const wrap = e.target.closest(".field.has-error"); if (wrap && HH.validate) HH.validate.field(formEl, f);
    });
    formEl.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    function reset() {
      const tmp = document.createElement("div");
      tmp.innerHTML = form.build(o.fields, values);
      formEl.innerHTML = tmp.firstElementChild.innerHTML;
      form.wire(formEl, o.fields, values);
      dirty = false;
      o.onReady && o.onReady(formEl, ctx);
      HH.toast("Form reset to its original values.", "info");
    }
    async function submit() {
      if (saving) return;
      if (!HH.validate.form(formEl, o.fields)) { HH.toast("Please fix the highlighted fields.", "error"); return; }
      const data = form.read(formEl, o.fields);
      saving = true; ctx.saveBtn.disabled = true;
      try {
        const res = await o.onSubmit(data, ctx);
        if (res === true || res === undefined) { dirty = false; ctx.close(); }
        else if (typeof res === "string") HH.toast(res, "error");
      } catch (err) {
        console.error(err); HH.toast(err.message || "Something went wrong while saving.", "error");
      } finally { saving = false; if (ctx.saveBtn) ctx.saveBtn.disabled = false; }
    }
    o.onReady && o.onReady(formEl, ctx);
    return ctx;
  };

  /* ========================================================== Table ==== */
  /**
   * new HH.Table(container, { columns:[{key,label,render(r),value(r),sortable,cls,thCls}], rows, pageSize,
   *   sort:{key,dir}, onRowClick(r), rowActions(r) -> menu items, selectable, onSelect(ids), empty, compact, footerRow(rows)->html })
   */
  class Table {
    constructor(el, o) {
      this.el = typeof el === "string" ? document.querySelector(el) : el;
      this.o = Object.assign({ pageSize: 10, page: 1, sort: null }, o);
      this.page = 1;
      this.pageSize = HH.store.pref(`pageSize:${this.o.id || location.pathname}`, this.o.pageSize);
      this.sort = this.o.sort;
      this.selected = new Set();
      this.rows = o.rows || [];
      this.el.addEventListener("click", (e) => this._click(e));
      this.el.addEventListener("change", (e) => this._change(e));
      this.render();
    }
    setRows(rows, keepPage) { this.rows = rows; if (!keepPage) this.page = 1; this.render(); }
    value(col, r) { return col.value ? col.value(r) : r[col.key]; }
    sorted() {
      if (!this.sort) return this.rows.slice();
      const col = this.o.columns.find((c) => c.key === this.sort.key); if (!col) return this.rows.slice();
      const dir = this.sort.dir === "desc" ? -1 : 1;
      return this.rows.slice().sort((a, b) => {
        let x = this.value(col, a), y = this.value(col, b);
        if (x == null) x = ""; if (y == null) y = "";
        if (typeof x === "number" && typeof y === "number") return (x - y) * dir;
        return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: "base" }) * dir;
      });
    }
    render() {
      const o = this.o, cols = o.columns;
      const all = this.sorted();
      const pages = Math.max(1, Math.ceil(all.length / this.pageSize));
      if (this.page > pages) this.page = pages;
      const start = (this.page - 1) * this.pageSize;
      const pageRows = o.paginate === false ? all : all.slice(start, start + this.pageSize);
      this.pageRows = pageRows;
      const head = `${o.selectable ? `<th class="col-check"><input type="checkbox" class="form-check-input" data-check-all aria-label="Select all"></th>` : ""}${cols.map((c) => {
        const sortable = c.sortable !== false;
        const isS = this.sort && this.sort.key === c.key;
        return `<th class="${c.thCls || ""} ${sortable ? "is-sortable" : ""} ${isS ? "is-sorted" : ""}" ${sortable ? `data-sort="${c.key}"` : ""} scope="col">${esc(c.label)}${sortable ? `<span class="sort-ind"><i class="bi ${isS ? (this.sort.dir === "desc" ? "bi-caret-down-fill" : "bi-caret-up-fill") : "bi-chevron-expand"}"></i></span>` : ""}</th>`;
      }).join("")}${o.rowActions ? `<th class="col-actions">Action</th>` : ""}`;
      const body = pageRows.length ? pageRows.map((r, i) => `<tr data-i="${i}" class="${o.onRowClick ? "is-clickable" : ""} ${o.rowCls ? o.rowCls(r) : ""}">${o.selectable ? `<td class="col-check"><input type="checkbox" class="form-check-input" data-check="${esc(r.id)}" ${this.selected.has(r.id) ? "checked" : ""} aria-label="Select row"></td>` : ""}${cols.map((c) => `<td class="${c.cls || ""}">${c.render ? c.render(r) : esc(this.value(c, r) ?? "—")}</td>`).join("")}${o.rowActions ? `<td class="col-actions"><button type="button" class="row-menu-btn" data-row-menu="${i}" aria-label="Row actions" aria-haspopup="true"><i class="bi bi-three-dots"></i></button></td>` : ""}</tr>`).join("")
        : `<tr><td colspan="${cols.length + (o.rowActions ? 1 : 0) + (o.selectable ? 1 : 0)}">${ui.empty(o.empty || "No records match your filters", "bi-search", o.emptySub || "Try clearing the search or filters.")}</td></tr>`;
      const foot = o.footerRow && all.length ? `<tfoot>${o.footerRow(all)}</tfoot>` : "";
      const showing = all.length ? `Showing <b>${start + 1}–${Math.min(start + this.pageSize, all.length)}</b> of <b>${all.length}</b>` : "No records";
      this.el.innerHTML = `<div class="table-wrap"><table class="table-hh ${o.compact ? "table-compact" : ""}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}</table></div>
        ${o.paginate === false ? "" : `<div class="table-foot"><span>${showing}</span><span class="row-flex">Rows per page <select class="select-hh" data-page-size aria-label="Rows per page">${[5, 10, 25, 50, 100].map((n) => `<option ${n === this.pageSize ? "selected" : ""}>${n}</option>`).join("")}</select></span><nav class="pager" aria-label="Pagination">${this._pager(pages)}</nav></div>`}`;
      const ca = this.el.querySelector("[data-check-all]");
      if (ca) ca.checked = pageRows.length > 0 && pageRows.every((r) => this.selected.has(r.id));
    }
    _pager(pages) {
      const p = this.page; const btn = (n, label, dis) => `<button type="button" data-page="${n}" ${dis ? "disabled" : ""} class="${n === p && !label ? "is-active" : ""}" ${label ? `aria-label="${label}"` : ""}>${label ? `<i class="bi ${label === "Previous" ? "bi-chevron-left" : "bi-chevron-right"}"></i>` : n}</button>`;
      const out = [btn(p - 1, "Previous", p <= 1)];
      const nums = new Set([1, pages, p - 1, p, p + 1].filter((n) => n >= 1 && n <= pages));
      let last = 0;
      [...nums].sort((a, b) => a - b).forEach((n) => { if (n - last > 1) out.push(`<span class="pager-gap">…</span>`); out.push(btn(n)); last = n; });
      out.push(btn(p + 1, "Next", p >= pages));
      return out.join("");
    }
    _click(e) {
      const s = e.target.closest("[data-sort]");
      if (s) { const k = s.dataset.sort; this.sort = this.sort && this.sort.key === k ? { key: k, dir: this.sort.dir === "asc" ? "desc" : "asc" } : { key: k, dir: "asc" }; this.render(); return; }
      const pg = e.target.closest("button[data-page]");
      if (pg) { this.page = +pg.dataset.page; this.render(); this.el.scrollIntoView({ block: "nearest" }); return; }
      const rm = e.target.closest("[data-row-menu]");
      if (rm) { e.stopPropagation(); const r = this.pageRows[+rm.dataset.rowMenu]; HH.menu.open(rm, this.o.rowActions(r)); return; }
      if (e.target.closest("input,button,a,select,label")) return;
      const tr = e.target.closest("tbody tr[data-i]");
      if (tr && this.o.onRowClick) this.o.onRowClick(this.pageRows[+tr.dataset.i]);
    }
    _change(e) {
      if (e.target.matches("[data-page-size]")) { this.pageSize = +e.target.value; HH.store.setPref(`pageSize:${this.o.id || location.pathname}`, this.pageSize); this.page = 1; this.render(); return; }
      if (e.target.matches("[data-check-all]")) { this.pageRows.forEach((r) => (e.target.checked ? this.selected.add(r.id) : this.selected.delete(r.id))); this.render(); this._sel(); return; }
      if (e.target.matches("[data-check]")) { const id = e.target.dataset.check; e.target.checked ? this.selected.add(id) : this.selected.delete(id); this._sel(); const ca = this.el.querySelector("[data-check-all]"); if (ca) ca.checked = this.pageRows.every((r) => this.selected.has(r.id)); }
    }
    _sel() { this.o.onSelect && this.o.onSelect([...this.selected]); }
    clearSelection() { this.selected.clear(); this.render(); this._sel(); }
    sortedRows() { return this.sorted(); }
  }
  HH.Table = Table;

  /* ======================================================= CrudPage ==== */
  /**
   * HH.CrudPage(config) — see README "CRUD engine" for the complete option list.
   * Key options: collection, entity, columns, fields, searchKeys|search, filters, dateFilter, tabs, stats,
   * defaults, beforeSave, afterSave, beforeDelete, afterDelete, view, viewFooter, actions, toolbarButtons,
   * bulkActions, defaultSort, pageSize, rowClick, exportName, csvColumns, baseFilter, noAdd, noEdit, noDelete.
   */
  HH.CrudPage = function (cfg) {
    const root = typeof cfg.mount === "string" ? document.querySelector(cfg.mount) : cfg.mount || document.getElementById("moduleRoot");
    const inlineActions = cfg.actionsHost === "inline";
    let actionsHost = inlineActions ? null : typeof cfg.actionsHost === "string" ? document.querySelector(cfg.actionsHost) : cfg.actionsHost || document.getElementById("pageActions");
    const entity = cfg.entity || "Record";
    const state = { q: util.qs("q") || "", filters: {}, from: "", to: "", tab: null };
    (cfg.filters || []).forEach((f) => { const v = util.qs(f.key); state.filters[f.key] = v != null ? v : f.default || ""; });

    root.innerHTML = `
      ${cfg.stats ? `<div data-stats></div>` : ""}
      ${cfg.before ? `<div data-before></div>` : ""}
      <section class="card-hh card-hh--flush list-card">
        ${cfg.tabs ? `<div data-tabs style="padding:0 var(--sp-5)"></div>` : ""}
        <div class="toolbar">
          <div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" data-search placeholder="${esc(cfg.searchPlaceholder || `Search ${(cfg.entityPlural || entity + "s").toLowerCase()}…`)}" value="${esc(state.q)}" aria-label="Search"></div>
          ${(cfg.filters || []).map((f) => `<select class="select-hh" data-filter="${f.key}" aria-label="${esc(f.label)}"></select>`).join("")}
          ${cfg.dateFilter ? `<span class="date-range"><span>${esc(cfg.dateFilter.label || "Date")}</span><input type="date" class="input-hh" data-from aria-label="From date"><span>to</span><input type="date" class="input-hh" data-to aria-label="To date"></span>` : ""}
          <button type="button" class="btn-hh btn-hh--ghost btn-hh--sm" data-clear><i class="bi bi-x-circle"></i>Clear</button>
          ${inlineActions ? `<span class="spacer"></span><span class="row-flex" data-inline-actions></span>` : ""}
        </div>
        ${cfg.bulkActions ? `<div class="bulk-bar" data-bulk><span data-bulk-count></span>${cfg.bulkActions.map((b, i) => `<button type="button" class="btn-hh btn-hh--sm ${b.cls || ""}" data-bulk-act="${i}"><i class="bi ${b.icon || "bi-check2"}"></i>${esc(b.label)}</button>`).join("")}<button type="button" class="btn-hh btn-hh--sm btn-hh--ghost" data-bulk-clear>Clear selection</button></div>` : ""}
        <div data-table></div>
      </section>
      ${cfg.after ? `<div data-after></div>` : ""}`;

    const $ = (s) => root.querySelector(s);
    const all = () => HH.store.all(cfg.collection).filter(cfg.baseFilter || (() => true));
    const filterOptions = (f) => (typeof f.options === "function" ? f.options() : f.options);
    const renderFilters = () => (cfg.filters || []).forEach((f) => { const el = root.querySelector(`[data-filter="${f.key}"]`); el.innerHTML = ui.options(filterOptions(f), state.filters[f.key], f.label); });
    renderFilters();

    const searchText = (r) => (cfg.search ? cfg.search(r) : (cfg.searchKeys || ["id", "name"]).map((k) => (typeof k === "function" ? k(r) : r[k])).join(" ")).toLowerCase();

    const filtered = () => {
      const q = state.q.toLowerCase();
      const tab = cfg.tabs && cfg.tabs.find((t) => t.key === state.tab);
      return all().filter((r) => {
        if (tab && tab.filter && !tab.filter(r)) return false;
        if (q && !searchText(r).includes(q)) return false;
        for (const f of cfg.filters || []) {
          const v = state.filters[f.key]; if (!v) continue;
          if (f.match ? !f.match(r, v) : String(f.value ? f.value(r) : r[f.key]) !== v) return false;
        }
        if (cfg.dateFilter && (state.from || state.to)) {
          const d = typeof cfg.dateFilter.key === "function" ? cfg.dateFilter.key(r) : r[cfg.dateFilter.key];
          if (!util.inRange(d, { from: state.from, to: state.to })) return false;
        }
        return true;
      });
    };

    const rowActions = (r) => {
      const items = [];
      if (cfg.view !== false) items.push({ label: "View details", icon: "bi-eye", onClick: () => page.openView(r.id) });
      if (!cfg.noEdit && (!cfg.canEdit || cfg.canEdit(r))) items.push({ label: "Edit", icon: "bi-pencil", onClick: () => page.openForm(r.id) });
      (cfg.actions || []).forEach((a) => { if (!a.show || a.show(r)) items.push({ label: typeof a.label === "function" ? a.label(r) : a.label, icon: a.icon, danger: a.danger, onClick: () => a.handler(HH.store.get(cfg.collection, r.id), page) }); });
      if (!cfg.noDelete && (!cfg.canDelete || cfg.canDelete(r))) { items.push({ divider: true }); items.push({ label: cfg.deleteLabel || "Delete", icon: "bi-trash", danger: true, onClick: () => page.remove(r.id) }); }
      return items;
    };

    const table = new HH.Table($("[data-table]"), {
      id: cfg.collection + (cfg.tableId || ""),
      columns: cfg.columns, pageSize: cfg.pageSize || 10, sort: cfg.defaultSort || null, compact: cfg.compact,
      selectable: !!cfg.bulkActions,
      onSelect: (ids) => { const bar = $("[data-bulk]"); if (!bar) return; bar.classList.toggle("is-visible", ids.length > 0); $("[data-bulk-count]").textContent = `${ids.length} selected`; },
      onRowClick: cfg.rowClick === null ? null : (r) => (typeof cfg.rowClick === "function" ? cfg.rowClick(r, page) : cfg.view !== false ? page.openView(r.id) : page.openForm(r.id)),
      rowActions, footerRow: cfg.footerRow, rowCls: cfg.rowCls, empty: cfg.emptyText,
    });

    // Header actions: Export / Print / custom / Add
    if (inlineActions) actionsHost = root.querySelector("[data-inline-actions]");
    if (actionsHost && !cfg.noHeaderActions) {
      actionsHost.innerHTML = `${(cfg.toolbarButtons || []).map((b, i) => `<button type="button" class="btn-hh ${b.cls || ""}" data-tb="${i}"><i class="bi ${b.icon}"></i><span>${esc(b.label)}</span></button>`).join("")}
        ${cfg.noExport ? "" : `<button type="button" class="btn-hh" data-export><i class="bi bi-filetype-csv"></i><span>Export CSV</span></button>`}
        ${cfg.noPrint ? "" : `<button type="button" class="btn-hh" data-print><i class="bi bi-printer"></i><span>Print</span></button>`}
        ${cfg.noAdd ? "" : `<button type="button" class="btn-hh btn-hh--primary" data-add><i class="bi bi-plus-lg"></i><span>${esc(cfg.addLabel || "Add " + entity)}</span></button>`}`;
      actionsHost.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.hasAttribute("data-add")) page.openForm();
        if (b.hasAttribute("data-export")) page.exportCSV();
        if (b.hasAttribute("data-print")) page.print();
        if (b.dataset.tb) cfg.toolbarButtons[+b.dataset.tb].handler(page);
      });
    }

    const onSearch = util.debounce(() => { state.q = $("[data-search]").value.trim(); page.refresh(); }, 180);
    $("[data-search]").addEventListener("input", onSearch);
    root.addEventListener("change", (e) => {
      if (e.target.matches("[data-filter]")) { state.filters[e.target.dataset.filter] = e.target.value; page.refresh(); }
      if (e.target.matches("[data-from]")) { state.from = e.target.value; page.refresh(); }
      if (e.target.matches("[data-to]")) { state.to = e.target.value; page.refresh(); }
    });
    $("[data-clear]").addEventListener("click", () => {
      state.q = ""; state.from = ""; state.to = ""; Object.keys(state.filters).forEach((k) => (state.filters[k] = ""));
      $("[data-search]").value = ""; if ($("[data-from]")) { $("[data-from]").value = ""; $("[data-to]").value = ""; }
      renderFilters(); page.refresh();
    });
    if (cfg.bulkActions) {
      root.addEventListener("click", (e) => {
        const b = e.target.closest("[data-bulk-act]");
        if (b) { const ids = [...table.selected]; cfg.bulkActions[+b.dataset.bulkAct].handler(ids.map((id) => HH.store.get(cfg.collection, id)).filter(Boolean), page); }
        if (e.target.closest("[data-bulk-clear]")) table.clearSelection();
      });
    }

    const page = {
      cfg, table, state,
      all, rows: filtered,
      refresh(keepPage = true) {
        if (cfg.stats) { const cards = cfg.stats(all()); $("[data-stats]").innerHTML = ui.statCards(cards); ui.bindStatCards($("[data-stats]"), cards); }
        if (cfg.before) { const h = cfg.before(page); if (typeof h === "string") $("[data-before]").innerHTML = h; }
        if (cfg.after) { const h = cfg.after(page); if (typeof h === "string") $("[data-after]").innerHTML = h; }
        table.setRows(filtered(), keepPage);
        cfg.onRefresh && cfg.onRefresh(page);
      },
      setFilter(key, value) { state.filters[key] = value; renderFilters(); page.refresh(false); },
      fields(rec) { return typeof cfg.fields === "function" ? cfg.fields(rec) : cfg.fields; },
      openForm(id, presets) {
        const rec = id ? HH.store.get(cfg.collection, id) : null;
        if (id && !rec) return HH.toast(`${entity} not found.`, "error");
        const values = rec ? JSON.parse(JSON.stringify(rec)) : Object.assign({}, cfg.defaults ? cfg.defaults() : {}, presets || {});
        const fields = page.fields(rec);
        return HH.formModal({
          title: rec ? `Edit ${entity} · ${rec.id}` : cfg.addTitle || `Add ${entity}`,
          icon: cfg.icon || (rec ? "bi-pencil-square" : "bi-plus-lg"),
          size: cfg.formSize || "lg", fields, values,
          submitText: rec ? "Save Changes" : cfg.addSubmitText || `Save ${entity}`,
          onReady: cfg.onFormReady ? (f, ctx) => cfg.onFormReady(f, ctx, rec, page) : null,
          onSubmit: async (data, ctx) => {
            const merged = Object.assign({}, rec || {}, data);
            if (cfg.beforeSave) { const err = await cfg.beforeSave(merged, rec, ctx); if (typeof err === "string") return err; }
            const saved = rec ? HH.store.update(cfg.collection, rec.id, merged) : HH.store.insert(cfg.collection, merged);
            cfg.afterSave && cfg.afterSave(saved, !rec, rec);
            HH.toast(rec ? `${entity} ${saved.id} updated.` : `${entity} ${saved.id} created.`, "success");
            page.refresh();
            return true;
          },
        });
      },
      openView(id) {
        const r = HH.store.get(cfg.collection, id);
        if (!r) return HH.toast(`${entity} not found.`, "error");
        if (typeof cfg.onView === "function") return cfg.onView(r, page);
        const body = cfg.view ? cfg.view(r, page) : ui.kv(cfg.columns.map((c) => [c.label, c.render ? c.render(r) : esc(r[c.key])]));
        const extra = cfg.viewFooter ? cfg.viewFooter(r, page) : [];
        const m = HH.modal({
          title: `${entity} · ${r.id}`, icon: cfg.viewIcon || "bi-eye", size: cfg.viewSize || "lg", body,
          footer: [
            ...extra.map((b) => Object.assign({}, b, { onClick: (ctx, btn) => b.onClick(HH.store.get(cfg.collection, id), ctx, page, btn) })),
            ...(cfg.noEdit || (cfg.canEdit && !cfg.canEdit(r)) ? [] : [{ label: "Edit", icon: "bi-pencil", onClick: (ctx) => { ctx.close(); setTimeout(() => page.openForm(id), 320); } }]),
            { label: "Close", cls: "btn-hh--dark", close: true },
          ],
        });
        cfg.onViewReady && cfg.onViewReady(m, r, page);
        return m;
      },
      async remove(id) {
        const r = HH.store.get(cfg.collection, id); if (!r) return;
        if (cfg.beforeDelete) { const err = cfg.beforeDelete(r); if (typeof err === "string") return HH.toast(err, "error"); }
        const ok = await HH.confirm(cfg.deleteMessage ? cfg.deleteMessage(r) : `Delete <b>${esc(cfg.titleOf ? cfg.titleOf(r) : r.name || r.title || r.id)}</b>? This cannot be undone.`, { title: `Delete ${entity}`, danger: true });
        if (!ok) return;
        HH.store.remove(cfg.collection, id);
        cfg.afterDelete && cfg.afterDelete(r);
        HH.toast(`${entity} ${id} deleted.`, "success");
        page.refresh();
        document.querySelectorAll(".modal.show").forEach((m) => bootstrap.Modal.getInstance(m)?.hide());
      },
      exportColumns() { return cfg.csvColumns || cfg.columns.filter((c) => c.csv !== false).map((c) => ({ label: c.label, value: c.csv || ((r) => (c.value ? c.value(r) : r[c.key])) })); },
      exportCSV() {
        const rows = table.sortedRows();
        if (!rows.length) return HH.toast("Nothing to export with the current filters.", "warning");
        HH.exportCSV(`${cfg.exportName || cfg.collection}-${util.todayISO()}.csv`, page.exportColumns(), rows);
      },
      print() {
        const rows = table.sortedRows();
        HH.printTable(cfg.printTitle || document.title.split("·")[0].trim(), page.exportColumns(), rows, page.filterSummary());
      },
      filterSummary() {
        const bits = [];
        if (state.tab && cfg.tabs) bits.push(cfg.tabs.find((t) => t.key === state.tab).label);
        if (state.q) bits.push(`Search: "${state.q}"`);
        (cfg.filters || []).forEach((f) => { if (state.filters[f.key]) { const o = filterOptions(f).map((x) => (typeof x === "object" ? x : { value: x, label: x })).find((x) => String(x.value) === state.filters[f.key]); bits.push(`${f.label}: ${o ? o.label : state.filters[f.key]}`); } });
        if (state.from || state.to) bits.push(`${cfg.dateFilter.label || "Date"}: ${state.from || "…"} → ${state.to || "…"}`);
        return bits.join(" · ") || "All records";
      },
    };

    if (cfg.tabs) {
      ui.tabs($("[data-tabs]"), cfg.tabs.map((t) => ({ key: t.key, label: t.label, icon: t.icon })), (k) => { state.tab = k; table.clearSelection && table.selected.clear(); page.refresh(false); }, { hash: cfg.tabsHash !== false });
    }
    page.refresh(false);

    // React to changes made elsewhere (other tabs or helpers)
    window.addEventListener("hh:datachange", (e) => { if (e.detail.external || e.detail.col === "*") { renderFilters(); page.refresh(); } });

    // Deep links: ?view=ID, ?edit=ID, ?action=add
    if (cfg.deepLinks !== false) setTimeout(() => {
      const v = util.qs("view"), ed = util.qs("edit"), act = util.qs("action");
      const mine = (id) => id && HH.store.get(cfg.collection, id);
      if (mine(v)) { page.openView(v); util.setQS({ view: null }); }
      else if (mine(ed)) { page.openForm(ed); util.setQS({ edit: null }); }
      else if (act === "add") {
        const presets = {};
        new URLSearchParams(location.search).forEach((val, key) => { if (!["action", "view", "edit", "q"].includes(key)) presets[key] = val; });
        page.openForm(null, cfg.presetsFromQuery ? cfg.presetsFromQuery(presets) : presets);
        util.setQS({ action: null });
      }
    }, 60);

    return page;
  };
})();
