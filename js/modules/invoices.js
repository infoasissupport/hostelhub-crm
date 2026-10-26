/* ==========================================================================
   HostelHub — Invoices module
   Exposes HH.invoices (payments, invoice view/print, late fees, monthly
   generation) which fees-payments.js re-uses. The invoice list is mounted only
   on pages/invoices.html.
   All figures come from HH.calc.invoiceTotals / HH.calc.invoiceStatus.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;

  const S = () => HH.store.settings();
  const T = U.todayISO();
  const me = () => (S().currentUser || {}).name || "Admin";
  const get = (id) => HH.store.get("invoices", id);
  const money = (n) => U.fmtMoney(n, { decimals: Math.round(Number(n || 0) * 100) % 100 ? 2 : 0 });
  const curPeriod = () => U.monthLabel(T.slice(0, 7));
  const later = (fn) => setTimeout(fn, 320);

  /* ------------------------------------------------------- helpers ---- */
  const statusOf = (inv) => C.invoiceStatus(inv);
  /** Write a patch and keep the stored status in sync (Cancelled stays sticky). */
  function save(id, patch) {
    const cur = get(id);
    const next = Object.assign({}, cur, patch);
    return HH.store.update("invoices", id, Object.assign({}, patch, { status: C.invoiceStatus(next) }));
  }
  function dueFor(issue) {
    const d = U.parse(issue || T);
    const std = U.iso(new Date(d.getFullYear(), d.getMonth(), S().invoiceDueDay || 10));
    return issue > std ? U.addDays(issue, 7) : std;
  }
  function periodKey(label) {
    const m = /^([A-Za-z]{3})\s+(\d{4})$/.exec(label || "");
    return m ? `${m[2]}-${U.pad(U.MONTHS.indexOf(m[1]) + 1)}` : "";
  }
  function periodOptions(selected) {
    const d = new Date(); const out = [];
    for (let i = 2; i >= -12; i--) out.push(U.monthLabel(U.iso(new Date(d.getFullYear(), d.getMonth() + i, 1)).slice(0, 7)));
    if (selected && !out.includes(selected)) out.push(selected);
    return out;
  }
  function residentPlan(resId) {
    const sub = HH.store.all("messSubscriptions").find((s) => s.residentId === resId && s.status === "Active");
    const planId = sub ? sub.planId : (L.resident(resId) || {}).messPlan;
    return planId ? L.plan(planId) : null;
  }
  function defaultItems(resId, period) {
    const r = resId && L.resident(resId);
    if (!r) return [{ category: "Hostel Rent", description: "", amount: "" }];
    const items = [{ category: "Hostel Rent", description: `Room rent — ${period}`, amount: Number(r.rent) || 0 }];
    const plan = residentPlan(resId);
    if (plan) items.push({ category: "Mess Fee", description: `${plan.name} — ${period}`, amount: Number(plan.monthlyCharge) || 0 });
    return items;
  }
  const resMeta = (resId) => { const r = L.resident(resId); return r ? [r.id, r.roomId ? L.bedLabel(r.roomId, r.bed) : "", L.branchName(r.branch)].filter(Boolean).join(" · ") : resId; };
  const daysOverdue = (inv) => (statusOf(inv) === "Overdue" ? Math.max(0, U.daysBetween(inv.dueDate, T)) : 0);

  /* ------------------------------------------------------ payments ---- */
  function recordPayment(invId, p) {
    const inv = get(invId);
    const pay = { id: HH.store.nextId("payments"), date: p.date || T, amount: Math.round(Number(p.amount) * 100) / 100, method: p.method, reference: p.reference || "", note: p.note || "" };
    const saved = save(invId, { payments: (inv.payments || []).slice().concat(pay) });
    return { pay, inv: saved };
  }

  async function deletePayment(invId, payId, onDone) {
    const inv = get(invId); if (!inv) return;
    const p = (inv.payments || []).find((x) => x.id === payId); if (!p) return;
    const ok = await HH.confirm(`Delete payment <b>${esc(p.id)}</b> of <b>${money(p.amount)}</b> (${esc(p.method)}, ${U.fmtDate(p.date)}) from invoice ${esc(inv.id)}? The invoice balance will increase by the same amount.`, { title: "Delete payment", danger: true });
    if (!ok) return;
    const saved = save(invId, { payments: inv.payments.filter((x) => x.id !== payId) });
    HH.toast(`Payment ${p.id} deleted. ${inv.id} is now ${saved.status} (balance ${money(C.invoiceTotals(saved).balance)}).`, "success");
    onDone && onDone(saved);
  }

  /**
   * Payment dialog (simulated — no real money moves).
   * o = { invoiceId, residentId, full, onDone(pay, inv) }
   */
  function payDialog(o = {}) {
    const fixed = o.invoiceId ? get(o.invoiceId) : null;
    if (o.invoiceId && !fixed) return HH.toast("Invoice not found.", "error");
    if (fixed && fixed.status === "Cancelled") return HH.toast(`${fixed.id} is cancelled and cannot take payments.`, "error");
    if (fixed && C.invoiceTotals(fixed).balance <= 0) return HH.toast(`${fixed.id} is already fully paid.`, "info");
    const open = C.openInvoices();
    if (!fixed && !open.length) return HH.toast("There are no invoices with an outstanding balance.", "info");
    const openFor = (resId) => open.filter((i) => i.residentId === resId).sort((a, b) => a.dueDate.localeCompare(b.dueDate))
      .map((i) => ({ value: i.id, label: `${i.id} · ${i.period} · due ${money(C.invoiceTotals(i).balance)}${statusOf(i) === "Overdue" ? " · overdue" : ""}` }));
    const debtors = Object.entries(U.groupBy(open, (i) => i.residentId)).map(([rid, list]) => ({ rid, bal: U.sum(list, (i) => C.invoiceTotals(i).balance) }))
      .sort((a, b) => L.residentName(a.rid).localeCompare(L.residentName(b.rid)))
      .map((x) => ({ value: x.rid, label: `${L.residentName(x.rid)} (${x.rid}) · ${money(x.bal)}` }));
    const methods = L.list("paymentMethods");
    let formEl = null;
    const curInv = () => (fixed ? get(fixed.id) : formEl && formEl.elements.invoiceId && formEl.elements.invoiceId.value ? get(formEl.elements.invoiceId.value) : null);
    const values = {};
    if (!fixed) {
      values.residentId = o.residentId && debtors.some((d) => d.value === o.residentId) ? o.residentId : "";
      const first = values.residentId ? openFor(values.residentId)[0] : null;
      values.invoiceId = first ? first.value : "";
      if (first) values.amount = C.invoiceTotals(get(first.value)).balance;
    } else values.amount = C.invoiceTotals(fixed).balance;
    if (o.residentId && !fixed && !values.residentId) HH.toast(`${L.residentName(o.residentId)} has no outstanding invoices.`, "info");

    const fields = [
      { type: "html", html: `<div class="alert-hh tone-yellow"><i class="bi bi-shield-lock"></i><span><b>Simulated payment</b> — demo only. No real money is charged; this records the payment against the invoice.</span><span></span></div>` },
      ...(fixed ? [] : [
        { name: "residentId", label: "Resident", type: "select", required: true, col: 6, options: debtors, placeholder: "Select resident with dues…",
          onChange: (v, f) => { const opts = openFor(v); HH.form.setOptions(f, "invoiceId", opts, opts[0] ? opts[0].value : "", "Select invoice…"); onInv(f, true); } },
        { name: "invoiceId", label: "Invoice", type: "select", required: true, col: 6, options: (v) => (v.residentId ? openFor(v.residentId) : []), placeholder: "Select invoice…", onChange: (v, f) => onInv(f, true) },
      ]),
      { type: "html", html: `<div data-inv-card></div>` },
      { name: "amount", label: o.full ? "Amount (full balance)" : "Amount received (₹)", type: "number", required: true, col: 6, min: 0.01, step: "any", readonly: !!o.full,
        validate: (v) => {
          const n = Number(v); if (!(n > 0)) return "Amount must be greater than zero.";
          const i = curInv(); if (!i) return "";
          const b = C.invoiceTotals(i).balance;
          return n > b + 0.001 ? `Amount cannot exceed the outstanding balance of ${money(b)}.` : "";
        } },
      { name: "date", label: "Payment date", type: "date", required: true, col: 6, default: T, max: T,
        validate: (v) => { const i = curInv(); return i && v < i.issueDate ? `Payment date cannot be before the invoice date (${U.fmtDate(i.issueDate)}).` : ""; } },
      { name: "method", label: "Payment method", type: "select", required: true, col: 6, options: methods, default: methods.includes("UPI") ? "UPI" : methods[0] },
      { name: "reference", label: "Reference / transaction ID", col: 6, maxlength: 40, placeholder: "e.g. UPI ref no., receipt no." },
      { name: "note", label: "Note", col: 12, maxlength: 160 },
      { name: "printAfter", label: "Receipt", type: "switch", col: 12, switchLabel: "Open the printable receipt after saving" },
    ];
    function card(i) {
      if (!i) return `<div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span>Choose the resident and the invoice to collect against.</span><span></span></div>`;
      const t = C.invoiceTotals(i);
      const amt = formEl ? Number(formEl.elements.amount.value) || 0 : t.balance;
      return `<div class="inv-paycard"><div><b>${esc(i.id)}</b> · ${esc(i.period)} ${HH.ui.badge(statusOf(i))}<div class="text-2 small">${esc(L.residentName(i.residentId))} · due ${U.fmtDate(i.dueDate)}</div></div>
        <div class="inv-paycard__nums"><span>Total <b>${money(t.total)}</b></span><span>Paid <b>${money(t.paid)}</b></span><span>Balance <b class="text-red">${money(t.balance)}</b></span><span>After this payment <b>${money(Math.max(0, t.balance - amt))}</b></span></div></div>`;
    }
    function onInv(f, setAmount) {
      const i = curInv();
      if (setAmount && f.elements.amount) f.elements.amount.value = i ? C.invoiceTotals(i).balance : "";
      f.querySelector("[data-inv-card]").innerHTML = card(i);
    }
    HH.formModal({
      title: o.full ? "Record full payment · Simulated" : "Record payment · Simulated", icon: "bi-cash-coin", size: "lg", fields, values, submitText: "Save payment",
      onReady: (f) => { formEl = f; onInv(f, false); f.addEventListener("input", (e) => { if (e.target.name === "amount") onInv(f, false); }); },
      onSubmit: (d) => {
        const inv = curInv();
        if (!inv) return "Select an invoice.";
        if (inv.status === "Cancelled") return "This invoice is cancelled.";
        const b = C.invoiceTotals(inv).balance;
        const amt = Number(d.amount);
        if (!(amt > 0)) return "Amount must be greater than zero.";
        if (amt > b + 0.001) return `Amount cannot exceed the outstanding balance of ${money(b)}.`;
        const res = recordPayment(inv.id, d);
        HH.toast(`Simulated payment ${res.pay.id} of ${money(res.pay.amount)} recorded. ${inv.id} is now ${res.inv.status}${res.inv.status === "Paid" ? "" : ` (balance ${money(C.invoiceTotals(res.inv).balance)})`}.`, "success", 5000);
        if (d.printAfter) printReceipt(inv.id, res.pay.id);
        o.onDone && o.onDone(res.pay, res.inv);
        return true;
      },
    });
  }

  /* ---------------------------------------------- cancel / late fees ---- */
  async function cancelInvoice(id, onDone) {
    const inv = get(id); if (!inv) return;
    if (inv.status === "Cancelled") return HH.toast(`${id} is already cancelled.`, "info");
    if ((inv.payments || []).length) return HH.toast(`${id} has ${inv.payments.length} payment(s). Delete the payments before cancelling the invoice.`, "error");
    const reason = await HH.prompt(`Cancel invoice <b>${esc(id)}</b> for <b>${esc(L.residentName(inv.residentId))}</b> (${money(C.invoiceTotals(inv).total)})? Cancelled invoices are kept for audit but excluded from dues.`,
      { label: "Reason for cancellation", type: "textarea", required: true, placeholder: "e.g. Billed twice by mistake" }, { title: "Cancel invoice", danger: true, okText: "Cancel invoice", icon: "bi-x-circle", cancelText: "Keep invoice" });
    if (!reason) return;
    HH.store.update("invoices", id, { status: "Cancelled", cancelledOn: T, cancelReason: reason, notes: [inv.notes, `Cancelled on ${U.fmtDate(T)} by ${me()}: ${reason}`].filter(Boolean).join("\n") });
    HH.toast(`Invoice ${id} cancelled.`, "success");
    onDone && onDone();
  }
  const lateFeeEligible = (inv) => statusOf(inv) === "Overdue" && !(Number(inv.lateFee) > 0);
  /** Adds settings.lateFeeAmount once to every eligible (overdue, no late fee yet) invoice. Returns count. */
  function applyLateFee(ids) {
    const fee = Number(S().lateFeeAmount) || 0;
    if (!fee) { HH.toast("Set a late fee amount in Settings first.", "warning"); return 0; }
    const list = HH.store.all("invoices").filter((i) => ids.includes(i.id) && lateFeeEligible(i));
    if (!list.length) return 0;
    const now = U.nowISO();
    const set = new Set(list.map((i) => i.id));
    HH.store.setAll("invoices", HH.store.all("invoices").map((i) => {
      if (!set.has(i.id)) return i;
      const n = Object.assign({}, i, { lateFee: fee, updatedAt: now, notes: [i.notes, `Late fee ${money(fee)} applied on ${U.fmtDate(T)} by ${me()}`].filter(Boolean).join("\n") });
      n.status = C.invoiceStatus(n);
      return n;
    }));
    return list.length;
  }

  /* ------------------------------------------------- view & print ---- */
  function docHTML(inv, opts = {}) {
    const t = C.invoiceTotals(inv); const st = statusOf(inv);
    const r = L.resident(inv.residentId) || {};
    const h = S().hostel || {};
    const pays = (inv.payments || []).slice().sort((a, b) => a.date.localeCompare(b.date));
    return `<div class="inv-doc">
      <div class="inv-doc__head">
        <div class="inv-doc__brand"><img src="${U.page("assets/images/logo/hostelhub-logo.svg")}" alt=""><div><b>${esc(h.name || "")}</b><span>${esc(h.address || "")}</span><span>${esc(h.phone || "")} · ${esc(h.email || "")}${h.gstin ? ` · GSTIN ${esc(h.gstin)}` : ""}</span></div></div>
        <div class="inv-doc__no"><span>INVOICE</span><b>${esc(inv.id)}</b>${HH.ui.badge(st)}</div>
      </div>
      <div class="inv-doc__meta">
        <div class="inv-doc__box"><div class="kv__label">Bill to</div><b>${esc(r.name || L.residentName(inv.residentId))}</b><span>${esc(resMeta(inv.residentId))}</span>${r.phone ? `<span>${esc(r.phone)}${r.email ? " · " + esc(r.email) : ""}</span>` : ""}</div>
        <div class="inv-doc__box">${HH.ui.kv([["Period", esc(inv.period)], ["Issue date", U.fmtDate(inv.issueDate)], ["Due date", `${U.fmtDate(inv.dueDate)}${daysOverdue(inv) ? ` <span class="text-red small">(${daysOverdue(inv)} days overdue)</span>` : ""}`], ["Status", HH.ui.badge(st)]])}</div>
      </div>
      <div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>#</th><th>Category</th><th>Description</th><th class="t-right">Amount</th></tr></thead><tbody>
        ${(inv.items || []).map((it, i) => `<tr><td>${i + 1}</td><td class="nowrap">${esc(it.category)}</td><td>${esc(it.description || "—")}</td><td class="t-right money">${money(it.amount)}</td></tr>`).join("")}
      </tbody></table></div>
      <div class="inv-doc__totals">
        <div><span>Subtotal</span><b>${money(t.subtotal)}</b></div>
        ${t.discount ? `<div><span>Discount</span><b>− ${money(t.discount)}</b></div>` : ""}
        ${t.tax ? `<div><span>Tax (${Number(inv.taxRate) || 0}%)</span><b>${money(t.tax)}</b></div>` : ""}
        ${t.lateFee ? `<div><span>Late fee</span><b>${money(t.lateFee)}</b></div>` : ""}
        <div class="is-total"><span>Total</span><b>${money(t.total)}</b></div>
        <div><span>Paid</span><b class="text-green">${money(t.paid)}</b></div>
        <div class="is-balance"><span>Balance due</span><b>${money(st === "Cancelled" ? 0 : t.balance)}</b></div>
      </div>
      <div class="section-title">Payment history</div>
      ${pays.length ? `<div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>Payment</th><th>Date</th><th>Method</th><th>Reference</th><th class="t-right">Amount</th>${opts.actions ? `<th class="t-right">Actions</th>` : ""}</tr></thead><tbody>
        ${pays.map((p) => `<tr><td class="nowrap">${esc(p.id)}</td><td class="nowrap">${U.fmtDate(p.date)}</td><td>${esc(p.method)}</td><td>${esc(p.reference || "—")}${p.note ? `<div class="text-2 small">${esc(p.note)}</div>` : ""}</td><td class="t-right money">${money(p.amount)}</td>
          ${opts.actions ? `<td class="t-right nowrap"><button type="button" class="btn-hh btn-hh--sm" data-receipt="${esc(p.id)}"><i class="bi bi-printer"></i>Receipt</button> <button type="button" class="btn-hh btn-hh--sm btn-hh--icon btn-hh--ghost" data-del-pay="${esc(p.id)}" aria-label="Delete payment ${esc(p.id)}" title="Delete payment"><i class="bi bi-trash text-red"></i></button></td>` : ""}</tr>`).join("")}
      </tbody></table></div>` : `<p class="text-2">No payments recorded yet.</p>`}
      ${inv.notes ? `<div class="section-title">Notes</div><p class="inv-doc__notes">${esc(inv.notes)}</p>` : ""}
    </div>`;
  }

  /** Invoice view modal. opts = { onChange(), onEdit(id) } */
  function viewInvoice(id, opts = {}) {
    const inv = get(id); if (!inv) return HH.toast("Invoice not found.", "error");
    const t = C.invoiceTotals(inv); const st = statusOf(inv);
    const changed = () => { opts.onChange && opts.onChange(); };
    const reopen = () => later(() => viewInvoice(id, opts));
    const footer = [];
    if (st !== "Cancelled" && !(inv.payments || []).length) footer.push({ label: "Cancel invoice", icon: "bi-x-circle", cls: "btn-hh--ghost", left: true, onClick: (ctx) => cancelInvoice(id, () => { changed(); ctx.close(); reopen(); }) });
    footer.push({ label: "Print", icon: "bi-printer", onClick: () => printInvoice(id) });
    if (opts.onEdit && st !== "Cancelled") footer.push({ label: "Edit", icon: "bi-pencil", onClick: (ctx) => { ctx.close(); later(() => opts.onEdit(id)); } });
    if (st !== "Cancelled" && t.balance > 0) footer.push({ label: "Record payment", icon: "bi-cash-coin", cls: "btn-hh--green", onClick: (ctx) => { ctx.close(); later(() => payDialog({ invoiceId: id, onDone: () => { changed(); reopen(); } })); } });
    footer.push({ label: "Close", cls: "btn-hh--dark", close: true });
    const m = HH.modal({ title: `Invoice · ${id}`, icon: "bi-receipt-cutoff", size: "lg", body: docHTML(inv, { actions: true }), footer });
    m.body.addEventListener("click", (e) => {
      const rc = e.target.closest("[data-receipt]"); if (rc) return printReceipt(id, rc.dataset.receipt);
      const dp = e.target.closest("[data-del-pay]");
      if (dp) deletePayment(id, dp.dataset.delPay, () => { changed(); m.close(); reopen(); });
    });
    return m;
  }

  function printInvoice(id) {
    const inv = get(id); if (!inv) return;
    const t = C.invoiceTotals(inv); const st = statusOf(inv); const r = L.resident(inv.residentId) || {};
    const tone = { Paid: "#10B981", Partial: "#1683FF", Overdue: "#F04452", Unpaid: "#FF8A1F", Cancelled: "#93A3BD" }[st] || "#102347";
    const html = `<div class="grid">
        <div class="box"><div class="lbl">Bill to</div><div class="val">${esc(r.name || L.residentName(inv.residentId))}</div><div class="muted">${esc(resMeta(inv.residentId))}</div>${r.phone ? `<div class="muted">${esc(r.phone)}</div>` : ""}</div>
        <div class="box"><div class="lbl">Invoice</div><div class="val">${esc(inv.id)} · ${esc(inv.period)}</div><div class="muted">Issued ${U.fmtDate(inv.issueDate)} · Due ${U.fmtDate(inv.dueDate)}</div><div style="margin-top:6px"><span class="stamp" style="color:${tone};border-color:${tone}">${esc(st.toUpperCase())}</span></div></div>
      </div>
      <table><thead><tr><th>#</th><th>Category</th><th>Description</th><th class="r">Amount</th></tr></thead><tbody>
        ${(inv.items || []).map((it, i) => `<tr><td>${i + 1}</td><td>${esc(it.category)}</td><td>${esc(it.description || "")}</td><td class="r">${money(it.amount)}</td></tr>`).join("")}
        <tr><td colspan="3" class="r">Subtotal</td><td class="r">${money(t.subtotal)}</td></tr>
        ${t.discount ? `<tr><td colspan="3" class="r">Discount</td><td class="r">− ${money(t.discount)}</td></tr>` : ""}
        ${t.tax ? `<tr><td colspan="3" class="r">Tax (${Number(inv.taxRate) || 0}%)</td><td class="r">${money(t.tax)}</td></tr>` : ""}
        ${t.lateFee ? `<tr><td colspan="3" class="r">Late fee</td><td class="r">${money(t.lateFee)}</td></tr>` : ""}
        <tr class="tot"><td colspan="3" class="r">Total</td><td class="r">${money(t.total)}</td></tr>
        <tr><td colspan="3" class="r">Paid</td><td class="r">${money(t.paid)}</td></tr>
        <tr class="tot"><td colspan="3" class="r">Balance due</td><td class="r">${money(st === "Cancelled" ? 0 : t.balance)}</td></tr>
      </tbody></table>
      <h2>Payment history</h2>
      ${(inv.payments || []).length ? `<table><thead><tr><th>Payment</th><th>Date</th><th>Method</th><th>Reference</th><th class="r">Amount</th></tr></thead><tbody>${inv.payments.map((p) => `<tr><td>${esc(p.id)}</td><td>${U.fmtDate(p.date)}</td><td>${esc(p.method)}</td><td>${esc(p.reference || "—")}</td><td class="r">${money(p.amount)}</td></tr>`).join("")}</tbody></table>` : `<p class="muted">No payments recorded.</p>`}
      ${inv.notes ? `<h2>Notes</h2><p class="muted" style="white-space:pre-line">${esc(inv.notes)}</p>` : ""}`;
    HH.printHTML(`Invoice ${inv.id}`, html, { subtitle: `${inv.period} · ${L.residentName(inv.residentId)}` });
  }

  function printReceipt(invId, payId) {
    const inv = get(invId); if (!inv) return;
    const p = (inv.payments || []).find((x) => x.id === payId); if (!p) return HH.toast("Payment not found.", "error");
    // balance right after this payment (payments up to and including this one, in date order)
    const ordered = inv.payments.slice().sort((a, b) => (a.date + a.id).localeCompare(b.date + b.id));
    const upto = ordered.slice(0, ordered.findIndex((x) => x.id === p.id) + 1);
    const after = C.invoiceTotals(Object.assign({}, inv, { payments: upto })).balance;
    const r = L.resident(inv.residentId) || {};
    const html = `<div class="grid">
        <div class="box"><div class="lbl">Received from</div><div class="val">${esc(r.name || L.residentName(inv.residentId))}</div><div class="muted">${esc(resMeta(inv.residentId))}</div></div>
        <div class="box"><div class="lbl">Amount received</div><div class="val" style="font-size:20px">${money(p.amount)}</div><div class="muted">${esc(p.method)}${p.reference ? " · Ref " + esc(p.reference) : ""}</div></div>
      </div>
      <table><tbody>
        <tr><td>Receipt no.</td><td class="r">${esc(p.id)}</td></tr><tr><td>Payment date</td><td class="r">${U.fmtDate(p.date)}</td></tr>
        <tr><td>Against invoice</td><td class="r">${esc(inv.id)} · ${esc(inv.period)}</td></tr><tr><td>Invoice total</td><td class="r">${money(C.invoiceTotals(inv).total)}</td></tr>
        <tr class="tot"><td>Balance after this payment</td><td class="r">${money(after)}</td></tr>
        ${p.note ? `<tr><td>Note</td><td class="r">${esc(p.note)}</td></tr>` : ""}
      </tbody></table>
      <p class="muted" style="margin-top:14px">Simulated payment recorded in the HostelHub demo — no real money was charged. Received by ${esc(me())}.</p>`;
    HH.printHTML("Payment Receipt", html, { subtitle: `${p.id} · ${U.fmtDate(p.date)}` });
  }

  /* ------------------------------------------- monthly generation ---- */
  function buildMonthly(d) {
    const period = U.monthLabel(d.month);
    const billed = new Set(HH.store.all("invoices").filter((i) => i.period === period && i.status !== "Cancelled").map((i) => i.residentId));
    const live = C.activeResidents();
    const todo = live.filter((r) => !billed.has(r.id)).map((r) => {
      let items = defaultItems(r.id, period);
      if (!d.includeMess) items = items.filter((x) => x.category !== "Mess Fee");
      items = items.filter((x) => Number(x.amount) > 0);
      return { r, items };
    }).filter((x) => x.items.length);
    return { period, todo, skipped: live.length - todo.length, already: live.filter((r) => billed.has(r.id)).length };
  }
  function generateMonthly(onDone) {
    const month = T.slice(0, 7);
    const issue0 = `${month}-01`;
    const fields = [
      { name: "month", label: "Billing month", type: "month", required: true, col: 4, default: month,
        onChange: (v, f) => { if (!v) return; f.elements.issueDate.value = `${v}-01`; f.elements.dueDate.value = dueFor(`${v}-01`); } },
      { name: "issueDate", label: "Issue date", type: "date", required: true, col: 4, default: issue0, onChange: (v, f) => { if (v) f.elements.dueDate.value = dueFor(v); } },
      { name: "dueDate", label: "Due date", type: "date", required: true, col: 4, default: dueFor(issue0), validate: (v, vals) => (vals.issueDate && v < vals.issueDate ? "Due date cannot be before the issue date." : "") },
      { name: "includeMess", label: "Mess fee", type: "switch", col: 12, default: true, switchLabel: "Add the mess fee for residents with an active mess plan" },
      { type: "html", html: `<div data-preview></div>` },
    ];
    let fEl;
    const read = () => ({ month: fEl.elements.month.value, issueDate: fEl.elements.issueDate.value, dueDate: fEl.elements.dueDate.value, includeMess: fEl.elements.includeMess.checked });
    function preview() {
      const d = read(); const box = fEl.querySelector("[data-preview]");
      if (!d.month) { box.innerHTML = ""; return; }
      const p = buildMonthly(d);
      const total = U.sum(p.todo, (x) => U.sum(x.items, (i) => i.amount));
      box.innerHTML = `<div class="alert-hh ${p.todo.length ? "tone-blue" : "tone-green"}"><i class="bi ${p.todo.length ? "bi-info-circle" : "bi-check-circle"}"></i>
        <span>${p.todo.length ? `<b>${p.todo.length}</b> invoice(s) will be created for <b>${esc(p.period)}</b> totalling <b>${money(total)}</b>.` : `Every active resident is already billed for <b>${esc(p.period)}</b>.`}
        ${p.already ? ` ${p.already} resident(s) already billed for this period will be skipped.` : ""}</span><span></span></div>
        ${p.todo.length ? `<div class="inv-gen-list">${p.todo.slice(0, 8).map((x) => `<span>${esc(x.r.name)} <b>${money(U.sum(x.items, (i) => i.amount))}</b></span>`).join("")}${p.todo.length > 8 ? `<span class="text-2">+ ${p.todo.length - 8} more</span>` : ""}</div>` : ""}`;
    }
    HH.formModal({
      title: "Generate monthly invoices", icon: "bi-magic", size: "lg", fields, values: {}, submitText: "Generate invoices",
      onReady: (f) => { fEl = f; f.addEventListener("input", preview); f.addEventListener("change", () => setTimeout(preview, 0)); preview(); },
      onSubmit: async (d) => {
        d.includeMess = !!d.includeMess;
        const p = buildMonthly(d);
        if (!p.todo.length) return `Every active resident is already billed for ${p.period}.`;
        const total = U.sum(p.todo, (x) => U.sum(x.items, (i) => i.amount));
        const ok = await HH.confirm(`Create <b>${p.todo.length}</b> invoice(s) for <b>${esc(p.period)}</b> totalling <b>${money(total)}</b>?`, { title: "Generate invoices", okText: "Generate", icon: "bi-magic" });
        if (!ok) return false;
        let n = 1000;
        HH.store.all("invoices").forEach((i) => { const x = parseInt(String(i.id).replace(/\D/g, ""), 10); if (x > n) n = x; });
        const now = U.nowISO();
        const created = p.todo.map((x) => {
          const inv = { id: `INV-${++n}`, residentId: x.r.id, issueDate: d.issueDate, dueDate: d.dueDate, period: p.period, items: x.items, discount: 0,
            taxRate: Number(S().taxRate) || 0, lateFee: 0, notes: "", status: "", payments: [], createdAt: T, updatedAt: now };
          inv.status = C.invoiceStatus(inv);
          return inv;
        });
        HH.store.setAll("invoices", HH.store.all("invoices").concat(created));
        HH.toast(`${created.length} invoice(s) generated for ${p.period} (${created[0].id} – ${created[created.length - 1].id}).`, "success", 5000);
        onDone && onDone(created);
        return true;
      },
    });
  }

  HH.invoices = {
    get, save, statusOf, dueFor, periodKey, periodOptions, residentPlan, defaultItems, recordPayment, deletePayment, payDialog,
    cancelInvoice, applyLateFee, lateFeeEligible, viewInvoice, printInvoice, printReceipt, generateMonthly, docHTML, money, daysOverdue, resMeta,
  };

  /* ================================================== invoices page ==== */
  if (document.body.dataset.page !== "invoices") return;

  /* ---- line items editor ---- */
  function lineRow(it = {}) {
    const cats = L.list("feeCategories"); if (it.category && !cats.includes(it.category)) cats.push(it.category);
    return `<div class="line-item" data-line>
      <select class="select-hh" name="li_category" aria-label="Fee category">${HH.ui.options(cats, it.category, "Category…")}</select>
      <input class="input-hh" name="li_description" maxlength="120" placeholder="Description" aria-label="Description" value="${esc(it.description || "")}">
      <input class="input-hh inv-amt" type="number" name="li_amount" min="0" step="any" placeholder="0.00" aria-label="Amount" value="${it.amount === "" || it.amount == null ? "" : esc(it.amount)}">
      <button type="button" class="btn-hh btn-hh--icon btn-hh--ghost" data-remove-line aria-label="Remove line item" title="Remove line item"><i class="bi bi-trash"></i></button>
    </div>`;
  }
  function linesHTML(items) {
    return `<div class="inv-lines" data-lines>
      <div class="line-items">
        <div class="line-item line-items__head"><span>Category</span><span>Description</span><span class="t-right">Amount (₹)</span><span></span></div>
        <div class="line-items" data-rows>${(items && items.length ? items : [{}]).map(lineRow).join("")}</div>
      </div>
      <div class="row-between inv-lines__foot"><button type="button" class="btn-hh btn-hh--sm btn-hh--soft-blue" data-add-line><i class="bi bi-plus-lg"></i>Add line item</button><span class="field-help">At least one item. Categories come from Settings → Fee categories.</span></div>
      <div class="field-error" data-lines-error></div>
    </div>`;
  }
  function readLines(f) {
    const items = []; const errs = [];
    f.querySelectorAll("[data-line]").forEach((row, i) => {
      const category = row.querySelector('[name="li_category"]').value;
      const description = row.querySelector('[name="li_description"]').value.trim();
      const raw = row.querySelector('[name="li_amount"]').value;
      if (!category && !description && raw === "") return;
      const amount = Number(raw);
      if (!category) errs.push(`Line ${i + 1}: choose a fee category.`);
      if (raw === "" || isNaN(amount) || amount <= 0) errs.push(`Line ${i + 1}: amount must be greater than zero.`);
      items.push({ category, description, amount: Math.round((amount || 0) * 100) / 100 });
    });
    if (!items.length) errs.unshift("Add at least one line item.");
    return { items, error: errs[0] || "" };
  }
  function updateSum(f, rec) {
    const box = f.querySelector("[data-sum]"); if (!box) return;
    const items = readLines(f).items;
    const tmp = { items, discount: Number(f.elements.discount.value) || 0, taxRate: Number(f.elements.taxRate.value) || 0, lateFee: Number(f.elements.lateFee.value) || 0, payments: rec ? rec.payments || [] : [] };
    const t = C.invoiceTotals(tmp);
    box.innerHTML = `<div><span>Subtotal</span><b>${money(t.subtotal)}</b></div><div><span>Discount</span><b>− ${money(t.discount)}</b></div>
      <div><span>Tax (${tmp.taxRate}%)</span><b>${money(t.tax)}</b></div><div><span>Late fee</span><b>${money(t.lateFee)}</b></div>
      <div class="is-total"><span>Total</span><b>${money(t.total)}</b></div>
      ${rec && t.paid ? `<div><span>Already paid</span><b class="text-green">${money(t.paid)}</b></div><div class="is-balance"><span>Balance</span><b>${money(t.balance)}</b></div>` : ""}
      ${t.discount > t.subtotal ? `<div class="inv-sum__warn"><i class="bi bi-exclamation-triangle"></i> Discount is more than the subtotal.</div>` : ""}
      ${rec && t.total < t.paid ? `<div class="inv-sum__warn"><i class="bi bi-exclamation-triangle"></i> Total is below the ${money(t.paid)} already paid.</div>` : ""}`;
  }
  function setDefaultLines(f) {
    if (f.dataset.linesTouched) return;
    f.querySelector("[data-rows]").innerHTML = defaultItems(f.elements.residentId.value, f.elements.period.value || curPeriod()).map(lineRow).join("");
  }

  function residentOpts(rec, preset) {
    const opts = L.residentOptions();
    const extra = [rec && rec.residentId, preset].filter((id) => id && !opts.some((o) => o.value === id) && L.resident(id));
    extra.forEach((id) => opts.push({ value: id, label: `${L.residentName(id)} (${id}) · ${L.resident(id).status}` }));
    return opts;
  }

  let page;
  const refresh = () => page && page.refresh();
  const openView = (id) => viewInvoice(id, { onChange: refresh, onEdit: (x) => page.openForm(x) });
  const tabFilter = (s) => (r) => statusOf(r) === s;
  const periodsList = () => {
    const m = {}; HH.store.all("invoices").forEach((i) => { if (!m[i.period] || i.issueDate > m[i.period]) m[i.period] = i.issueDate; });
    return Object.keys(m).sort((a, b) => (periodKey(b) || m[b]).localeCompare(periodKey(a) || m[a]));
  };

  page = HH.CrudPage({
    collection: "invoices", entity: "Invoice", icon: "bi-receipt-cutoff", addLabel: "Create Invoice", addTitle: "Create invoice", addSubmitText: "Create invoice",
    searchPlaceholder: "Search invoice no., resident, period, room…",
    searchKeys: ["id", "residentId", "period", (r) => L.residentName(r.residentId), (r) => { const x = L.resident(r.residentId); return x ? L.roomLabel(x.roomId) : ""; }],
    tabs: [
      { key: "all", label: "All" },
      { key: "unpaid", label: "Unpaid", filter: tabFilter("Unpaid") },
      { key: "partial", label: "Partial", filter: tabFilter("Partial") },
      { key: "overdue", label: "Overdue", filter: tabFilter("Overdue") },
      { key: "paid", label: "Paid", filter: tabFilter("Paid") },
      { key: "cancelled", label: "Cancelled", filter: tabFilter("Cancelled") },
    ],
    filters: [
      { key: "branch", label: "All branches", options: () => L.branchOptions(), match: (r, v) => (L.resident(r.residentId) || {}).branch === v },
      { key: "period", label: "All periods", options: periodsList },
      { key: "category", label: "Any fee category", options: () => L.list("feeCategories"), match: (r, v) => (r.items || []).some((i) => i.category === v) || (v === "Late Fee" && Number(r.lateFee) > 0) },
    ],
    dateFilter: { key: "issueDate", label: "Issued" },
    defaultSort: { key: "issueDate", dir: "desc" },
    columns: [
      { key: "id", label: "Invoice", render: (r) => `<b class="nowrap">${esc(r.id)}</b>`, value: (r) => r.id },
      { key: "resident", label: "Resident", value: (r) => L.residentName(r.residentId), render: (r) => HH.ui.person(L.residentName(r.residentId), resMeta(r.residentId), (L.resident(r.residentId) || {}).photo) },
      { key: "period", label: "Period", value: (r) => periodKey(r.period) || r.period, render: (r) => esc(r.period), cls: "nowrap", csv: (r) => r.period },
      { key: "issueDate", label: "Issued", value: (r) => r.issueDate + r.id, render: (r) => U.fmtDate(r.issueDate), cls: "nowrap", csv: (r) => r.issueDate },
      { key: "dueDate", label: "Due", render: (r) => `<span class="${statusOf(r) === "Overdue" ? "text-red fw-600" : ""}">${U.fmtDate(r.dueDate)}</span>${daysOverdue(r) ? `<span class="inv-sub text-red">${daysOverdue(r)}d overdue</span>` : ""}`, cls: "nowrap", csv: (r) => r.dueDate },
      { key: "total", label: "Total", value: (r) => C.invoiceTotals(r).total, render: (r) => `<span class="money">${money(C.invoiceTotals(r).total)}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "paid", label: "Paid", value: (r) => C.invoiceTotals(r).paid, render: (r) => { const p = C.invoiceTotals(r).paid; return `<span class="money ${p ? "text-green" : "text-3"}">${money(p)}</span>`; }, cls: "t-right", thCls: "t-right" },
      { key: "balance", label: "Balance", value: (r) => (statusOf(r) === "Cancelled" ? 0 : C.invoiceTotals(r).balance), render: (r) => `<b class="money">${money(statusOf(r) === "Cancelled" ? 0 : C.invoiceTotals(r).balance)}</b>`, cls: "t-right", thCls: "t-right" },
      { key: "status", label: "Status", value: statusOf, render: (r) => HH.ui.badge(statusOf(r)) },
    ],
    csvColumns: [
      ["Invoice", "id"], ["Resident ID", "residentId"], ["Resident", (r) => L.residentName(r.residentId)], ["Branch", (r) => L.branchName((L.resident(r.residentId) || {}).branch)],
      ["Period", "period"], ["Issue Date", "issueDate"], ["Due Date", "dueDate"], ["Items", (r) => (r.items || []).map((i) => `${i.category}: ${i.amount}`).join("; ")],
      ["Subtotal", (r) => C.invoiceTotals(r).subtotal], ["Discount", (r) => C.invoiceTotals(r).discount], ["Tax", (r) => C.invoiceTotals(r).tax], ["Late Fee", (r) => C.invoiceTotals(r).lateFee],
      ["Total", (r) => C.invoiceTotals(r).total], ["Paid", (r) => C.invoiceTotals(r).paid], ["Balance", (r) => (statusOf(r) === "Cancelled" ? 0 : C.invoiceTotals(r).balance)], ["Status", statusOf], ["Notes", "notes"],
    ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] })),
    stats: (all) => {
      const live = all.filter((i) => i.status !== "Cancelled");
      const tt = live.map(C.invoiceTotals);
      const overdue = live.filter((i) => statusOf(i) === "Overdue");
      const billed = U.sum(tt, (t) => t.total), paid = U.sum(tt, (t) => t.paid);
      return [
        { label: "Total Billed", value: U.fmtMoney(billed), icon: "bi-receipt", tone: "blue", meta: `${U.fmtNum(live.length)} invoices (excl. cancelled)` },
        { label: "Collected", value: U.fmtMoney(paid), icon: "bi-cash-stack", tone: "green", meta: `${U.pct(paid, billed)}% of billed amount`, onClick: () => (location.hash = "paid") },
        { label: "Outstanding", value: U.fmtMoney(U.sum(tt, (t) => t.balance)), icon: "bi-hourglass-split", tone: "orange", meta: `${live.filter((i) => C.invoiceTotals(i).balance > 0).length} open invoices`, href: "fees-payments.html#outstanding" },
        { label: "Overdue", value: overdue.length, icon: "bi-exclamation-octagon", tone: "red", meta: `${U.fmtMoney(U.sum(overdue, (i) => C.invoiceTotals(i).balance))} past due`, onClick: () => (location.hash = "overdue") },
      ];
    },
    fields: (rec) => [
      { type: "section", label: "Bill to", icon: "bi-person" },
      { name: "residentId", label: "Resident", type: "select", required: true, col: 6, options: (v) => residentOpts(rec, v.residentId), placeholder: "Select resident…",
        validate: (v) => (rec && (rec.payments || []).length && v !== rec.residentId ? "The resident cannot change after payments have been recorded." : ""),
        onChange: (v, f, ctx) => { if (!rec) setDefaultLines(f); updateSum(f, rec); } },
      { name: "period", label: "Billing period", type: "select", required: true, col: 6, options: (v) => periodOptions(v.period), placeholder: "Select period…",
        onChange: (v, f) => { if (!rec) setDefaultLines(f); updateSum(f, rec); } },
      { name: "issueDate", label: "Issue date", type: "date", required: true, col: 6, onChange: (v, f) => { if (!rec && v && !f.elements.dueDate.dataset.touched) f.elements.dueDate.value = dueFor(v); } },
      { name: "dueDate", label: "Due date", type: "date", required: true, col: 6, validate: (v, vals) => (vals.issueDate && v < vals.issueDate ? "Due date cannot be before the issue date." : "") },
      { type: "section", label: "Line items", icon: "bi-list-ul" },
      { type: "html", html: (v) => linesHTML(v.items && v.items.length ? v.items : defaultItems(v.residentId, v.period || curPeriod())) },
      { type: "section", label: "Adjustments & totals", icon: "bi-calculator" },
      { name: "discount", label: "Discount (₹)", type: "number", col: 4, min: 0, step: "any" },
      { name: "taxRate", label: "Tax rate (%)", type: "number", col: 4, min: 0, max: 100, step: "any" },
      { name: "lateFee", label: "Late fee (₹)", type: "number", col: 4, min: 0, step: "any" },
      { name: "notes", label: "Notes", type: "textarea", rows: 4, col: 6, maxlength: 500, placeholder: "Shown on the printed invoice" },
      { type: "html", col: 6, html: `<div class="inv-sum" data-sum aria-live="polite"></div>` },
    ],
    formSize: "xl",
    defaults: () => ({ issueDate: T, dueDate: dueFor(T), period: curPeriod(), discount: 0, taxRate: Number(S().taxRate) || 0, lateFee: 0, notes: "" }),
    presetsFromQuery: (p) => { const out = {}; const rid = p.resident || p.residentId; if (rid && L.resident(rid)) out.residentId = rid; if (p.period) out.period = p.period; return out; },
    onFormReady: (f, ctx, rec) => {
      if (rec && (rec.payments || []).length) f.insertAdjacentHTML("afterbegin", `<div class="f-col-12"><div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span>${money(C.invoiceTotals(rec).paid)} has already been paid on this invoice — the new total cannot be lower than that.</span><span></span></div></div>`);
      const lines = f.querySelector("[data-lines]");
      lines.addEventListener("click", (e) => {
        if (e.target.closest("[data-add-line]")) { lines.querySelector("[data-rows]").insertAdjacentHTML("beforeend", lineRow({})); f.dataset.linesTouched = "1"; lines.querySelector("[data-line]:last-child select").focus(); updateSum(f, rec); f.dispatchEvent(new Event("input", { bubbles: true })); }
        const rm = e.target.closest("[data-remove-line]");
        if (rm) {
          if (lines.querySelectorAll("[data-line]").length <= 1) return HH.toast("An invoice needs at least one line item.", "warning");
          rm.closest("[data-line]").remove(); f.dataset.linesTouched = "1"; updateSum(f, rec); f.dispatchEvent(new Event("input", { bubbles: true }));
        }
      });
      lines.addEventListener("input", (e) => { if (e.isTrusted) f.dataset.linesTouched = "1"; lines.querySelector("[data-lines-error]").textContent = ""; });
      lines.addEventListener("change", (e) => {
        if (e.target.name === "li_category") {
          const row = e.target.closest("[data-line]"); const amt = row.querySelector('[name="li_amount"]');
          const cat = (S().feeCategories || []).find((c) => c.name === e.target.value);
          if (cat && Number(cat.amount) > 0 && !amt.value) amt.value = cat.amount;
          f.dataset.linesTouched = "1";
        }
        updateSum(f, rec);
      });
      f.addEventListener("input", (e) => { if (e.target.name === "dueDate" && e.isTrusted) e.target.dataset.touched = "1"; updateSum(f, rec); });
      updateSum(f, rec);
    },
    beforeSave: async (d, prev, ctx) => {
      if (prev && prev.status === "Cancelled") return "Cancelled invoices cannot be edited.";
      const f = ctx.form;
      const { items, error } = readLines(f);
      if (error) { f.querySelector("[data-lines-error]").textContent = error; return error; }
      d.items = items;
      d.discount = Number(d.discount) || 0; d.taxRate = Number(d.taxRate) || 0; d.lateFee = Number(d.lateFee) || 0;
      const sub = U.sum(items, (i) => i.amount);
      if (d.discount > sub) { HH.validate.setError(f, "discount", "Discount cannot exceed the subtotal."); return `Discount (${money(d.discount)}) cannot be more than the subtotal (${money(sub)}).`; }
      d.payments = prev ? (prev.payments || []).slice() : [];
      const t = C.invoiceTotals(d);
      if (t.total <= 0) return "Invoice total must be greater than zero.";
      if (prev && t.total < t.paid) return `The new total (${money(t.total)}) cannot be lower than the ${money(t.paid)} already paid on this invoice.`;
      if (!prev || prev.period !== d.period || prev.residentId !== d.residentId) {
        const dup = HH.store.all("invoices").find((i) => i.residentId === d.residentId && i.period === d.period && i.status !== "Cancelled" && (!prev || i.id !== prev.id));
        if (dup) {
          const ok = await HH.confirm(`${esc(L.residentName(d.residentId))} already has invoice <b>${esc(dup.id)}</b> for <b>${esc(d.period)}</b> (${money(C.invoiceTotals(dup).total)}). Create another invoice for the same period anyway?`, { title: "Possible duplicate", okText: "Save anyway", icon: "bi-files" });
          if (!ok) return "Saving cancelled — duplicate invoice for this period.";
        }
      }
      d.notes = d.notes || "";
      d.status = C.invoiceStatus(Object.assign({}, d, { status: prev ? prev.status : "" }));
    },
    afterSave: () => refresh(),
    onView: (r) => openView(r.id),
    canEdit: (r) => r.status !== "Cancelled",
    canDelete: (r) => !(r.payments || []).length,
    deleteMessage: (r) => `Delete invoice <b>${esc(r.id)}</b> for ${esc(L.residentName(r.residentId))} (${money(C.invoiceTotals(r).total)})? This cannot be undone — consider <b>Cancel invoice</b> to keep an audit trail.`,
    actions: [
      { label: "Record full payment", icon: "bi-cash-coin", show: (r) => r.status !== "Cancelled" && C.invoiceTotals(r).balance > 0, handler: (r) => payDialog({ invoiceId: r.id, full: true, onDone: refresh }) },
      { label: "Record partial payment", icon: "bi-cash-stack", show: (r) => r.status !== "Cancelled" && C.invoiceTotals(r).balance > 0, handler: (r) => payDialog({ invoiceId: r.id, onDone: refresh }) },
      { label: "Apply late fee", icon: "bi-alarm", show: lateFeeEligible, handler: async (r) => {
        const fee = Number(S().lateFeeAmount) || 0;
        if (!(await HH.confirm(`Add a late fee of <b>${money(fee)}</b> to overdue invoice <b>${esc(r.id)}</b>?`, { title: "Apply late fee", okText: "Apply", icon: "bi-alarm" }))) return;
        const n = applyLateFee([r.id]); if (n) HH.toast(`Late fee of ${money(fee)} added to ${r.id}.`, "success"); refresh();
      } },
      { label: "Print invoice", icon: "bi-printer", handler: (r) => printInvoice(r.id) },
      { label: "Print receipt", icon: "bi-receipt", show: (r) => (r.payments || []).length > 0, handler: (r) => (r.payments.length === 1 ? printReceipt(r.id, r.payments[0].id) : openView(r.id)) },
      { label: "View resident", icon: "bi-person", show: (r) => !!L.resident(r.residentId), handler: (r) => (location.href = `resident-details.html?id=${r.residentId}#fees`) },
      { label: "Cancel invoice", icon: "bi-x-circle", danger: true, show: (r) => r.status !== "Cancelled" && !(r.payments || []).length, handler: (r) => cancelInvoice(r.id, refresh) },
    ],
    toolbarButtons: [
      { label: "Generate Monthly", icon: "bi-magic", handler: () => generateMonthly(refresh) },
      { label: "Record Payment", icon: "bi-cash-coin", cls: "btn-hh--green", handler: () => payDialog({ onDone: refresh }) },
    ],
    footerRow: (rows) => {
      const live = rows.filter((r) => r.status !== "Cancelled"); const tt = live.map(C.invoiceTotals);
      return `<tr><td colspan="5">Totals · ${rows.length} invoice(s)</td><td class="t-right money">${money(U.sum(tt, (t) => t.total))}</td><td class="t-right money">${money(U.sum(tt, (t) => t.paid))}</td><td class="t-right money">${money(U.sum(tt, (t) => t.balance))}</td><td colspan="2"></td></tr>`;
    },
    exportName: "invoices", printTitle: "Invoices",
  });
})();
