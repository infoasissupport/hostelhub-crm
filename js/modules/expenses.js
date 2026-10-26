/* ==========================================================================
   HostelHub — Expenses module
   Tabs: #all · #pending (approval queue) · #vendors (vendor payments summary)
   Dashboard / reports read HH.calc.expenses() (Approved only) — schema kept as
   { date, category, description, amount, vendor, method, attachment, branch, status, approvedBy, notes } (+ approvedOn, reject info).
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;

  const root = document.getElementById("moduleRoot");
  const T = U.todayISO();
  const S = () => HH.store.settings();
  const me = () => (S().currentUser || {}).name || "Admin";
  const STATUSES = ["Pending", "Approved", "Rejected"];
  const money = (n) => U.fmtMoney(n, { decimals: Math.round(Number(n || 0) * 100) % 100 ? 2 : 0 });
  const catColor = (name) => ((S().expenseCategories || []).find((c) => c.name === name) || {}).color || U.hashColor(name);
  const later = (fn) => setTimeout(fn, 320);
  const vendorNames = () => [...new Set([...HH.store.all("vendors").map((v) => v.name), ...HH.store.all("expenses").map((e) => e.vendor)].filter(Boolean))].sort();

  root.innerHTML = `
    <nav class="ex-tabs" data-tabs aria-label="Expense sections"></nav>
    <section class="stack" data-panel="all"><div id="exAll" class="stack" style="gap:var(--gutter)"></div></section>
    <section class="stack" data-panel="pending" hidden><div id="exPending" class="stack" style="gap:var(--gutter)"></div></section>
    <section class="stack" style="gap:var(--gutter)" data-panel="vendors" hidden>
      <div data-v-stats></div>
      <section class="card-hh card-hh--flush list-card">
        <div class="toolbar">
          <div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" data-vq placeholder="Search vendors…" aria-label="Search vendors"></div>
          <select class="select-hh" data-vf="scope" aria-label="Status scope"><option value="Approved">Approved only</option><option value="open">Approved + Pending</option><option value="all">All statuses</option></select>
          <select class="select-hh" data-vf="category" aria-label="Category"></select>
          <span class="date-range"><span>Date</span><input type="date" class="input-hh" data-vf="from" aria-label="From date"><span>to</span><input type="date" class="input-hh" data-vf="to" aria-label="To date"></span>
          <button type="button" class="btn-hh btn-hh--ghost btn-hh--sm" data-vclear><i class="bi bi-x-circle"></i>Clear</button>
          <span class="spacer"></span>
          <span class="row-flex"><button type="button" class="btn-hh" data-vexport><i class="bi bi-filetype-csv"></i><span>Export CSV</span></button><button type="button" class="btn-hh" data-vprint><i class="bi bi-printer"></i><span>Print</span></button></span>
        </div>
        <div data-v-table></div>
      </section>
    </section>`;
  const $ = (s) => root.querySelector(s);

  /* ------------------------------------------------- approval actions ---- */
  async function approve(rows) {
    const list = rows.filter((e) => e.status === "Pending");
    if (!list.length) return HH.toast("Only pending expenses can be approved.", "warning");
    const total = U.sum(list, (e) => e.amount);
    const ok = await HH.confirm(list.length === 1 ? `Approve <b>${esc(list[0].description)}</b> (${esc(list[0].id)}) for <b>${money(total)}</b>?` : `Approve <b>${list.length}</b> expenses totalling <b>${money(total)}</b>?`, { title: "Approve expense", okText: "Approve", icon: "bi-check2-circle", tone: "green" });
    if (!ok) return;
    const ids = new Set(list.map((e) => e.id)); const now = U.nowISO();
    HH.store.setAll("expenses", HH.store.all("expenses").map((e) => (ids.has(e.id) ? Object.assign({}, e, { status: "Approved", approvedBy: me(), approvedOn: T, rejectReason: "", rejectedBy: "", rejectedOn: "", updatedAt: now }) : e)));
    HH.toast(`${list.length} expense(s) approved — ${money(total)} now counts in reports.`, "success");
    refreshAll();
  }
  async function reject(rows) {
    const list = rows.filter((e) => e.status === "Pending");
    if (!list.length) return HH.toast("Only pending expenses can be rejected.", "warning");
    const reason = await HH.prompt(list.length === 1 ? `Reject <b>${esc(list[0].description)}</b> (${esc(list[0].id)}, ${money(list[0].amount)})?` : `Reject <b>${list.length}</b> selected expenses (${money(U.sum(list, (e) => e.amount))})?`,
      { label: "Reason for rejection", type: "textarea", required: true, placeholder: "e.g. Duplicate bill / quote too high" }, { title: "Reject expense", danger: true, okText: "Reject", icon: "bi-x-circle" });
    if (!reason) return;
    const ids = new Set(list.map((e) => e.id)); const now = U.nowISO();
    HH.store.setAll("expenses", HH.store.all("expenses").map((e) => (ids.has(e.id) ? Object.assign({}, e, { status: "Rejected", approvedBy: "", approvedOn: "", rejectReason: reason, rejectedBy: me(), rejectedOn: T, updatedAt: now }) : e)));
    HH.toast(`${list.length} expense(s) rejected.`, "success");
    refreshAll();
  }
  async function reopen(e) {
    const ok = await HH.confirm(`Send <b>${esc(e.description)}</b> (${esc(e.id)}) back to the approval queue?`, { title: "Reopen expense", okText: "Reopen", icon: "bi-arrow-counterclockwise" });
    if (!ok) return;
    HH.store.update("expenses", e.id, { status: "Pending", approvedBy: "", approvedOn: "", rejectReason: "", rejectedBy: "", rejectedOn: "" });
    HH.toast(`${e.id} is pending approval again.`, "success");
    refreshAll();
  }

  /* ---------------------------------------------------------- shared ---- */
  function attachmentHTML(a) {
    if (!a) return `<span class="text-3">No attachment</span>`;
    const icon = /pdf/.test(a.type || "") ? "bi-file-earmark-pdf" : /image/.test(a.type || "") ? "bi-file-earmark-image" : "bi-file-earmark";
    return `<div class="ex-attach"><span class="chip-icon tone-blue"><i class="bi ${icon}"></i></span><div style="min-width:0"><b class="truncate d-block">${esc(a.name)}</b><span class="text-2 small">${a.size ? U.fileSize(a.size) : ""}${a.uploadedOn ? ` · uploaded ${U.fmtDate(a.uploadedOn)}` : ""}</span></div>
      ${a.data ? `<a class="btn-hh btn-hh--sm" href="${a.data}" download="${esc(a.name)}"><i class="bi bi-download"></i>Download</a>` : `<span class="text-3 small">File over 350 KB — only the name is stored in the demo</span>`}</div>
      ${a.data && /^data:image\//.test(a.data) ? `<img class="ex-attach__img" src="${a.data}" alt="${esc(a.name)}">` : ""}`;
  }
  function viewHTML(r) {
    const flags = [];
    if (r.status === "Pending") flags.push(`<div class="alert-hh tone-orange"><i class="bi bi-hourglass-split"></i><span><b>Awaiting approval.</b> Pending expenses are not included in dashboard and report totals.</span><span></span></div>`);
    if (r.status === "Rejected") flags.push(`<div class="alert-hh tone-red"><i class="bi bi-x-circle"></i><span><b>Rejected</b>${r.rejectedBy ? ` by ${esc(r.rejectedBy)}` : ""}${r.rejectedOn ? ` on ${U.fmtDate(r.rejectedOn)}` : ""}${r.rejectReason ? ` — ${esc(r.rejectReason)}` : ""}</span><span></span></div>`);
    return `<div class="stack">${flags.join("")}${HH.ui.kv([
      ["Description", `<b>${esc(r.description)}</b>`], ["Amount", `<b class="ex-amt">${money(r.amount)}</b>`], ["Date", U.fmtDate(r.date)], ["Category", `<span class="ex-cat"><i style="background:${catColor(r.category)}"></i>${esc(r.category)}</span>`],
      ["Vendor / payee", esc(r.vendor || "")], ["Payment method", esc(r.method || "")], ["Branch", esc(L.branchName(r.branch))], ["Status", HH.ui.badge(r.status)],
      ["Approved by", r.status === "Approved" ? `${esc(r.approvedBy || "—")}${r.approvedOn ? ` · ${U.fmtDate(r.approvedOn)}` : ""}` : "—"], ["Recorded", U.fmtDate(r.createdAt)],
      ["Notes", esc(r.notes || ""), true], ["Attachment", attachmentHTML(r.attachment), true],
    ])}</div>`;
  }
  function printVoucher(r) {
    HH.printHTML(`Expense Voucher ${r.id}`, `<div class="grid">
      <div class="box"><div class="lbl">Paid to</div><div class="val">${esc(r.vendor || "—")}</div><div class="muted">${esc(r.method || "")} · ${esc(L.branchName(r.branch))}</div></div>
      <div class="box"><div class="lbl">Amount</div><div class="val" style="font-size:20px">${money(r.amount)}</div><div class="muted">${esc(r.category)} · ${U.fmtDate(r.date)}</div></div></div>
      <table><tbody><tr><td>Voucher no.</td><td class="r">${esc(r.id)}</td></tr><tr><td>Description</td><td class="r">${esc(r.description)}</td></tr>
      <tr><td>Status</td><td class="r">${esc(r.status)}${r.status === "Approved" && r.approvedBy ? ` · approved by ${esc(r.approvedBy)}${r.approvedOn ? " on " + U.fmtDate(r.approvedOn) : ""}` : ""}</td></tr>
      ${r.attachment ? `<tr><td>Attachment</td><td class="r">${esc(r.attachment.name)}</td></tr>` : ""}${r.notes ? `<tr><td>Notes</td><td class="r">${esc(r.notes)}</td></tr>` : ""}</tbody></table>
      <div class="grid" style="margin-top:40px"><div class="muted">Prepared by ____________________</div><div class="muted" style="text-align:right">Approved by ____________________</div></div>`, { subtitle: `${r.category} · ${U.fmtDate(r.date)}` });
  }

  const columns = [
    { key: "date", label: "Date", value: (r) => r.date + r.id, render: (r) => U.fmtDate(r.date), cls: "nowrap", csv: (r) => r.date },
    { key: "id", label: "Expense", render: (r) => `<b class="nowrap">${esc(r.id)}</b>` },
    { key: "description", label: "Description", render: (r) => `<span class="ex-desc">${esc(r.description)}</span>${r.attachment ? ` <i class="bi bi-paperclip text-3" title="Has attachment"></i>` : ""}` },
    { key: "category", label: "Category", render: (r) => `<span class="ex-cat nowrap"><i style="background:${catColor(r.category)}"></i>${esc(r.category)}</span>` },
    { key: "vendor", label: "Vendor", render: (r) => `<span class="truncate d-inline-block" style="max-width:170px">${esc(r.vendor || "—")}</span>` },
    { key: "method", label: "Method", cls: "nowrap" },
    { key: "branch", label: "Branch", value: (r) => L.branchName(r.branch), cls: "nowrap" },
    { key: "amount", label: "Amount", value: (r) => Number(r.amount) || 0, render: (r) => `<b class="money">${money(r.amount)}</b>`, cls: "t-right", thCls: "t-right" },
    { key: "status", label: "Status", render: (r) => HH.ui.badge(r.status) },
  ];
  const csvColumns = [
    ["Expense ID", "id"], ["Date", "date"], ["Category", "category"], ["Description", "description"], ["Amount", "amount"], ["Vendor", "vendor"], ["Method", "method"],
    ["Branch", (r) => L.branchName(r.branch)], ["Status", "status"], ["Approved By", "approvedBy"], ["Approved On", "approvedOn"], ["Reject Reason", "rejectReason"],
    ["Attachment", (r) => (r.attachment ? r.attachment.name : "")], ["Notes", "notes"],
  ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] || "" }));
  const filters = () => [
    { key: "category", label: "All categories", options: () => L.list("expenseCategories") },
    { key: "branch", label: "All branches", options: () => L.branchOptions() },
    { key: "method", label: "All methods", options: () => L.list("paymentMethods") },
  ];
  const footerRow = (rows) => `<tr><td colspan="8">Total · ${rows.length} expense(s)</td><td class="t-right money">${money(U.sum(rows, (r) => r.amount))}</td><td colspan="2"></td></tr>`;
  const rowActions = [
    { label: "Approve", icon: "bi-check2-circle", show: (r) => r.status === "Pending", handler: (r) => approve([r]) },
    { label: "Reject", icon: "bi-x-circle", show: (r) => r.status === "Pending", handler: (r) => reject([r]) },
    { label: "Reopen for approval", icon: "bi-arrow-counterclockwise", show: (r) => r.status === "Rejected", handler: reopen },
    { label: "Print voucher", icon: "bi-printer", handler: printVoucher },
  ];
  const viewFooter = (r) => (r.status === "Pending" ? [
    { label: "Reject", icon: "bi-x-circle", cls: "btn-hh--danger", left: true, onClick: (rec, ctx) => { ctx.close(); later(() => reject([HH.store.get("expenses", rec.id)])); } },
    { label: "Print", icon: "bi-printer", onClick: (rec) => printVoucher(rec) },
    { label: "Approve", icon: "bi-check2-circle", cls: "btn-hh--green", onClick: (rec, ctx) => { ctx.close(); later(() => approve([HH.store.get("expenses", rec.id)])); } },
  ] : [{ label: "Print", icon: "bi-printer", onClick: (rec) => printVoucher(rec) }, ...(r.status === "Rejected" ? [{ label: "Reopen", icon: "bi-arrow-counterclockwise", onClick: (rec, ctx) => { ctx.close(); later(() => reopen(rec)); } }] : [])]);

  /* ------------------------------------------------------------ form ---- */
  let amountReset = null;
  const fields = (rec) => [
    { name: "date", label: "Expense date", type: "date", required: true, col: 4, max: T },
    { name: "category", label: "Category", type: "select", required: true, col: 4, options: (() => { const l = L.list("expenseCategories"); return rec && rec.category && !l.includes(rec.category) ? l.concat(rec.category) : l; })() },
    { name: "amount", label: "Amount (₹)", type: "number", required: true, col: 4, min: 0.01, step: "any", placeholder: "0.00", validate: (v) => (Number(v) > 0 ? "" : "Amount must be greater than zero.") },
    { name: "description", label: "Description", required: true, col: 8, maxlength: 120, placeholder: "e.g. Weekly vegetable purchase" },
    { name: "vendor", label: "Vendor / payee", required: true, col: 4, maxlength: 80, placeholder: "Type or pick a vendor" },
    { name: "method", label: "Payment method", type: "select", required: true, col: 4, options: L.list("paymentMethods") },
    { name: "branch", label: "Branch", type: "select", required: true, col: 4, options: L.branchOptions() },
    { name: "status", label: "Status", type: "select", required: true, col: 4, options: STATUSES,
      help: rec && rec.status === "Approved" ? "Changing the amount of an approved expense sends it back for approval." : rec ? "" : "New expenses normally start as Pending." },
    { name: "attachment", label: "Bill / receipt", type: "file", col: 12, accept: "image/*,.pdf", help: "Image or PDF. Files up to 350 KB are stored in the demo and can be downloaded from the expense view." },
    { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12, maxlength: 400 },
  ];
  async function beforeSave(d, prev) {
    d.amount = Math.round(Number(d.amount) * 100) / 100;
    if (!(d.amount > 0)) return "Amount must be greater than zero.";
    if (d.date > T) return "Expense date cannot be in the future.";
    d.notes = d.notes || "";
    amountReset = null;
    if (prev && prev.status === "Approved" && Number(prev.amount) !== d.amount) {
      d.status = "Pending"; d.approvedBy = ""; d.approvedOn = "";
      amountReset = `Amount changed from ${money(prev.amount)} to ${money(d.amount)} — ${prev.id} was sent back for approval.`;
      return;
    }
    const was = prev ? prev.status : "";
    if (d.status === "Approved" && was !== "Approved") { d.approvedBy = me(); d.approvedOn = T; d.rejectReason = ""; }
    if (d.status === "Rejected" && was !== "Rejected") {
      const reason = await HH.prompt(`Why is <b>${esc(d.description)}</b> being rejected?`, { label: "Reason for rejection", type: "textarea", required: true }, { title: "Reject expense", danger: true, okText: "Reject", icon: "bi-x-circle" });
      if (!reason) return "A rejection reason is required.";
      Object.assign(d, { rejectReason: reason, rejectedBy: me(), rejectedOn: T });
    }
    if (d.status !== "Approved") { d.approvedBy = ""; d.approvedOn = ""; }
    if (d.status !== "Rejected") { d.rejectReason = ""; d.rejectedBy = ""; d.rejectedOn = ""; }
  }

  /* ------------------------------------------------------- all page ---- */
  const monthTotal = (rows, key, status = "Approved") => U.sum(rows.filter((e) => e.status === status && U.monthKey(e.date) === key), (e) => e.amount);
  const allPage = HH.CrudPage({
    mount: "#exAll", actionsHost: "inline", collection: "expenses", entity: "Expense", icon: "bi-receipt", noAdd: true,
    searchPlaceholder: "Search description, vendor, ID…",
    searchKeys: ["id", "description", "vendor", "category", "notes"],
    filters: [...filters(), { key: "status", label: "Any status", options: STATUSES }],
    dateFilter: { key: "date", label: "Date" },
    defaultSort: { key: "date", dir: "desc" },
    columns, csvColumns, footerRow,
    stats: (all) => {
      const mk = T.slice(0, 7); const d = new Date(); const lk = U.iso(new Date(d.getFullYear(), d.getMonth() - 1, 1)).slice(0, 7);
      const cur = monthTotal(all, mk), last = monthTotal(all, lk);
      const pend = all.filter((e) => e.status === "Pending"), rej = all.filter((e) => e.status === "Rejected");
      const byCat = Object.entries(U.groupBy(all.filter((e) => e.status === "Approved" && U.monthKey(e.date) === mk), (e) => e.category)).map(([k, l]) => [k, U.sum(l, (e) => e.amount)]).sort((a, b) => b[1] - a[1]);
      const diff = last ? Math.round(((cur - last) / last) * 100) : 0;
      return [
        { label: "Approved This Month", value: U.fmtMoney(cur), icon: "bi-check2-circle", tone: "green", meta: last ? `${diff >= 0 ? "▲" : "▼"} ${Math.abs(diff)}% vs ${U.monthLabel(lk)} (${U.fmtMoney(last)})` : "No approved spend last month" },
        { label: "Pending Approval", value: U.fmtMoney(U.sum(pend, (e) => e.amount)), icon: "bi-hourglass-split", tone: "orange", meta: `${pend.length} expense(s) waiting`, onClick: () => tabs.set("pending") },
        { label: "Rejected", value: rej.length, icon: "bi-x-octagon", tone: "red", meta: U.fmtMoney(U.sum(rej, (e) => e.amount)), onClick: () => allPage.setFilter("status", "Rejected") },
        { label: "Top Category (Month)", value: byCat[0] ? esc(byCat[0][0]) : "—", icon: "bi-pie-chart", tone: "purple", meta: byCat[0] ? `${U.fmtMoney(byCat[0][1])} · ${U.pct(byCat[0][1], cur)}% of approved` : "No approved spend yet", onClick: byCat[0] ? () => allPage.setFilter("category", byCat[0][0]) : undefined },
      ];
    },
    before: (() => {
      let done = false;
      return () => {
        if (done) return undefined; done = true;
        return `<section class="card-hh"><div class="card-hh__head"><span class="chip-icon tone-blue"><i class="bi bi-bar-chart-steps"></i></span><div><h2 class="card-hh__title">Monthly expenses by category</h2><div class="card-hh__sub">Approved expenses only — the same figures used by the dashboard</div></div>
          <div class="card-hh__tools"><select class="select-hh" data-ex-range style="height:34px;width:auto" aria-label="Chart range"><option value="6">Last 6 months</option><option value="12">Last 12 months</option></select></div></div>
          <div class="chart-legend" data-ex-legend></div><div class="chart-box chart-box--lg"><canvas id="exChart" role="img" aria-label="Monthly expenses by category stacked bar chart"></canvas></div></section>`;
      };
    })(),
    onRefresh: () => drawChart(),
    fields, formSize: "lg",
    defaults: () => ({ date: T, status: "Pending", branch: "BR-1", method: L.list("paymentMethods").includes("Bank Transfer") ? "Bank Transfer" : L.list("paymentMethods")[0], attachment: null }),
    onFormReady: (f) => {
      const el = f.elements.vendor; const id = `dl_vendor_${Math.random().toString(36).slice(2, 7)}`;
      f.insertAdjacentHTML("beforeend", `<datalist id="${id}">${vendorNames().map((v) => `<option value="${esc(v)}"></option>`).join("")}</datalist>`);
      el.setAttribute("list", id);
    },
    beforeSave,
    afterSave: (saved, isNew) => {
      if (amountReset) { const msg = amountReset; setTimeout(() => HH.toast(msg, "warning", 6000), 50); amountReset = null; }
      else if (isNew && saved.status === "Pending") setTimeout(() => HH.toast(`${saved.id} is waiting for approval in the Pending Approval tab.`, "info"), 50);
      refreshAll();
    },
    afterDelete: () => refreshAll(),
    view: viewHTML, viewFooter, actions: rowActions,
    bulkActions: [
      { label: "Approve", icon: "bi-check2-circle", handler: (rows, page) => { approve(rows); page.table.clearSelection(); } },
      { label: "Reject", icon: "bi-x-circle", handler: (rows, page) => { reject(rows); page.table.clearSelection(); } },
      { label: "Export selected", icon: "bi-filetype-csv", handler: (rows) => HH.exportCSV(`expenses-selected-${T}.csv`, csvColumns, rows) },
    ],
    deleteMessage: (r) => `Delete expense <b>${esc(r.description)}</b> (${r.id}, ${money(r.amount)})? ${r.status === "Approved" ? "It will be removed from dashboard and report totals. " : ""}This cannot be undone.`,
    exportName: "expenses", printTitle: "Expenses",
  });

  function drawChart() {
    const sel = $("[data-ex-range]"); if (!sel) return;
    const n = Number(sel.value) || 6; const d = new Date(); const keys = [];
    for (let i = n - 1; i >= 0; i--) keys.push(U.iso(new Date(d.getFullYear(), d.getMonth() - i, 1)).slice(0, 7));
    const rows = C.expenses({ from: keys[0] + "-01", to: T });
    const cats = L.list("expenseCategories"); rows.forEach((e) => { if (!cats.includes(e.category)) cats.push(e.category); });
    const grid = {}; rows.forEach((e) => { const k = U.monthKey(e.date); grid[e.category] = grid[e.category] || {}; grid[e.category][k] = (grid[e.category][k] || 0) + Number(e.amount); });
    $("[data-ex-legend]").innerHTML = cats.map((c) => `<span><i style="background:${catColor(c)}"></i>${esc(c)}</span>`).join("");
    HH.chart("#exChart", {
      type: "bar",
      data: { labels: keys.map((k) => U.monthLabel(k)), datasets: cats.map((c) => ({ label: c, data: keys.map((k) => (grid[c] || {})[k] || 0), backgroundColor: catColor(c), borderRadius: 2, barPercentage: 0.6, stack: "x" })) },
      options: {
        scales: { x: { stacked: true, grid: { display: false } }, y: { stacked: true, beginAtZero: true, border: { display: false }, ticks: { maxTicksLimit: 5, callback: (x) => U.fmtCompact(x) } } },
        plugins: { tooltip: { mode: "index", intersect: false, filter: (i) => i.raw > 0, callbacks: { label: (c) => `${c.dataset.label}: ${U.fmtMoney(c.raw)}`, footer: (items) => `Total: ${U.fmtMoney(U.sum(items, (i) => i.raw))}` } } },
        onClick: (e, els) => {
          if (!els.length) return; const k = keys[els[0].index]; const end = U.iso(new Date(+k.slice(0, 4), +k.slice(5), 0));
          const from = $("#exAll [data-from]"), to = $("#exAll [data-to]");
          from.value = `${k}-01`; to.value = end > T ? T : end; allPage.state.from = from.value; allPage.state.to = to.value;
          allPage.setFilter("category", cats[els[0].datasetIndex]); allPage.setFilter("status", "Approved");
        },
        onHover: (e, els) => (e.native.target.style.cursor = els.length ? "pointer" : "default"),
      },
    });
  }
  (function initRange() {
    const sel = $("[data-ex-range]");
    sel.value = String(HH.store.pref("ex:range", 6));
    sel.addEventListener("change", () => { HH.store.setPref("ex:range", +sel.value); drawChart(); });
    drawChart();
  })();

  /* --------------------------------------------------- pending page ---- */
  const pendingPage = HH.CrudPage({
    mount: "#exPending", actionsHost: "inline", collection: "expenses", entity: "Expense", entityPlural: "Pending Expenses", tableId: "-pending", icon: "bi-receipt",
    noAdd: true, deepLinks: false, baseFilter: (e) => e.status === "Pending",
    searchPlaceholder: "Search pending expenses…", searchKeys: ["id", "description", "vendor", "category", "notes"],
    filters: filters(), dateFilter: { key: "date", label: "Date" }, defaultSort: { key: "date", dir: "asc" },
    columns: columns.filter((c) => !["method", "branch"].includes(c.key)).concat([{ key: "age", label: "Waiting", value: (r) => U.daysBetween(r.createdAt || r.date, T), render: (r) => { const n = Math.max(0, U.daysBetween(r.createdAt || r.date, T)); return `<span class="nowrap ${n > 7 ? "text-red" : "text-2"}">${n ? `${n} day${n === 1 ? "" : "s"}` : "Today"}</span>`; } },
      { key: "quick", label: "Decision", sortable: false, csv: false, cls: "nowrap", render: (r) => `<button type="button" class="btn-hh btn-hh--sm btn-hh--green" data-approve="${esc(r.id)}" title="Approve ${esc(r.id)}"><i class="bi bi-check2"></i>Approve</button> <button type="button" class="btn-hh btn-hh--sm btn-hh--icon" data-reject="${esc(r.id)}" title="Reject ${esc(r.id)}" aria-label="Reject ${esc(r.id)}"><i class="bi bi-x-lg"></i></button>` }]),
    csvColumns, footerRow: (rows) => `<tr><td colspan="6">Total pending · ${rows.length}</td><td class="t-right money">${money(U.sum(rows, (r) => r.amount))}</td><td colspan="4"></td></tr>`,
    stats: (all) => {
      const oldest = all.reduce((m, e) => Math.max(m, U.daysBetween(e.createdAt || e.date, T)), 0);
      const big = all.slice().sort((a, b) => b.amount - a.amount)[0];
      return [
        { label: "Awaiting Approval", value: all.length, icon: "bi-hourglass-split", tone: "orange", meta: `${U.fmtMoney(U.sum(all, (e) => e.amount))} in total` },
        { label: "Oldest Request", value: all.length ? `${oldest} day${oldest === 1 ? "" : "s"}` : "—", icon: "bi-calendar-event", tone: "red", meta: "Since the expense was recorded" },
        { label: "Largest Pending", value: big ? U.fmtMoney(big.amount) : "—", icon: "bi-arrow-up-circle", tone: "purple", meta: big ? esc(big.description) : "Queue is empty" },
      ];
    },
    fields, formSize: "lg", beforeSave,
    onFormReady: (f, ctx) => allPage.cfg.onFormReady(f, ctx),
    afterSave: (saved) => { if (amountReset) { const msg = amountReset; setTimeout(() => HH.toast(msg, "warning", 6000), 50); amountReset = null; } refreshAll(); },
    afterDelete: () => refreshAll(),
    view: viewHTML, viewFooter, actions: rowActions,
    bulkActions: [
      { label: "Approve selected", icon: "bi-check2-circle", cls: "btn-hh--green", handler: (rows, page) => { approve(rows); page.table.clearSelection(); } },
      { label: "Reject selected", icon: "bi-x-circle", handler: (rows, page) => { reject(rows); page.table.clearSelection(); } },
    ],
    emptyText: "No expenses are waiting for approval",
    exportName: "expenses-pending", printTitle: "Expenses Pending Approval",
  });
  $("#exPending").addEventListener("click", (e) => {
    const a = e.target.closest("[data-approve]"), r = e.target.closest("[data-reject]");
    if (a) approve([HH.store.get("expenses", a.dataset.approve)]);
    if (r) reject([HH.store.get("expenses", r.dataset.reject)]);
  });

  /* --------------------------------------------------- vendors tab ---- */
  const vstate = { q: "", scope: "Approved", category: "", from: "", to: "" };
  $('[data-vf="category"]').innerHTML = HH.ui.options(L.list("expenseCategories"), "", "All categories");
  const inScope = (e) => (vstate.scope === "all" || (vstate.scope === "open" ? e.status !== "Rejected" : e.status === "Approved"))
    && (!vstate.category || e.category === vstate.category) && U.inRange(e.date, { from: vstate.from, to: vstate.to });
  const vKey = (s) => String(s || "(No vendor)").trim().toLowerCase();
  function vendorRows() {
    const groups = U.groupBy(HH.store.all("expenses").filter(inScope), (e) => vKey(e.vendor));
    const q = vstate.q.toLowerCase();
    return Object.entries(groups).map(([k, list]) => {
      const cats = Object.entries(U.groupBy(list, (e) => e.category)).map(([c, l]) => [c, U.sum(l, (e) => e.amount)]).sort((a, b) => b[1] - a[1]);
      const reg = HH.store.all("vendors").find((v) => vKey(v.name) === k);
      return {
        id: k, name: (list[0].vendor || "(No vendor)").trim(), count: list.length, list,
        approved: U.sum(list.filter((e) => e.status === "Approved"), (e) => e.amount), pending: U.sum(list.filter((e) => e.status === "Pending"), (e) => e.amount),
        total: U.sum(list, (e) => e.amount), last: list.reduce((m, e) => (e.date > m ? e.date : m), ""), topCat: cats[0] ? cats[0][0] : "", registered: reg ? reg.id : "",
      };
    }).filter((r) => !q || r.name.toLowerCase().includes(q) || r.topCat.toLowerCase().includes(q));
  }
  const vCols = [
    { key: "name", label: "Vendor / Payee", render: (r) => `<b>${esc(r.name)}</b>${r.registered ? `<span class="ex-sub">Registered vendor · ${esc(r.registered)}</span>` : ""}` },
    { key: "topCat", label: "Main Category", render: (r) => (r.topCat ? `<span class="ex-cat nowrap"><i style="background:${catColor(r.topCat)}"></i>${esc(r.topCat)}</span>` : "—") },
    { key: "count", label: "Expenses", cls: "t-right", thCls: "t-right" },
    { key: "approved", label: "Approved", render: (r) => `<span class="money">${money(r.approved)}</span>`, cls: "t-right", thCls: "t-right" },
    { key: "pending", label: "Pending", render: (r) => (r.pending ? `<span class="money ex-pend">${money(r.pending)}</span>` : `<span class="text-3">—</span>`), cls: "t-right", thCls: "t-right" },
    { key: "total", label: "Total", render: (r) => `<b class="money">${money(r.total)}</b>`, cls: "t-right", thCls: "t-right" },
    { key: "last", label: "Last Payment", render: (r) => U.fmtDate(r.last), cls: "nowrap" },
  ];
  const vCSV = [["Vendor", "name"], ["Main Category", "topCat"], ["Expenses", "count"], ["Approved", "approved"], ["Pending", "pending"], ["Total", "total"], ["Last Payment", "last"], ["Registered Vendor ID", "registered"]]
    .map(([label, k]) => ({ label, value: (r) => r[k] }));
  const vTable = new HH.Table($("[data-v-table]"), {
    id: "ex-vendors", columns: vCols, rows: [], pageSize: 10, sort: { key: "total", dir: "desc" },
    onRowClick: (r) => drill(r.id),
    rowActions: (r) => [
      { label: "View payments", icon: "bi-list-ul", onClick: () => drill(r.id) },
      { label: "Show in All Expenses", icon: "bi-funnel", onClick: () => { tabs.set("all"); const s = $("#exAll [data-search]"); s.value = r.name; s.dispatchEvent(new Event("input", { bubbles: true })); } },
      { label: "Add expense for vendor", icon: "bi-plus-lg", onClick: () => allPage.openForm(null, { vendor: r.name, category: r.topCat }) },
    ],
    footerRow: (rows) => `<tr><td colspan="2">Total · ${rows.length} vendor(s)</td><td class="t-right">${U.sum(rows, (r) => r.count)}</td><td class="t-right money">${money(U.sum(rows, (r) => r.approved))}</td><td class="t-right money">${money(U.sum(rows, (r) => r.pending))}</td><td class="t-right money">${money(U.sum(rows, (r) => r.total))}</td><td colspan="2"></td></tr>`,
    empty: "No vendor payments match your filters",
  });
  function drill(key) {
    const row = vendorRows().find((r) => r.id === key);
    if (!row) return;
    const list = row.list.slice().sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));
    const holder = document.createElement("div");
    holder.innerHTML = `${HH.ui.kv([["Vendor", `<b>${esc(row.name)}</b>`], ["Expenses", row.count], ["Approved", money(row.approved)], ["Pending", money(row.pending)], ["Total", `<b>${money(row.total)}</b>`], ["Last payment", U.fmtDate(row.last)]], 3)}<div class="divider"></div><div data-drill></div>`;
    const m = HH.modal({
      title: `Vendor payments · ${row.name}`, icon: "bi-shop", size: "xl", body: holder,
      footer: [
        { label: "Export CSV", icon: "bi-filetype-csv", onClick: () => HH.exportCSV(`vendor-${row.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-${T}.csv`, csvColumns, list) },
        { label: "Close", cls: "btn-hh--dark", close: true },
      ],
    });
    new HH.Table(m.body.querySelector("[data-drill]"), {
      id: "ex-drill", columns: columns.filter((c) => !["vendor"].includes(c.key)), rows: list, pageSize: 10, compact: true, sort: { key: "date", dir: "desc" },
      onRowClick: (r) => { m.close(); later(() => allPage.openView(r.id)); },
    });
  }
  function renderVendors() {
    const rows = vendorRows();
    const top = rows.slice().sort((a, b) => b.total - a.total)[0];
    $("[data-v-stats]").innerHTML = HH.ui.statCards([
      { label: "Vendors / Payees", value: rows.length, icon: "bi-shop", tone: "blue", meta: `${rows.filter((r) => r.registered).length} registered in Kitchen › Vendors` },
      { label: "Approved Payments", value: U.fmtMoney(U.sum(rows, (r) => r.approved)), icon: "bi-check2-circle", tone: "green", meta: `${U.sum(rows, (r) => r.list.filter((e) => e.status === "Approved").length)} expense(s)` },
      { label: "Pending Payments", value: U.fmtMoney(U.sum(rows, (r) => r.pending)), icon: "bi-hourglass-split", tone: "orange", meta: vstate.scope === "Approved" ? "Switch scope to include pending" : "Awaiting approval" },
      { label: "Top Vendor", value: top ? esc(top.name) : "—", icon: "bi-trophy", tone: "yellow", meta: top ? U.fmtMoney(top.total) : "No payments" },
    ]);
    vTable.setRows(rows, true);
  }
  const onVQ = U.debounce(() => { vstate.q = $("[data-vq]").value.trim(); vTable.page = 1; renderVendors(); }, 180);
  $("[data-vq]").addEventListener("input", onVQ);
  root.querySelectorAll("[data-vf]").forEach((el) => el.addEventListener("change", () => { vstate[el.dataset.vf] = el.value; vTable.page = 1; renderVendors(); }));
  $("[data-vclear]").addEventListener("click", () => {
    Object.assign(vstate, { q: "", scope: "Approved", category: "", from: "", to: "" }); $("[data-vq]").value = "";
    root.querySelectorAll("[data-vf]").forEach((el) => (el.value = vstate[el.dataset.vf])); renderVendors();
  });
  const vSummary = () => [vstate.scope === "Approved" ? "Approved only" : vstate.scope === "open" ? "Approved + Pending" : "All statuses", vstate.category, (vstate.from || vstate.to) && `${vstate.from || "…"} → ${vstate.to || "…"}`, vstate.q && `Search: "${vstate.q}"`].filter(Boolean).join(" · ");
  $("[data-vexport]").addEventListener("click", () => { const rows = vTable.sortedRows(); if (!rows.length) return HH.toast("Nothing to export with the current filters.", "warning"); HH.exportCSV(`vendor-payments-${T}.csv`, vCSV, rows); });
  $("[data-vprint]").addEventListener("click", () => HH.printTable("Vendor Payments", vCSV, vTable.sortedRows(), vSummary()));

  /* ------------------------------------------------------------ tabs ---- */
  function refreshAll() {
    allPage.refresh(); pendingPage.refresh(); renderVendors(); updateCount();
  }
  function updateCount() {
    const b = root.querySelector('[data-tabs] [data-tab="pending"] .badge-hh'); if (!b) return;
    const n = HH.store.all("expenses").filter((e) => e.status === "Pending").length;
    b.textContent = n; b.className = `badge-hh tone-${n ? "orange" : "gray"}`;
  }
  const tabs = HH.ui.tabs($("[data-tabs]"), [
    { key: "all", label: "All Expenses", icon: "bi-receipt" },
    { key: "pending", label: "Pending Approval", icon: "bi-hourglass-split", count: 0 },
    { key: "vendors", label: "Vendor Payments", icon: "bi-shop" },
  ], (k) => { HH.ui.panels(root, k); if (k === "all") drawChart(); }, { hash: true });
  renderVendors(); updateCount();

  const actions = document.getElementById("pageActions");
  actions.innerHTML = `<button type="button" class="btn-hh btn-hh--primary" data-add-exp><i class="bi bi-plus-lg"></i><span>Add Expense</span></button>`;
  actions.querySelector("[data-add-exp]").addEventListener("click", () => allPage.openForm());
  window.addEventListener("hh:datachange", (e) => { if (e.detail.external) { renderVendors(); updateCount(); } });
})();
