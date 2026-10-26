/* ==========================================================================
   HostelHub — Visitors (gate register)
   Tabs: #all · #inside
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const ID_TYPES = ["Aadhaar", "Driving Licence", "Voter ID", "Passport", "PAN Card", "College ID", "Other"];
  const PURPOSES = ["Family visit", "Parent meeting", "Guardian visit", "Friend visit", "Delivering items", "Document submission", "Medical visit", "Other"];
  const digits = (v) => String(v || "").replace(/\D/g, "");
  const inside = (v) => !v.checkOut;
  const mins = (v) => (v.checkOut ? Math.max(0, Math.round((U.parse(v.checkOut) - U.parse(v.checkIn)) / 60000)) : null);
  const dur = (m) => (m == null ? "—" : m < 60 ? `${m} min` : `${Math.floor(m / 60)}h ${U.pad(m % 60)}m`);
  const today = () => U.todayISO();
  const resLabel = (id) => { const r = L.resident(id); return r ? `${r.name}${r.roomId ? " · " + L.bedLabel(r.roomId, r.bed) : ""}` : L.residentName(id); };
  const residentChoice = (keep) => L.residentOptions((r) => r.status === "Active" || r.status === "On Leave" || r.id === keep).map((o) => { const r = L.resident(o.value); return { value: o.value, label: `${r.name} (${r.id})${r.roomId ? " · Room " + L.roomLabel(r.roomId) : ""}` }; });

  function resInfo(id) {
    const r = L.resident(id);
    if (!r) return `<div class="vis-resinfo text-2"><i class="bi bi-info-circle"></i> Select the resident being visited — the branch is filled in automatically.</div>`;
    return `<div class="vis-resinfo">${HH.ui.person(r.name, `${r.id} · ${r.phone}`, r.photo)}<div class="vis-resinfo__meta"><span><i class="bi bi-door-open"></i> ${esc(r.roomId ? L.bedLabel(r.roomId, r.bed) : "No room")}</span><span><i class="bi bi-building"></i> ${esc(L.branchName(r.branch))}</span>${r.status !== "Active" ? HH.ui.badge(r.status) : ""}</div></div>`;
  }

  function fields(rec) {
    return [
      { type: "section", label: "Visitor", icon: "bi-person-vcard" },
      { name: "name", label: "Visitor name", required: true, col: 6, maxlength: 80 },
      { name: "phone", label: "Phone", type: "tel", required: true, col: 6, placeholder: "98765 43210" },
      { name: "idProof", label: "ID proof type", type: "select", required: true, col: 6, options: ID_TYPES },
      { name: "idNumber", label: "ID number", col: 6, maxlength: 30, placeholder: "e.g. XXXX-XXXX-1234", required: !rec },
      { type: "section", label: "Visit", icon: "bi-door-open" },
      { name: "residentId", label: "Resident to visit", type: "select", required: true, col: 6, options: residentChoice(rec && rec.residentId),
        onChange: (v, f) => (f.querySelector("[data-resinfo]").innerHTML = resInfo(v)) },
      { name: "purpose", label: "Purpose", type: "select", required: true, col: 6, options: PURPOSES },
      { type: "html", col: 12, html: (v) => `<div data-resinfo>${resInfo(v.residentId)}</div>` },
      { name: "checkIn", label: "Check-in", type: "datetime-local", required: true, col: 6 },
      { name: "checkOut", label: "Check-out", type: "datetime-local", col: 6, help: rec ? "Leave empty while the visitor is inside." : "Use the Check out action when the visitor leaves." , disabled: !rec },
      { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12, placeholder: "Items carried, vehicle number…" },
    ];
  }

  function beforeSave(d, prev) {
    const r = L.resident(d.residentId);
    if (!r) return "Select a valid resident.";
    if (!prev && !(r.status === "Active" || r.status === "On Leave")) return `${r.name} is not currently staying at the hostel.`;
    d.branch = r.branch;
    const now = U.nowISO();
    if (d.checkIn > now) return "Check-in time cannot be in the future.";
    if (!prev) d.checkOut = "";
    if (d.checkOut) {
      if (d.checkOut < d.checkIn) return "Check-out cannot be before check-in.";
      if (d.checkOut > now) return "Check-out time cannot be in the future.";
    }
    if (!d.checkOut) {
      const dup = HH.store.all("visitors").find((v) => v.id !== (prev && prev.id) && inside(v) && digits(v.phone) === digits(d.phone));
      if (dup) return `A visitor with phone ${esc(d.phone)} is already inside (${dup.id} · ${esc(dup.name)}). Check them out first.`;
    }
  }

  async function checkOut(v) {
    const cur = HH.store.get("visitors", v.id);
    if (!cur || cur.checkOut) return HH.toast("This visitor has already checked out.", "warning");
    const now = U.nowISO();
    if (now < cur.checkIn) return HH.toast("Check-out cannot be before the check-in time. Edit the check-in time if it was entered wrongly.", "error");
    const ok = await HH.confirm(`Check out <b>${esc(cur.name)}</b> now (${U.fmtTime(now)})? Visit duration: <b>${dur(Math.round((U.parse(now) - U.parse(cur.checkIn)) / 60000))}</b>.`, { title: "Check out visitor", okText: "Check out", icon: "bi-box-arrow-right" });
    if (!ok) return;
    HH.store.update("visitors", cur.id, { checkOut: now });
    HH.toast(`${cur.name} checked out at ${U.fmtTime(now)}.`, "success");
    page.refresh();
  }

  function qrSVG(seed) {
    let h = 2166136261; for (const c of seed) h = Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0;
    const rnd = () => ((h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0) / 4294967296);
    const n = 21, s = 6; let cells = "";
    const finder = (x, y) => `<rect x="${x * s}" y="${y * s}" width="${7 * s}" height="${7 * s}" fill="#102347"/><rect x="${(x + 1) * s}" y="${(y + 1) * s}" width="${5 * s}" height="${5 * s}" fill="#fff"/><rect x="${(x + 2) * s}" y="${(y + 2) * s}" width="${3 * s}" height="${3 * s}" fill="#102347"/>`;
    const inF = (x, y) => (x < 8 && y < 8) || (x > 12 && y < 8) || (x < 8 && y > 12);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!inF(x, y) && rnd() > 0.52) cells += `<rect x="${x * s}" y="${y * s}" width="${s}" height="${s}" fill="#102347"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n * s} ${n * s}" width="126" height="126">${cells}${finder(0, 0)}${finder(14, 0)}${finder(0, 14)}</svg>`;
  }
  function printPass(v) {
    const r = L.resident(v.residentId);
    const valid = `${v.checkIn.slice(0, 10)}T21:30`;
    HH.printHTML(`Visitor Pass ${v.id}`, `
      <div class="pass">
        <div class="pass__top"><div><div class="lbl">Visitor pass</div><div class="pass__no">${esc(v.id)}</div></div><div class="stamp" style="color:${v.checkOut ? "#63789A" : "#10B981"}">${v.checkOut ? "CHECKED OUT" : "VALID"}</div></div>
        <div class="pass__body">
          <div class="pass__info">
            <div><div class="lbl">Visitor</div><div class="pass__name">${esc(v.name)}</div><div class="muted">${esc(v.phone)} · ${esc(v.idProof)}${v.idNumber ? " " + esc(v.idNumber) : ""}</div></div>
            <div><div class="lbl">Visiting</div><div class="val">${esc(r ? r.name : L.residentName(v.residentId))} (${esc(v.residentId)})</div><div class="muted">${esc(r && r.roomId ? "Room " + L.bedLabel(r.roomId, r.bed) : "—")} · ${esc(L.branchName(v.branch))}</div></div>
            <div><div class="lbl">Purpose</div><div class="val">${esc(v.purpose)}</div></div>
            <div class="pass__times"><div><div class="lbl">Check-in</div><div class="val">${U.fmtDateTime(v.checkIn)}</div></div><div><div class="lbl">Valid till</div><div class="val">${U.fmtDateTime(valid)}</div></div></div>
          </div>
          <div class="pass__qr">${qrSVG(v.id + v.phone)}<small class="muted">Scan placeholder · demo</small></div>
        </div>
        <div class="pass__foot">Please wear this pass while on the premises and return it at the gate when leaving. Visiting hours end at 9:30 PM.</div>
      </div>`, {
      subtitle: `${v.name} → ${r ? r.name : ""}`,
      css: `.pass{max-width:520px;margin:10px auto;border:2px solid #102347;border-radius:14px;overflow:hidden}
        .pass__top{display:flex;justify-content:space-between;align-items:center;background:#FFD21F;padding:12px 16px}.pass__no{font-size:22px;font-weight:800;letter-spacing:.04em}
        .pass__body{display:grid;grid-template-columns:1fr 140px;gap:14px;padding:16px}.pass__info{display:grid;gap:10px}.pass__name{font-size:18px;font-weight:800}
        .pass__times{display:grid;grid-template-columns:1fr 1fr;gap:10px}.pass__qr{display:grid;justify-items:center;align-content:start;gap:6px;border:1px dashed #CAD7E8;border-radius:10px;padding:8px}
        .pass__foot{background:#F4F7FC;padding:10px 16px;font-size:11px;color:#63789A}`,
    });
  }
  function history(v) {
    const list = HH.store.all("visitors").filter((x) => digits(x.phone) === digits(v.phone)).sort((a, b) => b.checkIn.localeCompare(a.checkIn));
    const total = U.sum(list.filter((x) => x.checkOut), mins);
    HH.modal({
      title: `Visitor history · ${v.phone}`, icon: "bi-clock-history", size: "lg",
      body: `<div class="stack"><div class="row-flex">${HH.ui.person(v.name, v.phone)}<span class="spacer" style="flex:1"></span><span class="badge-hh tone-blue">${list.length} visit(s)</span><span class="badge-hh tone-gray">Total time ${dur(total)}</span></div>
        <div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>Pass</th><th>Name used</th><th>Visited</th><th>Purpose</th><th>Check-in</th><th>Duration</th></tr></thead><tbody>
        ${list.map((x) => `<tr><td class="nowrap">${esc(x.id)}</td><td class="nowrap">${esc(x.name)}</td><td class="nowrap">${esc(resLabel(x.residentId))}</td><td>${esc(x.purpose)}</td><td class="nowrap">${U.fmtDateTime(x.checkIn)}</td><td class="nowrap">${inside(x) ? HH.ui.badge("Inside") : dur(mins(x))}</td></tr>`).join("")}</tbody></table></div></div>`,
      footer: [{ label: "Close", cls: "btn-hh--dark", close: true }],
    });
  }

  function view(v) {
    const r = L.resident(v.residentId);
    const prev = HH.store.all("visitors").filter((x) => x.id !== v.id && digits(x.phone) === digits(v.phone)).length;
    return `<div class="stack">
      <div class="detail-head"><img class="avatar avatar--lg" src="${U.avatar(v.name)}" alt="">
        <div style="min-width:0"><h3>${esc(v.name)}</h3><div class="text-2">${esc(v.phone)} · ${esc(v.idProof)}${v.idNumber ? " · " + esc(v.idNumber) : ""}</div>
          <div class="row-flex mt-2">${HH.ui.badge(inside(v) ? "Inside" : "Checked Out")} <span class="badge-hh tone-gray">${esc(v.id)}</span>${prev ? `<span class="badge-hh tone-purple">${prev} earlier visit(s)</span>` : ""}</div></div>
        <div class="vis-dur"><div class="kv__label">Duration</div><b>${inside(v) ? "In progress" : dur(mins(v))}</b></div></div>
      <div class="detail-block"><div class="detail-block__title">Visiting</div>${resInfo(v.residentId)}</div>
      <div class="detail-block">${HH.ui.kv([
        ["Purpose", esc(v.purpose)], ["Branch", esc(L.branchName(v.branch))], ["Check-in", U.fmtDateTime(v.checkIn)],
        ["Check-out", v.checkOut ? U.fmtDateTime(v.checkOut) : HH.ui.badge("Inside")], ["Pass valid till", U.fmtDateTime(v.checkIn.slice(0, 10) + "T21:30")],
        ["Resident profile", r ? `<a class="link-hh" href="resident-details.html?id=${esc(r.id)}">${esc(r.id)}</a>` : "—"], ["Notes", esc(v.notes), true],
      ], 3)}</div></div>`;
  }

  const csv = [
    ["Pass ID", "id"], ["Visitor", "name"], ["Phone", "phone"], ["ID Proof", "idProof"], ["ID Number", "idNumber"], ["Resident ID", "residentId"],
    ["Resident", (v) => L.residentName(v.residentId)], ["Room", (v) => { const r = L.resident(v.residentId); return r && r.roomId ? L.bedLabel(r.roomId, r.bed) : ""; }],
    ["Branch", (v) => L.branchName(v.branch)], ["Purpose", "purpose"], ["Check-in", "checkIn"], ["Check-out", "checkOut"], ["Duration (min)", (v) => mins(v) ?? ""], ["Notes", "notes"],
  ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] }));

  const page = HH.CrudPage({
    collection: "visitors", entity: "Visitor", icon: "bi-person-badge", addLabel: "Register Visitor", addTitle: "Register visitor", addSubmitText: "Check in visitor", viewIcon: "bi-person-badge",
    searchPlaceholder: "Search visitor, phone, pass no., resident…",
    search: (v) => `${v.id} ${v.name} ${v.phone} ${v.idNumber || ""} ${L.residentName(v.residentId)} ${v.purpose}`,
    tabs: [
      { key: "all", label: "Visitor Log" },
      { key: "inside", label: "Currently Inside", filter: inside },
    ],
    filters: [
      { key: "residentId", label: "Any resident", options: () => { const ids = new Set(HH.store.all("visitors").map((v) => v.residentId)); return [...ids].map((id) => ({ value: id, label: L.residentName(id) })).sort((a, b) => a.label.localeCompare(b.label)); } },
      { key: "branch", label: "All branches", options: () => L.branchOptions() },
      { key: "purpose", label: "Any purpose", options: () => [...new Set([...PURPOSES, ...HH.store.all("visitors").map((v) => v.purpose)])] },
    ],
    dateFilter: { key: "checkIn", label: "Visited" },
    defaultSort: { key: "checkIn", dir: "desc" },
    columns: [
      { key: "name", label: "Visitor", render: (v) => HH.ui.person(v.name, `${v.id} · ${v.phone}`) },
      { key: "residentId", label: "Visiting", value: (v) => L.residentName(v.residentId), render: (v) => { const r = L.resident(v.residentId); return `<div class="fw-semibold nowrap">${esc(L.residentName(v.residentId))}</div><div class="text-2 small nowrap">${esc(r && r.roomId ? "Room " + L.roomLabel(r.roomId) : "—")} · ${esc(L.branchName(v.branch))}</div>`; } },
      { key: "purpose", label: "Purpose", cls: "nowrap" },
      { key: "idProof", label: "ID Proof", render: (v) => `<span class="nowrap">${esc(v.idProof)}</span>${v.idNumber ? `<div class="text-2 small">${esc(v.idNumber)}</div>` : ""}` },
      { key: "checkIn", label: "Check-in", render: (v) => `<div class="nowrap">${U.fmtDate(v.checkIn)}</div><div class="text-2 small">${U.fmtTime(v.checkIn)}</div>` },
      { key: "checkOut", label: "Check-out", value: (v) => v.checkOut || "~", render: (v) => (v.checkOut ? `<div class="nowrap">${U.fmtTime(v.checkOut)}</div><div class="text-2 small">${dur(mins(v))}</div>` : `<button type="button" class="btn-hh btn-hh--sm btn-hh--soft-blue" data-checkout="${esc(v.id)}"><i class="bi bi-box-arrow-right"></i>Check out</button>`) },
      { key: "status", label: "Status", value: (v) => (inside(v) ? "Inside" : "Checked Out"), render: (v) => HH.ui.badge(inside(v) ? "Inside" : "Checked Out") },
    ],
    csvColumns: csv, exportName: "visitors", printTitle: "Visitor Register",
    rowCls: (v) => (inside(v) ? "vis-row--inside" : ""),
    stats: (all) => {
      const t = today(), m = t.slice(0, 7);
      const done = all.filter((v) => v.checkOut && v.checkIn.startsWith(m));
      const avg = done.length ? Math.round(U.sum(done, mins) / done.length) : null;
      const inNow = all.filter(inside);
      return [
        { label: "Today's Visitors", value: all.filter((v) => v.checkIn.startsWith(t)).length, icon: "bi-calendar-day", tone: "blue", meta: U.fmtDate(t), onClick: () => { const pg = page.table.el.closest(".list-card"); pg.querySelector("[data-from]").value = t; pg.querySelector("[data-to]").value = t; page.state.from = t; page.state.to = t; page.refresh(false); } },
        { label: "Currently Inside", value: inNow.length, icon: "bi-door-open-fill", tone: inNow.length ? "green" : "gray", meta: inNow.length ? "Check them out when they leave" : "Nobody inside", onClick: () => (location.hash = "inside") },
        { label: "Avg Visit Duration", value: dur(avg), icon: "bi-stopwatch", tone: "purple", meta: `${done.length} completed visit(s) this month` },
        { label: "This Month", value: all.filter((v) => v.checkIn.startsWith(m)).length, icon: "bi-people-fill", tone: "orange", meta: U.monthLabel(m) },
      ];
    },
    fields, formSize: "lg",
    defaults: () => ({ checkIn: U.nowISO(), idProof: "Aadhaar", purpose: "Family visit" }),
    presetsFromQuery: (p) => { const o = Object.assign({}, p); if (p.resident) { o.residentId = p.resident; delete o.resident; } return o; },
    beforeSave,
    afterSave: (saved, isNew) => { if (isNew) setTimeout(() => HH.confirm(`<b>${esc(saved.name)}</b> is checked in with pass <b>${esc(saved.id)}</b>. Print the visitor pass now?`, { title: "Visitor checked in", okText: "Print pass", cancelText: "Later", icon: "bi-printer", tone: "green" }).then((ok) => ok && printPass(saved)), 350); },
    view, viewSize: "lg",
    viewFooter: (v) => [
      { label: "Visitor history", icon: "bi-clock-history", left: true, onClick: (rec, ctx) => { ctx.close(); setTimeout(() => history(rec), 320); } },
      { label: "Print pass", icon: "bi-printer", onClick: (rec) => printPass(rec) },
      ...(inside(v) ? [{ label: "Check out", icon: "bi-box-arrow-right", cls: "btn-hh--green", onClick: (rec, ctx) => { ctx.close(); setTimeout(() => checkOut(rec), 320); } }] : []),
    ],
    actions: [
      { label: "Check out", icon: "bi-box-arrow-right", show: inside, handler: (v) => checkOut(v) },
      { label: "Print visitor pass", icon: "bi-printer", handler: (v) => printPass(v) },
      { label: "Visitor history", icon: "bi-clock-history", handler: (v) => history(v) },
      { label: "Register again", icon: "bi-arrow-repeat", show: (v) => !inside(v), handler: (v) => page.openForm(null, { name: v.name, phone: v.phone, idProof: v.idProof, idNumber: v.idNumber, residentId: v.residentId, purpose: v.purpose, checkIn: U.nowISO() }) },
    ],
    bulkActions: [
      { label: "Check out selected", icon: "bi-box-arrow-right", handler: (rows) => bulkCheckout(rows) },
      { label: "Export selected", icon: "bi-filetype-csv", handler: (rows) => HH.exportCSV(`visitors-selected-${U.todayISO()}.csv`, csv, rows) },
    ],
    titleOf: (v) => `${v.id} · ${v.name}`,
  });

  async function bulkCheckout(rows) {
    const now = U.nowISO();
    const list = rows.filter((v) => inside(v) && v.checkIn <= now);
    if (!list.length) return HH.toast("None of the selected visitors are inside.", "warning");
    if (!(await HH.confirm(`Check out <b>${list.length}</b> visitor(s) now (${U.fmtTime(now)})?`, { title: "Check out visitors", okText: "Check out", icon: "bi-box-arrow-right" }))) return;
    list.forEach((v) => HH.store.update("visitors", v.id, { checkOut: now }));
    page.table.clearSelection(); page.refresh();
    HH.toast(`${list.length} visitor(s) checked out.`, "success");
  }

  page.table.el.addEventListener("click", (e) => {
    const b = e.target.closest("[data-checkout]");
    if (b) { e.stopPropagation(); checkOut(HH.store.get("visitors", b.dataset.checkout)); }
  });
})();
