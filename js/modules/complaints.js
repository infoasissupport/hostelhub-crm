/* ==========================================================================
   HostelHub — Complaints
   Tabs: #all · #open · #resolved   (escalation uses HH.maintenance from maintenance.js)
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, esc = U.esc;
  const me = () => (HH.store.settings().currentUser || {}).name || "Admin";
  const CATEGORIES = ["Room", "Food", "Cleanliness", "Maintenance", "Staff", "Noise", "Internet", "Other"];
  const PRIORITIES = ["Low", "Medium", "High", "Critical"];
  const STATUSES = ["Open", "In Progress", "Resolved", "Closed", "Rejected"];
  const FINAL = ["Resolved", "Closed", "Rejected"];
  const isOpen = (c) => c.status === "Open" || c.status === "In Progress";
  const isDone = (c) => c.status === "Resolved" || c.status === "Closed";
  const CAT_TO_MT = { Room: "Carpentry", Maintenance: "Electrical", Cleanliness: "Cleaning", Internet: "Internet", Food: "Appliance", Noise: "Other", Staff: "Other", Other: "Other" };
  const CAT_ICON = { Room: "bi-door-closed", Food: "bi-egg-fried", Cleanliness: "bi-stars", Maintenance: "bi-tools", Staff: "bi-person-badge", Noise: "bi-volume-up", Internet: "bi-wifi", Other: "bi-chat-dots" };
  const hist = (c, status, note) => [...(c.history || []), { date: U.nowISO(), status, note: note || "", by: me() }];
  const curMonth = () => U.todayISO().slice(0, 7);
  const staffChoice = (keep) => L.staffOptions((s) => s.status !== "Resigned" || s.id === keep);
  const resChoice = (keep) => L.residentOptions((r) => r.status === "Active" || r.status === "On Leave" || r.id === keep);

  function fields(rec) {
    return [
      { name: "residentId", label: "Resident", type: "select", required: true, col: 8, options: resChoice(rec && rec.residentId) },
      { name: "createdAt", label: "Reported on", type: "date", required: true, col: 4, max: U.todayISO() },
      { name: "category", label: "Category", type: "select", required: true, col: 4, options: CATEGORIES },
      { name: "priority", label: "Priority", type: "select", required: true, col: 4, options: PRIORITIES },
      { name: "assignedTo", label: "Assigned to", type: "select", col: 4, placeholder: "Unassigned", options: staffChoice(rec && rec.assignedTo) },
      { name: "subject", label: "Subject", required: true, col: 12, maxlength: 120, placeholder: "Short summary of the issue" },
      { name: "description", label: "Description", type: "textarea", rows: 3, required: true, col: 12, maxlength: 1000 },
      { name: "status", label: "Status", type: "select", required: true, col: 4, options: STATUSES,
        onChange: (v, f) => f.querySelector('[data-field="resolution"] label').classList.toggle("is-req", FINAL.includes(v)) },
      { name: "resolution", label: "Resolution notes", type: "textarea", rows: 2, col: 8, help: "Required when the status is Resolved, Closed or Rejected.",
        validate: (v, vals) => (vals && FINAL.includes(vals.status) && !v ? "Resolution notes are required for this status." : "") },
    ];
  }

  function beforeSave(d, prev) {
    if (!L.resident(d.residentId)) return "Select a valid resident.";
    if (d.createdAt > U.todayISO()) return "Reported date cannot be in the future.";
    if (FINAL.includes(d.status) && !String(d.resolution || "").trim()) return `Resolution notes are required to mark the complaint ${d.status}.`;
    if (!prev) {
      d.history = [{ date: U.nowISO(), status: "Open", note: "Complaint registered", by: me() }];
      if (d.assignedTo) d.history.push({ date: U.nowISO(), status: d.status, note: `Assigned to ${L.staffName(d.assignedTo)}`, by: me() });
      if (d.status !== "Open") d.history.push({ date: U.nowISO(), status: d.status, note: d.resolution || "Status set on creation", by: me() });
    } else {
      const notes = [];
      if (prev.status !== d.status) notes.push(`Status ${prev.status} → ${d.status}${FINAL.includes(d.status) && d.resolution ? " · " + d.resolution : ""}`);
      if ((prev.assignedTo || "") !== (d.assignedTo || "")) notes.push(d.assignedTo ? `Assigned to ${L.staffName(d.assignedTo)}` : "Unassigned");
      if (notes.length) d.history = hist(prev, d.status, notes.join(" · "));
    }
    d.resolvedAt = FINAL.includes(d.status) ? (prev && FINAL.includes(prev.status) && prev.resolvedAt) || U.todayISO() : "";
  }

  function view(c) {
    const r = L.resident(c.residentId);
    const mt = c.maintenanceId && HH.store.get("maintenance", c.maintenanceId);
    const age = U.daysBetween(c.createdAt, c.resolvedAt || U.todayISO());
    return `<div class="stack">
      <div class="detail-head"><span class="chip-icon chip-icon--lg tone-purple"><i class="bi ${CAT_ICON[c.category] || "bi-chat-dots"}"></i></span>
        <div style="min-width:0"><h3>${esc(c.subject)}</h3><div class="text-2">${esc(c.id)} · ${esc(c.category)} · reported ${U.fmtDate(c.createdAt)}</div>
          <div class="row-flex mt-2">${HH.ui.badge(c.status)} ${HH.ui.badge(c.priority)} ${mt ? `<a class="badge-hh tone-blue" href="maintenance.html?view=${esc(mt.id)}"><i class="bi bi-tools"></i>${esc(mt.id)} · ${esc(mt.status)}</a>` : ""}</div></div>
        <div class="cmp-age"><div class="kv__label">${c.resolvedAt ? "Closed in" : "Open for"}</div><b>${age} day(s)</b></div></div>
      <div class="detail-block"><div class="detail-block__title">Description</div><div>${esc(c.description)}</div></div>
      <div class="detail-block">${HH.ui.kv([
        ["Resident", r ? `<a class="link-hh" href="resident-details.html?id=${esc(r.id)}">${esc(r.name)} (${esc(r.id)})</a>` : esc(L.residentName(c.residentId))],
        ["Room", esc(r && r.roomId ? L.bedLabel(r.roomId, r.bed) : "—")], ["Branch", esc(L.branchName(r && r.branch))],
        ["Assigned to", c.assignedTo ? `<a class="link-hh" href="staff-management.html?view=${esc(c.assignedTo)}">${esc(L.staffName(c.assignedTo))}</a>` : `<span class="text-3">Unassigned</span>`],
        ["Resolved on", U.fmtDate(c.resolvedAt)], ["Phone", esc(r ? r.phone : "—")],
        ["Resolution", esc(c.resolution), true],
      ], 3)}</div>
      <div class="detail-block"><div class="detail-block__title">Timeline</div>
        <ul class="timeline cmp-timeline">${(c.history || []).slice().reverse().map((h) => `<li class="is-${esc(HH.ui.toneOf(h.status))}"><time>${U.fmtDateTime(h.date)} · ${esc(h.by || "")}</time>${HH.ui.badge(h.status)} ${esc(h.note || "")}</li>`).join("") || `<li>No history recorded.</li>`}</ul></div>
    </div>`;
  }

  /* ----------------------------------------------------------- actions --- */
  function assign(c, after) {
    HH.formModal({
      title: `Assign · ${c.id}`, icon: "bi-person-gear", size: "md", values: {}, submitText: "Assign",
      fields: [
        { name: "assignedTo", label: "Staff member", type: "select", required: true, options: staffChoice(c.assignedTo), default: c.assignedTo },
        { name: "note", label: "Note", type: "text", placeholder: "Optional instructions" },
      ],
      onSubmit: (d) => {
        const cur = HH.store.get("complaints", c.id);
        if (d.assignedTo === cur.assignedTo) return "Complaint is already assigned to this person.";
        const status = cur.status === "Open" ? "In Progress" : cur.status;
        HH.store.update("complaints", c.id, { assignedTo: d.assignedTo, status, history: hist(cur, status, `Assigned to ${L.staffName(d.assignedTo)}${d.note ? " · " + d.note : ""}`) });
        HH.toast(`${c.id} assigned to ${L.staffName(d.assignedTo)}.`, "success");
        page.refresh(); after && after();
        return true;
      },
    });
  }
  function updateStatus(c, after) {
    HH.formModal({
      title: `Update status · ${c.id}`, icon: "bi-arrow-repeat", size: "md", values: {}, submitText: "Update status",
      fields: [
        { name: "status", label: "New status", type: "select", required: true, options: STATUSES, default: c.status },
        { name: "note", label: "Note / resolution", type: "textarea", rows: 3, default: FINAL.includes(c.status) ? c.resolution : "", help: "Required for Resolved, Closed or Rejected — saved as the resolution notes." },
      ],
      onSubmit: (d) => {
        const cur = HH.store.get("complaints", c.id);
        if (d.status === cur.status && !d.note) return "Status is unchanged — pick a new status or add a note.";
        if (FINAL.includes(d.status) && !d.note) return "Resolution notes are required for this status.";
        const patch = { status: d.status, history: hist(cur, d.status, d.status !== cur.status ? `Status ${cur.status} → ${d.status}${d.note ? " · " + d.note : ""}` : d.note) };
        if (FINAL.includes(d.status)) { patch.resolution = d.note; patch.resolvedAt = FINAL.includes(cur.status) && cur.resolvedAt ? cur.resolvedAt : U.todayISO(); }
        else patch.resolvedAt = "";
        HH.store.update("complaints", c.id, patch);
        HH.toast(`${c.id} is now ${d.status}.`, "success");
        page.refresh(); after && after();
        return true;
      },
    });
  }
  function escalate(c, after) {
    const existing = c.maintenanceId && HH.store.get("maintenance", c.maintenanceId);
    if (existing) {
      return HH.confirm(`This complaint was already escalated to ticket <b>${esc(existing.id)}</b> (${esc(existing.status)}). Open it?`, { title: "Already escalated", okText: "Open ticket", icon: "bi-tools" })
        .then((ok) => ok && (location.href = `maintenance.html?view=${existing.id}`));
    }
    if (!HH.maintenance) return HH.toast("Maintenance module is not available on this page.", "error");
    const r = L.resident(c.residentId);
    const branch = (r && r.branch) || (L.branches()[0] || {}).id;
    HH.formModal({
      title: `Escalate ${c.id} to maintenance`, icon: "bi-tools", size: "lg", values: {}, submitText: "Create ticket",
      fields: [
        { type: "html", html: `<div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span>A maintenance ticket will be created for <b>${esc(r ? r.name : "the resident")}</b>${r && r.roomId ? ` in room <b>${esc(L.roomLabel(r.roomId))}</b>` : ""} and linked to this complaint.</span><span></span></div>` },
        { name: "title", label: "Ticket title", required: true, col: 8, default: c.subject, maxlength: 100 },
        { name: "category", label: "Category", type: "select", required: true, col: 4, options: HH.maintenance.CATEGORIES, default: CAT_TO_MT[c.category] || "Other" },
        { name: "roomId", label: "Room", type: "select", col: 4, placeholder: "Common area / no room", options: L.roomOptions(branch), default: r ? r.roomId : "" },
        { name: "priority", label: "Priority", type: "select", required: true, col: 4, options: HH.maintenance.PRIORITIES, default: c.priority },
        { name: "assignedTo", label: "Assign technician", type: "select", col: 4, placeholder: "Unassigned", options: L.staffOptions((s) => s.status !== "Resigned" && ["Maintenance", "Housekeeping"].includes(s.department)) },
        { name: "notes", label: "Notes for technician", type: "textarea", rows: 2, col: 12, default: c.description },
      ],
      onSubmit: (d) => {
        const t = HH.maintenance.create({
          title: d.title, category: d.category, branch, roomId: d.roomId, priority: d.priority, assignedTo: d.assignedTo, status: "Open",
          notes: `${d.notes ? d.notes + "\n" : ""}Escalated from complaint ${c.id} (${L.residentName(c.residentId)}).`,
          comments: [{ date: U.nowISO(), by: me(), text: `Escalated from complaint ${c.id}: ${c.subject}` }],
          historyNote: `Created from complaint ${c.id}`,
        });
        const cur = HH.store.get("complaints", c.id);
        const status = cur.status === "Open" ? "In Progress" : cur.status;
        HH.store.update("complaints", c.id, { maintenanceId: t.id, status, history: hist(cur, status, `Escalated to maintenance ticket ${t.id}`) });
        HH.toast(`Maintenance ticket <a class="link-hh" style="color:#7DB9FF" href="maintenance.html?view=${t.id}">${t.id}</a> created and linked.`, "success", 6000);
        page.refresh(); after && after();
        return true;
      },
    });
  }

  /* ---------------------------------------------------------- chart ---- */
  function renderChart(pg) {
    const canvas = document.getElementById("cmpChart"); if (!canvas) return;
    const rows = (pg || page).rows();
    const counts = CATEGORIES.map((k) => rows.filter((c) => c.category === k).length);
    const open = CATEGORIES.map((k) => rows.filter((c) => c.category === k && isOpen(c)).length);
    HH.chart(canvas, {
      type: "bar",
      data: { labels: CATEGORIES, datasets: [
        { label: "Open / in progress", data: open, backgroundColor: HH.colors.orange, borderRadius: 6, maxBarThickness: 26 },
        { label: "Resolved / closed", data: counts.map((n, i) => n - open[i]), backgroundColor: HH.colors.blue, borderRadius: 6, maxBarThickness: 26 },
      ] },
      options: { scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0 } } },
        plugins: { legend: { display: true, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true } } } },
    });
    const sub = document.getElementById("cmpChartSub"); if (sub) sub.textContent = `${rows.length} complaint(s) matching the current tab & filters`;
  }

  const csv = [
    ["Complaint ID", "id"], ["Reported On", "createdAt"], ["Resident ID", "residentId"], ["Resident", (c) => L.residentName(c.residentId)],
    ["Room", (c) => { const r = L.resident(c.residentId); return r && r.roomId ? L.roomLabel(r.roomId) : ""; }], ["Category", "category"], ["Subject", "subject"],
    ["Description", "description"], ["Priority", "priority"], ["Assigned To", (c) => L.staffName(c.assignedTo)], ["Status", "status"], ["Resolved On", "resolvedAt"],
    ["Resolution", "resolution"], ["Maintenance Ticket", (c) => c.maintenanceId || ""],
  ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] }));

  const page = HH.CrudPage({
    collection: "complaints", entity: "Complaint", icon: "bi-chat-square-text", addLabel: "New Complaint", viewIcon: "bi-chat-square-text",
    searchPlaceholder: "Search ID, subject, resident…",
    search: (c) => `${c.id} ${c.subject} ${c.description} ${L.residentName(c.residentId)} ${c.residentId} ${L.staffName(c.assignedTo)}`,
    tabs: [
      { key: "all", label: "All Complaints" },
      { key: "open", label: "Open", filter: isOpen },
      { key: "resolved", label: "Resolved", filter: isDone },
    ],
    filters: [
      { key: "category", label: "All categories", options: CATEGORIES },
      { key: "priority", label: "Any priority", options: PRIORITIES },
      { key: "status", label: "Any status", options: STATUSES },
      { key: "assignedTo", label: "Any assignee", options: () => [{ value: "__none", label: "Unassigned" }, ...HH.store.all("staff").filter((s) => HH.store.all("complaints").some((c) => c.assignedTo === s.id)).map((s) => ({ value: s.id, label: s.name }))],
        match: (c, v) => (v === "__none" ? !c.assignedTo : c.assignedTo === v) },
    ],
    dateFilter: { key: "createdAt", label: "Reported" },
    defaultSort: { key: "createdAt", dir: "desc" },
    columns: [
      { key: "subject", label: "Complaint", render: (c) => `<div class="cmp-title"><span class="chip-icon tone-purple"><i class="bi ${CAT_ICON[c.category] || "bi-chat-dots"}"></i></span><div style="min-width:0"><div class="fw-semibold truncate">${esc(c.subject)}</div><div class="text-2 small">${esc(c.id)} · ${esc(c.category)}${c.maintenanceId ? ` · <i class="bi bi-tools"></i> ${esc(c.maintenanceId)}` : ""}</div></div></div>` },
      { key: "residentId", label: "Resident", value: (c) => L.residentName(c.residentId), render: (c) => { const r = L.resident(c.residentId); return `<div class="fw-semibold nowrap">${esc(L.residentName(c.residentId))}</div><div class="text-2 small nowrap">${esc(r && r.roomId ? "Room " + L.roomLabel(r.roomId) : c.residentId)}</div>`; } },
      { key: "priority", label: "Priority", value: (c) => PRIORITIES.indexOf(c.priority), render: (c) => HH.ui.badge(c.priority) },
      { key: "assignedTo", label: "Assigned", value: (c) => L.staffName(c.assignedTo), render: (c) => (c.assignedTo ? `<span class="nowrap">${esc(L.staffName(c.assignedTo))}</span>` : `<span class="text-3">Unassigned</span>`) },
      { key: "createdAt", label: "Reported", render: (c) => `<div class="nowrap">${U.fmtDate(c.createdAt)}</div><div class="text-2 small">${c.resolvedAt ? "closed " + U.fmtDate(c.resolvedAt) : U.daysBetween(c.createdAt, U.todayISO()) + " day(s) open"}</div>` },
      { key: "status", label: "Status", value: (c) => STATUSES.indexOf(c.status), render: (c) => HH.ui.badge(c.status) },
    ],
    csvColumns: csv, exportName: "complaints", printTitle: "Complaints",
    stats: (all) => {
      const m = curMonth();
      const done = all.filter((c) => isDone(c) && c.resolvedAt);
      const avg = done.length ? (U.sum(done, (c) => Math.max(0, U.daysBetween(c.createdAt, c.resolvedAt))) / done.length).toFixed(1) : "—";
      return [
        { label: "Total Complaints", value: all.length, icon: "bi-chat-square-text-fill", tone: "blue", meta: `${all.filter((c) => c.createdAt && c.createdAt.startsWith(m)).length} this month`, onClick: () => (location.hash = "all") },
        { label: "Open", value: all.filter((c) => c.status === "Open").length, icon: "bi-envelope-exclamation-fill", tone: "orange", meta: `${all.filter((c) => c.status === "Open" && !c.assignedTo).length} unassigned`, onClick: () => page.setFilter("status", "Open") },
        { label: "In Progress", value: all.filter((c) => c.status === "In Progress").length, icon: "bi-hourglass-split", tone: "purple", meta: "Being worked on", onClick: () => page.setFilter("status", "In Progress") },
        { label: "High Priority Open", value: all.filter((c) => isOpen(c) && ["High", "Critical"].includes(c.priority)).length, icon: "bi-exclamation-octagon-fill", tone: "red", meta: "High or critical", onClick: () => { location.hash = "open"; page.setFilter("priority", "High"); } },
        { label: "Resolved This Month", value: all.filter((c) => isDone(c) && String(c.resolvedAt).startsWith(m)).length, icon: "bi-check2-circle", tone: "green", meta: `Avg ${avg} day(s) to resolve`, onClick: () => (location.hash = "resolved") },
      ];
    },
    before: () => document.getElementById("cmpChart") ? undefined : `<section class="card-hh cmp-chart-card">
        <div class="card-hh__head"><span class="chip-icon tone-purple"><i class="bi bi-bar-chart"></i></span><div><div class="card-hh__title">Complaints by category</div><div class="card-hh__sub" id="cmpChartSub"></div></div></div>
        <div class="chart-box chart-box--sm"><canvas id="cmpChart" aria-label="Complaints by category chart" role="img"></canvas></div></section>`,
    onRefresh: (pg) => renderChart(pg),
    fields, formSize: "lg",
    defaults: () => ({ status: "Open", priority: "Medium", category: "Room", createdAt: U.todayISO() }),
    presetsFromQuery: (p) => { const o = Object.assign({}, p); if (p.resident) { o.residentId = p.resident; delete o.resident; } return o; },
    onFormReady: (f) => { const lab = f.querySelector('[data-field="resolution"] label'); if (lab) lab.classList.toggle("is-req", FINAL.includes(f.elements.status.value)); },
    beforeSave,
    view, viewSize: "lg",
    viewFooter: (c) => [
      ...(isOpen(c) ? [{ label: "Escalate to maintenance", icon: "bi-tools", left: true, onClick: (rec, ctx) => { ctx.close(); setTimeout(() => escalate(rec, () => page.openView(rec.id)), 320); } }] : []),
      { label: "Assign", icon: "bi-person-gear", onClick: (rec, ctx) => { ctx.close(); setTimeout(() => assign(rec, () => page.openView(rec.id)), 320); } },
      { label: "Update status", icon: "bi-arrow-repeat", cls: "btn-hh--blue", onClick: (rec, ctx) => { ctx.close(); setTimeout(() => updateStatus(rec, () => page.openView(rec.id)), 320); } },
    ],
    actions: [
      { label: "Assign", icon: "bi-person-gear", show: (c) => !FINAL.includes(c.status), handler: (c) => assign(c) },
      { label: "Update status", icon: "bi-arrow-repeat", handler: (c) => updateStatus(c) },
      { label: (c) => (c.maintenanceId ? "Open maintenance ticket" : "Escalate to maintenance"), icon: "bi-tools", show: (c) => isOpen(c) || !!c.maintenanceId, handler: (c) => escalate(c) },
      { label: "Resident profile", icon: "bi-person", show: (c) => !!L.resident(c.residentId), handler: (c) => (location.href = `resident-details.html?id=${c.residentId}`) },
    ],
    bulkActions: [
      { label: "Export selected", icon: "bi-filetype-csv", handler: (rows) => HH.exportCSV(`complaints-selected-${U.todayISO()}.csv`, csv, rows) },
    ],
    titleOf: (c) => `${c.id} · ${c.subject}`,
  });
})();
