/* ==========================================================================
   HostelHub — Notices & Communication
   Tabs: #all · #published · #draft · #archived
   No e-mail / SMS / WhatsApp is ever sent — delivery is simulated in demo mode.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const CATEGORIES = ["General", "Mess", "Fees", "Maintenance", "Event", "Rules", "Emergency"];
  const AUDIENCES = ["All", "Residents", "Staff", "Wardens"];
  const STATUSES = ["Draft", "Published", "Unpublished", "Archived"];
  const CAT_TONE = { General: "navy", Mess: "yellow", Fees: "green", Maintenance: "orange", Event: "pink", Rules: "purple", Emergency: "red" };
  const CAT_ICON = { General: "bi-info-circle", Mess: "bi-egg-fried", Fees: "bi-currency-rupee", Maintenance: "bi-tools", Event: "bi-balloon", Rules: "bi-journal-text", Emergency: "bi-exclamation-triangle" };
  const today = () => U.todayISO();
  const expired = (n) => n.expiryDate && n.expiryDate < today();
  const scheduled = (n) => n.status === "Published" && n.publishDate > today();
  const live = (n) => n.status === "Published" && !expired(n) && !scheduled(n);
  const catBadge = (c) => `<span class="badge-hh tone-${CAT_TONE[c] || "gray"}"><i class="bi ${CAT_ICON[c] || "bi-megaphone"}"></i>${esc(c)}</span>`;
  const audienceLabel = (n) => `${n.audience === "All" ? "Everyone" : n.audience} · ${L.branchName(n.branch)}`;
  let showAll = false;

  function countdown(n) {
    if (!n.expiryDate) return { text: "No expiry", tone: "gray" };
    const d = U.daysBetween(today(), n.expiryDate);
    if (d < 0) return { text: `Expired ${U.fmtDate(n.expiryDate)}`, tone: "red", expired: true };
    if (d === 0) return { text: "Expires today", tone: "orange" };
    return { text: `Expires in ${d} day${d === 1 ? "" : "s"}`, tone: d <= 3 ? "orange" : "gray" };
  }
  function recipients(n) {
    const br = (x) => !n.branch || n.branch === "All" || x.branch === n.branch;
    const res = C.activeResidents().filter(br).length;
    const staff = HH.store.all("staff").filter((s) => s.status !== "Resigned" && br(s));
    const wardens = staff.filter((s) => /warden/i.test(s.designation)).length;
    if (n.audience === "Residents") return { total: res, text: `${res} resident(s)` };
    if (n.audience === "Staff") return { total: staff.length, text: `${staff.length} staff` };
    if (n.audience === "Wardens") return { total: wardens, text: `${wardens} warden(s)` };
    return { total: res + staff.length, text: `${res} resident(s) + ${staff.length} staff` };
  }

  function fields() {
    return [
      { name: "title", label: "Title", required: true, col: 8, maxlength: 120 },
      { name: "category", label: "Category", type: "select", required: true, col: 4, options: CATEGORIES },
      { name: "message", label: "Message", type: "textarea", rows: 5, required: true, col: 12, maxlength: 1500, help: "Shown on the notice board. No e-mail, SMS or WhatsApp is sent in this demo." },
      { name: "audience", label: "Audience", type: "select", required: true, col: 4, options: AUDIENCES },
      { name: "branch", label: "Branch", type: "select", required: true, col: 4, options: L.branchOptions(true) },
      { name: "status", label: "Status", type: "select", required: true, col: 4, options: STATUSES },
      { name: "publishDate", label: "Publish date", type: "date", required: true, col: 6 },
      { name: "expiryDate", label: "Expiry date", type: "date", required: true, col: 6,
        validate: (v, vals) => (vals && vals.publishDate && v < vals.publishDate ? "Expiry date cannot be before the publish date." : "") },
    ];
  }
  function beforeSave(d, prev) {
    if (d.expiryDate < d.publishDate) return "Expiry date cannot be before the publish date.";
    if (d.status === "Published" && d.expiryDate < today()) return "This notice has already expired — move the expiry date forward to publish it.";
    if (!prev) d.read = false;
    else if (prev.status !== "Published" && d.status === "Published") d.read = false;
  }

  /* ----------------------------------------------------------- actions --- */
  function setStatus(n, status, msg) {
    const patch = { status };
    if (status === "Published") {
      if (expired(n)) return HH.toast("This notice has expired — edit the expiry date before publishing.", "error");
      patch.read = false;
      if (!n.publishDate) patch.publishDate = today();
    }
    HH.store.update("notices", n.id, patch);
    HH.toast(msg || `${n.id} is now ${status}.`, "success");
    page.refresh();
  }
  async function archive(n) {
    if (!(await HH.confirm(`Archive <b>${esc(n.title)}</b>? It will be removed from the notice board. You can restore it later.`, { title: "Archive notice", okText: "Archive", icon: "bi-archive", danger: true }))) return;
    setStatus(n, "Archived", `${n.id} archived.`);
  }
  function duplicate(n) {
    const span = Math.max(0, U.daysBetween(n.publishDate, n.expiryDate));
    const copy = HH.store.insert("notices", { title: `Copy of ${n.title}`.slice(0, 120), message: n.message, category: n.category, audience: n.audience, branch: n.branch, publishDate: today(), expiryDate: U.addDays(today(), span || 7), status: "Draft", read: false });
    HH.toast(`Draft ${copy.id} created from ${n.id}.`, "success");
    page.refresh();
    setTimeout(() => page.openForm(copy.id), 200);
  }
  function toggleRead(n) {
    HH.store.update("notices", n.id, { read: !n.read });
    HH.toast(`${n.id} marked as ${n.read ? "unread" : "read"}.`, "info");
    page.refresh();
  }
  function printNotice(n) {
    HH.printHTML(`Notice · ${n.title}`, `
      <div class="box" style="border-left:6px solid ${{ navy: "#102347", yellow: "#FFC400", green: "#10B981", orange: "#FF8A1F", pink: "#EC4899", purple: "#8B5CF6", red: "#F04452" }[CAT_TONE[n.category]] || "#63789A"};padding:20px 24px">
        <div class="lbl">${esc(n.category)} notice · ${esc(n.id)}</div>
        <h2 style="font-size:22px;margin:6px 0 12px">${esc(n.title)}</h2>
        <div style="font-size:14px;line-height:1.6;white-space:pre-wrap">${esc(n.message)}</div>
      </div>
      <div class="grid"><div><div class="lbl">Audience</div><div class="val">${esc(audienceLabel(n))}</div></div>
        <div><div class="lbl">Valid</div><div class="val">${U.fmtDate(n.publishDate)} – ${U.fmtDate(n.expiryDate)}</div></div></div>
      <div style="margin-top:40px">______________________<br><span class="muted">Warden / Administrator</span></div>`, { subtitle: `${n.category} · ${n.status}` });
  }
  function preview(n) {
    const rc = recipients(n);
    const sms = `[${HH.store.settings().hostel.name}] ${n.title}: ${n.message}`;
    HH.modal({
      title: `Preview message · ${n.id}`, icon: "bi-chat-square-quote", size: "lg",
      body: `<div class="stack">
        <div class="alert-hh tone-yellow"><i class="bi bi-shield-check"></i><span><b>Delivery simulated in demo mode.</b> No e-mail, SMS or WhatsApp message is sent — this is only a preview of what recipients would see.</span><span></span></div>
        <div class="grid grid-2 ntc-preview">
          <div class="detail-block"><div class="detail-block__title"><i class="bi bi-phone"></i> SMS / WhatsApp</div><div class="ntc-bubble">${esc(sms)}</div><div class="text-2 small">${sms.length} characters · ${Math.ceil(sms.length / 160)} SMS segment(s)</div></div>
          <div class="detail-block"><div class="detail-block__title"><i class="bi bi-envelope"></i> E-mail</div>
            <div class="ntc-mail"><div><span class="text-2">Subject:</span> <b>${esc(n.category)} notice — ${esc(n.title)}</b></div><div class="divider"></div><div style="white-space:pre-wrap">${esc(n.message)}</div><div class="text-2 small">Valid ${U.fmtDate(n.publishDate)} – ${U.fmtDate(n.expiryDate)}</div></div></div>
        </div>
        ${HH.ui.kv([["Audience", esc(audienceLabel(n))], ["Would reach", `${esc(rc.text)}`], ["Last simulated", n.simulatedAt ? U.fmtDateTime(n.simulatedAt) : "Never"]], 3)}
      </div>`,
      footer: [
        { label: "Close", close: true },
        { label: "Simulate send", icon: "bi-send", cls: "btn-hh--primary", onClick: (ctx) => {
          if (n.status !== "Published") return HH.toast("Publish the notice before simulating delivery.", "warning");
          HH.store.update("notices", n.id, { simulatedAt: U.nowISO() });
          HH.toast(`Simulated delivery to ${rc.text} (demo — nothing was sent).`, "info", 5000);
          ctx.close(); page.refresh();
        } },
      ],
    });
  }

  /* -------------------------------------------------------------- view --- */
  function view(n) {
    const cd = countdown(n), rc = recipients(n);
    return `<div class="stack">
      <div class="ntc-hero ntc-cat--${CAT_TONE[n.category] || "gray"}">
        <div class="row-flex">${catBadge(n.category)} ${HH.ui.badge(scheduled(n) ? "Scheduled" : n.status, scheduled(n) ? "blue" : undefined)} ${cd.expired ? HH.ui.badge("Expired") : ""}<span class="badge-hh tone-gray">${esc(n.id)}</span></div>
        <h3>${esc(n.title)}</h3>
        <div class="ntc-msg">${esc(n.message)}</div>
      </div>
      <div class="detail-block">${HH.ui.kv([
        ["Audience", esc(n.audience === "All" ? "Everyone" : n.audience)], ["Branch", esc(L.branchName(n.branch))], ["Reaches", esc(rc.text)],
        ["Publish date", U.fmtDate(n.publishDate)], ["Expiry date", `${U.fmtDate(n.expiryDate)} <span class="badge-hh tone-${cd.tone}">${esc(cd.text)}</span>`], ["Created", U.fmtDate(n.createdAt)],
      ], 3)}</div>
      <div class="text-2 small"><i class="bi bi-info-circle"></i> Notices appear on the in-app notice board and header notifications only. No e-mail / SMS / WhatsApp is sent in demo mode.</div>
    </div>`;
  }

  /* -------------------------------------------------------- notice board -- */
  function board() {
    const list = HH.store.all("notices").filter((n) => n.status === "Published").sort((a, b) => Number(expired(a)) - Number(expired(b)) || String(b.publishDate).localeCompare(String(a.publishDate)));
    const shown = showAll ? list : list.slice(0, 6);
    return `<section class="card-hh">
      <div class="card-hh__head"><span class="chip-icon"><i class="bi bi-pin-angle"></i></span>
        <div><div class="card-hh__title">Notice board</div><div class="card-hh__sub">${list.filter(live).length} live · ${list.filter(scheduled).length} scheduled · ${list.filter(expired).length} expired — click a card to read it</div></div>
        <div class="card-hh__tools">${list.length > 6 ? `<button type="button" class="btn-hh btn-hh--sm btn-hh--ghost" data-board-toggle>${showAll ? "Show fewer" : `Show all ${list.length}`}</button>` : ""}</div></div>
      ${shown.length ? `<div class="ntc-board">${shown.map((n) => { const cd = countdown(n); return `
        <button type="button" class="ntc-card ntc-cat--${CAT_TONE[n.category] || "gray"} ${cd.expired ? "is-expired" : ""} ${n.read ? "" : "is-unread"}" data-open="${esc(n.id)}">
          <span class="ntc-card__top">${catBadge(n.category)}${!n.read ? `<span class="ntc-dot" title="Unread"></span>` : ""}</span>
          <span class="ntc-card__title">${esc(n.title)}</span>
          <span class="ntc-card__msg">${esc(n.message)}</span>
          <span class="ntc-card__foot"><span><i class="bi bi-people"></i> ${esc(audienceLabel(n))}</span>${scheduled(n) ? HH.ui.badge(`Starts ${U.fmtDate(n.publishDate)}`, "blue") : cd.expired ? HH.ui.badge("Expired") : `<span class="badge-hh tone-${cd.tone}"><i class="bi bi-hourglass-split"></i>${esc(cd.text)}</span>`}</span>
        </button>`; }).join("")}</div>` : HH.ui.empty("No published notices", "bi-megaphone", "Publish a notice to show it on the board.")}
    </section>`;
  }

  const csv = [
    ["Notice ID", "id"], ["Title", "title"], ["Message", "message"], ["Category", "category"], ["Audience", "audience"], ["Branch", (n) => L.branchName(n.branch)],
    ["Publish Date", "publishDate"], ["Expiry Date", "expiryDate"], ["Status", "status"], ["Expired", (n) => (expired(n) ? "Yes" : "No")], ["Read", (n) => (n.read ? "Yes" : "No")],
  ].map(([label, k]) => ({ label, value: typeof k === "function" ? k : (r) => r[k] }));

  const page = HH.CrudPage({
    collection: "notices", entity: "Notice", icon: "bi-megaphone", addLabel: "New Notice", viewIcon: "bi-megaphone",
    searchPlaceholder: "Search title or message…", searchKeys: ["id", "title", "message", "category"],
    tabs: [
      { key: "all", label: "All Notices" },
      { key: "published", label: "Published", filter: (n) => n.status === "Published" },
      { key: "draft", label: "Drafts", filter: (n) => n.status === "Draft" },
      { key: "archived", label: "Archived", filter: (n) => n.status === "Archived" },
    ],
    filters: [
      { key: "category", label: "All categories", options: CATEGORIES },
      { key: "audience", label: "Any audience", options: AUDIENCES },
      { key: "branch", label: "Any branch", options: () => L.branchOptions(true) },
      { key: "status", label: "Any status", options: STATUSES },
      { key: "validity", label: "Any validity", options: ["Live", "Scheduled", "Expired", "Unread"], match: (n, v) => (v === "Live" ? live(n) : v === "Scheduled" ? scheduled(n) : v === "Expired" ? expired(n) : !n.read) },
    ],
    dateFilter: { key: "publishDate", label: "Published" },
    defaultSort: { key: "publishDate", dir: "desc" },
    columns: [
      { key: "title", label: "Notice", render: (n) => `<div class="ntc-title">${n.read ? "" : `<span class="ntc-dot" title="Unread"></span>`}<div style="min-width:0"><div class="truncate ${n.read ? "fw-semibold" : "fw-bold"}">${esc(n.title)}</div><div class="text-2 small truncate">${esc(n.id)} · ${esc(n.message)}</div></div></div>` },
      { key: "category", label: "Category", render: (n) => catBadge(n.category) },
      { key: "audience", label: "Audience", render: (n) => `<div class="nowrap">${esc(n.audience === "All" ? "Everyone" : n.audience)}</div><div class="text-2 small nowrap">${esc(L.branchName(n.branch))}</div>` },
      { key: "publishDate", label: "Publish", render: (n) => U.fmtDate(n.publishDate), cls: "nowrap" },
      { key: "expiryDate", label: "Expiry", render: (n) => { const cd = countdown(n); return `<div class="nowrap">${U.fmtDate(n.expiryDate)}</div><div class="small nowrap" style="color:var(--${cd.tone === "gray" ? "text-2" : cd.tone})">${esc(cd.text)}</div>`; } },
      { key: "status", label: "Status", render: (n) => `${HH.ui.badge(scheduled(n) ? "Scheduled" : n.status, scheduled(n) ? "blue" : undefined)}${n.status === "Published" && expired(n) ? " " + HH.ui.badge("Expired") : ""}` },
    ],
    csvColumns: csv, exportName: "notices", printTitle: "Notices",
    stats: (all) => [
      { label: "Live Notices", value: all.filter(live).length, icon: "bi-broadcast", tone: "green", meta: `${all.filter(scheduled).length} scheduled`, onClick: () => { location.hash = "published"; page.setFilter("validity", "Live"); } },
      { label: "Drafts", value: all.filter((n) => n.status === "Draft" || n.status === "Unpublished").length, icon: "bi-pencil-square", tone: "blue", meta: `${all.filter((n) => n.status === "Unpublished").length} unpublished`, onClick: () => (location.hash = "draft") },
      { label: "Expiring in 3 Days", value: all.filter((n) => live(n) && U.daysBetween(today(), n.expiryDate) <= 3).length, icon: "bi-hourglass-split", tone: "orange", meta: `${all.filter((n) => n.status === "Published" && expired(n)).length} published but expired`, onClick: () => page.setFilter("validity", "Expired") },
      { label: "Unread", value: all.filter((n) => !n.read && n.status !== "Archived").length, icon: "bi-envelope-fill", tone: "purple", meta: "Opening a notice marks it read", onClick: () => page.setFilter("validity", "Unread") },
      { label: "Archived", value: all.filter((n) => n.status === "Archived").length, icon: "bi-archive-fill", tone: "navy", meta: "Hidden from the board", onClick: () => (location.hash = "archived") },
    ],
    before: () => board(),
    fields, formSize: "lg",
    defaults: () => ({ status: "Draft", category: "General", audience: "All", branch: "All", publishDate: today(), expiryDate: U.addDays(today(), 14) }),
    beforeSave,
    view, viewSize: "lg",
    onViewReady: (m, n) => { if (!n.read) { HH.store.update("notices", n.id, { read: true }); page.refresh(); } },
    viewFooter: (n) => [
      { label: "Preview message", icon: "bi-chat-square-quote", left: true, onClick: (rec, ctx) => { ctx.close(); setTimeout(() => preview(HH.store.get("notices", rec.id)), 320); } },
      { label: "Print", icon: "bi-printer", onClick: (rec) => printNotice(rec) },
      ...(n.status !== "Published" && n.status !== "Archived" ? [{ label: "Publish", icon: "bi-broadcast", cls: "btn-hh--green", onClick: (rec, ctx) => { ctx.close(); setStatus(rec, "Published", `${rec.id} published to the notice board.`); } }] : []),
    ],
    actions: [
      { label: "Publish", icon: "bi-broadcast", show: (n) => n.status === "Draft" || n.status === "Unpublished", handler: (n) => setStatus(n, "Published", `${n.id} published to the notice board.`) },
      { label: "Unpublish", icon: "bi-eye-slash", show: (n) => n.status === "Published", handler: (n) => setStatus(n, "Unpublished", `${n.id} removed from the notice board.`) },
      { label: "Archive", icon: "bi-archive", show: (n) => n.status !== "Archived", handler: (n) => archive(n) },
      { label: "Restore as draft", icon: "bi-arrow-counterclockwise", show: (n) => n.status === "Archived", handler: (n) => setStatus(n, "Draft", `${n.id} restored as a draft.`) },
      { label: "Duplicate", icon: "bi-copy", handler: (n) => duplicate(n) },
      { label: (n) => (n.read ? "Mark as unread" : "Mark as read"), icon: "bi-envelope-open", handler: (n) => toggleRead(n) },
      { label: "Preview message", icon: "bi-chat-square-quote", handler: (n) => preview(n) },
      { label: "Print notice", icon: "bi-printer", handler: (n) => printNotice(n) },
    ],
    bulkActions: [
      { label: "Mark read", icon: "bi-envelope-open", handler: (rows) => bulk(rows, { read: true }, "marked read") },
      { label: "Archive", icon: "bi-archive", handler: (rows) => bulk(rows.filter((n) => n.status !== "Archived"), { status: "Archived" }, "archived") },
    ],
    titleOf: (n) => n.title,
  });

  async function bulk(rows, patch, verb) {
    if (!rows.length) return HH.toast("Nothing to update in the selection.", "warning");
    if (patch.status && !(await HH.confirm(`Archive <b>${rows.length}</b> notice(s)?`, { title: "Archive notices", okText: "Archive", danger: true, icon: "bi-archive" }))) return;
    rows.forEach((n) => HH.store.update("notices", n.id, patch));
    page.table.clearSelection(); page.refresh();
    HH.toast(`${rows.length} notice(s) ${verb}.`, "success");
  }

  document.getElementById("moduleRoot").addEventListener("click", (e) => {
    const c = e.target.closest("[data-open]");
    if (c) return page.openView(c.dataset.open);
    if (e.target.closest("[data-board-toggle]")) { showAll = !showAll; page.refresh(); }
  });
  // header notifications link here with ?view= — when already on the page, open in place
  window.addEventListener("popstate", () => { const v = U.qs("view"); if (v && HH.store.get("notices", v)) { page.openView(v); U.setQS({ view: null }); } });
})();
