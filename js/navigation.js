/* ==========================================================================
   HostelHub — Sidebar, header, mobile offcanvas & global search
   Every page provides:  <body data-page="<key>" data-root="../">
                         <aside id="appSidebar"> <header id="appHeader">
   ========================================================================== */
(function () {
  "use strict";
  const HH = (window.HH = window.HH || {});
  const esc = (s) => HH.util.esc(s);

  /* Custom glyphs not available in Bootstrap Icons */
  const SVG = {
    bed: '<svg viewBox="0 0 24 24" width="1em" height="1em" fill="currentColor" aria-hidden="true" class="bi-main"><path d="M3 5a1 1 0 0 1 1 1v6h7V9a2 2 0 0 1 2-2h5a4 4 0 0 1 4 4v8a1 1 0 1 1-2 0v-2H4v2a1 1 0 1 1-2 0V6a1 1 0 0 1 1-1Zm1 9v1h16v-1H4Zm16-2v-1a2 2 0 0 0-2-2h-5v3h7ZM7.5 8a2 2 0 1 1 0 4 2 2 0 0 1 0-4Z"/></svg>',
  };
  HH.svg = SVG;

  const MENU = [
    { key: "dashboard", label: "Dashboard", icon: "bi-house-door-fill", href: "dashboard.html" },
    { key: "residents", label: "Residents", icon: "bi-person", href: "pages/residents.html", aliases: ["resident-details"] },
    { key: "rooms-beds", label: "Rooms & Beds", svg: "bed", href: "pages/rooms-beds.html", subs: [["All Rooms", "#rooms"], ["Bed Map", "#beds"], ["Occupancy", "#occupancy"]] },
    { key: "mess-management", label: "Mess Management", icon: "bi-fork-knife", href: "pages/mess-management.html", subs: [["Meal Plans", "#plans"], ["Subscriptions", "#subscriptions"], ["Daily Meal Counts", "#counts"], ["Meal Charges", "#charges"]] },
    { key: "meal-attendance", label: "Meal Attendance", icon: "bi-egg-fried", href: "pages/meal-attendance.html", subs: [["Mark Attendance", "#mark"], ["Attendance History", "#history"]] },
    { key: "menu-management", label: "Menu Management", icon: "bi-journal-text", href: "pages/menu-management.html", subs: [["Daily Menus", "#daily"], ["Weekly Planner", "#weekly"]] },
    { key: "kitchen-inventory", label: "Kitchen & Inventory", icon: "bi-box-seam", href: "pages/kitchen-inventory.html", subs: [["Stock Items", "#items"], ["Stock History", "#history"], ["Vendors", "#vendors"], ["Alerts", "#alerts"]] },
    { key: "fees-payments", label: "Fees & Payments", icon: "bi-shield-check", href: "pages/fees-payments.html", aliases: ["invoices"], subs: [["Fee Overview", "pages/fees-payments.html#overview"], ["Invoices", "pages/invoices.html"], ["Payment History", "pages/fees-payments.html#payments"], ["Outstanding Fees", "pages/fees-payments.html#outstanding"]] },
    { key: "expenses", label: "Expenses", icon: "bi-receipt", href: "pages/expenses.html", subs: [["All Expenses", "#all"], ["Pending Approval", "#pending"], ["Vendor Payments", "#vendors"]] },
    { key: "staff-management", label: "Staff Management", icon: "bi-people", href: "pages/staff-management.html", subs: [["Staff Directory", "#staff"], ["Attendance", "#attendance"], ["Salary Records", "#salary"]] },
    { key: "maintenance", label: "Maintenance", icon: "bi-wrench-adjustable", href: "pages/maintenance.html", subs: [["All Tickets", "#all"], ["Open Tickets", "#open"], ["Overdue", "#overdue"]] },
    { key: "visitors", label: "Visitors", icon: "bi-person-badge", href: "pages/visitors.html", subs: [["Visitor Log", "#all"], ["Currently Inside", "#inside"]] },
    { key: "complaints", label: "Complaints", icon: "bi-chat-square-text", href: "pages/complaints.html", subs: [["All Complaints", "#all"], ["Open", "#open"], ["Resolved", "#resolved"]] },
    { key: "reports", label: "Reports", icon: "bi-graph-up", href: "pages/reports.html", subs: [["Residents & Rooms", "#residents"], ["Mess & Meals", "#mess"], ["Finance", "#finance"], ["Inventory", "#inventory"], ["Staff", "#staff"], ["Operations", "#operations"]] },
    { key: "notices", label: "Notices & Communication", icon: "bi-bell", href: "pages/notices.html", subs: [["All Notices", "#all"], ["Published", "#published"], ["Drafts", "#draft"], ["Archived", "#archived"]] },
    { key: "settings", label: "Settings", icon: "bi-gear", href: "pages/settings.html", subs: [["Hostel Profile", "#profile"], ["Branches", "#branches"], ["Lookups & Categories", "#lookups"], ["Preferences", "#preferences"], ["Users & Roles", "#roles"], ["Demo Data", "#data"]] },
  ];
  HH.MENU = MENU;

  const pageKey = () => document.body.dataset.page || "dashboard";
  const url = (p) => HH.util.page(p);
  const subHref = (m, s) => (s[1].startsWith("#") ? url(m.href) + s[1] : url(s[1]));
  const isActive = (m) => m.key === pageKey() || (m.aliases || []).includes(pageKey());

  function menuHTML() {
    const cur = location.pathname.split("/").pop() + location.hash;
    return `<ul class="nav-menu">${MENU.map((m) => {
      const active = isActive(m);
      const ico = m.svg ? SVG[m.svg] : `<i class="bi ${m.icon} bi-main"></i>`;
      if (!m.subs) return `<li class="nav-item"><a class="nav-link-hh ${active ? "is-active" : ""}" href="${url(m.href)}" ${active ? 'aria-current="page"' : ""} data-bs-title="${esc(m.label)}">${ico}<span class="nav-label">${esc(m.label)}</span><span></span></a></li>`;
      return `<li class="nav-item ${active ? "is-open" : ""}" data-key="${m.key}">
        <a class="nav-link-hh ${active ? "is-active" : ""}" href="${url(m.href)}" data-toggle-sub aria-expanded="${active}" data-bs-title="${esc(m.label)}">${ico}<span class="nav-label">${esc(m.label)}</span><i class="bi bi-chevron-right nav-caret"></i></a>
        <ul class="nav-sub">${m.subs.map((s, i) => { const h = subHref(m, s); const file = h.split("/").pop(); const curr = active && (file === cur || (i === 0 && !location.hash && file.split("#")[0] === cur.split("#")[0])); return `<li><a href="${h}" class="${curr ? "is-current" : ""}">${esc(s[0])}</a></li>`; }).join("")}</ul></li>`;
    }).join("")}</ul>`;
  }

  function sidebarHTML(mobile) {
    const s = HH.store.settings();
    return `${mobile ? "" : brandHTML()}
      <div class="sidebar-scroll">
        ${menuHTML()}
        <div class="promo-card" style="--promo-img:url('${new URL(url("assets/images/hostel/promo-students.svg"), location.href).href}')">
          <h4>${esc(s.hostel.tagline || "Smart Hostel, Happier Students")}</h4>
          <p>Manage hostel, mess and everything in one place.</p>
          <a class="btn-hh btn-hh--primary btn-hh--lg" href="${url("pages/residents.html?action=add")}"><i class="bi bi-plus-lg"></i>Add Resident</a>
        </div>
        <div class="demo-flag" title="Demo mode — all data is stored in this browser only"><i class="bi bi-database-check"></i><span>Demo Mode · data saved in this browser</span></div>
      </div>`;
  }

  function brandHTML(cls = "") {
    return `<a class="brand ${cls}" href="${url("dashboard.html")}" aria-label="HostelHub dashboard">
      <img class="brand__logo" src="${url("assets/images/logo/hostelhub-logo.svg")}" alt="">
      <span class="brand__text"><span class="brand__name">Hostel<b>Hub</b></span><span class="brand__tag">Management System</span></span></a>`;
  }

  function headerHTML() {
    const u = HH.store.settings().currentUser || { name: "Admin", role: "Super Admin" };
    return `
      <button type="button" class="icon-btn-dark" id="sidebarToggle" aria-label="Toggle navigation" data-bs-toggle="tooltip" data-bs-placement="bottom" data-bs-title="Toggle sidebar"><i class="bi bi-list"></i></button>
      ${brandHTML("mobile-brand")}
      <div class="global-search" id="globalSearch">
        <label class="global-search__box"><i class="bi bi-search"></i>
          <input type="search" id="globalSearchInput" placeholder="Search residents, rooms, meals, invoices, or anything..." autocomplete="off" aria-label="Global search" aria-controls="searchResults">
          <span class="kbd">Ctrl + K</span></label>
        <div class="search-results" id="searchResults" role="listbox"></div>
      </div>
      <div class="header-right">
        <button type="button" class="icon-btn-dark search-toggle" id="searchToggle" aria-label="Search"><i class="bi bi-search"></i></button>
        <span class="demo-pill" title="All data lives in your browser (localStorage)"><i class="bi bi-lightning-charge-fill"></i>DEMO MODE</span>
        <div class="header-clock"><i class="bi bi-calendar3"></i><span id="headerClock"></span></div>
        <div class="dropdown">
          <button type="button" class="icon-btn-dark" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" aria-label="Notifications"><i class="bi bi-bell"></i><span class="notif-count" id="notifCount"></span></button>
          <div class="dropdown-menu dropdown-menu-end hh-dropdown notif-panel">
            <div class="notif-panel__head"><div><strong>Notifications</strong><div class="text-2" style="font-size:12px" id="notifSummary"></div></div><button type="button" class="link-hh" id="notifMarkAll"><i class="bi bi-check2-all"></i>Mark all read</button></div>
            <div class="notif-panel__list" id="notifList"></div>
            <div class="notif-panel__foot"><a class="link-hh" href="${url("pages/notices.html")}">Open Notices & Communication <i class="bi bi-arrow-right"></i></a></div>
          </div>
        </div>
        <div class="dropdown">
          <button type="button" class="profile-btn" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Profile menu">
            <img src="${url("assets/images/avatars/admin.svg")}" alt="">
            <span><strong>${esc(u.name)}</strong><small>${esc(u.role)}</small></span><i class="bi bi-chevron-down"></i></button>
          <ul class="dropdown-menu dropdown-menu-end hh-dropdown">
            <li><h6 class="dropdown-header">${esc(u.email || "")}</h6></li>
            <li><a class="dropdown-item" href="${url("pages/settings.html#profile")}"><i class="bi bi-person-circle"></i>My Profile</a></li>
            <li><a class="dropdown-item" href="${url("pages/settings.html#preferences")}"><i class="bi bi-gear"></i>Settings</a></li>
            <li><a class="dropdown-item" href="${url("pages/notices.html")}"><i class="bi bi-megaphone"></i>Notices</a></li>
            <li><hr class="dropdown-divider"></li>
            <li><button type="button" class="dropdown-item" data-demo="load"><i class="bi bi-cloud-download"></i>Load Sample Data</button></li>
            <li><button type="button" class="dropdown-item text-danger" data-demo="reset"><i class="bi bi-arrow-repeat"></i>Reset Demo Data</button></li>
            <li><hr class="dropdown-divider"></li>
            <li><button type="button" class="dropdown-item" data-logout><i class="bi bi-box-arrow-right"></i>Log out</button></li>
          </ul>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------- search ---- */
  function searchIndex(q) {
    q = q.toLowerCase();
    const U = HH.util, L = HH.lookup;
    const has = (...v) => v.some((x) => String(x || "").toLowerCase().includes(q));
    const groups = [];
    const add = (label, icon, items) => { if (items.length) groups.push({ label, icon, items: items.slice(0, 5), more: items.length - 5 }); };
    add("Pages", "bi-grid", MENU.filter((m) => has(m.label)).map((m) => ({ title: m.label, meta: "Open module", href: url(m.href) })));
    add("Residents", "bi-person", HH.store.all("residents").filter((r) => has(r.name, r.id, r.phone, r.email, L.roomLabel(r.roomId), r.course)).map((r) => ({ title: r.name, meta: `${r.id} · ${L.roomLabel(r.roomId)} · ${r.status}`, href: url(`pages/resident-details.html?id=${r.id}`) })));
    add("Rooms", "bi-door-closed", HH.store.all("rooms").filter((r) => has(r.number, r.id, r.type, r.building)).map((r) => { const s = HH.calc.roomStats(r); return { title: `Room ${r.number}`, meta: `${r.type} · ${s.occupied}/${s.total} occupied · ${L.branchName(r.branch)}`, href: url(`pages/rooms-beds.html?view=${r.id}`) }; }));
    add("Invoices", "bi-receipt-cutoff", HH.store.all("invoices").filter((i) => has(i.id, L.residentName(i.residentId))).sort((a, b) => b.issueDate.localeCompare(a.issueDate)).map((i) => ({ title: `${i.id} — ${L.residentName(i.residentId)}`, meta: `${i.period} · ${U.fmtMoney(HH.calc.invoiceTotals(i).total)} · ${HH.calc.invoiceStatus(i)}`, href: url(`pages/invoices.html?view=${i.id}`) })));
    add("Menus", "bi-fork-knife", HH.store.all("menus").filter((m) => has(m.items, m.meal)).sort((a, b) => b.date.localeCompare(a.date)).map((m) => ({ title: `${m.meal} · ${U.fmtDate(m.date)}`, meta: m.items, href: url(`pages/menu-management.html?view=${m.id}`) })));
    add("Staff", "bi-people", HH.store.all("staff").filter((s) => has(s.name, s.id, s.designation, s.phone)).map((s) => ({ title: s.name, meta: `${s.designation} · ${L.branchName(s.branch)}`, href: url(`pages/staff-management.html?view=${s.id}`) })));
    add("Inventory", "bi-box-seam", HH.store.all("inventory").filter((i) => has(i.name, i.id, i.category)).map((i) => ({ title: i.name, meta: `${i.stock} ${i.unit} in stock · ${i.category}`, href: url(`pages/kitchen-inventory.html?view=${i.id}`) })));
    add("Expenses", "bi-receipt", HH.store.all("expenses").filter((e) => has(e.id, e.description, e.vendor, e.category)).map((e) => ({ title: e.description, meta: `${e.id} · ${U.fmtMoney(e.amount)} · ${U.fmtDate(e.date)}`, href: url(`pages/expenses.html?view=${e.id}`) })));
    add("Maintenance", "bi-tools", HH.store.all("maintenance").filter((t) => has(t.id, t.title, t.category)).map((t) => ({ title: t.title, meta: `${t.id} · ${t.status}`, href: url(`pages/maintenance.html?view=${t.id}`) })));
    add("Complaints", "bi-chat-square-text", HH.store.all("complaints").filter((c) => has(c.id, c.subject, L.residentName(c.residentId))).map((c) => ({ title: c.subject, meta: `${c.id} · ${c.status}`, href: url(`pages/complaints.html?view=${c.id}`) })));
    add("Visitors", "bi-person-badge", HH.store.all("visitors").filter((v) => has(v.name, v.id, v.phone)).map((v) => ({ title: v.name, meta: `${v.id} · visiting ${L.residentName(v.residentId)}`, href: url(`pages/visitors.html?view=${v.id}`) })));
    add("Notices", "bi-megaphone", HH.store.all("notices").filter((n) => has(n.title, n.message)).map((n) => ({ title: n.title, meta: `${n.category} · ${n.status}`, href: url(`pages/notices.html?view=${n.id}`) })));
    return groups;
  }

  function initSearch() {
    const input = document.getElementById("globalSearchInput");
    const box = document.getElementById("searchResults");
    const wrap = document.getElementById("globalSearch");
    let focus = -1;
    const links = () => [...box.querySelectorAll(".search-hit")];
    const run = HH.util.debounce(() => {
      const q = input.value.trim();
      focus = -1;
      if (q.length < 2) { box.innerHTML = q ? `<div class="search-empty">Type at least 2 characters…</div>` : `<div class="search-empty"><i class="bi bi-lightbulb"></i> Try a resident name, room number (A-101), invoice (INV-1001) or item.</div>`; box.classList.add("is-open"); return; }
      const groups = searchIndex(q);
      box.innerHTML = groups.length ? groups.map((g) => `<div class="search-results__group">${esc(g.label)}</div>${g.items.map((it) => `<a class="search-hit" href="${it.href}"><span class="search-hit__icon"><i class="bi ${g.icon}"></i></span><span style="min-width:0"><span class="search-hit__title d-block">${esc(it.title)}</span><span class="search-hit__meta d-block">${esc(it.meta)}</span></span><i class="bi bi-arrow-return-left text-3"></i></a>`).join("")}${g.more > 0 ? `<div class="search-hit__meta" style="padding:2px 10px 6px">+${g.more} more…</div>` : ""}`).join("")
        : `<div class="search-empty"><i class="bi bi-search"></i> No results for “${esc(q)}”</div>`;
      box.classList.add("is-open");
    }, 120);
    input.addEventListener("input", run);
    input.addEventListener("focus", run);
    input.addEventListener("keydown", (e) => {
      const l = links();
      if (e.key === "ArrowDown") { e.preventDefault(); focus = Math.min(l.length - 1, focus + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); focus = Math.max(0, focus - 1); }
      else if (e.key === "Enter") { e.preventDefault(); const t = l[focus >= 0 ? focus : 0]; if (t) location.href = t.href; return; }
      else if (e.key === "Escape") { box.classList.remove("is-open"); input.blur(); return; }
      else return;
      l.forEach((a, i) => a.classList.toggle("is-focus", i === focus));
      l[focus] && l[focus].scrollIntoView({ block: "nearest" });
    });
    document.addEventListener("click", (e) => { if (!wrap.contains(e.target)) box.classList.remove("is-open"); });
    document.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        document.getElementById("appHeader").classList.add("search-open");
        input.focus(); input.select();
      }
    });
    document.getElementById("searchToggle").addEventListener("click", () => {
      const h = document.getElementById("appHeader");
      h.classList.toggle("search-open");
      if (h.classList.contains("search-open")) input.focus();
    });
  }

  /* -------------------------------------------------------- behaviour ---- */
  function isRail() {
    const shell = document.getElementById("appShell");
    if (innerWidth <= 768) return false;
    if (innerWidth <= 1100) return !shell.classList.contains("is-expanded");
    return shell.classList.contains("is-collapsed");
  }

  function wireMenu(container, inDrawer) {
    container.addEventListener("click", (e) => {
      const t = e.target.closest("[data-toggle-sub]");
      if (!t) return;
      if (!inDrawer && isRail()) return; // rail: let the link navigate
      // Parent rows expand/collapse their submenu (the first sub-link opens the module itself)
      e.preventDefault();
      const li = t.closest(".nav-item");
      const open = !li.classList.contains("is-open");
      li.classList.toggle("is-open", open);
      t.setAttribute("aria-expanded", String(open));
    });
  }

  function clock() {
    const el = document.getElementById("headerClock");
    if (!el) return;
    const d = new Date();
    el.innerHTML = `${HH.util.DAYS[d.getDay()]}, ${HH.util.pad(d.getDate())} ${HH.util.MONTHS[d.getMonth()]} ${d.getFullYear()}<br>${HH.util.fmtTime(`${HH.util.pad(d.getHours())}:${HH.util.pad(d.getMinutes())}`)}`;
  }

  async function demoAction(kind) {
    const reset = kind === "reset";
    const ok = await HH.confirm(reset
      ? "This will erase every change you have made and restore the original demo dataset across <b>all modules</b>."
      : "Reload the sample dataset? Your current records will be replaced; display preferences are kept.",
      { title: reset ? "Reset demo data?" : "Load sample data?", danger: reset, okText: reset ? "Reset everything" : "Load sample data", icon: "bi-arrow-repeat" });
    if (!ok) return;
    reset ? HH.store.reset() : HH.store.loadSample();
    sessionStorage.setItem("hh:flash", reset ? "Demo data has been reset to its initial state." : "Sample data loaded.");
    location.reload();
  }
  HH.demoAction = demoAction;

  function render() {
    const sidebar = document.getElementById("appSidebar");
    const header = document.getElementById("appHeader");
    const shell = document.getElementById("appShell");
    if (!sidebar || !header) return;
    sidebar.innerHTML = sidebarHTML(false);
    header.innerHTML = headerHTML();
    if (HH.store.pref("sidebarCollapsed", false)) shell.classList.add("is-collapsed");

    // Mobile offcanvas (Bootstrap) re-using the same menu
    const oc = document.createElement("div");
    oc.className = "offcanvas offcanvas-start hh-offcanvas-nav";
    oc.id = "mobileNav"; oc.tabIndex = -1; oc.setAttribute("aria-label", "Navigation");
    oc.innerHTML = `<div class="offcanvas-header">${brandHTML()}<button type="button" class="btn-close" data-bs-dismiss="offcanvas" aria-label="Close"></button></div><div class="offcanvas-body">${sidebarHTML(true)}</div>`;
    document.body.appendChild(oc);

    wireMenu(sidebar, false);
    wireMenu(oc, true);

    document.getElementById("sidebarToggle").addEventListener("click", () => {
      if (innerWidth <= 768) { bootstrap.Offcanvas.getOrCreateInstance(oc).toggle(); return; }
      if (innerWidth <= 1100) { shell.classList.toggle("is-expanded"); return; }
      shell.classList.toggle("is-collapsed");
      HH.store.setPref("sidebarCollapsed", shell.classList.contains("is-collapsed"));
      setTimeout(() => window.dispatchEvent(new Event("resize")), 340); // let charts resize
    });

    header.addEventListener("click", (e) => {
      const d = e.target.closest("[data-demo]");
      if (d) demoAction(d.dataset.demo);
      if (e.target.closest("[data-logout]")) {
        HH.confirm("You will be returned to the sign-in screen. Your demo data stays saved in this browser.", { title: "Log out?", okText: "Log out", icon: "bi-box-arrow-right" })
          .then((ok) => { if (ok) { try { localStorage.removeItem("hh:session"); } catch (err) { /* ignore */ } location.href = url("index.html"); } });
      }
    });

    // Tooltips for rail mode
    sidebar.querySelectorAll(".nav-link-hh").forEach((a) => {
      const tip = new bootstrap.Tooltip(a, { placement: "right", trigger: "hover", title: a.dataset.bsTitle });
      a.addEventListener("mouseenter", () => { if (!isRail()) tip.hide(); });
      a.addEventListener("show.bs.tooltip", (ev) => { if (!isRail()) ev.preventDefault(); });
    });
    header.querySelectorAll('[data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));

    initSearch();
    clock();
    setInterval(clock, 30000);
  }

  HH.nav = { render, MENU };
})();
