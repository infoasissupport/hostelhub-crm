/* ==========================================================================
   HostelHub — Menu Management module
   #daily   menu CRUD (unique per date + meal), copy tools
   #weekly  Mon–Sun × meals planner with week navigation and print
   Schema (read by the dashboard via HH.calc.menuFor):
   menus { date, meal, items, ingredients, start, end, cost, servings, notes }
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const root = document.getElementById("moduleRoot");
  const today = U.todayISO();
  const mealTypes = () => HH.store.settings().mealTypes || [];
  const meals = () => mealTypes().map((m) => m.name);
  const mealType = (name) => mealTypes().find((m) => m.name === name) || {};
  const mealIdx = (m) => { const i = meals().indexOf(m); return i < 0 ? 99 : i; };
  const TONES = ["yellow", "blue", "green", "purple", "pink"];
  const mealTone = (m) => TONES[mealIdx(m) % TONES.length] || "gray";
  const dupOf = (date, meal, exceptId) => HH.store.all("menus").find((m) => m.date === date && m.meal === meal && m.id !== exceptId);
  const weekday = (d) => U.DAYS[U.parse(d).getDay()];
  const mondayOf = (d) => { const x = U.parse(d); const wd = (x.getDay() + 6) % 7; return U.addDays(d, -wd); };
  const timeRange = (m) => (m.start ? `${U.fmtTime(m.start)} – ${U.fmtTime(m.end)}` : "—");
  const copyFields = (m) => ({ items: m.items, ingredients: m.ingredients, start: m.start, end: m.end, cost: m.cost, servings: m.servings, notes: m.notes || "" });

  /* ------------------------------------------------------------ shell --- */
  root.innerHTML = `
    <div data-mn-stats></div>
    <div class="card-hh card-hh--flush mod-tabs"><div data-mn-tabs></div></div>
    <div class="tab-panel" data-panel="daily"><div id="mnDaily" class="stack" style="gap:var(--gutter)"></div></div>
    <div class="tab-panel stack" data-panel="weekly" style="gap:var(--gutter)">
      <section class="card-hh">
        <div class="card-hh__head"><span class="chip-icon tone-yellow"><i class="bi bi-calendar-week"></i></span>
          <div><h2 class="card-hh__title" data-wk-title>Week</h2><div class="card-hh__sub" data-wk-sub></div></div>
          <div class="card-hh__tools">
            <button type="button" class="btn-hh btn-hh--sm btn-hh--icon" data-wk="prev" aria-label="Previous week" title="Previous week"><i class="bi bi-chevron-left"></i></button>
            <button type="button" class="btn-hh btn-hh--sm" data-wk="this"><i class="bi bi-calendar-check"></i>This week</button>
            <button type="button" class="btn-hh btn-hh--sm btn-hh--icon" data-wk="next" aria-label="Next week" title="Next week"><i class="bi bi-chevron-right"></i></button>
            <input type="date" class="input-hh mn-wk-date" data-wk-date aria-label="Jump to week containing date">
            <button type="button" class="btn-hh btn-hh--sm" data-wk="copy"><i class="bi bi-copy"></i>Copy week to next</button>
            <button type="button" class="btn-hh btn-hh--sm" data-wk="print"><i class="bi bi-printer"></i>Print week</button>
          </div></div>
        <div class="mn-week" data-wk-grid></div>
      </section>
    </div>`;
  const $ = (s) => root.querySelector(s);

  function renderStats() {
    const all = HH.store.all("menus");
    const todays = meals().filter((m) => C.menuFor(today, m));
    const wkStart = mondayOf(today), wkEnd = U.addDays(wkStart, 6);
    const nwStart = U.addDays(wkStart, 7), nwEnd = U.addDays(wkStart, 13);
    const slots = meals().length * 7;
    const inWeek = (a, b) => all.filter((m) => m.date >= a && m.date <= b && meals().includes(m.meal)).length;
    const month = all.filter((m) => U.monthKey(m.date) === U.monthKey(today));
    const avgCost = month.length ? Math.round(U.sum(month, (m) => m.cost) / month.length) : 0;
    const cards = [
      { label: "Today's Menu", value: `${todays.length}/${meals().length}`, icon: "bi-egg-fried", tone: todays.length === meals().length ? "green" : "orange", meta: todays.length === meals().length ? "All meals planned" : `Missing: ${meals().filter((m) => !todays.includes(m)).join(", ")}`, onClick: () => { daily.state.from = today; daily.state.to = today; syncDateInputs(); tabs.set("daily"); daily.refresh(false); } },
      { label: "This Week Planned", value: `${inWeek(wkStart, wkEnd)}/${slots}`, icon: "bi-calendar-week", tone: "blue", meta: `${U.fmtDate(wkStart)} – ${U.fmtDate(wkEnd)}`, onClick: () => { wk.start = wkStart; tabs.set("weekly"); } },
      { label: "Next Week Planned", value: `${inWeek(nwStart, nwEnd)}/${slots}`, icon: "bi-calendar-plus", tone: "purple", meta: `${slots - inWeek(nwStart, nwEnd)} slot(s) still empty`, onClick: () => { wk.start = nwStart; tabs.set("weekly"); renderWeek(); } },
      { label: "Avg Cost / Plate", value: U.fmtMoney(avgCost), icon: "bi-currency-rupee", tone: "yellow", meta: `${U.monthLabel(U.monthKey(today))} · ${month.length} menus` },
    ];
    const host = $("[data-mn-stats]"); host.innerHTML = HH.ui.statCards(cards); HH.ui.bindStatCards(host, cards);
  }

  /* ------------------------------------------------------------ fields --- */
  function fields(rec) {
    const id = rec && rec.id;
    return [
      { name: "date", label: "Date", type: "date", required: true, col: 4, default: today, min: U.addDays(today, -365), max: U.addDays(today, 365) },
      { name: "meal", label: "Meal", type: "select", required: true, col: 4, options: meals(),
        validate: (v, vals) => { const d = vals.date; const dup = d && dupOf(d, v, id); return dup ? `A ${v} menu for ${U.fmtDate(d)} already exists (${dup.id}).` : ""; },
        onChange: (v, f) => { const t = mealType(v); if (t.start) { f.elements.start.value = t.start; f.elements.end.value = t.end; } } },
      { name: "servings", label: "Expected servings", type: "number", col: 4, min: 0, max: 5000, step: 1, help: "Plates expected",
        validate: (v) => (Number.isInteger(Number(v)) ? "" : "Servings must be a whole number.") },
      { name: "items", label: "Menu items", type: "textarea", required: true, rows: 2, col: 12, maxlength: 400, placeholder: "e.g. Idli, Sambar, Coconut Chutney, Tea / Coffee", help: "Separate dishes with commas." },
      { name: "ingredients", label: "Key ingredients", type: "textarea", rows: 2, col: 12, maxlength: 400, placeholder: "e.g. Rice flour, urad dal, coconut, vegetables" },
      { name: "start", label: "Serving starts", type: "time", required: true, col: 4 },
      { name: "end", label: "Serving ends", type: "time", required: true, col: 4, validate: (v, vals) => (vals.start && v <= vals.start ? "End time must be after the start time." : "") },
      { name: "cost", label: "Est. cost per plate (₹)", type: "number", col: 4, min: 0, max: 10000, step: 1 },
      { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12, maxlength: 300, placeholder: "Special dishes, dietary notes…" },
    ];
  }
  function withMealTimes(o) {
    const t = mealType(o.meal);
    if (t.start && !o.start) o.start = t.start;
    if (t.end && !o.end) o.end = t.end;
    return o;
  }
  const expectedServings = (meal) => {
    const recent = HH.store.all("menus").filter((m) => m.meal === meal && m.servings).sort((a, b) => b.date.localeCompare(a.date))[0];
    return recent ? recent.servings : C.activeResidents().length;
  };

  /* --------------------------------------------------------- copy tools -- */
  function copyMenu(src) {
    const next = (() => { const i = mealIdx(src.meal); return { date: U.addDays(src.date, 7), meal: src.meal, i }; })();
    HH.formModal({
      title: `Copy menu · ${src.meal}, ${U.fmtDate(src.date)}`, icon: "bi-copy", size: "md", submitText: "Copy menu",
      fields: [
        { type: "html", html: `<div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span>${esc(src.items)}</span><span></span></div>` },
        { name: "date", label: "Copy to date", type: "date", required: true, col: 6, default: next.date },
        { name: "meal", label: "Meal", type: "select", required: true, col: 6, options: meals(), default: src.meal },
        { name: "times", label: "Serving time", type: "select", col: 12, options: [{ value: "source", label: `Keep source time (${timeRange(src)})` }, { value: "meal", label: "Use the target meal's default time" }], default: "source" },
      ],
      values: {},
      onSubmit: (d) => {
        if (d.date === src.date && d.meal === src.meal) return "Choose a different date or meal than the source menu.";
        const dup = dupOf(d.date, d.meal);
        if (dup) return `A ${d.meal} menu for ${U.fmtDate(d.date)} already exists (${dup.id}). Edit or delete it first.`;
        const rec = Object.assign(copyFields(src), { date: d.date, meal: d.meal });
        if (d.times === "meal" || d.meal !== src.meal) { const t = mealType(d.meal); if (t.start) { rec.start = t.start; rec.end = t.end; } }
        const saved = HH.store.insert("menus", rec);
        HH.toast(`Menu copied to ${esc(d.meal)}, ${U.fmtDate(d.date)} (${saved.id}).`, "success");
        refreshAll();
        return true;
      },
    });
  }

  /** Copies every menu in [from, from+days) to the same weekday/meal offset by `shift` days. */
  function copyRange(from, days, shift) {
    const to = U.addDays(from, days - 1);
    const src = HH.store.all("menus").filter((m) => m.date >= from && m.date <= to);
    let copied = 0, skipped = 0;
    src.forEach((m) => {
      const date = U.addDays(m.date, shift);
      if (dupOf(date, m.meal)) { skipped++; return; }
      HH.store.insert("menus", Object.assign(copyFields(m), { date, meal: m.meal }));
      copied++;
    });
    return { src: src.length, copied, skipped };
  }
  function report(r, what) {
    if (!r.src) return HH.toast(`No menus found in the source ${what}.`, "warning");
    HH.toast(`${r.copied} menu(s) copied${r.skipped ? `, ${r.skipped} skipped because a menu already exists for that date & meal` : ""}.`, r.copied ? "success" : "warning", 5000);
    refreshAll();
  }

  function copyDay() {
    HH.formModal({
      title: "Copy a whole day", icon: "bi-calendar2-range", size: "md", submitText: "Copy day",
      fields: [
        { name: "from", label: "Source day", type: "date", required: true, col: 6, default: today },
        { name: "to", label: "Copy to", type: "date", required: true, col: 6, default: U.addDays(today, 7), validate: (v, vals) => (vals.from && v === vals.from ? "Choose a different day." : "") },
        { type: "html", html: `<div class="field-help">All meals of the source day are copied. Meals that already have a menu on the target day are skipped.</div>` },
      ],
      values: {},
      onSubmit: (d) => { if (d.from === d.to) return "Choose a different target day."; report(copyRange(d.from, 1, U.daysBetween(d.from, d.to)), "day"); return true; },
    });
  }
  function copyWeek(fromMonday) {
    const src = fromMonday || U.addDays(mondayOf(today), -7);
    HH.formModal({
      title: "Copy a week", icon: "bi-calendar-week", size: "md", submitText: "Copy week",
      fields: [
        { name: "from", label: "Source week (any day in it)", type: "date", required: true, col: 6, default: src },
        { name: "to", label: "Target week (any day in it)", type: "date", required: true, col: 6, default: U.addDays(mondayOf(today), 7) },
        { type: "html", html: `<div class="field-help">Copies Monday–Sunday of the source week onto the same weekdays of the target week. Existing menus are never overwritten — conflicts are skipped and reported.</div>` },
      ],
      values: {},
      onSubmit: (d) => {
        const a = mondayOf(d.from), b = mondayOf(d.to);
        if (a === b) return "Source and target are the same week.";
        report(copyRange(a, 7, U.daysBetween(a, b)), "week"); return true;
      },
    });
  }

  /* -------------------------------------------------------- daily CRUD --- */
  let tabs = null;
  const daily = HH.CrudPage({
    mount: "#mnDaily", collection: "menus", entity: "Menu", icon: "bi-journal-text",
    searchPlaceholder: "Search dishes, ingredients, notes…",
    searchKeys: ["id", "meal", "items", "ingredients", "notes", (m) => U.fmtDate(m.date), (m) => weekday(m.date)],
    tabs: [
      { key: "all", label: "All Menus" },
      { key: "today", label: "Today", filter: (m) => m.date === today },
      { key: "upcoming", label: "Upcoming", filter: (m) => m.date > today },
      { key: "past", label: "Past", filter: (m) => m.date < today },
    ],
    tabsHash: false,
    filters: [{ key: "meal", label: "All meals", options: () => meals() }],
    dateFilter: { key: "date", label: "Date" },
    defaultSort: { key: "date", dir: "desc" },
    columns: [
      { key: "date", label: "Date", value: (m) => `${m.date}-${mealIdx(m.meal)}`, csv: (m) => m.date, render: (m) => `<div class="cell-strong nowrap">${U.fmtDate(m.date)}${m.date === today ? ' <span class="badge-hh tone-yellow">Today</span>' : ""}</div><div class="cell-muted">${weekday(m.date)}</div>` },
      { key: "meal", label: "Meal", value: (m) => mealIdx(m.meal), csv: (m) => m.meal, render: (m) => `<span class="badge-hh tone-${mealTone(m.meal)}">${esc(m.meal)}</span>` },
      { key: "items", label: "Menu items", sortable: false, render: (m) => `<div class="mn-items" title="${esc(m.items)}">${esc(m.items)}</div>` },
      { key: "time", label: "Serving time", value: (m) => m.start, csv: (m) => `${m.start}-${m.end}`, render: (m) => `<span class="nowrap">${timeRange(m)}</span>` },
      { key: "cost", label: "Cost / plate", value: (m) => Number(m.cost) || 0, render: (m) => `<span class="money">${U.fmtMoney(m.cost)}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "servings", label: "Servings", value: (m) => Number(m.servings) || 0, cls: "t-center", thCls: "t-center" },
      { key: "total", label: "Est. total", value: (m) => (Number(m.cost) || 0) * (Number(m.servings) || 0), render: (m) => `<span class="money">${U.fmtMoney((Number(m.cost) || 0) * (Number(m.servings) || 0))}</span>`, cls: "t-right", thCls: "t-right" },
    ],
    csvColumns: [
      ["Menu ID", (m) => m.id], ["Date", (m) => m.date], ["Day", (m) => weekday(m.date)], ["Meal", (m) => m.meal], ["Items", (m) => m.items], ["Ingredients", (m) => m.ingredients],
      ["Start", (m) => m.start], ["End", (m) => m.end], ["Cost per plate", (m) => m.cost], ["Servings", (m) => m.servings], ["Notes", (m) => m.notes],
    ].map(([label, value]) => ({ label, value })),
    fields, formSize: "lg",
    defaults: () => { const meal = meals()[0] || ""; return withMealTimes({ date: today, meal, cost: 0, servings: expectedServings(meal) }); },
    presetsFromQuery: (p) => {
      const out = {};
      if (p.date && /^\d{4}-\d{2}-\d{2}$/.test(p.date)) out.date = p.date;
      if (p.meal && meals().includes(p.meal)) { out.meal = p.meal; out.start = ""; out.end = ""; out.servings = expectedServings(p.meal); }
      return withMealTimes(Object.assign({ meal: meals()[0] }, out));
    },
    beforeSave: (d, prev) => {
      if (!meals().includes(d.meal)) return "Choose a valid meal.";
      const dup = dupOf(d.date, d.meal, prev && prev.id);
      if (dup) return `A ${d.meal} menu for ${U.fmtDate(d.date)} already exists (${dup.id}). Each date can have only one menu per meal — edit that menu instead.`;
      if (d.end <= d.start) return "Serving end time must be after the start time.";
      d.cost = Number(d.cost) || 0; d.servings = Number(d.servings) || 0;
    },
    afterSave: () => refreshSide(),
    afterDelete: () => refreshSide(),
    titleOf: (m) => `${m.meal} menu for ${U.fmtDate(m.date)}`,
    view: (m) => `<div class="stack">
        <div class="detail-head"><span class="chip-icon chip-icon--lg tone-${mealTone(m.meal)}"><i class="bi bi-journal-text"></i></span>
          <div><h3>${esc(m.meal)} · ${U.fmtDate(m.date)}</h3><div class="text-2">${weekday(m.date)} · ${timeRange(m)}</div></div>
          <div>${m.date === today ? '<span class="badge-hh tone-yellow">Today</span>' : m.date > today ? '<span class="badge-hh tone-blue">Upcoming</span>' : '<span class="badge-hh tone-gray">Past</span>'}</div></div>
        <div class="detail-block"><div class="detail-block__title">Menu items</div><div class="row-flex">${String(m.items || "").split(",").map((x) => x.trim()).filter(Boolean).map((x) => `<span class="badge-hh tone-navy">${esc(x)}</span>`).join("")}</div></div>
        ${HH.ui.kv([
          ["Ingredients", esc(m.ingredients), true],
          ["Cost per plate", U.fmtMoney(m.cost)], ["Expected servings", U.fmtNum(m.servings)],
          ["Estimated total cost", U.fmtMoney((Number(m.cost) || 0) * (Number(m.servings) || 0))], ["Meals served (attendance)", (() => { const s = C.attendanceSheet(m.date, m.meal); return s && s.meal === m.meal ? `${C.mealCount(m.date, m.meal)} present · <a class="link-hh" href="meal-attendance.html?date=${m.date}#history">view sheet</a>` : m.date <= today ? "No attendance sheet" : "—"; })()],
          ["Notes", esc(m.notes), true],
        ])}
      </div>`,
    viewSize: "lg", viewIcon: "bi-journal-text",
    viewFooter: () => [
      { label: "Copy menu", icon: "bi-copy", left: true, onClick: (m, ctx) => { ctx.close(); setTimeout(() => copyMenu(m), 320); } },
      { label: "Week planner", icon: "bi-calendar-week", left: true, onClick: (m, ctx) => { ctx.close(); wk.start = mondayOf(m.date); tabs.set("weekly"); renderWeek(); } },
    ],
    actions: [
      { label: "Copy menu", icon: "bi-copy", handler: (m) => copyMenu(m) },
      { label: "Show in week planner", icon: "bi-calendar-week", handler: (m) => { wk.start = mondayOf(m.date); tabs.set("weekly"); renderWeek(); } },
    ],
    toolbarButtons: [
      { label: "Copy a day", icon: "bi-calendar2-range", handler: () => copyDay() },
      { label: "Copy last week → next week", icon: "bi-calendar-week", handler: () => copyWeek() },
    ],
    exportName: "menus", printTitle: "Mess menus",
  });
  function syncDateInputs() { const r = $("#mnDaily"); r.querySelector("[data-from]").value = daily.state.from || ""; r.querySelector("[data-to]").value = daily.state.to || ""; }

  /* ------------------------------------------------------- week planner -- */
  const wk = { start: mondayOf(today) };
  function weekMenus(start) {
    const days = U.dateList(start, U.addDays(start, 6));
    const all = HH.store.all("menus");
    return { days, get: (d, meal) => all.find((m) => m.date === d && m.meal === meal) };
  }
  function renderWeek() {
    const { days, get } = weekMenus(wk.start);
    const end = days[6];
    const filled = days.reduce((n, d) => n + meals().filter((m) => get(d, m)).length, 0);
    const cost = days.reduce((s, d) => s + U.sum(meals().map((m) => get(d, m)).filter(Boolean), (x) => (Number(x.cost) || 0) * (Number(x.servings) || 0)), 0);
    const isThis = wk.start === mondayOf(today);
    $("[data-wk-title]").innerHTML = `${U.fmtDate(wk.start)} – ${U.fmtDate(end)} ${isThis ? '<span class="badge-hh tone-yellow">This week</span>' : ""}`;
    $("[data-wk-sub]").textContent = `${filled} of ${days.length * meals().length} meal slots planned · estimated food cost ${U.fmtMoney(cost)}`;
    $("[data-wk-date]").value = wk.start;
    $('[data-wk="this"]').disabled = isThis;
    $("[data-wk-grid]").innerHTML = days.map((d) => `<div class="mn-day ${d === today ? "is-today" : ""} ${d < today ? "is-past" : ""}">
        <div class="mn-day__head"><b>${weekday(d)}</b><span>${U.fmtDate(d, "DD MMM")}</span>${d === today ? '<span class="badge-hh tone-yellow">Today</span>' : ""}</div>
        ${meals().map((meal) => {
          const m = get(d, meal);
          return m
            ? `<button type="button" class="mn-cell is-filled tone-edge-${mealTone(meal)}" data-view="${m.id}" title="Open ${esc(meal)} menu"><span class="mn-cell__meal">${esc(meal)} <small>${U.fmtTime(m.start)}</small></span><span class="mn-cell__items">${esc(m.items)}</span><span class="mn-cell__meta">${U.fmtMoney(m.cost)} · ${U.fmtNum(m.servings)} plates</span></button>`
            : `<button type="button" class="mn-cell is-empty" data-add="${d}|${esc(meal)}" title="Add ${esc(meal)} menu for ${U.fmtDate(d)}"><span class="mn-cell__meal">${esc(meal)}</span><span class="mn-cell__add"><i class="bi bi-plus-lg"></i> Add</span></button>`;
        }).join("")}
      </div>`).join("");
  }
  function printWeek() {
    const { days, get } = weekMenus(wk.start);
    const html = `<table><thead><tr><th>Day</th>${meals().map((m) => `<th>${esc(m)}</th>`).join("")}</tr></thead><tbody>${days.map((d) => `<tr><td><b>${weekday(d)}</b><br><span class="muted">${U.fmtDate(d)}</span></td>${meals().map((meal) => { const m = get(d, meal); return `<td>${m ? `${esc(m.items)}<br><span class="muted">${timeRange(m)}</span>` : '<span class="muted">— not planned —</span>'}</td>`; }).join("")}</tr>`).join("")}</tbody></table>`;
    HH.printHTML(`Weekly menu · ${U.fmtDate(wk.start)} – ${U.fmtDate(days[6])}`, html, { subtitle: HH.store.settings().hostel.name });
  }
  const wkPanel = root.querySelector('[data-panel="weekly"]');
  wkPanel.addEventListener("click", (e) => {
    const b = e.target.closest("[data-wk]");
    if (b) {
      const a = b.dataset.wk;
      if (a === "prev") wk.start = U.addDays(wk.start, -7);
      if (a === "next") wk.start = U.addDays(wk.start, 7);
      if (a === "this") wk.start = mondayOf(today);
      if (a === "print") return printWeek();
      if (a === "copy") return copyWeek(wk.start);
      return renderWeek();
    }
    const v = e.target.closest("[data-view]"); if (v) return daily.openView(v.dataset.view);
    const add = e.target.closest("[data-add]");
    if (add) { const [date, meal] = add.dataset.add.split("|"); daily.openForm(null, withMealTimes({ date, meal, servings: expectedServings(meal) })); }
  });
  $("[data-wk-date]").addEventListener("change", (e) => { if (e.target.value) { wk.start = mondayOf(e.target.value); renderWeek(); } });

  /* -------------------------------------------------------------- tabs --- */
  let current = "daily";
  function refreshSide() { renderStats(); if (current === "weekly") renderWeek(); }
  function refreshAll() { daily.refresh(); refreshSide(); }
  renderStats();
  tabs = HH.ui.tabs($("[data-mn-tabs]"), [
    { key: "daily", label: "Daily Menus", icon: "bi-journal-text" },
    { key: "weekly", label: "Weekly Planner", icon: "bi-calendar-week" },
  ], (k) => { current = k; HH.ui.panels(root, k); if (k === "weekly") renderWeek(); }, { hash: true });
  window.addEventListener("hh:datachange", (e) => { const c = e.detail && e.detail.col; if (c === "menus" || c === "settings" || c === "*") refreshSide(); });
})();
