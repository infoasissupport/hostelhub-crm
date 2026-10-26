/* ==========================================================================
   HostelHub — Application bootstrap
   Load order (all with `defer`): bootstrap → chart.js → demo-data → storage →
   common → validation → notifications → export → navigation → app → page script
   ========================================================================== */
(function () {
  "use strict";
  const HH = (window.HH = window.HH || {});

  const isLogin = document.body.dataset.page === "login";

  // 1. Data — seed only when nothing (or an older schema) is stored
  const seeded = HH.store.init();

  // 2. Login disabled — auto sign-in as Admin and skip the sign-in screen
  let session = null;
  try { session = JSON.parse(localStorage.getItem("hh:session") || "null"); } catch (e) { session = null; }
  if (!session) {
    const s = HH.store.settings();
    if (!s.currentUser) {
      const u = (s.users || [])[0] || { name: "Admin", role: "Super Admin", email: "admin@hostelhub.local" };
      s.currentUser = { name: u.name, role: u.role, email: u.email };
      HH.store.saveSettings(s);
    }
    try { localStorage.setItem("hh:session", JSON.stringify({ user: s.currentUser.name, at: HH.util.nowISO() })); } catch (e) { /* ignore */ }
  }
  if (isLogin) {
    location.replace(HH.util.page("dashboard.html"));
    return;
  }

  // 3. Chart.js theme
  if (window.Chart) {
    const C = window.Chart;
    C.defaults.font.family = '"Inter", "Segoe UI", system-ui, sans-serif';
    C.defaults.font.size = 11.5;
    C.defaults.color = "#63789A";
    C.defaults.borderColor = "#E9EFF7";
    C.defaults.plugins.legend.display = false;
    C.defaults.plugins.tooltip.backgroundColor = "#0B1930";
    C.defaults.plugins.tooltip.padding = 10;
    C.defaults.plugins.tooltip.cornerRadius = 8;
    C.defaults.plugins.tooltip.titleFont = { weight: "700" };
    C.defaults.maintainAspectRatio = false;
    C.defaults.animation.duration = 500;
  }
  HH.colors = { yellow: "#FFC400", blue: "#1683FF", green: "#10B981", purple: "#8B5CF6", pink: "#EC4899", orange: "#FF8A1F", red: "#F04452", teal: "#14B8A6", gray: "#D6DDE8", navy: "#102347" };
  HH.palette = ["#FFC400", "#1683FF", "#10B981", "#8B5CF6", "#EC4899", "#FF8A1F", "#14B8A6", "#F04452", "#0EA5E9", "#6366F1"];

  /** Create or replace a chart on a canvas. */
  HH.chart = function (canvas, config) {
    const el = typeof canvas === "string" ? document.querySelector(canvas) : canvas;
    if (!el || !window.Chart) return null;
    const prev = window.Chart.getChart(el);
    if (prev) prev.destroy();
    return new window.Chart(el, config);
  };

  // 4. Layout chrome
  if (!isLogin) {
    HH.nav.render();
    HH.notifications.init();
  }

  // 5. Flash messages (e.g. after reset)
  const flash = sessionStorage.getItem("hh:flash");
  if (flash) { sessionStorage.removeItem("hh:flash"); setTimeout(() => HH.toast(flash, "success"), 300); }
  else if (seeded && !isLogin) setTimeout(() => HH.toast("Sample demo data loaded. Changes are saved in this browser.", "info", 5000), 400);

  // 6. Generic tooltips declared in page markup
  document.querySelectorAll('main [data-bs-toggle="tooltip"]').forEach((el) => new bootstrap.Tooltip(el));

  // Breadcrumb "Home" links & year
  document.querySelectorAll("[data-year]").forEach((el) => (el.textContent = new Date().getFullYear()));

  HH.ready = true;
})();
