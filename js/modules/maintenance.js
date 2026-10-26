/* ==========================================================================
   HostelHub — Maintenance tickets
   Tabs: #all · #open · #overdue   ·  exposes HH.maintenance.create() for other modules
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const me = () => (HH.store.settings().currentUser || {}).name || "Admin";
  const CATEGORIES = ["Electrical", "Plumbing", "Carpentry", "Civil", "Cleaning", "Appliance", "Internet", "Other"];
  const PRIORITIES = ["Low", "Medium", "High", "Critical"];
  const STATUSES = ["Open", "In Progress", "On Hold", "Resolved", "Closed"];
  const DONE = (s) => s === "Resolved" || s === "Closed";
  const isOpen = (t) => !DONE(t.status);
  const dueDays = (p) => (p === "Critical" ? 1 : p === "High" ? 3 : 7);
  const CAT_ICON = { Electrical: "bi-lightning-charge", Plumbing: "bi-droplet", Carpentry: "bi-hammer", Civil: "bi-bricks", Cleaning: "bi-stars", Appliance: "bi-plug", Internet: "bi-wifi", Other: "bi-tools" };
  const money = (v) => `<span class="money">${U.fmtMoney(v)}</span>`;
  const curMonth = () => U.todayISO().slice(0, 7);
  const hist = (t, status, note) => [...(t.history || []), { date: U.nowISO(), status, note: note || "", by: me() }];
  const totalHours = (t) => U.sum(t.worklog || [], (w) => w.hours);

  function staffChoice(selected) {
    const pref = ["Maintenance", "Housekeeping"];
    return HH.store.all("staff").filter((s) => s.status !== "Resigned" || s.id === selected)
      .sort((a, b) => (pref.includes(b.department) - pref.includes(a.department)) || a.name.localeCompare(b.name))
      .map((s) => ({ value: s.id, label: `${pref.includes(s.department) ? "★ " : ""}${s.name} — ${s.designation} (${s.department})` }));
  }
  const roomChoice = (branch) => (branch ? L.roomOptions(branch) : []);
  const location_ = (t) => `${t.roomId ? L.roomLabel(t.roomId) : "Common area"} · ${L.branchName(t.branch)}`;

  /** Create a ticket programmatically (used by complaints escalation through the store directly too). */
  function create(data) {
    const reported = data.reportedOn || U.todayISO();
    const rec = Object.assign({ title: "", category: "Other", branch: "", roomId: "", priority: "Medium", assignedTo: "", reportedOn: reported, dueDate: U.addDays(reported, dueDays(data.priority || "Medium")), completedOn: "", estCost: 0, actualCost: 0, status: "Open", notes: "", comments: [], worklog: [] }, data);
    rec.history = [{ date: U.nowISO(), status: rec.status, note: data.historyNote || "Ticket created", by: me() }];
    delete rec.historyNote;
    return HH.store.insert("maintenance", rec);
  }
  HH.maintenance = { create, dueDays, CATEGORIES, PRIORITIES };
  if (document.body.dataset.page !== "maintenance") return;

  /* --------------------------------------------------------- form spec --- */
  function fields(rec) {
    return [
      { type: "section", label: "Issue", icon: "bi-exclamation-diamond" },
      { name: "title", label: "Title", required: true, col: 8, maxlength: 100, placeholder: "e.g. Ceiling fan not working" },
      { name: "category", label: "Category", type: "select", required: true, col: 4, options: CATEGORIES },
      { name: "branch", label: "Branch", type: "select", required: true, col: 4, options: L.branchOptions(),
        onChange: (v, f) => HH.form.setOptions(f, "roomId", roomChoice(v), "", "Common area / no room") },
      { name: "roomId", label: "Room", type: "select", col: 4, placeholder: "Common area / no room", options: (v) => roomChoice(v.branch) },
      { name: "priority", label: "Priority", type: "select", required: true, col: 4, options: PRIORITIES,
        onChange: (v, f) => autoDue(f) },
      { type: "section", label: "Schedule & assignment", icon: "bi-calendar-event" },
      { name: "assignedTo", label: "Assigned to", type: "select", col: 6, placeholder: "Unassigned", options: staffChoice(rec && rec.assignedTo), help: "★ Maintenance / Housekeeping staff are listed first." },
      { name: "status", label: "Status", type: "select", required: true, col: 6, options: STATUSES },
      { name: "reportedOn", label: "Reported on", type: "date", required: true, col: 4, max: U.todayISO(), onChange: (v, f) => autoDue(f) },
      { name: "dueDate", label: "Due date", type: "date", required: true, col: 4, help: "Auto: Critical +1 day, High +3, others +7.",
        validate: (v, vals) => (vals && vals.reportedOn && v < vals.reportedOn ? "Due date cannot be before the reported date." : "") },
      { name: "completedOn", label: "Completed on", type: "date", col: 4, max: U.todayISO(), help: "Set automatically when resolved." },
      { name: "estCost", label: "Estimated cost (₹)", type: "number", col: 6, min: 0, step: 50 },
      { name: "actualCost", label: "Actual cost (₹)", type: "number", col: 6, min: 0, step: 50, help: "Required to resolve or close the ticket." },
      { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12 },
    ];
  }
  function autoDue(f) {
    const r = f.elements.reportedOn.value; const p = f.elements.priority.value;
    if (r && p) f.elements.dueDate.value = U.addDays(r, dueDays(p));
  }

  function beforeSave(d, prev) {
    if (d.reportedOn > U.todayISO()) return "Reported date cannot be in the future.";
    if (!d.dueDate) d.dueDate = U.addDays(d.reportedOn, dueDays(d.priority));
    if (d.dueDate < d.reportedOn) return "Due date cannot be before the reported date.";
    if (d.roomId) { const room = L.room(d.roomId); if (!room || room.branch !== d.branch) return "Selected room does not belong to this branch."; }
    d.estCost = Number(d.estCost) || 0;
    if (DONE(d.status)) {
      if (d.actualCost === "" || d.actualCost == null || Number(d.actualCost) <= 0) return `Enter the actual cost before marking the ticket ${d.status}.`;
      d.completedOn = d.completedOn || U.todayISO();
      if (d.completedOn < d.reportedOn) return "Completed date cannot be before the reported date.";
    } else d.completedOn = "";
    d.actualCost = Number(d.actualCost) || 0;
    d.comments = (prev && prev.comments) || d.comments || [];
    d.worklog = (prev && prev.worklog) || d.worklog || [];
    if (!prev) d.history = [{ date: U.nowISO(), status: d.status, note: "Ticket created", by: me() }];
    else {
      const notes = [];
      if (prev.status !== d.status) notes.push(`Status ${prev.status} → ${d.status}`);
      if ((prev.assignedTo || "") !== (d.assignedTo || "")) notes.push(`Assigned to ${L.staffName(d.assignedTo)}`);
      if (prev.priority !== d.priority) notes.push(`Priority ${prev.priority} → ${d.priority}`);
      if (notes.length) d.history = hist(prev, d.status, notes.join(" · "));
    }
  }

  /* -------------------------------------------------------------- view --- */
  function view(t) {
    const od = C.isOverdueTicket(t);
    const history = (t.history && t.history.length) ? t.history : [{ date: t.reportedOn, status: "Open", note: "Ticket created", by: "—" }, ...(t.status !== "Open" ? [{ date: t.completedOn || t.updatedAt || t.reportedOn, status: t.status, note: "Imported status (detailed history starts with the next change)", by: "—" }] : [])];
    return `<div class="stack">
      <div class="detail-head"><span class="chip-icon chip-icon--lg tone-${od ? "red" : "blue"}"><i class="bi ${CAT_ICON[t.category] || "bi-tools"}"></i></span>
        <div style="min-width:0"><h3>${esc(t.title)}</h3><div class="text-2">${esc(t.id)} · ${esc(t.category)} · ${esc(location_(t))}</div>
          <div class="row-flex mt-2">${HH.ui.badge(t.status)} ${HH.ui.badge(t.priority)} ${od ? HH.ui.badge("Overdue") : ""}</div></div>
        <div class="mt-due"><div class="kv__label">Due</div><b style="${od ? "color:var(--red)" : ""}">${U.fmtDate(t.dueDate)}</b></div></div>
      <div class="detail-block">${HH.ui.kv([
        ["Assigned to", t.assignedTo ? `<a class="link-hh" href="staff-management.html?view=${esc(t.assignedTo)}">${esc(L.staffName(t.assignedTo))}</a>` : `<span class="text-3">Unassigned</span>`],
        ["Reported on", U.fmtDate(t.reportedOn)], ["Completed on", U.fmtDate(t.completedOn)],
        ["Estimated cost", U.fmtMoney(t.estCost)], ["Actual cost", t.actualCost ? U.fmtMoney(t.actualCost) : "—"], ["Hours logged", `${totalHours(t)} h`],
        ["Notes", esc(t.notes), true],
      ], 3)}</div>
      <div class="grid grid-2">
        <div class="detail-block"><div class="row-between"><div class="detail-block__title">Comments</div><span class="badge-hh tone-gray">${(t.comments || []).length}</span></div>
          <div class="mt-thread">${(t.comments || []).length ? t.comments.slice().reverse().map((c) => `<div class="mt-comment"><img class="avatar avatar--sm" src="${U.avatar(c.by)}" alt=""><div><div class="mt-comment__meta"><b>${esc(c.by)}</b> · ${U.fmtDateTime(c.date)}</div><div>${esc(c.text)}</div></div></div>`).join("") : `<div class="text-2 small">No comments yet.</div>`}</div>
          <form class="mt-inline" data-comment-form novalidate><textarea class="textarea-hh" rows="2" name="text" placeholder="Add a comment…" maxlength="500" aria-label="Comment"></textarea><button type="submit" class="btn-hh btn-hh--sm btn-hh--dark"><i class="bi bi-send"></i>Add comment</button></form>
        </div>
        <div class="detail-block"><div class="row-between"><div class="detail-block__title">Work log</div><span class="badge-hh tone-blue">Total ${totalHours(t)} h</span></div>
          ${(t.worklog || []).length ? `<div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>Date</th><th>By</th><th class="t-right">Hours</th><th>Note</th></tr></thead><tbody>
            ${t.worklog.map((w) => `<tr><td class="nowrap">${U.fmtDate(w.date)}</td><td class="nowrap">${esc(w.by)}</td><td class="t-right">${esc(w.hours)}</td><td>${esc(w.note)}</td></tr>`).join("")}</tbody></table></div>` : `<div class="text-2 small">No work logged yet.</div>`}
          <form class="mt-log-form" data-log-form novalidate>
            <input class="input-hh" type="date" name="date" value="${U.todayISO()}" min="${esc(t.reportedOn)}" max="${U.todayISO()}" aria-label="Work date">
            <input class="input-hh" type="text" name="by" value="${esc(t.assignedTo ? L.staffName(t.assignedTo) : "")}" placeholder="Done by" aria-label="Done by" maxlength="60">
            <input class="input-hh" type="number" name="hours" min="0.25" max="24" step="0.25" placeholder="Hours" aria-label="Hours">
            <input class="input-hh" type="text" name="note" placeholder="Work done" aria-label="Note" maxlength="200">
            <button type="submit" class="btn-hh btn-hh--sm btn-hh--dark"><i class="bi bi-plus-lg"></i>Add entry</button></form>
        </div>
      </div>
      <div class="detail-block"><div class="detail-block__title">Status history</div>
        <ul class="timeline">${history.slice().reverse().map((h) => `<li><time>${h.date && h.date.includes("T") ? U.fmtDateTime(h.date) : U.fmtDate(h.date)} · ${esc(h.by || "")}</time>${HH.ui.badge(h.status)} ${esc(h.note || "")}</li>`).join("")}</ul></div>
    </div>`;
  }

  function addComment(id, text) {
    const t = HH.store.get("maintenance", id); if (!t) return false;
    text = String(text || "").trim();
    if (!text) { HH.toast("Write a comment first.", "error"); return false; }
    HH.store.update("maintenance", id, { comments: [...(t.comments || []), { date: U.nowISO(), by: me(), text }] });
    HH.toast("Comment added.", "success");
    return true;
  }
  function addLog(id, d) {
    const t = HH.store.get("maintenance", id); if (!t) return "Ticket not found.";
    const hours = Number(d.hours);
    if (!d.date) return "Select the work date.";
    if (d.date > U.todayISO()) return "Work date cannot be in the future.";
    if (d.date < t.reportedOn) return "Work date cannot be before the ticket was reported.";
    if (!d.by) return "Enter who did the work.";
    if (!hours || hours <= 0 || hours > 24) return "Hours must be between 0.25 and 24.";
    if (!d.note) return "Describe the work done.";
    HH.store.update("maintenance", id, { worklog: [...(t.worklog || []), { date: d.date, by: d.by, hours, note: d.note }] });
    HH.toast(`${hours} h logged on ${t.id}.`, "success");
    return true;
  }

  function wireView(m, id) {
    const rerender = () => { const t = HH.store.get("maintenance", id); if (!t) return; m.body.innerHTML = view(t); bind(); page.refresh(); };
    const bind = () => {
      m.body.querySelector("[data-comment-form]").addEventListener("submit", (e) => { e.preventDefault(); if (addComment(id, e.target.elements.text.value)) rerender(); });
      m.body.querySelector("[data-log-form]").addEventListener("submit", (e) => {
        e.preventDefault(); const f = e.target.elements;
        const res = addLog(id, { date: f.date.value, by: f.by.value.trim(), hours: f.hours.value, note: f.note.value.trim() });
        if (res === true) rerender(); else HH.toast(res, "error");
      });
    };
    bind();
    m.rerender = rerender;
  }

  /* ----------------------------------------------------------- actions --- */
  function assign(t, after) {
    HH.formModal({
      title: `Assign · ${t.id}`, icon: "bi-person-gear", size: "md", values: {}, submitText: "Assign",
      fields: [
        { name: "assignedTo", label: "Staff member", type: "select", required: true, options: staffChoice(t.assignedTo), default: t.assignedTo },
        { name: "start", label: "Start work", type: "switch", switchLabel: "Move ticket to In Progress", default: t.status === "Open" },
        { name: "note", label: "Note", type: "text", placeholder: "Instructions for the technician" },
      ],
      onSubmit: (d) => {
        const cur = HH.store.get("maintenance", t.id);
        if (d.assignedTo === cur.assignedTo && !(d.start && cur.status === "Open")) return "Ticket is already assigned to this person.";
        const status = d.start && cur.status === "Open" ? "In Progress" : cur.status;
        HH.store.update("maintenance", t.id, { assignedTo: d.assignedTo, status, history: hist(cur, status, `Assigned to ${L.staffName(d.assignedTo)}${d.note ? " · " + d.note : ""}`) });
        HH.toast(`${t.id} assigned to ${L.staffName(d.assignedTo)}.`, "success");
        page.refresh(); after && after();
        return true;
      },
    });
  }
  function updateStatus(t, after) {
    HH.formModal({
      title: `Update status · ${t.id}`, icon: "bi-arrow-repeat", size: "md", values: {}, submitText: "Update status",
      fields: [
        { name: "status", label: "New status", type: "select", required: true, options: STATUSES, default: t.status },
        { name: "actualCost", label: "Actual cost (₹)", type: "number", min: 0, step: 50, default: t.actualCost || "", help: "Required for Resolved / Closed." },
        { name: "completedOn", label: "Completed on", type: "date", default: t.completedOn || U.todayISO(), min: t.reportedOn, max: U.todayISO() },
        { name: "note", label: "Note", type: "textarea", rows: 2, placeholder: "What changed?" },
      ],
      onSubmit: (d) => {
        const cur = HH.store.get("maintenance", t.id);
        if (d.status === cur.status && !d.note) return "Status is unchanged — add a note or pick a different status.";
        const patch = { status: d.status };
        if (DONE(d.status)) {
          if (d.actualCost === "" || Number(d.actualCost) <= 0) return `Enter the actual cost to mark the ticket ${d.status}.`;
          if (!d.completedOn) return "Enter the completion date.";
          if (d.completedOn < cur.reportedOn) return "Completion date cannot be before the reported date.";
          patch.actualCost = Number(d.actualCost); patch.completedOn = d.completedOn;
        } else { patch.completedOn = ""; if (d.actualCost !== "") patch.actualCost = Number(d.actualCost); }
        patch.history = hist(cur, d.status, d.status !== cur.status ? `Status ${cur.status} → ${d.status}${d.note ? " · " + d.note : ""}` : d.note);
        HH.store.update("maintenance", t.id, patch);
        HH.toast(`${t.id} is now ${d.status}.`, "success");
        page.refresh(); after && after();
        return true;
      },
    });
  }
  function commentModal(t) {
    HH.prompt(`Add a comment to <b>${esc(t.id)}</b> · ${esc(t.title)}`, { label: "Comment", type: "textarea", required: true }, { title: "Add comment", okText: "Add comment", icon: "bi-chat-left-text" })
      .then((v) => { if (v && addComment(t.id, v)) page.refresh(); });
  }
  function logModal(t) {
    HH.formModal({
      title: `Add work log · ${t.id}`, icon: "bi-stopwatch", size: "md", values: {}, submitText: "Add entry",
      fields: [
        { name: "date", label: "Date", type: "date", required: true, col: 6, default: U.todayISO(), min: t.reportedOn, max: U.todayISO() },
        { name: "hours", label: "Hours", type: "number", required: true, col: 6, min: 0.25, max: 24, step: 0.25 },
        { name: "by", label: "Done by", required: true, default: t.assignedTo ? L.staffName(t.assignedTo) : "" },
        { name: "note", label: "Work done", type: "textarea", rows: 2, required: true },
      ],
      onSubmit: (d) => { const r = addLog(t.id, d); if (r === true) page.refresh(); return r; },
    });
  }
  function printWorkOrder(t) {
    const room = L.room(t.roomId);
    HH.printHTML(`Work Order ${t.id}`, `
      <div class="grid">
        <div class="box"><div class="lbl">Issue</div><div class="val">${esc(t.title)}</div><div class="muted">${esc(t.category)} · Priority ${esc(t.priority)} · ${esc(t.status)}</div></div>
        <div class="box"><div class="lbl">Location</div><div class="val">${esc(room ? `Room ${room.number} · ${room.building}, floor ${room.floor}` : "Common area")}</div><div class="muted">${esc(L.branchName(t.branch))}</div></div>
        <div class="box"><div class="lbl">Assigned technician</div><div class="val">${esc(L.staffName(t.assignedTo))}</div><div class="muted">${esc((L.staff(t.assignedTo) || {}).phone || "")}</div></div>
        <div class="box"><div class="lbl">Dates</div><div class="val">Reported ${U.fmtDate(t.reportedOn)} · Due ${U.fmtDate(t.dueDate)}</div><div class="muted">Completed ${U.fmtDate(t.completedOn)}</div></div>
      </div>
      <div class="box"><div class="lbl">Notes</div><div>${esc(t.notes || "—")}</div></div>
      <h2>Work log</h2><table><thead><tr><th>Date</th><th>By</th><th class="r">Hours</th><th>Work done</th></tr></thead><tbody>
      ${(t.worklog || []).map((w) => `<tr><td>${U.fmtDate(w.date)}</td><td>${esc(w.by)}</td><td class="r">${esc(w.hours)}</td><td>${esc(w.note)}</td></tr>`).join("") || `<tr><td colspan="4" class="muted">No entries yet</td></tr>`}
      ${[1, 2, 3].map(() => `<tr><td>&nbsp;</td><td></td><td></td><td></td></tr>`).join("")}
      <tr class="tot"><td colspan="2">Total hours</td><td class="r">${totalHours(t)}</td><td></td></tr></tbody></table>
      <div class="grid" style="margin-top:14px"><div class="box"><div class="lbl">Estimated cost</div><div class="val">${U.fmtMoney(t.estCost)}</div></div><div class="box"><div class="lbl">Actual cost</div><div class="val">${t.actualCost ? U.fmtMoney(t.actualCost) : "________"}</div></div></div>
      <div class="grid" style="margin-top:40px"><div>______________________<br><span class="muted">Technician signature</span></div><div>______________________<br><span class="muted">Warden / supervisor</span></div></div>`,
    { subtitle: `${t.title} · ${t.category}` });
  }

  /* --------------------------------------------------------- list page --- */
  const csv = [
    ["Ticket ID", "id"], ["Title", "title"], ["Category", "category"], ["Branch", (t) => L.branchName(t.branch)], ["Room", (t) => (t.roomId ? L.roomLabel(t.roomId) : "Common area")],
    ["Priority", "priority"], ["Assigned To", (t) => L.staffName(t.assignedTo)], ["Reported On", "reportedOn"], ["Due Date", "dueDate"], ["Completed On", "completedOn"],
    ["Status", "status"], ["Overdue", (t) => (C.isOverdueTicket(t) ? "Yes" : "No")], ["Estimated Cost", "estCost"], ["Actual Cost", "actualCost"], ["Hours Logged", totalHours], ["Notes", "notes"],
  ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] }));

  const page = HH.CrudPage({
    collection: "maintenance", entity: "Ticket", entityPlural: "Tickets", icon: "bi-tools", addLabel: "New Ticket", addTitle: "New maintenance ticket", viewIcon: "bi-tools",
    searchPlaceholder: "Search ticket ID, title, room, technician…",
    search: (t) => `${t.id} ${t.title} ${t.category} ${L.roomLabel(t.roomId)} ${L.staffName(t.assignedTo)} ${t.notes || ""}`,
    tabs: [
      { key: "all", label: "All Tickets" },
      { key: "open", label: "Open Tickets", filter: isOpen },
      { key: "overdue", label: "Overdue", filter: C.isOverdueTicket },
    ],
    filters: [
      { key: "category", label: "All categories", options: CATEGORIES },
      { key: "priority", label: "Any priority", options: PRIORITIES },
      { key: "status", label: "Any status", options: STATUSES },
      { key: "branch", label: "All branches", options: () => L.branchOptions() },
      { key: "assignedTo", label: "Any assignee", options: () => [{ value: "__none", label: "Unassigned" }, ...HH.store.all("staff").filter((s) => HH.store.all("maintenance").some((t) => t.assignedTo === s.id) || ["Maintenance", "Housekeeping"].includes(s.department)).map((s) => ({ value: s.id, label: s.name }))],
        match: (t, v) => (v === "__none" ? !t.assignedTo : t.assignedTo === v) },
    ],
    dateFilter: { key: "reportedOn", label: "Reported" },
    defaultSort: { key: "reportedOn", dir: "desc" },
    rowCls: (t) => (C.isOverdueTicket(t) ? "mt-row--overdue" : ""),
    columns: [
      { key: "title", label: "Ticket", render: (t) => `<div class="mt-title"><span class="chip-icon tone-${C.isOverdueTicket(t) ? "red" : "blue"}"><i class="bi ${CAT_ICON[t.category] || "bi-tools"}"></i></span><div style="min-width:0"><div class="fw-semibold truncate">${esc(t.title)}</div><div class="text-2 small">${esc(t.id)} · ${esc(t.category)}</div></div></div>` },
      { key: "room", label: "Location", value: (t) => location_(t), render: (t) => `<div class="nowrap fw-semibold">${t.roomId ? esc(L.roomLabel(t.roomId)) : "Common area"}</div><div class="text-2 small nowrap">${esc(L.branchName(t.branch))}</div>` },
      { key: "priority", label: "Priority", value: (t) => PRIORITIES.indexOf(t.priority), render: (t) => HH.ui.badge(t.priority) },
      { key: "assignedTo", label: "Assigned", value: (t) => L.staffName(t.assignedTo), render: (t) => (t.assignedTo ? `<span class="nowrap">${esc(L.staffName(t.assignedTo))}</span>` : `<span class="text-3">Unassigned</span>`) },
      { key: "reportedOn", label: "Reported", render: (t) => U.fmtDate(t.reportedOn), cls: "nowrap" },
      { key: "dueDate", label: "Due", render: (t) => (C.isOverdueTicket(t) ? `<span class="mt-overdue"><i class="bi bi-alarm"></i> ${U.fmtDate(t.dueDate)}</span><div class="small" style="color:var(--red)">${U.daysBetween(t.dueDate, U.todayISO())} day(s) late</div>` : U.fmtDate(t.dueDate)), cls: "nowrap" },
      { key: "actualCost", label: "Cost", value: (t) => Number(t.actualCost || t.estCost) || 0, render: (t) => (t.actualCost ? money(t.actualCost) : `<span class="text-2">est. ${U.fmtMoney(t.estCost)}</span>`), cls: "t-right nowrap", thCls: "t-right" },
      { key: "status", label: "Status", value: (t) => STATUSES.indexOf(t.status), render: (t) => HH.ui.badge(t.status) },
    ],
    csvColumns: csv, exportName: "maintenance-tickets", printTitle: "Maintenance Tickets",
    stats: (all) => {
      const m = curMonth();
      const doneM = all.filter((t) => DONE(t.status) && String(t.completedOn).startsWith(m));
      const od = all.filter(C.isOverdueTicket);
      return [
        { label: "Open Tickets", value: all.filter(isOpen).length, icon: "bi-envelope-open", tone: "blue", meta: `${all.filter((t) => isOpen(t) && !t.assignedTo).length} unassigned`, onClick: () => (location.hash = "open") },
        { label: "Overdue", value: od.length, icon: "bi-alarm-fill", tone: "red", meta: od.length ? `${od.filter((t) => ["High", "Critical"].includes(t.priority)).length} high / critical` : "Nothing overdue", onClick: () => (location.hash = "overdue") },
        { label: "In Progress", value: all.filter((t) => t.status === "In Progress").length, icon: "bi-gear-wide-connected", tone: "orange", meta: `${all.filter((t) => t.status === "On Hold").length} on hold`, onClick: () => page.setFilter("status", "In Progress") },
        { label: "Resolved This Month", value: doneM.length, icon: "bi-check2-circle", tone: "green", meta: U.monthLabel(m) },
        { label: "Repair Cost This Month", value: U.fmtMoney(U.sum(doneM, (t) => t.actualCost)), icon: "bi-currency-rupee", tone: "purple", meta: "Actual cost of completed tickets" },
      ];
    },
    fields, formSize: "lg",
    defaults: () => ({ status: "Open", priority: "Medium", category: "Electrical", branch: (L.branches()[0] || {}).id || "", reportedOn: U.todayISO(), dueDate: U.addDays(U.todayISO(), 7), estCost: 0, actualCost: "" }),
    presetsFromQuery: (p) => {
      const out = Object.assign({}, p);
      if (p.room) { const r = L.room(p.room); if (r) { out.roomId = r.id; out.branch = r.branch; } delete out.room; }
      if (p.priority && PRIORITIES.includes(p.priority)) out.dueDate = U.addDays(U.todayISO(), dueDays(p.priority));
      return out;
    },
    onFormReady: (f, ctx, rec) => { if (rec && !DONE(rec.status) && !Number(rec.actualCost)) f.elements.actualCost.value = ""; },
    beforeSave,
    view, viewSize: "xl",
    onViewReady: (m, t) => wireView(m, t.id),
    viewFooter: () => [
      { label: "Print work order", icon: "bi-printer", left: true, onClick: (t) => printWorkOrder(t) },
      { label: "Assign", icon: "bi-person-gear", onClick: (t, ctx) => { ctx.close(); setTimeout(() => assign(t, () => page.openView(t.id)), 320); } },
      { label: "Update status", icon: "bi-arrow-repeat", cls: "btn-hh--blue", onClick: (t, ctx) => { ctx.close(); setTimeout(() => updateStatus(t, () => page.openView(t.id)), 320); } },
    ],
    actions: [
      { label: "Assign", icon: "bi-person-gear", show: isOpen, handler: (t) => assign(t) },
      { label: "Update status", icon: "bi-arrow-repeat", handler: (t) => updateStatus(t) },
      { label: "Add comment", icon: "bi-chat-left-text", handler: (t) => commentModal(t) },
      { label: "Add work log", icon: "bi-stopwatch", handler: (t) => logModal(t) },
      { label: "Print work order", icon: "bi-printer", handler: (t) => printWorkOrder(t) },
    ],
    bulkActions: [
      { label: "Export selected", icon: "bi-filetype-csv", handler: (rows) => HH.exportCSV(`maintenance-selected-${U.todayISO()}.csv`, csv, rows) },
    ],
    titleOf: (t) => `${t.id} · ${t.title}`,
  });
})();
