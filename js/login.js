/* HostelHub — demo sign-in (no real authentication is performed) */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const form = document.getElementById("loginForm");
  const fields = [
    { name: "email", label: "Email address", type: "email", required: true },
    { name: "password", label: "Password", type: "password", required: true, validate: (v) => (v.length < 4 ? "Password must be at least 4 characters." : "") },
  ];
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    if (!HH.validate.form(form, fields)) return;
    const s = HH.store.settings();
    const email = form.email.value.trim().toLowerCase();
    const user = (s.users || []).find((u) => u.email.toLowerCase() === email) || { name: "Admin", role: "Super Admin", email };
    s.currentUser = { name: user.name, role: user.role, email: user.email };
    HH.store.saveSettings(s);
    try { localStorage.setItem("hh:session", JSON.stringify({ user: user.name, at: HH.util.nowISO() })); } catch (err) { /* ignore */ }
    const next = HH.util.qs("next");
    location.href = next && /^[\w\-./?=&#%]+$/.test(next) && !next.includes("//") ? next : "dashboard.html";
  });
  document.getElementById("pwToggle").addEventListener("click", (e) => {
    const p = form.password; const show = p.type === "password";
    p.type = show ? "text" : "password";
    e.currentTarget.innerHTML = `<i class="bi ${show ? "bi-eye-slash" : "bi-eye"}"></i>`;
  });
  document.getElementById("forgot").addEventListener("click", () => HH.toast("Demo mode: no e-mails are sent. Use any password with 4+ characters.", "info"));
  document.getElementById("resetDemo").addEventListener("click", () => HH.demoAction("reset"));
})();
