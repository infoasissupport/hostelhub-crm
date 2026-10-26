/* ==========================================================================
   HostelHub — Toasts and in-app notification centre
   HH.toast(message, type = 'success'|'error'|'info'|'warning', ms)
   HH.notifications.list()  -> generated from live data (low stock, overdue…)
   HH.notifications.render() refreshes the header bell
   No real e-mail / SMS / WhatsApp is ever sent — everything is in-app.
   ========================================================================== */
(function () {
  "use strict";
  const HH = (window.HH = window.HH || {});

  /* ----------------------------------------------------------- toast ---- */
  const ICONS = { success: "bi-check2-circle", error: "bi-x-octagon", info: "bi-info-circle", warning: "bi-exclamation-triangle" };
  HH.toast = function (message, type = "success", ms = 3600) {
    let stack = document.querySelector(".toast-stack");
    if (!stack) { stack = document.createElement("div"); stack.className = "toast-stack"; stack.setAttribute("aria-live", "polite"); document.body.appendChild(stack); }
    const t = document.createElement("div");
    t.className = `toast-hh toast-hh--${type}`;
    t.setAttribute("role", type === "error" ? "alert" : "status");
    t.innerHTML = `<span class="toast-hh__icon"><i class="bi ${ICONS[type] || ICONS.info}"></i></span><span>${message}</span><button type="button" aria-label="Dismiss"><i class="bi bi-x-lg"></i></button>`;
    const kill = () => { t.classList.add("is-leaving"); setTimeout(() => t.remove(), 220); };
    t.querySelector("button").addEventListener("click", kill);
    stack.appendChild(t);
    setTimeout(kill, ms);
    while (stack.children.length > 4) stack.firstChild.remove();
  };

  /* --------------------------------------------------- notifications ---- */
  const U = () => HH.util;
  const page = (p) => HH.util.page(p);

  function list() {
    const s = HH.store.settings();
    const prefs = s.notifications || {};
    const out = [];
    const today = U().todayISO();

    if (prefs.notices !== false) {
      HH.store.all("notices").filter((n) => n.status === "Published" && !n.read && (!n.expiryDate || n.expiryDate >= today))
        .forEach((n) => out.push({ id: `notice:${n.id}`, icon: "bi-megaphone", tone: "blue", title: n.title, text: `${n.category} notice · ${HH.lookup.branchName(n.branch)}`, href: page(`pages/notices.html?view=${n.id}`), date: n.publishDate }));
    }
    if (prefs.lowStock !== false) {
      HH.store.all("inventory").filter(HH.calc.isLowStock)
        .forEach((i) => out.push({ id: `low:${i.id}:${i.stock}`, icon: "bi-box-seam", tone: "orange", title: `Low stock: ${i.name}`, text: `${i.stock} ${i.unit} left (minimum ${i.minStock})`, href: page(`pages/kitchen-inventory.html?view=${i.id}`), date: today }));
    }
    if (prefs.expiry !== false) {
      HH.store.all("inventory").filter((i) => { const d = HH.calc.expiresInDays(i); return d <= 7 && Number(i.stock) > 0; })
        .forEach((i) => { const d = HH.calc.expiresInDays(i); out.push({ id: `exp:${i.id}:${i.expiryDate}`, icon: "bi-hourglass-split", tone: "red", title: `${d < 0 ? "Expired" : "Expiring soon"}: ${i.name}`, text: d < 0 ? `Expired on ${U().fmtDate(i.expiryDate)}` : `Expires in ${d} day(s)`, href: page(`pages/kitchen-inventory.html?view=${i.id}`), date: today }); });
    }
    if (prefs.maintenance !== false) {
      HH.store.all("maintenance").filter(HH.calc.isOverdueTicket)
        .forEach((t) => out.push({ id: `mt:${t.id}`, icon: "bi-tools", tone: "red", title: `Overdue ticket: ${t.title}`, text: `${HH.lookup.roomLabel(t.roomId)} · due ${U().fmtDate(t.dueDate)}`, href: page(`pages/maintenance.html?view=${t.id}`), date: t.dueDate }));
    }
    if (prefs.complaints !== false) {
      HH.store.all("complaints").filter((c) => c.status === "Open" && ["High", "Critical"].includes(c.priority))
        .forEach((c) => out.push({ id: `cmp:${c.id}`, icon: "bi-chat-left-text", tone: "purple", title: `High priority complaint`, text: `${c.subject} — ${HH.lookup.residentName(c.residentId)}`, href: page(`pages/complaints.html?view=${c.id}`), date: c.createdAt }));
    }
    if (prefs.fees !== false) {
      const overdue = HH.calc.openInvoices().filter((i) => i.dueDate < today);
      if (overdue.length) {
        const amt = U().sum(overdue, (i) => HH.calc.invoiceTotals(i).balance);
        out.push({ id: `fees:${today}:${overdue.length}`, icon: "bi-currency-rupee", tone: "red", title: `${overdue.length} overdue invoices`, text: `${U().fmtMoney(amt)} outstanding past due date`, href: page("pages/fees-payments.html#outstanding"), date: today });
      }
      const pend = HH.store.all("expenses").filter((e) => e.status === "Pending");
      if (pend.length) out.push({ id: `expa:${pend.map((e) => e.id).join(",")}`, icon: "bi-receipt", tone: "yellow", title: `${pend.length} expense(s) awaiting approval`, text: U().fmtMoney(U().sum(pend, (e) => e.amount)), href: page("pages/expenses.html#pending"), date: today });
    }
    if (prefs.visitors !== false) {
      const inside = HH.store.all("visitors").filter((v) => !v.checkOut);
      if (inside.length) out.push({ id: `vis:${today}:${inside.length}`, icon: "bi-person-badge", tone: "green", title: `${inside.length} visitor(s) currently inside`, text: "Remember to record check-out", href: page("pages/visitors.html#inside"), date: today });
    }
    const read = HH.store.pref("notifRead", {});
    out.forEach((n) => (n.read = !!read[n.id]));
    return out.sort((a, b) => Number(a.read) - Number(b.read) || String(b.date).localeCompare(String(a.date)));
  }

  function markRead(ids) {
    const read = Object.assign({}, HH.store.pref("notifRead", {}));
    ids.forEach((id) => (read[id] = true));
    HH.store.setPref("notifRead", read);
  }

  function render() {
    const panel = document.getElementById("notifList");
    const badge = document.getElementById("notifCount");
    if (!panel || !badge) return;
    const items = list();
    const unread = items.filter((n) => !n.read).length;
    badge.textContent = unread ? (unread > 99 ? "99+" : unread) : "";
    document.getElementById("notifSummary").textContent = unread ? `${unread} unread` : "All caught up";
    panel.innerHTML = items.length ? items.slice(0, 30).map((n) => `
      <a class="notif-item ${n.read ? "is-read" : ""}" href="${n.href}" data-notif="${HH.util.esc(n.id)}">
        <span class="notif-item__icon tone-${n.tone}"><i class="bi ${n.icon}"></i></span>
        <span style="min-width:0"><span class="notif-item__title d-block">${HH.util.esc(n.title)}</span><span class="notif-item__text d-block">${HH.util.esc(n.text)}</span></span>
        <span class="notif-item__dot"></span></a>`).join("") : HH.ui.empty("No notifications", "bi-bell-slash", "You're all caught up.");
  }

  function init() {
    const panel = document.getElementById("notifList");
    if (!panel) return;
    panel.addEventListener("click", (e) => {
      const a = e.target.closest("[data-notif]");
      if (a) markRead([a.dataset.notif]);
    });
    document.getElementById("notifMarkAll").addEventListener("click", (e) => {
      e.preventDefault(); e.stopPropagation();
      markRead(list().map((n) => n.id));
      render();
      HH.toast("All notifications marked as read.", "info");
    });
    render();
    window.addEventListener("hh:datachange", HH.util.debounce(render, 250));
  }

  HH.notifications = { list, render, init, markRead };
})();
