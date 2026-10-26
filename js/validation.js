/* ==========================================================================
   HostelHub — Form validation
   HH.validate.form(formEl, fields)  -> boolean (marks invalid fields)
   HH.validate.field(formEl, field)  -> error message | ""
   HH.validate.rules                  reusable rule helpers
   ========================================================================== */
(function () {
  "use strict";
  const HH = (window.HH = window.HH || {});

  const MSG = {
    required: (l) => `${l} is required.`,
    email: "Enter a valid email address (e.g. name@example.com).",
    tel: "Enter a valid phone number (10–15 digits).",
    min: (l, m) => `${l} must be at least ${m}.`,
    max: (l, m) => `${l} must be at most ${m}.`,
    dateMin: (l, m) => `${l} cannot be before ${HH.util.fmtDate(m)}.`,
    dateMax: (l, m) => `${l} cannot be after ${HH.util.fmtDate(m)}.`,
    pattern: (l) => `${l} has an invalid format.`,
    number: (l) => `${l} must be a number.`,
  };

  const rules = {
    email: (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v),
    tel: (v) => /^\+?[\d\s()-]{10,18}$/.test(v) && v.replace(/\D/g, "").length >= 10 && v.replace(/\D/g, "").length <= 15,
    notFuture: (v) => !v || v <= HH.util.todayISO(),
    after: (a, b) => !a || !b || a >= b,
  };

  function getValue(formEl, f) {
    if (f.type === "checks") return [...formEl.querySelectorAll(`[data-checks="${f.name}"] input:checked`)].map((i) => i.value);
    if (f.type === "file") return (formEl._files && formEl._files[f.name]) || [];
    if (f.type === "photo") return (formEl._files && formEl._files[f.name]) || "";
    const el = formEl.elements[f.name];
    if (!el) return undefined;
    if (f.type === "switch") return el.checked;
    if (f.type === "select" && f.multiple) return [...el.selectedOptions].map((o) => o.value);
    return typeof el.value === "string" ? el.value.trim() : el.value;
  }

  function check(formEl, f, values) {
    if (!f || !f.name || ["section", "html"].includes(f.type)) return "";
    const el = formEl.elements[f.name];
    if (el && el.disabled) return "";
    const v = getValue(formEl, f);
    const label = f.label || f.name;
    const empty = v == null || v === "" || (Array.isArray(v) && v.length === 0);
    if (f.required && empty) return MSG.required(label);
    if (empty) return f.validate ? f.validate(v, values) || "" : "";
    if (f.type === "email" && !rules.email(v)) return MSG.email;
    if (f.type === "tel" && !rules.tel(v)) return MSG.tel;
    if (f.type === "number") {
      const n = Number(v);
      if (isNaN(n)) return MSG.number(label);
      if (f.min != null && n < Number(f.min)) return MSG.min(label, f.min);
      if (f.max != null && n > Number(f.max)) return MSG.max(label, f.max);
    }
    if (f.type === "date") {
      if (f.min && v < f.min) return MSG.dateMin(label, f.min);
      if (f.max && v > f.max) return MSG.dateMax(label, f.max);
    }
    if (f.pattern && typeof v === "string" && !new RegExp(`^(?:${f.pattern})$`).test(v)) return f.patternMsg || MSG.pattern(label);
    if (f.maxlength && String(v).length > f.maxlength) return `${label} must be ${f.maxlength} characters or fewer.`;
    if (f.validate) return f.validate(v, values) || "";
    return "";
  }

  function mark(formEl, f, msg) {
    const wrap = formEl.querySelector(`[data-field="${f.name}"]`);
    if (!wrap) return;
    wrap.classList.toggle("has-error", !!msg);
    const box = wrap.querySelector(".field-error");
    if (box) box.textContent = msg || "";
    const el = formEl.elements[f.name];
    if (el && el.setAttribute) el.setAttribute("aria-invalid", msg ? "true" : "false");
  }

  HH.validate = {
    rules, MSG,
    field(formEl, f) {
      if (!f) return "";
      const values = HH.form.read(formEl, [f]);
      const msg = check(formEl, f, values);
      mark(formEl, f, msg);
      return msg;
    },
    form(formEl, fields) {
      const values = HH.form.read(formEl, fields);
      let first = null;
      fields.forEach((f) => {
        if (!f.name) return;
        const msg = check(formEl, f, values);
        mark(formEl, f, msg);
        if (msg && !first) first = f;
      });
      if (first) {
        const el = formEl.querySelector(`[data-field="${first.name}"] input, [data-field="${first.name}"] select, [data-field="${first.name}"] textarea`);
        el && el.focus();
      }
      return !first;
    },
    /** Mark an error manually (e.g. business rule failure). */
    setError(formEl, name, msg) { mark(formEl, { name }, msg); },
  };
})();
