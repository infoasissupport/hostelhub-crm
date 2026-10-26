/* ==========================================================================
   HostelHub — Resident profile (resident-details.html?id=RES-0001)
   Uses HH.residents (residents.js) for room assignment / check-out / status.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const root = document.getElementById("moduleRoot");
  const actions = document.getElementById("pageActions");
  const id = U.qs("id");
  const isLive = (r) => r && (r.status === "Active" || r.status === "On Leave");
  let tabCtl = null, currentTab = location.hash.slice(1) || "overview";

  if (!id || !L.resident(id)) {
    document.getElementById("pageTitle").textContent = "Resident not found";
    root.innerHTML = `<section class="card-hh">${HH.ui.empty(id ? `No resident with ID “${esc(id)}”` : "No resident selected", "bi-person-x", `<a class="btn-hh btn-hh--primary" href="residents.html" style="margin-top:8px"><i class="bi bi-arrow-left"></i>Back to residents</a>`)}</section>`;
    return;
  }

  const res = () => L.resident(id);

  /* ------------------------------------------------------------ data ---- */
  const invoices = () => HH.store.all("invoices").filter((i) => i.residentId === id).sort((a, b) => b.issueDate.localeCompare(a.issueDate));
  const payments = () => invoices().flatMap((i) => (i.payments || []).map((p) => Object.assign({ invoiceId: i.id, period: i.period }, p))).sort((a, b) => b.date.localeCompare(a.date));
  function mealStats(days) {
    const T = U.todayISO(); const from = U.addDays(T, -(days - 1));
    const meals = HH.store.settings().mealTypes.map((m) => m.name);
    const out = {}; meals.forEach((m) => (out[m] = { P: 0, A: 0, NA: 0 }));
    HH.store.all("attendance").forEach((s) => { if (s.date >= from && s.date <= T && out[s.meal] && s.marks[id]) out[s.meal][s.marks[id]]++; });
    return out;
  }

  /* ---------------------------------------------------------- render ---- */
  function render() {
    const r = res();
    if (!r) { location.href = "residents.html"; return; }
    document.title = `${r.name} · HostelHub`;
    document.getElementById("pageTitle").textContent = r.name;
    document.getElementById("pageSub").textContent = `${r.id} · ${r.course || "Resident"} · ${L.branchName(r.branch)}`;
    document.querySelector(".crumbs span:last-child").textContent = r.name;

    renderActions(r);
    const bal = C.residentBalance(id);
    const paid = U.sum(payments(), (p) => p.amount);
    const ms = mealStats(30);
    const taken = U.sum(Object.values(ms), (m) => m.P), possible = U.sum(Object.values(ms), (m) => m.P + m.A);
    const cmp = HH.store.all("complaints").filter((c) => c.residentId === id);
    const vis = HH.store.all("visitors").filter((v) => v.residentId === id);
    const plan = HH.store.all("messSubscriptions").find((s) => s.residentId === id && s.status === "Active");

    root.innerHTML = `
      <section class="card-hh">
        <div class="resident-hero">
          <img class="avatar avatar--lg" src="${U.avatar(r.name, r.photo)}" alt="">
          <div style="min-width:0">
            <div class="row-flex"><h2>${esc(r.name)}</h2>${HH.ui.badge(r.status)}${HH.ui.badge(C.residentPaymentStatus(id))}</div>
            <div class="resident-hero__meta">
              <span><i class="bi bi-hash"></i>${esc(r.id)}</span>
              <span>${HH.svg.bed.replace('class="bi-main"', 'style="margin-right:4px;color:var(--text-3)"')}${r.roomId ? esc(L.bedLabel(r.roomId, r.bed)) : "No bed assigned"}</span>
              <span><i class="bi bi-building"></i>${esc(L.branchName(r.branch))}</span>
              <span><i class="bi bi-telephone"></i><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a></span>
              ${r.email ? `<span><i class="bi bi-envelope"></i>${esc(r.email)}</span>` : ""}
              <span><i class="bi bi-calendar-check"></i>Joined ${U.fmtDate(r.joinDate)}</span>
              ${r.checkOut ? `<span><i class="bi bi-calendar-x"></i>Checked out ${U.fmtDate(r.checkOut)}</span>` : ""}
            </div>
          </div>
          <div class="row-flex">
            <a class="btn-hh" href="residents.html"><i class="bi bi-arrow-left"></i>All residents</a>
          </div>
        </div>
      </section>
      ${HH.ui.statCards([
        { label: "Outstanding Balance", value: U.fmtMoney(bal), icon: "bi-wallet2", tone: bal > 0 ? "red" : "green", meta: `${invoices().filter((i) => C.invoiceTotals(i).balance > 0 && i.status !== "Cancelled").length} open invoice(s)`, onClick: () => tabCtl.set("fees") },
        { label: "Total Paid", value: U.fmtMoney(paid), icon: "bi-cash-coin", tone: "blue", meta: `${payments().length} payments`, onClick: () => tabCtl.set("fees") },
        { label: "Meal Attendance (30d)", value: possible ? `${U.pct(taken, possible)}%` : "—", icon: "bi-fork-knife", tone: "orange", meta: plan ? L.planName(plan.planId) : "No mess plan", onClick: () => tabCtl.set("meals") },
        { label: "Complaints", value: cmp.length, icon: "bi-chat-square-text", tone: "purple", meta: `${cmp.filter((c) => ["Open", "In Progress"].includes(c.status)).length} open`, onClick: () => tabCtl.set("complaints") },
        { label: "Visitors", value: vis.length, icon: "bi-person-badge", tone: "green", meta: `${vis.filter((v) => !v.checkOut).length} inside now`, onClick: () => tabCtl.set("visitors") },
      ])}
      <section class="card-hh card-hh--flush">
        <div id="profileTabs" style="padding:0 var(--sp-5)"></div>
        <div style="padding:var(--sp-5)" id="tabBody"></div>
      </section>`;
    HH.ui.bindStatCards(root, [{ onClick: () => tabCtl.set("fees") }, { onClick: () => tabCtl.set("fees") }, { onClick: () => tabCtl.set("meals") }, { onClick: () => tabCtl.set("complaints") }, { onClick: () => tabCtl.set("visitors") }]);
    tabCtl = HH.ui.tabs(document.getElementById("profileTabs"), [
      { key: "overview", label: "Overview", icon: "bi-person-lines-fill" },
      { key: "fees", label: "Fee History", icon: "bi-receipt" },
      { key: "meals", label: "Meal Attendance", icon: "bi-fork-knife" },
      { key: "complaints", label: "Complaints", icon: "bi-chat-square-text" },
      { key: "visitors", label: "Visitors", icon: "bi-person-badge" },
      { key: "documents", label: "Documents", icon: "bi-paperclip" },
      { key: "activity", label: "Activity", icon: "bi-clock-history" },
    ], (k) => { currentTab = k; history.replaceState(null, "", "#" + k); renderTab(k); }, { initial: currentTab });
  }

  function renderActions(r) {
    const live = isLive(r);
    actions.innerHTML = `
      <button type="button" class="btn-hh" data-act="print"><i class="bi bi-printer"></i><span>Print profile</span></button>
      <button type="button" class="btn-hh" data-act="more" aria-haspopup="true"><i class="bi bi-three-dots"></i><span>More</span></button>
      ${live ? `<button type="button" class="btn-hh" data-act="room"><i class="bi bi-arrow-left-right"></i><span>${r.roomId ? "Transfer room" : "Assign room"}</span></button>` : `<button type="button" class="btn-hh btn-hh--green" data-act="checkin"><i class="bi bi-box-arrow-in-right"></i><span>Check in</span></button>`}
      <button type="button" class="btn-hh btn-hh--primary" data-act="edit"><i class="bi bi-pencil"></i><span>Edit resident</span></button>`;
  }

  actions.addEventListener("click", (e) => {
    const b = e.target.closest("[data-act]"); if (!b) return;
    const r = res();
    const act = b.dataset.act;
    if (act === "edit") return edit();
    if (act === "room") return HH.residents.assignRoom(id, { onDone: render });
    if (act === "checkin") return HH.residents.assignRoom(id, { checkIn: true, onDone: render });
    if (act === "print") return printProfile();
    if (act === "more") {
      HH.menu.open(b, [
        isLive(r) ? { label: "Check out", icon: "bi-box-arrow-right", onClick: () => HH.residents.checkOut(id, render) } : null,
        { label: "Change status", icon: "bi-toggles", onClick: () => HH.residents.changeStatus(id, render) },
        { label: "Create invoice", icon: "bi-file-earmark-plus", onClick: () => (location.href = `invoices.html?action=add&resident=${id}`) },
        { label: "Record payment", icon: "bi-cash-coin", onClick: () => (location.href = `fees-payments.html?action=pay&resident=${id}`) },
        { label: "Raise complaint", icon: "bi-chat-square-text", onClick: () => (location.href = `complaints.html?action=add&resident=${id}`) },
        { label: "Register visitor", icon: "bi-person-badge", onClick: () => (location.href = `visitors.html?action=add&residentId=${id}`) },
        { divider: true },
        { label: "Delete resident", icon: "bi-trash", danger: true, onClick: remove },
      ]);
    }
  });

  function edit() {
    const r = res();
    const fields = HH.residents.fields(r);
    HH.formModal({
      title: `Edit Resident · ${r.id}`, icon: "bi-pencil-square", size: "xl", fields, values: JSON.parse(JSON.stringify(r)), submitText: "Save Changes",
      onSubmit: (data) => {
        const merged = Object.assign({}, r, data);
        const err = HH.residents.prepare(merged, r);
        if (typeof err === "string") return err;
        HH.store.update("residents", r.id, merged);
        HH.toast(`Resident ${r.id} updated.`, "success");
        render();
        return true;
      },
    });
  }

  async function remove() {
    const r = res();
    const ok = await HH.confirm(`Delete <b>${esc(r.name)}</b> (${r.id})? ${r.roomId ? `Bed ${esc(L.bedLabel(r.roomId, r.bed))} will be released. ` : ""}Existing invoices, attendance and complaints are kept for audit.`, { title: "Delete resident", danger: true });
    if (!ok) return;
    HH.store.remove("residents", r.id);
    sessionStorage.setItem("hh:flash", `Resident ${r.id} deleted.`);
    location.href = "residents.html";
  }

  /* ------------------------------------------------------------ tabs ---- */
  function renderTab(k) {
    const body = document.getElementById("tabBody");
    body.onclick = null;
    const r = res();
    if (k === "overview") {
      const plan = HH.store.all("messSubscriptions").find((s) => s.residentId === id && s.status === "Active");
      body.innerHTML = `<div class="grid grid-2">
        <div class="detail-block"><div class="detail-block__title">Personal</div>${HH.ui.kv([
          ["Full name", esc(r.name)], ["Gender", esc(r.gender)], ["Date of birth", U.fmtDate(r.dob)], ["Phone", esc(r.phone)], ["Email", esc(r.email)], ["Address", esc(r.address), true],
        ])}</div>
        <div class="detail-block"><div class="detail-block__title">Guardian & emergency</div>${HH.ui.kv([
          ["Guardian", esc(r.guardianName)], ["Relation", esc(r.guardianRelation)], ["Guardian phone", esc(r.guardianPhone)], ["Emergency contact", esc(r.emergencyName)], ["Emergency phone", esc(r.emergencyPhone)],
        ])}</div>
        <div class="detail-block"><div class="detail-block__title">Stay</div>${HH.ui.kv([
          ["Branch", esc(L.branchName(r.branch))], ["Room / Bed", r.roomId ? esc(L.bedLabel(r.roomId, r.bed)) : "—"], ["Room type", r.roomId ? esc((L.room(r.roomId) || {}).type) : "—"],
          ["Course / occupation", esc(r.course)], ["Joining date", U.fmtDate(r.joinDate)], ["Check-in", U.fmtDate(r.checkIn)], ["Check-out", U.fmtDate(r.checkOut)], ["Status", HH.ui.badge(r.status)],
        ])}</div>
        <div class="detail-block"><div class="detail-block__title">Fees & mess</div>${HH.ui.kv([
          ["Monthly rent", `<span class="money">${U.fmtMoney(r.rent)}</span>`], ["Security deposit", `<span class="money">${U.fmtMoney(r.deposit)}</span>`],
          ["Payment status", HH.ui.badge(C.residentPaymentStatus(id))], ["Outstanding", `<span class="money">${U.fmtMoney(C.residentBalance(id))}</span>`],
          ["Mess plan", plan ? `${esc(L.planName(plan.planId))} <span class="text-2">since ${U.fmtDate(plan.startDate)}</span>` : "Not subscribed"], ["Notes", esc(r.notes), true],
        ])}</div></div>`;
    }
    if (k === "fees") {
      body.innerHTML = `<div class="stack">
        <div class="row-between"><div class="section-title">Invoices</div><div class="row-flex"><a class="btn-hh btn-hh--sm" href="fees-payments.html?action=pay&resident=${id}"><i class="bi bi-cash-coin"></i>Record payment</a><a class="btn-hh btn-hh--sm btn-hh--primary" href="invoices.html?action=add&resident=${id}"><i class="bi bi-plus-lg"></i>New invoice</a></div></div>
        <div id="invTable"></div>
        <div class="row-between"><div class="section-title">Payments received</div><button type="button" class="btn-hh btn-hh--sm" id="payCsv"><i class="bi bi-filetype-csv"></i>Export</button></div>
        <div id="payTable"></div></div>`;
      new HH.Table(document.getElementById("invTable"), {
        id: "res-inv", pageSize: 5, rows: invoices(), sort: { key: "issueDate", dir: "desc" },
        columns: [
          { key: "id", label: "Invoice", render: (i) => `<span class="cell-strong">${esc(i.id)}</span>` },
          { key: "period", label: "Period" },
          { key: "issueDate", label: "Issued", render: (i) => U.fmtDate(i.issueDate), cls: "nowrap" },
          { key: "dueDate", label: "Due", render: (i) => U.fmtDate(i.dueDate), cls: "nowrap" },
          { key: "total", label: "Total", value: (i) => C.invoiceTotals(i).total, render: (i) => `<span class="money">${U.fmtMoney(C.invoiceTotals(i).total)}</span>`, cls: "t-right", thCls: "t-right" },
          { key: "paid", label: "Paid", value: (i) => C.invoiceTotals(i).paid, render: (i) => `<span class="money">${U.fmtMoney(C.invoiceTotals(i).paid)}</span>`, cls: "t-right", thCls: "t-right" },
          { key: "balance", label: "Balance", value: (i) => C.invoiceTotals(i).balance, render: (i) => `<span class="money cell-strong">${U.fmtMoney(C.invoiceTotals(i).balance)}</span>`, cls: "t-right", thCls: "t-right" },
          { key: "status", label: "Status", value: (i) => C.invoiceStatus(i), render: (i) => HH.ui.badge(C.invoiceStatus(i)) },
        ],
        onRowClick: (i) => (location.href = `invoices.html?view=${i.id}`),
        empty: "No invoices yet",
      });
      new HH.Table(document.getElementById("payTable"), {
        id: "res-pay", pageSize: 5, rows: payments(), sort: { key: "date", dir: "desc" },
        columns: [
          { key: "id", label: "Payment" }, { key: "date", label: "Date", render: (p) => U.fmtDate(p.date) },
          { key: "invoiceId", label: "Invoice" }, { key: "period", label: "Period" }, { key: "method", label: "Method" }, { key: "reference", label: "Reference" },
          { key: "amount", label: "Amount", render: (p) => `<span class="money cell-strong">${U.fmtMoney(p.amount)}</span>`, cls: "t-right", thCls: "t-right" },
        ],
        onRowClick: (p) => (location.href = `invoices.html?view=${p.invoiceId}`),
        empty: "No payments recorded",
      });
      document.getElementById("payCsv").addEventListener("click", () => {
        const rows = payments();
        if (!rows.length) return HH.toast("No payments to export.", "warning");
        HH.exportCSV(`${id}-payments.csv`, [["Payment", "id"], ["Date", "date"], ["Invoice", "invoiceId"], ["Period", "period"], ["Method", "method"], ["Reference", "reference"], ["Amount", "amount"]].map(([label, k]) => ({ label, value: (x) => x[k] })), rows);
      });
    }
    if (k === "meals") {
      const meals = HH.store.settings().mealTypes.map((m) => m.name);
      const days = U.dateList(U.addDays(U.todayISO(), -13), U.todayISO());
      const ms = mealStats(30);
      const sheet = (d, m) => { const s = C.attendanceSheet(d, m); return s ? s.marks[id] : null; };
      body.innerHTML = `<div class="stack">
        <div class="grid grid-3">${meals.map((m) => { const s = ms[m]; const n = s.P + s.A; return `<div class="detail-block"><div class="row-between"><div class="detail-block__title">${esc(m)} · last 30 days</div><b>${n ? U.pct(s.P, n) + "%" : "—"}</b></div>${HH.ui.progress(n ? U.pct(s.P, n) : 0, "var(--green)")}<div class="text-2" style="font-size:12px">${s.P} present · ${s.A} absent · ${s.NA} not applicable</div></div>`; }).join("")}</div>
        <div class="section-title">Last 14 days</div>
        <div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>Meal</th>${days.map((d) => `<th class="t-center">${U.DAYS[U.parse(d).getDay()]}<br>${U.parse(d).getDate()}</th>`).join("")}</tr></thead>
        <tbody>${meals.map((m) => `<tr><td class="cell-strong">${esc(m)}</td>${days.map((d) => { const v = sheet(d, m); return `<td class="t-center"><span class="att-cell att-${v || "none"}" title="${esc(m)} · ${U.fmtDate(d)}: ${v === "P" ? "Present" : v === "A" ? "Absent" : v === "NA" ? "Not applicable" : "Not recorded"}">${v === "NA" ? "–" : v || "·"}</span></td>`; }).join("")}</tr>`).join("")}</tbody></table></div>
        <div class="row-flex text-2" style="font-size:12px"><span class="att-cell att-P">P</span> Present <span class="att-cell att-A">A</span> Absent <span class="att-cell att-NA">–</span> Not applicable <span class="att-cell att-none">·</span> Not recorded
          <span class="spacer" style="flex:1"></span><a class="btn-hh btn-hh--sm" href="meal-attendance.html#mark"><i class="bi bi-check2-square"></i>Mark attendance</a></div></div>`;
    }
    if (k === "complaints") {
      const list = HH.store.all("complaints").filter((c) => c.residentId === id);
      body.innerHTML = `<div class="stack"><div class="row-between"><div class="section-title">${list.length} complaint(s)</div><a class="btn-hh btn-hh--sm btn-hh--primary" href="complaints.html?action=add&resident=${id}"><i class="bi bi-plus-lg"></i>Raise complaint</a></div><div id="cmpTable"></div></div>`;
      new HH.Table(document.getElementById("cmpTable"), {
        id: "res-cmp", pageSize: 5, rows: list, sort: { key: "createdAt", dir: "desc" },
        columns: [{ key: "id", label: "ID" }, { key: "subject", label: "Subject", render: (c) => `<span class="cell-strong">${esc(c.subject)}</span>` }, { key: "category", label: "Category" }, { key: "priority", label: "Priority", render: (c) => HH.ui.badge(c.priority) }, { key: "createdAt", label: "Raised", render: (c) => U.fmtDate(c.createdAt) }, { key: "status", label: "Status", render: (c) => HH.ui.badge(c.status) }],
        onRowClick: (c) => (location.href = `complaints.html?view=${c.id}`), empty: "No complaints raised",
      });
    }
    if (k === "visitors") {
      const list = HH.store.all("visitors").filter((v) => v.residentId === id);
      body.innerHTML = `<div class="stack"><div class="row-between"><div class="section-title">${list.length} visit(s)</div><a class="btn-hh btn-hh--sm btn-hh--primary" href="visitors.html?action=add&residentId=${id}"><i class="bi bi-plus-lg"></i>Register visitor</a></div><div id="visTable"></div></div>`;
      new HH.Table(document.getElementById("visTable"), {
        id: "res-vis", pageSize: 5, rows: list, sort: { key: "checkIn", dir: "desc" },
        columns: [{ key: "id", label: "Pass" }, { key: "name", label: "Visitor", render: (v) => `<span class="cell-strong">${esc(v.name)}</span>` }, { key: "phone", label: "Phone" }, { key: "purpose", label: "Purpose" }, { key: "checkIn", label: "Check-in", render: (v) => U.fmtDateTime(v.checkIn) }, { key: "checkOut", label: "Check-out", render: (v) => (v.checkOut ? U.fmtTime(v.checkOut) : HH.ui.badge("Inside")) }],
        onRowClick: (v) => (location.href = `visitors.html?view=${v.id}`), empty: "No visitors recorded",
      });
    }
    if (k === "documents") {
      const docs = r.documents || [];
      body.innerHTML = `<div class="stack">
        <div class="row-between"><div class="section-title">${docs.length} document(s)</div>
          <label class="btn-hh btn-hh--sm btn-hh--primary" style="cursor:pointer"><i class="bi bi-upload"></i>Upload documents<input type="file" multiple hidden id="docUpload" accept="image/*,.pdf,.doc,.docx"></label></div>
        ${docs.length ? `<div class="doc-grid">${docs.map((d, i) => `<div class="doc-card"><span class="chip-icon tone-${/pdf/.test(d.type) ? "red" : /image/.test(d.type) ? "blue" : "navy"}"><i class="bi ${/pdf/.test(d.type) ? "bi-filetype-pdf" : /image/.test(d.type) ? "bi-file-image" : "bi-file-earmark-text"}"></i></span>
          <div style="min-width:0"><div class="cell-strong truncate">${esc(d.name)}</div><div class="text-2" style="font-size:12px">${U.fileSize(d.size || 0)} · ${U.fmtDate(d.uploadedOn)}</div></div>
          <div class="row-flex" style="gap:2px"><button type="button" class="row-menu-btn" data-doc-dl="${i}" title="${d.data ? "Download" : "File content not stored (demo)"}" aria-label="Download ${esc(d.name)}"><i class="bi bi-download"></i></button><button type="button" class="row-menu-btn" data-doc-rm="${i}" aria-label="Remove ${esc(d.name)}"><i class="bi bi-trash"></i></button></div></div>`).join("")}</div>`
          : HH.ui.empty("No documents uploaded", "bi-folder2-open", "Upload ID proof, admission letter or agreements.")}
        <div class="text-2" style="font-size:12px"><i class="bi bi-info-circle"></i> Demo storage: files up to 350 KB are saved in this browser; larger files keep only their name and size.</div></div>`;
      body.querySelector("#docUpload").addEventListener("change", async (e) => {
        const files = [...e.target.files]; if (!files.length) return;
        const list = (res().documents || []).slice();
        for (const f of files) {
          const rec = { name: f.name, type: f.type, size: f.size, uploadedOn: U.todayISO() };
          if (f.size <= 350 * 1024) rec.data = f.type.startsWith("image/") ? await U.imageToDataURL(f, 900) : await U.readFile(f);
          list.push(rec);
        }
        HH.store.update("residents", id, { documents: list, history: HH.residents.logHistory(res(), "Documents uploaded", files.map((f) => f.name).join(", ")) });
        HH.toast(`${files.length} document(s) uploaded.`, "success");
        renderTab("documents");
      });
      body.onclick = async (e) => {
        const dl = e.target.closest("[data-doc-dl]"), rm = e.target.closest("[data-doc-rm]");
        const docsNow = res().documents || [];
        if (dl) { const d = docsNow[+dl.dataset.docDl]; if (!d.data) return HH.toast("This sample document has no stored file content (demo record).", "info"); const a = document.createElement("a"); a.href = d.data; a.download = d.name; a.click(); }
        if (rm) {
          const d = docsNow[+rm.dataset.docRm];
          if (!(await HH.confirm(`Remove document <b>${esc(d.name)}</b>?`, { title: "Remove document", danger: true, okText: "Remove" }))) return;
          const list = docsNow.slice(); list.splice(+rm.dataset.docRm, 1);
          HH.store.update("residents", id, { documents: list, history: HH.residents.logHistory(res(), "Document removed", d.name) });
          HH.toast("Document removed.", "success");
          renderTab("documents");
        }
      };
    }
    if (k === "activity") {
      const h = r.history || [];
      const events = h.map((x) => ({ date: x.date, title: x.action, note: x.note, by: x.by }))
        .concat([{ date: r.joinDate, title: "Joined hostel", note: L.branchName(r.branch) }])
        .concat(payments().slice(0, 10).map((p) => ({ date: p.date, title: `Payment ${U.fmtMoney(p.amount)}`, note: `${p.method} · ${p.invoiceId}` })))
        .sort((a, b) => String(b.date).localeCompare(String(a.date)));
      body.innerHTML = events.length ? `<ul class="timeline">${events.map((e) => `<li><time>${e.date.includes("T") ? U.fmtDateTime(e.date) : U.fmtDate(e.date)}${e.by ? ` · ${esc(e.by)}` : ""}</time><b>${esc(e.title)}</b>${e.note ? `<div class="text-2">${esc(e.note)}</div>` : ""}</li>`).join("")}</ul>` : HH.ui.empty("No activity yet", "bi-clock-history");
    }
  }

  function printProfile() {
    const r = res();
    const kv = (pairs) => `<div class="grid">${pairs.map(([k, v]) => `<div><div class="lbl">${esc(k)}</div><div class="val">${esc(v == null || v === "" ? "—" : v)}</div></div>`).join("")}</div>`;
    const inv = invoices().slice(0, 12);
    HH.printHTML(`Resident Profile · ${r.id}`, `
      <div style="display:flex;gap:16px;align-items:center"><img src="${U.avatar(r.name, r.photo)}" style="width:72px;height:72px;border-radius:50%"><div><h2 style="margin:0">${esc(r.name)}</h2><span class="muted">${esc(r.id)} · ${esc(r.status)} · ${esc(L.branchName(r.branch))}</span></div></div>
      <h2>Personal</h2>${kv([["Gender", r.gender], ["Date of birth", U.fmtDate(r.dob)], ["Phone", r.phone], ["Email", r.email], ["Address", r.address], ["Course / occupation", r.course]])}
      <h2>Guardian & emergency</h2>${kv([["Guardian", `${r.guardianName || ""} (${r.guardianRelation || ""})`], ["Guardian phone", r.guardianPhone], ["Emergency contact", r.emergencyName], ["Emergency phone", r.emergencyPhone]])}
      <h2>Stay & fees</h2>${kv([["Room / bed", r.roomId ? L.bedLabel(r.roomId, r.bed) : "—"], ["Joined", U.fmtDate(r.joinDate)], ["Monthly rent", U.fmtMoney(r.rent)], ["Deposit", U.fmtMoney(r.deposit)], ["Outstanding", U.fmtMoney(C.residentBalance(id))], ["Payment status", C.residentPaymentStatus(id)]])}
      <h2>Recent invoices</h2><table><thead><tr><th>Invoice</th><th>Period</th><th>Due</th><th class="r">Total</th><th class="r">Paid</th><th class="r">Balance</th><th>Status</th></tr></thead><tbody>
      ${inv.map((i) => { const t = C.invoiceTotals(i); return `<tr><td>${esc(i.id)}</td><td>${esc(i.period)}</td><td>${U.fmtDate(i.dueDate)}</td><td class="r">${U.fmtMoney(t.total)}</td><td class="r">${U.fmtMoney(t.paid)}</td><td class="r">${U.fmtMoney(t.balance)}</td><td>${esc(C.invoiceStatus(i))}</td></tr>`; }).join("") || `<tr><td colspan="7" class="muted">No invoices</td></tr>`}</tbody></table>`,
    { subtitle: r.name });
  }

  window.addEventListener("hashchange", () => { const k = location.hash.slice(1); if (k && k !== currentTab && tabCtl) tabCtl.set(k); });
  render();
  window.addEventListener("hh:datachange", U.debounce(() => { if (!document.querySelector(".modal.show")) render(); }, 250));
})();
