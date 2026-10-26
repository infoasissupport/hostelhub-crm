/* ==========================================================================
   HostelHub — CSV export & print helpers
   HH.exportCSV(filename, columns:[{label, value(r)}], rows)
   HH.printTable(title, columns, rows, subtitle)
   HH.printHTML(title, html, opts)   — printable document (invoice, pass, report)
   HH.download(filename, content, mime)
   ========================================================================== */
(function () {
  "use strict";
  const HH = (window.HH = window.HH || {});
  const esc = (s) => HH.util.esc(s);
  const strip = (v) => {
    if (v == null) return "";
    const s = String(v);
    if (!/[<&]/.test(s)) return s;
    const d = document.createElement("div"); d.innerHTML = s; return d.textContent.trim();
  };

  HH.download = function (filename, content, mime = "text/plain") {
    const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  };

  HH.toCSV = function (columns, rows) {
    const cell = (v) => { const s = strip(v).replace(/\r?\n/g, " "); return /[",]/.test(s) || /^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    const head = columns.map((c) => cell(c.label)).join(",");
    const body = rows.map((r) => columns.map((c) => cell(typeof c.value === "function" ? c.value(r) : r[c.key])).join(","));
    return "﻿" + [head, ...body].join("\r\n");
  };

  HH.exportCSV = function (filename, columns, rows) {
    HH.download(filename, HH.toCSV(columns, rows), "text/csv;charset=utf-8");
    HH.toast && HH.toast(`Exported ${rows.length} record${rows.length === 1 ? "" : "s"} to ${filename}`, "success");
  };

  const PRINT_CSS = `
    *{box-sizing:border-box} body{font-family:"Inter","Segoe UI",Arial,sans-serif;color:#102347;margin:28px;font-size:12px}
    .ph{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #FFD21F;padding-bottom:12px;margin-bottom:16px;gap:20px}
    .ph h1{font-size:20px;margin:0 0 4px} .ph small{color:#63789A} .brand{display:flex;gap:10px;align-items:center}
    .brand img{width:42px;height:40px} .brand b{font-size:18px} .brand span{display:block;color:#63789A;font-size:11px}
    table{width:100%;border-collapse:collapse;margin-top:8px} th{background:#F4F7FC;color:#63789A;text-align:left;font-size:11px;padding:7px 8px;border-bottom:1px solid #E1EAF5}
    td{padding:7px 8px;border-bottom:1px solid #E1EAF5;vertical-align:top} tr:nth-child(even) td{background:#FAFCFF}
    .r{text-align:right} .muted{color:#63789A} .tot td{font-weight:700;border-top:2px solid #102347}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:12px 28px;margin:12px 0} .box{border:1px solid #E1EAF5;border-radius:8px;padding:12px}
    .lbl{font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#63789A;font-weight:700} .val{font-weight:600}
    .stamp{display:inline-block;padding:4px 12px;border:2px solid;border-radius:6px;font-weight:800;letter-spacing:.08em}
    .foot{margin-top:24px;padding-top:10px;border-top:1px solid #E1EAF5;color:#63789A;font-size:10px;display:flex;justify-content:space-between}
    .demo{color:#B58900;font-weight:700} h2{font-size:15px;margin:18px 0 6px} .cards{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
    .card{border:1px solid #E1EAF5;border-radius:8px;padding:10px 14px;min-width:140px} .card b{display:block;font-size:16px}
    @media print{body{margin:12mm}.noprint{display:none}} @page{size:auto;margin:10mm}`;

  function header(title, subtitle) {
    const s = HH.store.settings();
    const logo = new URL(HH.util.page("assets/images/logo/hostelhub-logo.svg"), location.href).href;
    return `<div class="ph"><div class="brand"><img src="${logo}" alt=""><div><b>${esc(s.hostel.name)}</b><span>${esc(s.hostel.address)} · ${esc(s.hostel.phone)}</span></div></div>
      <div style="text-align:right"><h1>${esc(title)}</h1><small>${esc(subtitle || "")}</small><br><small>Printed ${HH.util.fmtDateTime(HH.util.nowISO())}</small></div></div>`;
  }

  HH.printHTML = function (title, html, opts = {}) {
    const w = window.open("", "_blank", "width=1000,height=760");
    if (!w) { HH.toast("Pop-up blocked — allow pop-ups to print.", "warning"); return; }
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}${opts.css || ""}</style></head><body>
      ${opts.noHeader ? "" : header(title, opts.subtitle)}${html}
      <div class="foot"><span>${esc(HH.store.settings().hostel.invoiceFooter || "")}</span><span class="demo">DEMO MODE — not a legal document</span></div>
      <div class="noprint" style="margin-top:18px;text-align:center"><button onclick="window.print()" style="padding:8px 18px;border:0;border-radius:6px;background:#FFD21F;font-weight:700;cursor:pointer">Print</button></div>
      <script>window.onload=function(){setTimeout(function(){window.focus();window.print();},250)}<\/script></body></html>`);
    w.document.close();
  };

  HH.printTable = function (title, columns, rows, subtitle) {
    if (!rows.length) { HH.toast("Nothing to print with the current filters.", "warning"); return; }
    const html = `<table><thead><tr>${columns.map((c) => `<th>${esc(c.label)}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((r) => `<tr>${columns.map((c) => `<td>${esc(strip(typeof c.value === "function" ? c.value(r) : r[c.key]))}</td>`).join("")}</tr>`).join("")}
      </tbody></table><p class="muted" style="margin-top:10px">${rows.length} record(s)</p>`;
    HH.printHTML(title, html, { subtitle });
  };
})();
