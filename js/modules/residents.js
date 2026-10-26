/* ==========================================================================
   HostelHub — Residents module
   Also exposes HH.residents (room assignment, check-in/out, status change)
   which resident-details.js re-uses.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const STATUSES = ["Active", "On Leave", "Inactive", "Checked Out"];
  const isLive = (r) => r.status === "Active" || r.status === "On Leave";

  /* ------------------------------------------------ shared operations --- */
  function logHistory(r, action, note) {
    const h = (r.history || []).slice();
    h.unshift({ date: U.nowISO(), action, note: note || "", by: (HH.store.settings().currentUser || {}).name || "Admin" });
    return h.slice(0, 50);
  }

  function bedOptions(roomId, residentId) {
    return C.freeBeds(roomId, residentId).map((b) => ({ value: b.id, label: b.label }));
  }
  function roomChoice(branch, residentId) {
    const map = C.bedMap();
    return HH.store.all("rooms").filter((r) => (!branch || r.branch === branch) && r.status === "Available")
      .sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }))
      .map((r) => { const free = C.freeBeds(r.id, residentId).length; return { value: r.id, label: `${r.number} · ${r.type} · ${free} free · ${U.fmtMoney(r.rent)}`, free }; })
      .filter((o) => o.free > 0 || (residentId && (L.resident(residentId) || {}).roomId === o.value));
  }

  /** Validate a bed assignment. Returns an error string or "". */
  function checkBed(roomId, bedId, residentId) {
    if (!roomId) return "";
    const room = L.room(roomId);
    if (!room) return "Selected room no longer exists.";
    if (room.status !== "Available") return `Room ${room.number} is under ${room.status.toLowerCase()} and cannot take residents.`;
    if (!bedId) return "Select a bed in the chosen room.";
    const bed = room.beds.find((b) => b.id === bedId);
    if (!bed) return "Selected bed does not exist in this room.";
    if (bed.status !== "Available") return `${bed.label} in ${room.number} is marked ${bed.status}.`;
    if (!C.isBedFree(roomId, bedId, residentId)) { const occ = C.bedMap()[`${roomId}|${bedId}`]; return `${bed.label} in ${room.number} is already occupied by ${occ.name} (${occ.id}).`; }
    const occupied = room.beds.filter((b) => !C.isBedFree(roomId, b.id, residentId)).length;
    if (occupied >= room.capacity) return `Room ${room.number} is already at full capacity (${room.capacity}).`;
    return "";
  }

  function assignRoom(resId, opts = {}) {
    const r = L.resident(resId); if (!r) return;
    const fields = [
      { name: "branch", label: "Hostel branch", type: "select", required: true, col: 6, options: L.branchOptions(), default: r.branch,
        onChange: (v, f) => { HH.form.setOptions(f, "roomId", roomChoice(v, r.id)); HH.form.setOptions(f, "bed", []); } },
      { name: "roomId", label: "Room", type: "select", required: true, col: 6, options: (v) => roomChoice(v.branch || r.branch, r.id), default: r.roomId,
        onChange: (v, f) => { HH.form.setOptions(f, "bed", bedOptions(v, r.id)); const room = L.room(v); if (room) f.elements.rent.value = room.rent; } },
      { name: "bed", label: "Bed", type: "select", required: true, col: 6, options: (v) => bedOptions(v.roomId || r.roomId, r.id), default: r.bed },
      { name: "rent", label: "Monthly rent (₹)", type: "number", required: true, col: 6, min: 0, default: r.rent },
      { name: "date", label: opts.checkIn ? "Check-in date" : "Effective date", type: "date", required: true, col: 6, default: U.todayISO() },
      { name: "note", label: "Note", type: "text", col: 6, placeholder: opts.checkIn ? "e.g. Returned after semester break" : "Reason for transfer" },
    ];
    HH.formModal({
      title: opts.checkIn ? `Check in · ${r.name}` : r.roomId ? `Transfer room · ${r.name}` : `Assign room · ${r.name}`, icon: opts.checkIn ? "bi-box-arrow-in-right" : "bi-arrow-left-right",
      size: "lg", fields, values: {}, submitText: opts.checkIn ? "Check in" : "Save assignment",
      onSubmit: (d) => {
        const err = checkBed(d.roomId, d.bed, r.id); if (err) return err;
        const from = r.roomId ? L.bedLabel(r.roomId, r.bed) : "none";
        const patch = { branch: d.branch, roomId: d.roomId, bed: d.bed, rent: Number(d.rent) };
        if (opts.checkIn) Object.assign(patch, { status: "Active", checkIn: d.date, checkOut: "" });
        const action = opts.checkIn ? "Checked in" : r.roomId ? "Room transferred" : "Room assigned";
        patch.history = logHistory(r, action, `${from} → ${L.bedLabel(d.roomId, d.bed)}${d.note ? " · " + d.note : ""}`);
        HH.store.update("residents", r.id, patch);
        HH.toast(`${r.name}: ${action.toLowerCase()} to ${L.bedLabel(d.roomId, d.bed)}.`, "success");
        opts.onDone && opts.onDone();
        return true;
      },
    });
  }

  async function checkOut(resId, onDone) {
    const r = L.resident(resId); if (!r) return;
    const bal = C.residentBalance(r.id);
    const fields = [
      { name: "date", label: "Check-out date", type: "date", required: true, col: 6, default: U.todayISO(), min: r.checkIn || r.joinDate },
      { name: "refund", label: "Deposit refund (₹)", type: "number", col: 6, min: 0, max: r.deposit || 0, default: Math.max(0, (r.deposit || 0) - bal) },
      { name: "reason", label: "Reason", type: "select", required: true, col: 12, options: ["Course completed", "Moved to another city", "Personal reasons", "Disciplinary", "Other"] },
      { name: "note", label: "Notes", type: "textarea", col: 12, rows: 2 },
      { type: "html", html: bal > 0 ? `<div class="alert-hh tone-orange"><i class="bi bi-exclamation-triangle"></i><span><b>${U.fmtMoney(bal)}</b> is still outstanding for this resident. You can still check out and collect later from Fees & Payments.</span><span></span></div>` : `<div class="alert-hh tone-green"><i class="bi bi-check-circle"></i><span>No outstanding dues.</span><span></span></div>` },
    ];
    HH.formModal({
      title: `Check out · ${r.name}`, icon: "bi-box-arrow-right", size: "lg", fields, values: {}, submitText: "Confirm check-out",
      onSubmit: (d) => {
        const bedWas = L.bedLabel(r.roomId, r.bed);
        HH.store.update("residents", r.id, {
          status: "Checked Out", checkOut: d.date, lastRoom: r.roomId, lastBed: r.bed, roomId: "", bed: "",
          history: logHistory(r, "Checked out", `${bedWas} released · ${d.reason}${d.refund ? ` · deposit refund ${U.fmtMoney(d.refund)}` : ""}${d.note ? " · " + d.note : ""}`),
        });
        HH.store.all("messSubscriptions").filter((s) => s.residentId === r.id && s.status === "Active")
          .forEach((s) => HH.store.update("messSubscriptions", s.id, { status: "Cancelled", endDate: d.date, notes: "Closed on check-out" }));
        HH.toast(`${r.name} checked out. ${bedWas} is now vacant.`, "success");
        onDone && onDone();
        return true;
      },
    });
  }

  async function changeStatus(resId, onDone) {
    const r = L.resident(resId); if (!r) return;
    HH.formModal({
      title: `Change status · ${r.name}`, icon: "bi-toggles", size: "md",
      fields: [
        { name: "status", label: "New status", type: "select", required: true, options: STATUSES, default: r.status,
          validate: (v) => (v === "Checked Out" ? "Use the Check-out action so the bed is released properly." : (v === "Active" || v === "On Leave") && !r.roomId ? "Assign a room first (use Check in)." : "") },
        { name: "note", label: "Reason / note", type: "textarea", rows: 2 },
      ],
      values: {}, submitText: "Update status",
      onSubmit: (d) => {
        if (d.status === r.status) return "Status is unchanged.";
        const patch = { status: d.status, history: logHistory(r, `Status: ${r.status} → ${d.status}`, d.note) };
        if (d.status === "Inactive" && r.roomId) Object.assign(patch, { lastRoom: r.roomId, lastBed: r.bed, roomId: "", bed: "" });
        HH.store.update("residents", r.id, patch);
        HH.toast(`${r.name} is now ${d.status}.`, "success");
        onDone && onDone();
        return true;
      },
    });
  }

  /* -------------------------------------------------------- form spec --- */
  function fields(rec) {
    const id = rec && rec.id;
    return [
      { type: "section", label: "Personal details", icon: "bi-person" },
      { name: "name", label: "Full name", required: true, col: 8, maxlength: 80, placeholder: "e.g. Rahul Kumar" },
      { name: "gender", label: "Gender", type: "select", required: true, col: 4, options: ["Male", "Female", "Other"] },
      { name: "photo", label: "Photo", type: "photo", col: 12 },
      { name: "dob", label: "Date of birth", type: "date", col: 4, max: U.addDays(U.todayISO(), -365 * 14), help: "Must be at least 14 years old." },
      { name: "phone", label: "Phone", type: "tel", required: true, col: 4, placeholder: "98765 43210",
        validate: (v) => { const dup = HH.store.all("residents").find((x) => x.id !== id && x.phone.replace(/\D/g, "") === v.replace(/\D/g, "") && isLive(x)); return dup ? `Phone already used by ${dup.name} (${dup.id}).` : ""; } },
      { name: "email", label: "Email", type: "email", col: 4, placeholder: "name@example.com" },
      { name: "address", label: "Permanent address", type: "textarea", rows: 2, col: 12 },
      { type: "section", label: "Guardian & emergency contact", icon: "bi-shield-check" },
      { name: "guardianName", label: "Guardian name", required: true, col: 4 },
      { name: "guardianRelation", label: "Relation", type: "select", col: 4, options: ["Father", "Mother", "Uncle", "Aunt", "Brother", "Sister", "Guardian", "Spouse"] },
      { name: "guardianPhone", label: "Guardian phone", type: "tel", required: true, col: 4 },
      { name: "emergencyName", label: "Emergency contact name", col: 6 },
      { name: "emergencyPhone", label: "Emergency phone", type: "tel", col: 6 },
      { type: "section", label: "Stay & fees", icon: "bi-house-door" },
      { name: "course", label: "Course / occupation", col: 6, placeholder: "e.g. B.Tech Computer Science" },
      { name: "joinDate", label: "Joining date", type: "date", required: true, col: 6, default: U.todayISO(), max: U.addDays(U.todayISO(), 60) },
      { name: "branch", label: "Hostel branch", type: "select", required: true, col: 4, options: L.branchOptions(), default: "BR-1",
        onChange: (v, f) => { HH.form.setOptions(f, "roomId", roomChoice(v, id), "", "No room yet"); HH.form.setOptions(f, "bed", [], "", "—"); } },
      { name: "roomId", label: "Room", type: "select", col: 4, placeholder: "No room yet", options: (v) => roomChoice(v.branch || "BR-1", id),
        onChange: (v, f) => { HH.form.setOptions(f, "bed", bedOptions(v, id), "", v ? "Select bed" : "—"); const room = L.room(v); if (room) f.elements.rent.value = room.rent; } },
      { name: "bed", label: "Bed", type: "select", col: 4, placeholder: "—", options: (v) => (v.roomId ? bedOptions(v.roomId, id) : []) },
      { name: "rent", label: "Monthly rent (₹)", type: "number", required: true, col: 4, min: 0, step: 100, default: 6000 },
      { name: "deposit", label: "Security deposit (₹)", type: "number", col: 4, min: 0, step: 500, default: 10000 },
      { name: "status", label: "Resident status", type: "select", required: true, col: 4, options: STATUSES, default: "Active" },
      { type: "section", label: "Notes & documents", icon: "bi-paperclip" },
      { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12, placeholder: "Dietary preferences, medical notes, etc." },
      { name: "documents", label: "Documents", type: "file", multiple: true, col: 12, accept: "image/*,.pdf,.doc,.docx", help: "ID proof, admission letter… Files up to 350 KB are stored in the demo; larger files keep only their name." },
    ];
  }

  /** Business rules applied before any resident save. Returns an error string or undefined. */
  function prepare(d, prev) {
    if (!d.roomId) { d.bed = ""; }
    if ((d.status === "Active" || d.status === "On Leave")) {
      const err = checkBed(d.roomId, d.bed, prev && prev.id);
      if (err) return err;
    } else if (d.roomId) {
      return `A resident with status "${d.status}" cannot hold a bed. Clear the room or use Check-out.`;
    }
    if (d.status === "Checked Out" && (!prev || prev.status !== "Checked Out")) d.checkOut = d.checkOut || U.todayISO();
    if (!prev) { d.checkIn = d.joinDate; d.createdAt = U.todayISO(); d.history = [{ date: U.nowISO(), action: "Resident registered", note: d.roomId ? `Assigned ${L.bedLabel(d.roomId, d.bed)}` : "No room assigned", by: (HH.store.settings().currentUser || {}).name || "Admin" }]; }
    else {
      const changes = [];
      if (prev.roomId !== d.roomId || prev.bed !== d.bed) changes.push(`Bed ${prev.roomId ? L.bedLabel(prev.roomId, prev.bed) : "none"} → ${d.roomId ? L.bedLabel(d.roomId, d.bed) : "none"}`);
      if (prev.status !== d.status) changes.push(`Status ${prev.status} → ${d.status}`);
      if (Number(prev.rent) !== Number(d.rent)) changes.push(`Rent ${U.fmtMoney(prev.rent)} → ${U.fmtMoney(d.rent)}`);
      d.history = logHistory(prev, "Profile updated", changes.join(" · "));
    }
  }

  HH.residents = { prepare, assignRoom, checkOut, changeStatus, checkBed, fields, logHistory, roomChoice, bedOptions, STATUSES };

  /* ------------------------------------------------------- list page ---- */
  if (document.body.dataset.page !== "residents") return;

  const details = (id, tab) => (location.href = `resident-details.html?id=${id}${tab ? "#" + tab : ""}`);
  let page;
  const refresh = () => page && page.refresh();

  page = HH.CrudPage({
    collection: "residents", entity: "Resident", icon: "bi-person-plus",
    searchPlaceholder: "Search by name, ID, phone, room, course…",
    searchKeys: ["id", "name", "phone", "email", "course", "guardianName", (r) => L.roomLabel(r.roomId)],
    tabs: [
      { key: "all", label: "All Residents" },
      { key: "active", label: "Active", filter: (r) => r.status === "Active" },
      { key: "leave", label: "On Leave", filter: (r) => r.status === "On Leave" },
      { key: "past", label: "Checked Out / Inactive", filter: (r) => !isLive(r) },
      { key: "unassigned", label: "Without Bed", filter: (r) => isLive(r) && !r.roomId },
    ],
    filters: [
      { key: "branch", label: "All branches", options: () => L.branchOptions() },
      { key: "pay", label: "Any payment status", options: ["Paid", "Due", "Overdue", "No Invoices"], match: (r, v) => C.residentPaymentStatus(r.id) === v },
      { key: "gender", label: "Any gender", options: ["Male", "Female", "Other"] },
    ],
    dateFilter: { key: "joinDate", label: "Joined" },
    defaultSort: { key: "joinDate", dir: "desc" },
    columns: [
      { key: "name", label: "Resident", render: (r) => HH.ui.person(r.name, r.id, r.photo) },
      { key: "room", label: "Room / Bed", value: (r) => (r.roomId ? L.bedLabel(r.roomId, r.bed) : ""), render: (r) => (r.roomId ? `<span class="nowrap">${esc(L.bedLabel(r.roomId, r.bed))}</span>` : `<span class="text-3">—</span>`), cls: "nowrap" },
      { key: "branch", label: "Branch", value: (r) => L.branchName(r.branch), cls: "nowrap" },
      { key: "phone", label: "Contact", render: (r) => `<span style="color:var(--blue)" class="nowrap">${esc(r.phone)}</span>`, cls: "nowrap" },
      { key: "course", label: "Course / Occupation", render: (r) => `<span class="truncate d-inline-block" style="max-width:180px">${esc(r.course || "—")}</span>` },
      { key: "joinDate", label: "Joined On", render: (r) => U.fmtDate(r.joinDate), cls: "nowrap" },
      { key: "rent", label: "Rent", value: (r) => Number(r.rent) || 0, render: (r) => `<span class="money">${U.fmtMoney(r.rent)}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "pay", label: "Payment", value: (r) => C.residentPaymentStatus(r.id), render: (r) => HH.ui.badge(C.residentPaymentStatus(r.id)) },
      { key: "status", label: "Status", render: (r) => HH.ui.badge(r.status) },
    ],
    csvColumns: [
      ["Resident ID", "id"], ["Full Name", "name"], ["Gender", "gender"], ["Date of Birth", "dob"], ["Phone", "phone"], ["Email", "email"], ["Address", "address"],
      ["Guardian", "guardianName"], ["Guardian Relation", "guardianRelation"], ["Guardian Phone", "guardianPhone"], ["Emergency Contact", "emergencyName"], ["Emergency Phone", "emergencyPhone"],
      ["Course / Occupation", "course"], ["Joining Date", "joinDate"], ["Branch", (r) => L.branchName(r.branch)], ["Room", (r) => L.roomLabel(r.roomId)], ["Bed", "bed"],
      ["Monthly Rent", "rent"], ["Security Deposit", "deposit"], ["Payment Status", (r) => C.residentPaymentStatus(r.id)], ["Outstanding", (r) => C.residentBalance(r.id)],
      ["Status", "status"], ["Check-in", "checkIn"], ["Check-out", "checkOut"], ["Notes", "notes"],
    ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] })),
    stats: (all) => {
      const live = all.filter(isLive);
      const dues = live.filter((r) => ["Due", "Overdue"].includes(C.residentPaymentStatus(r.id))).length;
      const occ = C.occupancy();
      return [
        { label: "Total Residents", value: U.fmtNum(all.length), icon: "bi-people-fill", tone: "blue", meta: `${live.length} currently staying` },
        { label: "Active", value: all.filter((r) => r.status === "Active").length, icon: "bi-person-check-fill", tone: "green", meta: `${all.filter((r) => r.status === "On Leave").length} on leave`, onClick: () => tabs("active") },
        { label: "Checked Out / Inactive", value: all.filter((r) => !isLive(r)).length, icon: "bi-person-dash-fill", tone: "red", meta: "Past residents", onClick: () => tabs("past") },
        { label: "With Pending Dues", value: dues, icon: "bi-wallet2", tone: "purple", meta: "Due or overdue invoices", onClick: () => page.setFilter("pay", "Overdue") },
        { label: "Vacant Beds", value: occ.vacant, icon: "bi-door-open-fill", tone: "orange", meta: `${occ.pct}% occupancy`, href: "rooms-beds.html#beds" },
      ];
    },
    fields, formSize: "xl",
    defaults: () => ({ status: "Active", branch: "BR-1", joinDate: U.todayISO(), rent: 6000, deposit: 10000, documents: [] }),
    beforeSave: prepare,
    onView: (r) => details(r.id),
    rowClick: (r) => details(r.id),
    actions: [
      { label: "Assign / transfer room", icon: "bi-arrow-left-right", show: isLive, handler: (r) => assignRoom(r.id, { onDone: refresh }) },
      { label: "Check in", icon: "bi-box-arrow-in-right", show: (r) => !isLive(r), handler: (r) => assignRoom(r.id, { checkIn: true, onDone: refresh }) },
      { label: "Check out", icon: "bi-box-arrow-right", show: isLive, handler: (r) => checkOut(r.id, refresh) },
      { label: "Change status", icon: "bi-toggles", handler: (r) => changeStatus(r.id, refresh) },
      { label: "Fee history", icon: "bi-receipt", handler: (r) => details(r.id, "fees") },
      { label: "Meal attendance", icon: "bi-fork-knife", handler: (r) => details(r.id, "meals") },
      { label: "Create invoice", icon: "bi-file-earmark-plus", handler: (r) => (location.href = `invoices.html?action=add&resident=${r.id}`) },
    ],
    deleteMessage: (r) => `Delete <b>${esc(r.name)}</b> (${r.id})? ${r.roomId ? `Their bed ${esc(L.bedLabel(r.roomId, r.bed))} will be released. ` : ""}Invoices, attendance and complaints already recorded are kept for audit.`,
    bulkActions: [
      { label: "Export selected", icon: "bi-filetype-csv", handler: (rows) => HH.exportCSV(`residents-selected-${U.todayISO()}.csv`, page.exportColumns(), rows) },
      { label: "Mark On Leave", icon: "bi-airplane", handler: (rows) => bulkStatus(rows, "On Leave") },
      { label: "Mark Active", icon: "bi-person-check", handler: (rows) => bulkStatus(rows, "Active") },
    ],
  });

  function tabs(key) { location.hash = key; }

  async function bulkStatus(rows, status) {
    const eligible = rows.filter((r) => r.roomId && isLive(r) && r.status !== status);
    if (!eligible.length) return HH.toast(`None of the selected residents can be set to ${status} (they need an assigned bed).`, "warning");
    const ok = await HH.confirm(`Set <b>${eligible.length}</b> resident(s) to <b>${status}</b>?`, { title: "Update status", okText: "Update" });
    if (!ok) return;
    eligible.forEach((r) => HH.store.update("residents", r.id, { status, history: logHistory(r, `Status: ${r.status} → ${status}`, "Bulk update") }));
    page.table.clearSelection();
    page.refresh();
    HH.toast(`${eligible.length} resident(s) updated to ${status}.`, "success");
  }

  // Extra toolbar link
  const actions = document.getElementById("pageActions");
  actions.insertAdjacentHTML("afterbegin", `<a class="btn-hh" href="rooms-beds.html#beds"><i class="bi bi-grid-3x3-gap"></i><span>Bed Map</span></a>`);
})();
