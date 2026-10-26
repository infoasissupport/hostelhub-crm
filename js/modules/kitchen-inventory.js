/* ==========================================================================
   HostelHub — Kitchen & Inventory module
   Tabs: #items (stock items) · #history (stock transactions) · #vendors · #alerts
   Every stock movement is written to the stockTx collection.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;

  const root = document.getElementById("moduleRoot");
  const T = U.todayISO();
  const me = () => (HH.store.settings().currentUser || {}).name || "Admin";
  const UNITS = ["kg", "g", "ltr", "ml", "pcs", "dozen", "tray", "pack", "box", "bottle", "roll", "bag", "can"];
  const TX_TYPES = ["Purchase", "Consumption", "Adjustment"];
  const TX_TONE = { Purchase: "green", Consumption: "blue", Adjustment: "orange" };
  const ADJ_REASONS = ["Stock count correction", "Damaged / spoiled", "Expired write-off", "Returned to vendor", "Found extra stock", "Transferred to another branch", "Other"];
  const STATES = [
    { value: "in", label: "In stock" }, { value: "low", label: "Low stock" }, { value: "out", label: "Out of stock" },
    { value: "expiring", label: "Expiring ≤ 7 days" }, { value: "expired", label: "Expired" },
  ];

  const item = (id) => HH.store.get("inventory", id);
  const itemName = (id) => { const i = item(id); return i ? i.name : id || "—"; };
  const round = (n) => Math.round(Number(n || 0) * 1000) / 1000;
  const qty = (n) => Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 3 });
  const distinct = (key) => [...new Set(HH.store.all("inventory").map((i) => i[key]).filter(Boolean))].sort();
  const daysLeft = (i) => C.expiresInDays(i);
  const isExpired = (i) => daysLeft(i) < 0;
  const isExpiring = (i) => { const d = daysLeft(i); return d >= 0 && d <= 7; };
  const stockState = (i) => (Number(i.stock) <= 0 ? "Out of Stock" : C.isLowStock(i) ? "Low Stock" : "In Stock");
  const matchState = (i, v) => ({ in: stockState(i) === "In Stock", low: C.isLowStock(i), out: Number(i.stock) <= 0, expiring: isExpiring(i), expired: isExpired(i) }[v]);
  const signedQty = (t) => (t.type === "Consumption" ? -Math.abs(t.qty) : t.type === "Purchase" ? Math.abs(t.qty) : Number(t.qty) || 0);
  const txValue = (t) => Math.abs(Number(t.qty) || 0) * (Number(t.unitPrice) || 0);
  const suggestQty = (i) => Math.max(Math.ceil(Number(i.minStock) * 2 - Number(i.stock)), Math.ceil(Number(i.minStock)) || 1);
  const itemOptions = (withStock) => HH.store.all("inventory").slice().sort((a, b) => a.name.localeCompare(b.name))
    .map((i) => ({ value: i.id, label: withStock ? `${i.name} · ${qty(i.stock)} ${i.unit} in stock` : i.name }));
  const vendorPurchases = (vid) => HH.store.all("stockTx").filter((t) => t.type === "Purchase" && t.vendor === vid);

  function expiryCell(i) {
    if (!i.expiryDate) return `<span class="text-3">No expiry</span>`;
    const d = daysLeft(i);
    const note = d < 0 ? `Expired ${-d} day${d === -1 ? "" : "s"} ago` : d === 0 ? "Expires today" : d <= 7 ? `In ${d} day${d === 1 ? "" : "s"}` : "";
    return `<span class="nowrap">${U.fmtDate(i.expiryDate)}</span>${note ? `<span class="ki-sub ${d < 0 ? "is-red" : "is-orange"}">${note}</span>` : ""}`;
  }
  function stockCell(i) {
    const st = stockState(i);
    return `<b class="money ${st === "In Stock" ? "" : st === "Low Stock" ? "ki-low" : "ki-out"}">${qty(i.stock)}</b> <span class="text-2">${esc(i.unit)}</span>`;
  }
  function addDatalist(formEl, name, options) {
    const el = formEl.elements[name]; if (!el) return;
    const id = `dl_${name}_${Math.random().toString(36).slice(2, 7)}`;
    formEl.insertAdjacentHTML("beforeend", `<datalist id="${id}">${options.map((o) => `<option value="${esc(o)}"></option>`).join("")}</datalist>`);
    el.setAttribute("list", id);
  }

  /* --------------------------------------------------------- layout ---- */
  root.innerHTML = `
    <nav class="ki-tabs" data-tabs aria-label="Kitchen & inventory sections"></nav>
    <section class="stack" data-panel="items"><div id="kiItems" class="stack" style="gap:var(--gutter)"></div></section>
    <section class="stack" data-panel="history" hidden><div id="kiHistory" class="stack" style="gap:var(--gutter)"></div></section>
    <section class="stack" data-panel="vendors" hidden><div id="kiVendors" class="stack" style="gap:var(--gutter)"></div></section>
    <section class="stack" data-panel="alerts" hidden><div id="kiAlerts" class="stack" style="gap:var(--gutter)"></div></section>`;

  /* --------------------------------------------- stock movement dialog ---- */
  /**
   * type: "Purchase" | "Consumption" | "Adjustment"; itemId optional (shows an item picker when empty)
   * presets: initial values (qty, vendor, dir, reason, itemId…)
   */
  function stockDialog(type, itemId, presets = {}) {
    if (!HH.store.all("inventory").length) return HH.toast("Add a stock item first.", "warning");
    const fixed = itemId && item(itemId);
    if (itemId && !fixed) return HH.toast("Stock item not found.", "error");
    let formEl = null;
    const current = () => (fixed ? item(fixed.id) : formEl && formEl.elements.itemId ? item(formEl.elements.itemId.value) : null);
    const pmethods = L.list("paymentMethods");
    const fields = [];
    if (!fixed) fields.push({ name: "itemId", label: "Stock item", type: "select", required: true, col: 12, options: itemOptions(true), onChange: (v, f) => onItem(f) });
    fields.push({ type: "html", html: `<div data-item-card></div>` });
    fields.push({ name: "date", label: type === "Purchase" ? "Purchase date" : type === "Consumption" ? "Consumption date" : "Adjustment date", type: "date", required: true, col: 6, default: T, max: T });

    if (type === "Purchase") {
      fields.push(
        { name: "qty", label: "Quantity purchased", type: "number", required: true, col: 6, min: 0.001, step: "any", placeholder: "0",
          validate: (v) => (Number(v) > 0 ? "" : "Quantity must be greater than zero.") },
        { name: "unitPrice", label: "Unit price (₹)", type: "number", required: true, col: 6, min: 0, step: "any", default: fixed ? fixed.price : "" },
        { name: "vendor", label: "Vendor", type: "select", required: true, col: 6, options: L.vendorOptions(), default: fixed ? fixed.supplier : "" },
        { name: "expiryDate", label: "New expiry date", type: "date", col: 6, help: "Leave blank to keep the item's current expiry date.",
          validate: (v, vals) => (v && vals.date && v < vals.date ? "Expiry date cannot be before the purchase date." : "") },
        { name: "note", label: "Bill no. / note", col: 6, maxlength: 120, placeholder: "e.g. Bill #4521" },
        { type: "html", html: `<div class="ki-calc" data-calc></div>` },
        { name: "asExpense", label: "Expenses", type: "switch", col: 12, switchLabel: "Also record this purchase as an expense (Food Purchase · Pending approval)" },
        { name: "method", label: "Payment method", type: "select", col: 6, options: pmethods, default: pmethods.includes("Bank Transfer") ? "Bank Transfer" : pmethods[0] },
        { name: "branch", label: "Expense branch", type: "select", col: 6, options: L.branchOptions(), default: "BR-1" },
      );
    } else if (type === "Consumption") {
      fields.push(
        { name: "qty", label: "Quantity used", type: "number", required: true, col: 6, min: 0.001, step: "any", placeholder: "0",
          validate: (v) => {
            if (!(Number(v) > 0)) return "Quantity must be greater than zero.";
            const i = current(); if (!i) return "";
            return Number(v) > Number(i.stock) ? `Only ${qty(i.stock)} ${i.unit} in stock — consumption cannot exceed available stock.` : "";
          } },
        { name: "usedFor", label: "Used for", type: "select", col: 6, options: [...L.list("mealTypes"), "Snacks / tea", "Special event", "Wastage", "General kitchen use"], default: "General kitchen use" },
        { name: "note", label: "Note", col: 6, maxlength: 120, placeholder: "Optional" },
        { type: "html", html: `<div class="ki-calc" data-calc></div>` },
      );
    } else {
      fields.push(
        { name: "dir", label: "Adjustment", type: "select", required: true, col: 6, options: [{ value: "add", label: "Increase stock (+)" }, { value: "remove", label: "Decrease stock (−)" }], default: "remove" },
        { name: "qty", label: "Quantity", type: "number", required: true, col: 6, min: 0.001, step: "any", placeholder: "0", validate: (v) => (Number(v) > 0 ? "" : "Quantity must be greater than zero.") },
        { name: "reason", label: "Reason", type: "select", required: true, col: 6, options: ADJ_REASONS },
        { name: "note", label: "Details", col: 12, maxlength: 160, placeholder: "e.g. Physical count on Monday found 2 kg less" },
        { name: "override", label: "Manager override", type: "switch", col: 12, switchLabel: "Authorize negative stock (manager override)" },
        { type: "html", html: `<div class="ki-calc" data-calc></div>` },
      );
    }

    function card(i) {
      if (!i) return `<div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span>Select the stock item to ${type === "Purchase" ? "purchase" : type === "Consumption" ? "consume" : "adjust"}.</span><span></span></div>`;
      return `<div class="ki-itemcard"><span class="chip-icon tone-${C.isLowStock(i) ? "orange" : "green"}"><i class="bi bi-box-seam"></i></span>
        <div style="min-width:0"><b>${esc(i.name)}</b> <span class="text-3">${esc(i.id)}</span><div class="text-2 small">${esc(i.category)} · ${esc(i.location || "—")} · ${esc(L.vendorName(i.supplier))}</div></div>
        <div class="ki-itemcard__nums"><span>In stock <b>${qty(i.stock)} ${esc(i.unit)}</b></span><span>Minimum <b>${qty(i.minStock)}</b></span><span>Price <b>${U.fmtMoney(i.price, { decimals: Number(i.price) % 1 ? 2 : 0 })}</b></span></div></div>`;
    }
    function onItem(f) {
      const i = current();
      f.querySelector("[data-item-card]").innerHTML = card(i);
      if (i && type === "Purchase") {
        if (f.elements.unitPrice && !f.elements.unitPrice.dataset.touched) f.elements.unitPrice.value = i.price;
        if (f.elements.vendor && !f.elements.vendor.dataset.touched) f.elements.vendor.value = i.supplier || "";
      }
      calc(f);
    }
    function calc(f) {
      const box = f.querySelector("[data-calc]"); if (!box) return;
      const i = current(); const q = Number(f.elements.qty.value) || 0;
      if (!i) { box.innerHTML = ""; return; }
      if (type === "Purchase") {
        const price = Number(f.elements.unitPrice.value) || 0;
        box.innerHTML = `<span>Purchase total <b>${U.fmtMoney(q * price, { decimals: (q * price) % 1 ? 2 : 0 })}</b></span><span>Stock after purchase <b>${qty(round(Number(i.stock) + q))} ${esc(i.unit)}</b></span>`;
      } else if (type === "Consumption") {
        const after = round(Number(i.stock) - q);
        box.innerHTML = `<span>Stock after use <b class="${after < 0 ? "ki-out" : after <= Number(i.minStock) ? "ki-low" : ""}">${qty(after)} ${esc(i.unit)}</b></span>${after < 0 ? `<span class="ki-out">Exceeds available stock</span>` : after <= Number(i.minStock) ? `<span class="ki-low">Will be at or below minimum stock</span>` : ""}`;
      } else {
        const after = round(Number(i.stock) + (f.elements.dir.value === "remove" ? -q : q));
        box.innerHTML = `<span>Stock after adjustment <b class="${after < 0 ? "ki-out" : ""}">${qty(after)} ${esc(i.unit)}</b></span>${after < 0 ? `<span class="ki-out">Negative stock — requires manager override</span>` : ""}`;
      }
    }
    function toggleExpense(f) {
      if (type !== "Purchase") return;
      const on = f.elements.asExpense.checked;
      ["method", "branch"].forEach((n) => { const w = f.querySelector(`[data-field="${n}"]`); w.hidden = !on; f.elements[n].disabled = !on; });
    }

    const titleOf = { Purchase: "Stock purchase", Consumption: "Record consumption", Adjustment: "Stock adjustment" }[type];
    HH.formModal({
      title: fixed ? `${titleOf} · ${fixed.name}` : titleOf,
      icon: { Purchase: "bi-cart-plus", Consumption: "bi-basket", Adjustment: "bi-sliders" }[type],
      size: "lg", fields, values: Object.assign({}, presets),
      submitText: { Purchase: "Save purchase", Consumption: "Save consumption", Adjustment: "Save adjustment" }[type],
      onReady: (f) => {
        formEl = f;
        f.addEventListener("input", (e) => { if (e.isTrusted && e.target.name) e.target.dataset.touched = "1"; calc(f); });
        f.addEventListener("change", (e) => { if (e.target.name === "vendor" && e.isTrusted) e.target.dataset.touched = "1"; if (e.target.name === "asExpense") toggleExpense(f); calc(f); });
        if (presets.vendor && f.elements.vendor) f.elements.vendor.dataset.touched = "1";
        onItem(f); toggleExpense(f);
      },
      onSubmit: (d) => {
        const i = current();
        if (!i) return "Select a stock item.";
        const q = round(d.qty);
        if (!(q > 0)) return "Quantity must be greater than zero.";
        let delta = type === "Purchase" ? q : type === "Consumption" ? -q : d.dir === "remove" ? -q : q;
        const after = round(Number(i.stock) + delta);
        if (type === "Consumption" && q > Number(i.stock)) return `Only ${qty(i.stock)} ${i.unit} of ${i.name} in stock — consumption cannot exceed available stock.`;
        if (type === "Adjustment" && after < 0 && !d.override) return `This adjustment would make ${i.name} stock negative (${qty(after)} ${i.unit}). Tick "Authorize negative stock (manager override)" to proceed.`;
        let note = d.note || "";
        if (type === "Consumption") note = [d.usedFor, d.note].filter(Boolean).join(" · ");
        if (type === "Adjustment") note = [d.reason, d.note, after < 0 ? `MANAGER OVERRIDE: negative stock authorized by ${me()}` : ""].filter(Boolean).join(" · ");
        const tx = HH.store.insert("stockTx", {
          itemId: i.id, date: d.date, type, qty: type === "Adjustment" ? delta : q,
          unitPrice: type === "Purchase" ? Number(d.unitPrice) || 0 : Number(i.price) || 0,
          vendor: type === "Purchase" ? d.vendor : "", note, by: me(),
        });
        const patch = { stock: after };
        if (type === "Purchase") {
          patch.price = Number(d.unitPrice) || 0;
          if (!i.purchaseDate || d.date >= i.purchaseDate) patch.purchaseDate = d.date;
          if (d.expiryDate) patch.expiryDate = d.expiryDate;
        }
        HH.store.update("inventory", i.id, patch);
        let msg = `${tx.id}: ${type === "Purchase" ? "added" : type === "Consumption" ? "used" : delta > 0 ? "added" : "removed"} ${qty(Math.abs(delta))} ${i.unit} ${type === "Consumption" ? "of" : delta > 0 ? "to" : "from"} ${i.name}. Stock is now ${qty(after)} ${i.unit}.`;
        if (type === "Purchase" && d.asExpense) {
          const v = HH.store.get("vendors", d.vendor);
          const exp = HH.store.insert("expenses", {
            date: d.date, category: "Food Purchase", description: `Stock purchase — ${i.name} (${qty(q)} ${i.unit})`,
            amount: Math.round(q * (Number(d.unitPrice) || 0) * 100) / 100, vendor: v ? v.name : d.vendor, method: d.method || pmethods[0],
            attachment: null, branch: d.branch || "BR-1", status: "Pending", approvedBy: "", notes: `Linked to stock transaction ${tx.id}${d.note ? " · " + d.note : ""}`,
          });
          msg += ` Expense ${exp.id} sent for approval.`;
        }
        HH.toast(msg, "success", 5000);
        refreshAll();
        return true;
      },
    });
  }

  /* --------------------------------------------------- item history ---- */
  function txTable(list, opts = {}) {
    if (!list.length) return HH.ui.empty("No stock movements yet", "bi-clock-history");
    return `<div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>Date</th><th>Txn</th>${opts.item ? "<th>Item</th>" : ""}<th>Type</th><th class="t-right">Qty</th><th class="t-right">Value</th><th>Vendor / note</th><th>By</th></tr></thead><tbody>
      ${list.map((t) => { const i = item(t.itemId); const s = signedQty(t); return `<tr><td class="nowrap">${U.fmtDate(t.date)}</td><td class="nowrap text-2">${esc(t.id)}</td>${opts.item ? `<td>${esc(itemName(t.itemId))}</td>` : ""}<td>${HH.ui.badge(t.type, TX_TONE[t.type])}</td>
        <td class="t-right nowrap"><b class="${s < 0 ? "ki-out" : "ki-in"}">${s > 0 ? "+" : ""}${qty(s)}</b> ${esc(i ? i.unit : "")}</td><td class="t-right money">${U.fmtMoney(txValue(t))}</td>
        <td>${t.vendor ? esc(L.vendorName(t.vendor)) + (t.note ? "<br>" : "") : ""}<span class="text-2">${esc(t.note || "")}</span></td><td class="nowrap">${esc(t.by || "—")}</td></tr>`; }).join("")}
      </tbody></table></div>`;
  }
  const txFor = (id) => HH.store.all("stockTx").filter((t) => t.itemId === id).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id));

  function historyModal(id) {
    const i = item(id); if (!i) return HH.toast("Stock item not found.", "error");
    const list = txFor(id);
    const inQ = U.sum(list.filter((t) => signedQty(t) > 0), signedQty), outQ = -U.sum(list.filter((t) => signedQty(t) < 0), signedQty);
    HH.modal({
      title: `Stock history · ${i.name}`, icon: "bi-clock-history", size: "xl",
      body: `${HH.ui.kv([["Current stock", `<b>${qty(i.stock)} ${esc(i.unit)}</b>`], ["Total in", `${qty(inQ)} ${esc(i.unit)}`], ["Total out", `${qty(outQ)} ${esc(i.unit)}`], ["Transactions", list.length]], 3)}<div class="divider"></div>${txTable(list)}`,
      footer: [
        { label: "Export CSV", icon: "bi-filetype-csv", onClick: () => (list.length ? HH.exportCSV(`stock-history-${i.id}-${T}.csv`, historyPage.exportColumns(), list) : HH.toast("No transactions to export.", "warning")) },
        { label: "Open in Stock History", icon: "bi-box-arrow-up-right", onClick: (ctx) => { ctx.close(); historyPage.setFilter("itemId", i.id); tabs.set("history"); } },
        { label: "Close", cls: "btn-hh--dark", close: true },
      ],
    });
  }

  const later = (fn) => (rec, ctx) => { ctx.close(); setTimeout(() => fn(rec), 320); };

  /* ------------------------------------------------------ items page ---- */
  const itemsPage = HH.CrudPage({
    mount: "#kiItems", actionsHost: "inline", collection: "inventory", entity: "Stock Item", entityPlural: "Stock Items", icon: "bi-box-seam",
    searchPlaceholder: "Search items, category, location…",
    searchKeys: ["id", "name", "category", "location", (r) => L.vendorName(r.supplier)],
    filters: [
      { key: "category", label: "All categories", options: () => distinct("category") },
      { key: "supplier", label: "All suppliers", options: () => L.vendorOptions() },
      { key: "location", label: "All locations", options: () => distinct("location") },
      { key: "state", label: "Any stock state", options: STATES, match: matchState },
    ],
    defaultSort: { key: "name", dir: "asc" },
    columns: [
      { key: "name", label: "Item", render: (r) => `<b>${esc(r.name)}</b><span class="ki-sub">${esc(r.id)}</span>` },
      { key: "category", label: "Category", cls: "nowrap" },
      { key: "stock", label: "In Stock", value: (r) => Number(r.stock) || 0, render: stockCell, cls: "nowrap t-right", thCls: "t-right", csv: (r) => r.stock },
      { key: "minStock", label: "Min.", value: (r) => Number(r.minStock) || 0, render: (r) => qty(r.minStock), cls: "t-right", thCls: "t-right" },
      { key: "price", label: "Price / Unit", value: (r) => Number(r.price) || 0, render: (r) => `<span class="money">${U.fmtMoney(r.price, { decimals: Number(r.price) % 1 ? 2 : 0 })}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "value", label: "Value", value: (r) => C.stockValue(r), render: (r) => `<span class="money">${U.fmtMoney(C.stockValue(r))}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "supplier", label: "Supplier", value: (r) => L.vendorName(r.supplier), render: (r) => `<span class="truncate d-inline-block" style="max-width:170px">${esc(L.vendorName(r.supplier))}</span>` },
      { key: "purchaseDate", label: "Last Purchase", render: (r) => U.fmtDate(r.purchaseDate), cls: "nowrap" },
      { key: "expiryDate", label: "Expiry", value: (r) => r.expiryDate || "9999", render: expiryCell, csv: (r) => r.expiryDate, cls: "nowrap" },
      { key: "location", label: "Location", cls: "nowrap" },
      { key: "status", label: "Status", value: stockState, render: (r) => HH.ui.badge(isExpired(r) ? "Expired" : stockState(r)) + (isExpiring(r) && !isExpired(r) ? " " + HH.ui.badge("Expiring") : "") },
    ],
    csvColumns: [
      ["Item ID", "id"], ["Name", "name"], ["Category", "category"], ["Unit", "unit"], ["Current Stock", "stock"], ["Minimum Stock", "minStock"],
      ["Unit Price", "price"], ["Stock Value", C.stockValue], ["Supplier", (r) => L.vendorName(r.supplier)], ["Purchase Date", "purchaseDate"],
      ["Expiry Date", "expiryDate"], ["Location", "location"], ["Stock State", stockState], ["Expiry State", (r) => (isExpired(r) ? "Expired" : isExpiring(r) ? "Expiring" : "")], ["Notes", "notes"],
    ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] })),
    stats: (all) => {
      const low = all.filter(C.isLowStock).length, exp7 = all.filter(isExpiring).length, expired = all.filter(isExpired).length;
      return [
        { label: "Stock Items", value: U.fmtNum(all.length), icon: "bi-box-seam", tone: "blue", meta: `${distinct("category").length} categories · ${distinct("location").length} locations` },
        { label: "Inventory Valuation", value: U.fmtMoney(U.sum(all, C.stockValue)), icon: "bi-currency-rupee", tone: "green", meta: "Σ current stock × unit price" },
        { label: "Low Stock", value: low, icon: "bi-exclamation-triangle", tone: "orange", meta: "At or below minimum level", onClick: () => itemsPage.setFilter("state", "low") },
        { label: "Expiring ≤ 7 Days", value: exp7, icon: "bi-hourglass-split", tone: "yellow", meta: "Use or replace soon", onClick: () => itemsPage.setFilter("state", "expiring") },
        { label: "Expired", value: expired, icon: "bi-x-octagon", tone: "red", meta: "Write off or replace", onClick: () => itemsPage.setFilter("state", "expired") },
      ];
    },
    fields: (rec) => [
      { type: "section", label: "Item details", icon: "bi-box-seam" },
      { name: "name", label: "Item name", required: true, col: 6, maxlength: 60, placeholder: "e.g. Basmati Rice",
        validate: (v) => { const dup = HH.store.all("inventory").find((x) => x.name.trim().toLowerCase() === v.trim().toLowerCase() && (!rec || x.id !== rec.id)); return dup ? `An item named "${dup.name}" already exists (${dup.id}).` : ""; } },
      { name: "category", label: "Category", required: true, col: 3, maxlength: 40, placeholder: "e.g. Grains" },
      { name: "unit", label: "Unit", type: "select", required: true, col: 3, options: rec && rec.unit && !UNITS.includes(rec.unit) ? UNITS.concat(rec.unit) : UNITS },
      { type: "section", label: "Stock & pricing", icon: "bi-currency-rupee" },
      { name: "stock", label: rec ? "Current stock" : "Opening stock", type: "number", required: true, col: 4, min: 0, step: "any", readonly: !!rec,
        help: rec ? "Change stock with Purchase, Consume or Adjust so every movement is logged." : "Logged as an opening-stock adjustment." },
      { name: "minStock", label: "Minimum stock (reorder level)", type: "number", required: true, col: 4, min: 0, step: "any" },
      { name: "price", label: "Purchase price / unit (₹)", type: "number", required: true, col: 4, min: 0, step: "any" },
      { name: "supplier", label: "Supplier", type: "select", required: true, col: 6, options: L.vendorOptions(), help: "Manage suppliers in the Vendors tab." },
      { name: "location", label: "Storage location", required: true, col: 6, maxlength: 40, placeholder: "e.g. Dry Store" },
      { name: "purchaseDate", label: "Purchase date", type: "date", col: 6, max: T },
      { name: "expiryDate", label: "Expiry date", type: "date", col: 6, validate: (v, vals) => (vals.purchaseDate && v < vals.purchaseDate ? "Expiry date cannot be before the purchase date." : "") },
      { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12, maxlength: 300 },
    ],
    formSize: "lg",
    defaults: () => ({ unit: "kg", stock: 0, minStock: 5, purchaseDate: T, location: "Main Store" }),
    onFormReady: (f) => { addDatalist(f, "category", distinct("category")); addDatalist(f, "location", distinct("location")); },
    beforeSave: (d, prev) => {
      ["stock", "minStock", "price"].forEach((k) => (d[k] = Number(d[k]) || 0));
      if (prev) d.stock = prev.stock; // stock only changes through logged transactions
      d.notes = d.notes || "";
    },
    afterSave: (saved, isNew) => {
      if (isNew && Number(saved.stock) > 0) HH.store.insert("stockTx", { itemId: saved.id, date: saved.purchaseDate || T, type: "Adjustment", qty: Number(saved.stock), unitPrice: Number(saved.price) || 0, vendor: "", note: "Opening stock", by: me() });
      historyPage.setFilter("itemId", historyPage.state.filters.itemId || "");
      refreshAll(true);
    },
    deleteMessage: (r) => `Delete <b>${esc(r.name)}</b> (${r.id})? ${Number(r.stock) > 0 ? `It still has <b>${qty(r.stock)} ${esc(r.unit)}</b> in stock (${U.fmtMoney(C.stockValue(r))}). ` : ""}Its stock history is kept for audit.`,
    afterDelete: () => refreshAll(true),
    view: (r) => {
      const flags = [];
      if (Number(r.stock) <= 0) flags.push(`<div class="alert-hh tone-red"><i class="bi bi-x-octagon"></i><span><b>Out of stock.</b> Reorder from ${esc(L.vendorName(r.supplier))}.</span><span></span></div>`);
      else if (C.isLowStock(r)) flags.push(`<div class="alert-hh tone-orange"><i class="bi bi-exclamation-triangle"></i><span><b>Low stock</b> — ${qty(r.stock)} ${esc(r.unit)} left, minimum is ${qty(r.minStock)}. Suggested order: ${qty(suggestQty(r))} ${esc(r.unit)}.</span><span></span></div>`);
      if (isExpired(r)) flags.push(`<div class="alert-hh tone-red"><i class="bi bi-hourglass-bottom"></i><span><b>Expired</b> on ${U.fmtDate(r.expiryDate)}. Write it off with a stock adjustment.</span><span></span></div>`);
      else if (isExpiring(r)) flags.push(`<div class="alert-hh tone-yellow"><i class="bi bi-hourglass-split"></i><span><b>Expiring</b> on ${U.fmtDate(r.expiryDate)} (${daysLeft(r)} day(s)).</span><span></span></div>`);
      return `<div class="stack">${flags.join("")}
        ${HH.ui.kv([
          ["Item", `<b>${esc(r.name)}</b>`], ["Category", esc(r.category)], ["Current stock", stockCell(r)], ["Minimum stock", `${qty(r.minStock)} ${esc(r.unit)}`],
          ["Unit price", U.fmtMoney(r.price, { decimals: Number(r.price) % 1 ? 2 : 0 })], ["Stock value", `<b>${U.fmtMoney(C.stockValue(r))}</b>`],
          ["Supplier", esc(L.vendorName(r.supplier))], ["Location", esc(r.location)], ["Last purchase", U.fmtDate(r.purchaseDate)], ["Expiry", expiryCell(r)],
          ["Status", HH.ui.badge(stockState(r))], ["Notes", esc(r.notes || ""), true],
        ])}
        <div class="section-title">Recent stock movements</div>${txTable(txFor(r.id).slice(0, 8))}</div>`;
    },
    viewSize: "xl",
    viewFooter: () => [
      { label: "Stock history", icon: "bi-clock-history", onClick: later((r) => historyModal(r.id)) },
      { label: "Adjust", icon: "bi-sliders", onClick: later((r) => stockDialog("Adjustment", r.id)) },
      { label: "Consume", icon: "bi-basket", onClick: later((r) => stockDialog("Consumption", r.id)) },
      { label: "Purchase", icon: "bi-cart-plus", cls: "btn-hh--green", onClick: later((r) => stockDialog("Purchase", r.id, { qty: C.isLowStock(r) ? suggestQty(r) : "" })) },
    ],
    actions: [
      { label: "Purchase stock", icon: "bi-cart-plus", handler: (r) => stockDialog("Purchase", r.id, { qty: C.isLowStock(r) ? suggestQty(r) : "" }) },
      { label: "Record consumption", icon: "bi-basket", handler: (r) => stockDialog("Consumption", r.id) },
      { label: "Adjust stock", icon: "bi-sliders", handler: (r) => stockDialog("Adjustment", r.id) },
      { label: "Stock history", icon: "bi-clock-history", handler: (r) => historyModal(r.id) },
    ],
    rowCls: (r) => (isExpired(r) || Number(r.stock) <= 0 ? "ki-row-red" : C.isLowStock(r) ? "ki-row-orange" : ""),
    footerRow: (rows) => `<tr><td colspan="5">Total · ${rows.length} item(s)</td><td class="t-right money">${U.fmtMoney(U.sum(rows, C.stockValue))}</td><td colspan="6"></td></tr>`,
    exportName: "inventory", printTitle: "Stock Items",
  });

  /* --------------------------------------------------- history page ---- */
  const historyPage = HH.CrudPage({
    mount: "#kiHistory", actionsHost: "inline", collection: "stockTx", entity: "Stock Transaction", entityPlural: "Stock Transactions", tableId: "-ki",
    noAdd: true, noEdit: true, noDelete: true, deepLinks: false, viewIcon: "bi-clock-history",
    searchPlaceholder: "Search item, note, user, vendor…",
    searchKeys: ["id", (r) => itemName(r.itemId), "note", "by", (r) => (r.vendor ? L.vendorName(r.vendor) : "")],
    filters: [
      { key: "type", label: "All types", options: TX_TYPES },
      { key: "itemId", label: "All items", options: () => itemOptions(false) },
      { key: "vendor", label: "All vendors", options: () => L.vendorOptions() },
    ],
    dateFilter: { key: "date", label: "Date" },
    defaultSort: { key: "date", dir: "desc" },
    columns: [
      { key: "date", label: "Date", value: (r) => r.date + r.id, render: (r) => U.fmtDate(r.date), cls: "nowrap", csv: (r) => r.date },
      { key: "id", label: "Txn ID", cls: "nowrap text-2" },
      { key: "itemId", label: "Item", value: (r) => itemName(r.itemId), render: (r) => `<b>${esc(itemName(r.itemId))}</b><span class="ki-sub">${esc(r.itemId)}</span>` },
      { key: "type", label: "Type", render: (r) => HH.ui.badge(r.type, TX_TONE[r.type]) },
      { key: "qty", label: "Quantity", value: signedQty, render: (r) => { const s = signedQty(r); const i = item(r.itemId); return `<b class="${s < 0 ? "ki-out" : "ki-in"}">${s > 0 ? "+" : ""}${qty(s)}</b> ${esc(i ? i.unit : "")}`; }, cls: "t-right nowrap", thCls: "t-right" },
      { key: "unitPrice", label: "Unit Price", value: (r) => Number(r.unitPrice) || 0, render: (r) => `<span class="money">${U.fmtMoney(r.unitPrice, { decimals: Number(r.unitPrice) % 1 ? 2 : 0 })}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "value", label: "Value", value: txValue, render: (r) => `<span class="money">${U.fmtMoney(txValue(r))}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "vendor", label: "Vendor", value: (r) => (r.vendor ? L.vendorName(r.vendor) : ""), render: (r) => (r.vendor ? esc(L.vendorName(r.vendor)) : `<span class="text-3">—</span>`) },
      { key: "note", label: "Note", render: (r) => `<span class="truncate d-inline-block" style="max-width:220px" title="${esc(r.note || "")}">${esc(r.note || "—")}</span>` },
      { key: "by", label: "By", cls: "nowrap" },
    ],
    stats: (all) => {
      const m = U.range("month"); const mo = all.filter((t) => U.inRange(t.date, m));
      const pur = mo.filter((t) => t.type === "Purchase"), con = mo.filter((t) => t.type === "Consumption"), adj = mo.filter((t) => t.type === "Adjustment");
      return [
        { label: "Purchases This Month", value: U.fmtMoney(U.sum(pur, txValue)), icon: "bi-cart-check", tone: "green", meta: `${pur.length} purchase entries`, onClick: () => historyPage.setFilter("type", "Purchase") },
        { label: "Consumed This Month", value: U.fmtMoney(U.sum(con, txValue)), icon: "bi-basket", tone: "blue", meta: `${con.length} consumption entries`, onClick: () => historyPage.setFilter("type", "Consumption") },
        { label: "Adjustments This Month", value: adj.length, icon: "bi-sliders", tone: "orange", meta: `${adj.filter((t) => /OVERRIDE/.test(t.note || "")).length} manager override(s)`, onClick: () => historyPage.setFilter("type", "Adjustment") },
        { label: "Total Transactions", value: U.fmtNum(all.length), icon: "bi-clock-history", tone: "purple", meta: "All recorded stock movements" },
      ];
    },
    view: (r) => HH.ui.kv([
      ["Transaction", esc(r.id)], ["Date", U.fmtDate(r.date)], ["Item", `${esc(itemName(r.itemId))} <span class="text-3">${esc(r.itemId)}</span>`], ["Type", HH.ui.badge(r.type, TX_TONE[r.type])],
      ["Quantity", `${signedQty(r) > 0 ? "+" : ""}${qty(signedQty(r))} ${esc((item(r.itemId) || {}).unit || "")}`], ["Unit price", U.fmtMoney(r.unitPrice, { decimals: 2 })],
      ["Value", `<b>${U.fmtMoney(txValue(r), { decimals: txValue(r) % 1 ? 2 : 0 })}</b>`], ["Vendor", r.vendor ? esc(L.vendorName(r.vendor)) : "—"], ["Recorded by", esc(r.by || "—")], ["Note", esc(r.note || ""), true],
    ]),
    viewFooter: (r) => (item(r.itemId) ? [{ label: "Open item", icon: "bi-box-seam", onClick: later((x) => itemsPage.openView(x.itemId)) }] : []),
    toolbarButtons: [
      { label: "Adjust", icon: "bi-sliders", handler: () => stockDialog("Adjustment") },
      { label: "Consume", icon: "bi-basket", handler: () => stockDialog("Consumption") },
      { label: "Purchase", icon: "bi-cart-plus", cls: "btn-hh--primary", handler: () => stockDialog("Purchase") },
    ],
    csvColumns: [
      ["Txn ID", "id"], ["Date", "date"], ["Item ID", "itemId"], ["Item", (r) => itemName(r.itemId)], ["Type", "type"], ["Quantity", signedQty],
      ["Unit", (r) => (item(r.itemId) || {}).unit || ""], ["Unit Price", "unitPrice"], ["Value", txValue], ["Vendor", (r) => (r.vendor ? L.vendorName(r.vendor) : "")], ["Note", "note"], ["By", "by"],
    ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] })),
    exportName: "stock-history", printTitle: "Stock History",
  });

  /* --------------------------------------------------- vendors page ---- */
  const vendorItems = (vid) => HH.store.all("inventory").filter((i) => i.supplier === vid);
  const vendorTotal = (vid, range) => U.sum(vendorPurchases(vid).filter((t) => !range || U.inRange(t.date, range)), txValue);
  const lastPurchase = (vid) => vendorPurchases(vid).reduce((m, t) => (t.date > m ? t.date : m), "");
  const vendorsPage = HH.CrudPage({
    mount: "#kiVendors", actionsHost: "inline", collection: "vendors", entity: "Vendor", icon: "bi-truck", deepLinks: false,
    searchPlaceholder: "Search vendors, category, phone…",
    searchKeys: ["id", "name", "category", "phone", "email", "address"],
    filters: [{ key: "category", label: "All categories", options: () => [...new Set(HH.store.all("vendors").map((v) => v.category).filter(Boolean))].sort() }],
    defaultSort: { key: "purchases", dir: "desc" },
    columns: [
      { key: "name", label: "Vendor", render: (r) => `<b>${esc(r.name)}</b><span class="ki-sub">${esc(r.id)}</span>` },
      { key: "category", label: "Category", cls: "nowrap" },
      { key: "phone", label: "Phone", cls: "nowrap" },
      { key: "email", label: "Email", render: (r) => (r.email ? `<a class="link-hh" href="mailto:${esc(r.email)}">${esc(r.email)}</a>` : "—") },
      { key: "items", label: "Items Supplied", value: (r) => vendorItems(r.id).length, cls: "t-right", thCls: "t-right" },
      { key: "purchases", label: "Total Purchases", value: (r) => vendorTotal(r.id), render: (r) => `<span class="money">${U.fmtMoney(vendorTotal(r.id))}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "month", label: "This Month", value: (r) => vendorTotal(r.id, U.range("month")), render: (r) => `<span class="money">${U.fmtMoney(vendorTotal(r.id, U.range("month")))}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "last", label: "Last Purchase", value: (r) => lastPurchase(r.id), render: (r) => U.fmtDate(lastPurchase(r.id)), cls: "nowrap" },
    ],
    csvColumns: [["Vendor ID", "id"], ["Name", "name"], ["Category", "category"], ["Phone", "phone"], ["Email", "email"], ["Address", "address"],
      ["Items Supplied", (r) => vendorItems(r.id).length], ["Total Purchases", (r) => vendorTotal(r.id)], ["This Month", (r) => vendorTotal(r.id, U.range("month"))], ["Last Purchase", lastPurchase]]
      .map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] })),
    stats: (all) => {
      const m = U.range("month");
      const totals = all.map((v) => ({ v, t: vendorTotal(v.id, m) })).sort((a, b) => b.t - a.t);
      return [
        { label: "Vendors", value: all.length, icon: "bi-truck", tone: "blue", meta: `${all.filter((v) => vendorItems(v.id).length).length} supplying stock items` },
        { label: "Purchases This Month", value: U.fmtMoney(U.sum(totals, (x) => x.t)), icon: "bi-cart-check", tone: "green", meta: "From stock purchase entries" },
        { label: "Top Vendor (Month)", value: totals[0] && totals[0].t ? esc(totals[0].v.name) : "—", icon: "bi-trophy", tone: "yellow", meta: totals[0] && totals[0].t ? U.fmtMoney(totals[0].t) : "No purchases yet" },
      ];
    },
    fields: (rec) => [
      { name: "name", label: "Vendor name", required: true, col: 8, maxlength: 80,
        validate: (v) => { const dup = HH.store.all("vendors").find((x) => x.name.trim().toLowerCase() === v.trim().toLowerCase() && (!rec || x.id !== rec.id)); return dup ? `Vendor "${dup.name}" already exists (${dup.id}).` : ""; } },
      { name: "category", label: "Category", required: true, col: 4, maxlength: 40, placeholder: "e.g. Vegetables" },
      { name: "phone", label: "Phone", type: "tel", required: true, col: 6, placeholder: "98470 12345" },
      { name: "email", label: "Email", type: "email", col: 6, placeholder: "orders@vendor.com" },
      { name: "address", label: "Address", type: "textarea", rows: 2, col: 12, maxlength: 200 },
    ],
    formSize: "lg",
    onFormReady: (f) => addDatalist(f, "category", [...new Set(HH.store.all("vendors").map((v) => v.category).filter(Boolean))].sort()),
    beforeDelete: (r) => {
      const used = vendorItems(r.id);
      return used.length ? `Cannot delete ${r.name}: it is the supplier of ${used.length} stock item(s) (${used.slice(0, 3).map((i) => i.name).join(", ")}${used.length > 3 ? "…" : ""}). Assign another supplier first.` : undefined;
    },
    deleteMessage: (r) => `Delete vendor <b>${esc(r.name)}</b>? Past purchase entries keep the vendor ID for audit.`,
    afterSave: () => refreshAll(true), afterDelete: () => refreshAll(true),
    view: (r) => {
      const items = vendorItems(r.id);
      const recent = vendorPurchases(r.id).sort((a, b) => (b.date + b.id).localeCompare(a.date + a.id)).slice(0, 8);
      return `<div class="stack">${HH.ui.kv([["Vendor", `<b>${esc(r.name)}</b>`], ["Category", esc(r.category)], ["Phone", esc(r.phone)], ["Email", esc(r.email || "")],
        ["Total purchases", `<b>${U.fmtMoney(vendorTotal(r.id))}</b>`], ["Last purchase", U.fmtDate(lastPurchase(r.id))], ["Address", esc(r.address || ""), true]])}
        <div class="section-title">Items supplied (${items.length})</div>
        ${items.length ? `<div class="row-flex">${items.map((i) => `<span class="badge-hh tone-${C.isLowStock(i) ? "orange" : "gray"}">${esc(i.name)} · ${qty(i.stock)} ${esc(i.unit)}</span>`).join("")}</div>` : `<p class="text-2">No stock items use this vendor as supplier.</p>`}
        <div class="section-title">Recent purchases</div>${txTable(recent, { item: true })}</div>`;
    },
    viewSize: "xl",
    viewFooter: () => [
      { label: "All purchases", icon: "bi-clock-history", onClick: (r, ctx) => { ctx.close(); historyPage.setFilter("vendor", r.id); tabs.set("history"); } },
      { label: "New purchase", icon: "bi-cart-plus", cls: "btn-hh--green", onClick: later((r) => stockDialog("Purchase", null, { vendor: r.id })) },
    ],
    actions: [
      { label: "Purchase history", icon: "bi-clock-history", handler: (r) => { historyPage.setFilter("vendor", r.id); tabs.set("history"); } },
      { label: "New purchase", icon: "bi-cart-plus", handler: (r) => stockDialog("Purchase", null, { vendor: r.id }) },
    ],
    exportName: "vendors", printTitle: "Vendors",
  });

  /* ---------------------------------------------------------- alerts ---- */
  const lowItems = () => HH.store.all("inventory").filter(C.isLowStock).sort((a, b) => Number(a.stock) / (Number(a.minStock) || 1) - Number(b.stock) / (Number(b.minStock) || 1));
  const expItems = () => HH.store.all("inventory").filter((i) => isExpired(i) || isExpiring(i)).sort((a, b) => a.expiryDate.localeCompare(b.expiryDate));
  const alertCount = () => new Set([...lowItems(), ...expItems()].map((i) => i.id)).size;
  const lowCols = [
    { key: "name", label: "Item", render: (r) => `<b>${esc(r.name)}</b><span class="ki-sub">${esc(r.category)}</span>`, csv: (r) => r.name },
    { key: "stock", label: "In Stock", value: (r) => Number(r.stock), render: stockCell, cls: "nowrap t-right", thCls: "t-right", csv: (r) => r.stock },
    { key: "minStock", label: "Minimum", value: (r) => Number(r.minStock), render: (r) => `${qty(r.minStock)} ${esc(r.unit)}`, cls: "nowrap t-right", thCls: "t-right" },
    { key: "short", label: "Shortfall", value: (r) => Math.max(0, round(r.minStock - r.stock)), render: (r) => `${qty(Math.max(0, round(r.minStock - r.stock)))} ${esc(r.unit)}`, cls: "nowrap t-right", thCls: "t-right" },
    { key: "suggest", label: "Suggested Order", value: suggestQty, render: (r) => `<b>${qty(suggestQty(r))}</b> ${esc(r.unit)}`, cls: "nowrap t-right", thCls: "t-right" },
    { key: "cost", label: "Est. Cost", value: (r) => suggestQty(r) * (Number(r.price) || 0), render: (r) => `<span class="money">${U.fmtMoney(suggestQty(r) * (Number(r.price) || 0))}</span>`, cls: "t-right", thCls: "t-right" },
    { key: "supplier", label: "Supplier", value: (r) => L.vendorName(r.supplier) },
    { key: "act", label: "", sortable: false, csv: false, render: (r) => `<button type="button" class="btn-hh btn-hh--sm btn-hh--primary" data-reorder="${esc(r.id)}"><i class="bi bi-cart-plus"></i>Reorder</button>`, cls: "t-right nowrap" },
  ];
  const expCols = [
    { key: "name", label: "Item", render: (r) => `<b>${esc(r.name)}</b><span class="ki-sub">${esc(r.category)} · ${esc(r.location || "")}</span>`, csv: (r) => r.name },
    { key: "stock", label: "In Stock", value: (r) => Number(r.stock), render: stockCell, cls: "nowrap t-right", thCls: "t-right", csv: (r) => r.stock },
    { key: "expiryDate", label: "Expiry", render: expiryCell, csv: (r) => r.expiryDate },
    { key: "state", label: "Status", value: (r) => (isExpired(r) ? "Expired" : "Expiring"), render: (r) => HH.ui.badge(isExpired(r) ? "Expired" : "Expiring") },
    { key: "risk", label: "Value at Risk", value: C.stockValue, render: (r) => `<span class="money">${U.fmtMoney(C.stockValue(r))}</span>`, cls: "t-right", thCls: "t-right" },
    { key: "act", label: "", sortable: false, csv: false, cls: "t-right nowrap",
      render: (r) => `${Number(r.stock) > 0 ? `<button type="button" class="btn-hh btn-hh--sm" data-writeoff="${esc(r.id)}"><i class="bi bi-trash3"></i>Write off</button> ` : ""}<button type="button" class="btn-hh btn-hh--sm btn-hh--primary" data-reorder="${esc(r.id)}"><i class="bi bi-cart-plus"></i>Reorder</button>` },
  ];
  const csvOf = (cols) => cols.filter((c) => c.csv !== false).map((c) => ({ label: c.label, value: c.csv || ((r) => (c.value ? c.value(r) : r[c.key])) }));
  const alertsEl = document.getElementById("kiAlerts");
  alertsEl.innerHTML = `
    <section class="card-hh card-hh--flush">
      <div class="card-hh__head"><span class="chip-icon tone-orange"><i class="bi bi-exclamation-triangle"></i></span><div><h2 class="card-hh__title">Low stock</h2><div class="card-hh__sub">Items at or below their minimum stock level</div></div>
        <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--sm" data-exp-csv="low"><i class="bi bi-filetype-csv"></i>Export</button><button type="button" class="btn-hh btn-hh--sm" data-exp-print="low"><i class="bi bi-printer"></i>Print</button></div></div>
      <div data-low></div></section>
    <section class="card-hh card-hh--flush">
      <div class="card-hh__head"><span class="chip-icon tone-red"><i class="bi bi-hourglass-split"></i></span><div><h2 class="card-hh__title">Expiry alerts</h2><div class="card-hh__sub">Expired items and items expiring within 7 days</div></div>
        <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--sm" data-exp-csv="exp"><i class="bi bi-filetype-csv"></i>Export</button><button type="button" class="btn-hh btn-hh--sm" data-exp-print="exp"><i class="bi bi-printer"></i>Print</button></div></div>
      <div data-exp></div></section>`;
  const lowTable = new HH.Table(alertsEl.querySelector("[data-low]"), { id: "ki-low", columns: lowCols, rows: [], paginate: false, compact: true, onRowClick: (r) => itemsPage.openView(r.id), empty: "No low-stock items", emptySub: "Every item is above its minimum level." });
  const expTable = new HH.Table(alertsEl.querySelector("[data-exp]"), { id: "ki-exp", columns: expCols, rows: [], paginate: false, compact: true, onRowClick: (r) => itemsPage.openView(r.id), empty: "No expiry alerts", emptySub: "Nothing is expired or expiring this week." });
  alertsEl.addEventListener("click", (e) => {
    const ro = e.target.closest("[data-reorder]");
    if (ro) { const i = item(ro.dataset.reorder); return stockDialog("Purchase", i.id, { qty: suggestQty(i), note: "Reorder" }); }
    const wo = e.target.closest("[data-writeoff]");
    if (wo) { const i = item(wo.dataset.writeoff); return stockDialog("Adjustment", i.id, { dir: "remove", qty: i.stock, reason: "Expired write-off" }); }
    const cs = e.target.closest("[data-exp-csv]");
    if (cs) { const low = cs.dataset.expCsv === "low"; const rows = low ? lowTable.sortedRows() : expTable.sortedRows(); return rows.length ? HH.exportCSV(`${low ? "low-stock" : "expiry-alerts"}-${T}.csv`, csvOf(low ? lowCols : expCols), rows) : HH.toast("Nothing to export.", "warning"); }
    const pr = e.target.closest("[data-exp-print]");
    if (pr) { const low = pr.dataset.expPrint === "low"; HH.printTable(low ? "Low Stock Report" : "Expiry Alerts", csvOf(low ? lowCols : expCols), low ? lowTable.sortedRows() : expTable.sortedRows(), U.fmtDate(T)); }
  });
  function renderAlerts() {
    lowTable.setRows(lowItems(), true); expTable.setRows(expItems(), true);
    const b = root.querySelector('[data-tabs] [data-tab="alerts"] .badge-hh');
    const n = alertCount();
    if (b) { b.textContent = n; b.className = `badge-hh tone-${n ? "red" : "gray"}`; }
  }

  /* ------------------------------------------------------------ tabs ---- */
  function refreshAll(skipSelf) {
    itemsPage.refresh(); historyPage.refresh(); vendorsPage.refresh(); renderAlerts();
  }
  const tabs = HH.ui.tabs(root.querySelector("[data-tabs]"), [
    { key: "items", label: "Stock Items", icon: "bi-box-seam" },
    { key: "history", label: "Stock History", icon: "bi-clock-history" },
    { key: "vendors", label: "Vendors", icon: "bi-truck" },
    { key: "alerts", label: "Alerts", icon: "bi-bell", count: alertCount() },
  ], (k) => { HH.ui.panels(root, k); if (k === "alerts") renderAlerts(); }, { hash: true });
  renderAlerts();

  // Header actions
  const actions = document.getElementById("pageActions");
  actions.innerHTML = `<button type="button" class="btn-hh" data-hdr="consume"><i class="bi bi-basket"></i><span>Record Consumption</span></button>
    <button type="button" class="btn-hh btn-hh--primary" data-hdr="purchase"><i class="bi bi-cart-plus"></i><span>Purchase Stock</span></button>`;
  actions.addEventListener("click", (e) => {
    const b = e.target.closest("[data-hdr]"); if (!b) return;
    stockDialog(b.dataset.hdr === "purchase" ? "Purchase" : "Consumption");
  });

  // Deep links handled outside CrudPage: ?action=purchase|consume|adjust[&item=ITM-…], ?view=STX-…|VEN-…
  setTimeout(() => {
    const act = U.qs("action"), it = U.qs("item"), v = U.qs("view");
    const map = { purchase: "Purchase", consume: "Consumption", consumption: "Consumption", adjust: "Adjustment" };
    if (map[act]) { stockDialog(map[act], it && item(it) ? it : null); U.setQS({ action: null, item: null }); }
    if (v && HH.store.get("stockTx", v)) { tabs.set("history"); historyPage.openView(v); U.setQS({ view: null }); }
    if (v && HH.store.get("vendors", v)) { tabs.set("vendors"); vendorsPage.openView(v); U.setQS({ view: null }); }
  }, 80);

  window.addEventListener("hh:datachange", (e) => { if (e.detail.external) renderAlerts(); });
})();
