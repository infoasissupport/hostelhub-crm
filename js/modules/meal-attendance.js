/* ==========================================================================
   HostelHub — Meal Attendance module
   #mark     mark Present / Absent / N/A for one date + meal (one sheet each)
   #history  saved sheets, view / edit / delete / export / print, resident lookup
   Sheet schema: attendance { id: ATT-YYYYMMDD-<meal initial>, date, meal, marks:{ residentId: 'P'|'A'|'NA' }, updatedAt }
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const root = document.getElementById("moduleRoot");
  const MARK = { P: "Present", A: "Absent", NA: "N/A" };
  const meals = () => L.list("mealTypes");
  const mealIdx = (m) => Math.max(0, meals().indexOf(m));
  const sheetId = (date, meal) => `ATT-${date.replace(/-/g, "")}-${meal[0]}`;
  const getSheet = (date, meal) => { const s = HH.store.get("attendance", sheetId(date, meal)); return s && s.meal === meal ? s : null; };
  const conflictSheet = (date, meal) => { const s = HH.store.get("attendance", sheetId(date, meal)); return s && s.meal !== meal ? s : null; };
  const planMeals = (r) => { const p = r.messPlan && L.plan(r.messPlan); return p ? p.meals || [] : []; };
  const roomOf = (r) => (r.roomId ? L.bedLabel(r.roomId, r.bed) : "—");
  const me = () => (HH.store.settings().currentUser || {}).name || "Admin";
  const sortRes = (a, b) => roomOf(a).localeCompare(roomOf(b), undefined, { numeric: true }) || a.name.localeCompare(b.name);
  const eligible = (date) => C.activeResidents().filter((r) => (r.joinDate || r.checkIn || "") <= date).sort(sortRes);
  const defaultMark = (r, meal) => (!planMeals(r).includes(meal) ? "NA" : r.status === "On Leave" ? "A" : "");

  function counts(sheet, branch) {
    const c = { P: 0, A: 0, NA: 0 };
    Object.entries(sheet.marks || {}).forEach(([id, v]) => {
      if (branch && (L.resident(id) || {}).branch !== branch) return;
      if (c[v] != null) c[v]++;
    });
    c.marked = c.P + c.A; c.total = c.P + c.A + c.NA; c.pct = U.pct(c.P, c.marked);
    return c;
  }

  /* ------------------------------------------------------------ shell --- */
  root.innerHTML = `
    <div class="card-hh card-hh--flush mod-tabs"><div data-ma-tabs></div></div>
    <div class="tab-panel stack" data-panel="mark" style="gap:var(--gutter)">
      <section class="card-hh">
        <div class="ma-controls">
          <div class="field"><label for="maDate">Date</label><input type="date" class="input-hh" id="maDate"></div>
          <div class="field"><label for="maMeal">Meal</label><select class="select-hh" id="maMeal"></select></div>
          <div class="field"><label for="maBranch">Branch</label><select class="select-hh" id="maBranch"></select></div>
          <div class="field"><label for="maRoom">Room</label><select class="select-hh" id="maRoom"></select></div>
          <div class="field ma-controls__search"><label for="maSearch">Find resident</label><div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" id="maSearch" placeholder="Name, ID or room…"></div></div>
        </div>
        <div data-ma-status></div>
        <div class="ma-counters" data-ma-counters></div>
      </section>
      <section class="card-hh card-hh--flush">
        <div class="card-hh__head"><div><h2 class="card-hh__title" data-ma-title>Residents</h2><div class="card-hh__sub" data-ma-sub></div></div>
          <div class="card-hh__tools">
            <span class="text-2" style="font-size:var(--fs-xs)">Mark all shown:</span>
            <button type="button" class="btn-hh btn-hh--sm" data-all="P"><i class="bi bi-check2-all" style="color:var(--green)"></i>Present</button>
            <button type="button" class="btn-hh btn-hh--sm" data-all="A"><i class="bi bi-x-lg" style="color:var(--red)"></i>Absent</button>
            <button type="button" class="btn-hh btn-hh--sm" data-all="NA"><i class="bi bi-dash-circle"></i>N/A</button>
          </div></div>
        <div class="bulk-bar" data-ma-bulk><span data-ma-selcount></span>
          <button type="button" class="btn-hh btn-hh--sm" data-sel="P"><i class="bi bi-check2"></i>Mark Present</button>
          <button type="button" class="btn-hh btn-hh--sm" data-sel="A"><i class="bi bi-x"></i>Mark Absent</button>
          <button type="button" class="btn-hh btn-hh--sm" data-sel="NA"><i class="bi bi-dash"></i>Mark N/A</button>
          <button type="button" class="btn-hh btn-hh--sm btn-hh--ghost" data-sel-clear>Clear selection</button></div>
        <div class="table-wrap"><table class="table-hh ma-table"><thead><tr>
          <th class="col-check"><input type="checkbox" class="form-check-input" data-ma-checkall aria-label="Select all shown"></th>
          <th>Resident</th><th>Room / Bed</th><th>Mess plan</th><th>Attendance</th></tr></thead><tbody data-ma-rows></tbody></table></div>
        <div class="ma-savebar">
          <span data-ma-dirty class="text-2"></span>
          <span class="spacer"></span>
          <button type="button" class="btn-hh" data-ma-discard><i class="bi bi-arrow-counterclockwise"></i>Discard changes</button>
          <button type="button" class="btn-hh btn-hh--primary" data-ma-save><i class="bi bi-check2"></i>Save attendance</button>
        </div>
      </section>
    </div>
    <div class="tab-panel stack" data-panel="history" style="gap:var(--gutter)">
      <div id="maHistory" class="stack" style="gap:var(--gutter)"></div>
      <section class="card-hh" data-ma-lookup>
        <div class="card-hh__head"><span class="chip-icon tone-purple"><i class="bi bi-person-lines-fill"></i></span>
          <div><h2 class="card-hh__title">Resident attendance lookup</h2><div class="card-hh__sub">Attendance % per meal over the last 30 days (present ÷ marked present or absent).</div></div>
          <div class="card-hh__tools ma-lookup-tools"><div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" data-lk-q placeholder="Filter residents…" aria-label="Filter residents"></div><select class="select-hh" data-lk-res aria-label="Resident"></select></div></div>
        <div data-lk-body></div>
      </section>
    </div>`;
  const $ = (s) => root.querySelector(s);

  /* ------------------------------------------------------------ mark ---- */
  const today = U.todayISO();
  const st = { date: today, meal: meals()[0] || "Breakfast", branch: "", room: "", q: "", marks: {}, snapshot: "{}", sel: new Set() };
  const qDate = U.qs("date");
  if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) && qDate <= today) st.date = qDate;
  const qMeal = U.qs("meal");
  if (qMeal && meals().includes(qMeal)) st.meal = qMeal;

  const dirty = () => JSON.stringify(st.marks) !== st.snapshot;
  let hist = null, tabs = null;

  function load() {
    const sheet = getSheet(st.date, st.meal);
    const marks = {};
    eligible(st.date).forEach((r) => { const v = sheet && sheet.marks[r.id]; marks[r.id] = v || defaultMark(r, st.meal); });
    st.marks = marks; st.snapshot = JSON.stringify(marks); st.sel.clear();
    renderMark();
  }

  function shownResidents() {
    const q = st.q.toLowerCase();
    return eligible(st.date).filter((r) => (!st.branch || r.branch === st.branch) && (!st.room || r.roomId === st.room) &&
      (!q || [r.name, r.id, roomOf(r), r.phone].join(" ").toLowerCase().includes(q)));
  }

  function renderControls() {
    $("#maDate").max = today; $("#maDate").value = st.date;
    $("#maMeal").innerHTML = HH.ui.options(meals(), st.meal);
    $("#maBranch").innerHTML = HH.ui.options(L.branchOptions(), st.branch, "All branches");
    const rooms = HH.store.all("rooms").filter((r) => !st.branch || r.branch === st.branch).sort((a, b) => a.number.localeCompare(b.number, undefined, { numeric: true }));
    if (st.room && !rooms.some((r) => r.id === st.room)) st.room = "";
    $("#maRoom").innerHTML = HH.ui.options(rooms.map((r) => ({ value: r.id, label: `${r.number}${st.branch ? "" : " · " + L.branchName(r.branch)}` })), st.room, "All rooms");
  }

  function renderStatus() {
    const sheet = getSheet(st.date, st.meal);
    const clash = conflictSheet(st.date, st.meal);
    const mt = (HH.store.settings().mealTypes || []).find((m) => m.name === st.meal) || {};
    let html;
    if (clash) html = `<div class="alert-hh tone-red"><i class="bi bi-exclamation-octagon"></i><span>Sheet id <b>${clash.id}</b> is already used by <b>${esc(clash.meal)}</b> on this date (meal names share the initial “${esc(st.meal[0])}”). Rename one meal type in Settings before saving.</span><span></span></div>`;
    else if (sheet) html = `<div class="alert-hh tone-green"><i class="bi bi-cloud-check"></i><span><b>Saved sheet</b> · ${esc(st.meal)} on ${U.fmtDate(st.date)} · last saved <b>${U.fmtDateTime(sheet.updatedAt)}</b>${sheet.updatedBy ? ` by ${esc(sheet.updatedBy)}` : ""}. Saving again will overwrite it.</span><span class="mono text-2">${sheet.id}</span></div>`;
    else html = `<div class="alert-hh tone-blue"><i class="bi bi-info-circle"></i><span><b>New sheet</b> · ${esc(st.meal)} on ${U.fmtDate(st.date)}${mt.start ? ` (${U.fmtTime(mt.start)} – ${U.fmtTime(mt.end)})` : ""} has not been saved yet. Residents whose mess plan excludes ${esc(st.meal.toLowerCase())} start as N/A; residents on leave start as Absent.</span><span></span></div>`;
    $("[data-ma-status]").innerHTML = html;
  }

  function renderCounters() {
    const c = { P: 0, A: 0, NA: 0, "": 0 };
    Object.values(st.marks).forEach((v) => (c[v] = (c[v] || 0) + 1));
    const shown = shownResidents();
    const total = Object.keys(st.marks).length;
    const box = (label, v, tone, icon) => `<div class="ma-counter tone-${tone}"><i class="bi ${icon}"></i><div><b>${v}</b><span>${label}</span></div></div>`;
    $("[data-ma-counters]").innerHTML =
      box("Present", c.P, "green", "bi-check-circle-fill") + box("Absent", c.A, "red", "bi-x-circle-fill") + box("N/A", c.NA, "navy", "bi-dash-circle-fill") +
      box("Not marked", c[""], "orange", "bi-question-circle-fill") + box("Attendance", `${U.pct(c.P, c.P + c.A)}%`, "blue", "bi-graph-up");
    $("[data-ma-title]").textContent = `Residents (${shown.length}${shown.length !== total ? ` of ${total}` : ""})`;
    $("[data-ma-sub]").textContent = `${st.meal} · ${U.fmtDate(st.date)} · active residents who had joined by this date`;
    const d = dirty();
    $("[data-ma-dirty]").innerHTML = d ? `<i class="bi bi-circle-fill" style="color:var(--orange);font-size:8px"></i> Unsaved changes` : getSheet(st.date, st.meal) ? `<i class="bi bi-check2"></i> All changes saved` : "Not saved yet";
    $("[data-ma-discard]").disabled = !d;
    $("[data-ma-bulk]").classList.toggle("is-visible", st.sel.size > 0);
    $("[data-ma-selcount]").textContent = `${st.sel.size} selected`;
  }

  function segHTML(id, v) {
    return `<div class="ma-seg" role="group" aria-label="Attendance">${["P", "A", "NA"].map((k) => `<button type="button" data-mark="${k}" data-id="${id}" class="${v === k ? "is-on" : ""}" aria-pressed="${v === k}"><i class="bi ${k === "P" ? "bi-check-lg" : k === "A" ? "bi-x-lg" : "bi-dash-lg"}"></i><span>${MARK[k]}</span></button>`).join("")}</div>`;
  }

  function renderRows() {
    const shown = shownResidents();
    $("[data-ma-rows]").innerHTML = shown.length ? shown.map((r) => {
      const v = st.marks[r.id] || "";
      const pm = planMeals(r);
      return `<tr data-row="${r.id}" class="ma-row is-${v || "none"}">
        <td class="col-check"><input type="checkbox" class="form-check-input" data-pick="${r.id}" ${st.sel.has(r.id) ? "checked" : ""} aria-label="Select ${esc(r.name)}"></td>
        <td>${HH.ui.person(r.name, `${r.id}${r.status === "On Leave" ? " · On leave" : ""}`, r.photo)}</td>
        <td class="nowrap">${esc(roomOf(r))}</td>
        <td>${r.messPlan ? `<span class="nowrap">${esc(L.planName(r.messPlan))}</span>${pm.includes(st.meal) ? "" : `<div class="cell-muted">excludes ${esc(st.meal)}</div>`}` : '<span class="text-3">No plan</span>'}</td>
        <td>${segHTML(r.id, v)}</td></tr>`;
    }).join("") : `<tr><td colspan="5">${HH.ui.empty("No residents match these filters", "bi-people", "Change branch / room or clear the search.")}</td></tr>`;
    const ca = $("[data-ma-checkall]");
    ca.checked = shown.length > 0 && shown.every((r) => st.sel.has(r.id));
  }

  function renderMark() { renderControls(); renderStatus(); renderRows(); renderCounters(); }

  function setMark(id, v) {
    st.marks[id] = v;
    const tr = root.querySelector(`tr[data-row="${id}"]`);
    if (tr) {
      tr.className = `ma-row is-${v || "none"}`;
      tr.querySelectorAll("[data-mark]").forEach((b) => { const on = b.dataset.mark === v; b.classList.toggle("is-on", on); b.setAttribute("aria-pressed", on); });
    }
  }

  async function guard(message) {
    if (!dirty()) return true;
    return HH.confirm(message || "You have unsaved attendance changes. Discard them?", { title: "Discard changes?", okText: "Discard", danger: true, icon: "bi-pencil-square" });
  }

  async function save() {
    if (st.date > today) return HH.toast("Attendance cannot be saved for a future date.", "error");
    const clash = conflictSheet(st.date, st.meal);
    if (clash) return HH.toast(`Sheet ${clash.id} already belongs to ${esc(clash.meal)}. Rename one of the meal types first.`, "error");
    const ids = Object.keys(st.marks);
    if (!ids.length) return HH.toast("There are no eligible residents for this date.", "warning");
    const existing = getSheet(st.date, st.meal);
    if (existing && !dirty()) return HH.toast("No changes to save — this sheet is already up to date.", "info");
    const unmarked = ids.filter((id) => !st.marks[id]);
    if (unmarked.length) {
      const ok = await HH.confirm(`<b>${unmarked.length}</b> resident(s) are not marked yet. Save them as <b>Absent</b>?`, { title: "Unmarked residents", okText: "Save as Absent", icon: "bi-question-circle" });
      if (!ok) return;
    }
    if (existing) {
      const ok = await HH.confirm(`Attendance for <b>${esc(st.meal)}</b> on <b>${U.fmtDate(st.date)}</b> was already saved on <b>${U.fmtDateTime(existing.updatedAt)}</b>${existing.updatedBy ? ` by ${esc(existing.updatedBy)}` : ""}. Overwrite it with your changes?`, { title: "Overwrite saved sheet?", okText: "Overwrite", icon: "bi-exclamation-triangle", tone: "orange" });
      if (!ok) return;
    }
    unmarked.forEach((id) => (st.marks[id] = "A"));
    const marks = Object.assign({}, existing ? existing.marks : {}, st.marks);
    const rec = { date: st.date, meal: st.meal, marks, updatedBy: me() };
    if (existing) HH.store.update("attendance", existing.id, rec);
    else HH.store.insert("attendance", Object.assign({ id: sheetId(st.date, st.meal) }, rec));
    st.snapshot = JSON.stringify(st.marks);
    const c = counts({ marks });
    HH.toast(`${esc(st.meal)} attendance for ${U.fmtDate(st.date)} saved — ${c.P} present, ${c.A} absent, ${c.NA} N/A.`, "success");
    renderMark();
    hist && hist.refresh();
  }

  // control events
  $("#maDate").addEventListener("change", async (e) => {
    const v = e.target.value;
    if (!v || v > today) { HH.toast(!v ? "Choose a date." : "You can't mark attendance for a future date.", "error"); e.target.value = st.date; return; }
    if (!(await guard())) { e.target.value = st.date; return; }
    st.date = v; load();
  });
  $("#maMeal").addEventListener("change", async (e) => {
    if (!(await guard())) { e.target.value = st.meal; return; }
    st.meal = e.target.value; load();
  });
  $("#maBranch").addEventListener("change", (e) => { st.branch = e.target.value; st.room = ""; renderControls(); renderRows(); renderCounters(); });
  $("#maRoom").addEventListener("change", (e) => { st.room = e.target.value; renderRows(); renderCounters(); });
  $("#maSearch").addEventListener("input", U.debounce((e) => { st.q = e.target.value.trim(); renderRows(); renderCounters(); }, 160));

  const markPanel = root.querySelector('[data-panel="mark"]');
  markPanel.addEventListener("click", (e) => {
    const m = e.target.closest("[data-mark]");
    if (m) { setMark(m.dataset.id, m.dataset.mark); renderCounters(); return; }
    const all = e.target.closest("[data-all]");
    if (all) {
      const shown = shownResidents();
      if (!shown.length) return HH.toast("No residents are shown.", "warning");
      const v = all.dataset.all;
      const skip = v === "NA" ? [] : shown.filter((r) => !planMeals(r).includes(st.meal));
      shown.forEach((r) => { if (!skip.includes(r)) setMark(r.id, v); }); renderCounters();
      HH.toast(`${shown.length - skip.length} resident(s) marked ${MARK[v]}.${skip.length ? ` ${skip.length} whose plan excludes ${esc(st.meal)} kept as is (mark them individually if needed).` : ""} Remember to save.`, "info", 5000);
      return;
    }
    const sel = e.target.closest("[data-sel]");
    if (sel) {
      const n = st.sel.size; st.sel.forEach((id) => setMark(id, sel.dataset.sel)); st.sel.clear(); renderRows(); renderCounters();
      HH.toast(`${n} selected resident(s) marked ${MARK[sel.dataset.sel]}.`, "info");
      return;
    }
    if (e.target.closest("[data-sel-clear]")) { st.sel.clear(); renderRows(); renderCounters(); return; }
    if (e.target.closest("[data-ma-save]")) { save(); return; }
    if (e.target.closest("[data-ma-discard]")) {
      HH.confirm("Discard your unsaved changes and reload the last saved state?", { title: "Discard changes?", okText: "Discard", danger: true }).then((ok) => { if (ok) { load(); HH.toast("Changes discarded.", "info"); } });
    }
  });
  markPanel.addEventListener("change", (e) => {
    if (e.target.matches("[data-pick]")) { e.target.checked ? st.sel.add(e.target.dataset.pick) : st.sel.delete(e.target.dataset.pick); renderCounters(); const shown = shownResidents(); $("[data-ma-checkall]").checked = shown.length > 0 && shown.every((r) => st.sel.has(r.id)); }
    if (e.target.matches("[data-ma-checkall]")) { shownResidents().forEach((r) => (e.target.checked ? st.sel.add(r.id) : st.sel.delete(r.id))); renderRows(); renderCounters(); }
  });
  window.addEventListener("beforeunload", (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ""; } });

  /* --------------------------------------------------------- history ---- */
  function sheetRows(s, branch) {
    return Object.entries(s.marks || {}).map(([id, v]) => { const r = L.resident(id) || { id, name: "(removed resident)", branch: "" }; return { id, name: r.name, room: roomOf(r), branch: r.branch, mark: v }; })
      .filter((x) => !branch || x.branch === branch).sort((a, b) => a.room.localeCompare(b.room, undefined, { numeric: true }) || a.name.localeCompare(b.name));
  }
  const sheetCols = [
    { label: "Resident ID", value: (x) => x.id }, { label: "Resident", value: (x) => x.name }, { label: "Room / Bed", value: (x) => x.room },
    { label: "Branch", value: (x) => L.branchName(x.branch) }, { label: "Attendance", value: (x) => MARK[x.mark] || x.mark },
  ];
  const histBranch = () => (hist ? hist.state.filters.branch : "");
  function exportSheet(s) { HH.exportCSV(`attendance-${s.date}-${s.meal.toLowerCase()}.csv`, sheetCols, sheetRows(s, histBranch())); }
  function printSheet(s) {
    const b = histBranch(); const c = counts(s, b);
    HH.printTable(`${s.meal} attendance · ${U.fmtDate(s.date)}`, sheetCols, sheetRows(s, b), `${b ? L.branchName(b) : "All branches"} · Present ${c.P} · Absent ${c.A} · N/A ${c.NA} · ${c.pct}% attendance`);
  }
  async function editSheet(s) {
    if ((s.date !== st.date || s.meal !== st.meal) && !(await guard("You have unsaved changes on the current sheet. Discard them and open this one?"))) return;
    document.querySelectorAll(".modal.show").forEach((m) => bootstrap.Modal.getInstance(m)?.hide());
    if (s.date !== st.date || s.meal !== st.meal) { st.date = s.date; st.meal = s.meal; load(); }
    tabs.set("mark");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function sheetView(s) {
    const b = histBranch(); const c = counts(s, b); const rows = sheetRows(s, b);
    const list = (k) => { const xs = rows.filter((x) => x.mark === k); return xs.length ? `<div class="ma-namelist">${xs.map((x) => `<a href="resident-details.html?id=${x.id}#meals"><b>${esc(x.name)}</b><span>${esc(x.room)}</span></a>`).join("")}</div>` : '<span class="text-3">None</span>'; };
    return `<div class="stack">
      <div class="detail-head"><span class="chip-icon chip-icon--lg tone-orange"><i class="bi bi-egg-fried"></i></span>
        <div><h3>${esc(s.meal)} · ${U.fmtDate(s.date)}</h3><div class="text-2">${U.DAYS[U.parse(s.date).getDay()]} · ${b ? esc(L.branchName(b)) : "All branches"} · last saved ${U.fmtDateTime(s.updatedAt)}${s.updatedBy ? ` by ${esc(s.updatedBy)}` : ""}</div></div>
        <div><span class="badge-hh tone-blue">${c.pct}% present</span></div></div>
      <div class="grid grid-4 grid-gap-sm">
        <div class="detail-block"><div class="detail-block__title">Present</div><b class="fw-800" style="font-size:1.3rem;color:var(--green)">${c.P}</b></div>
        <div class="detail-block"><div class="detail-block__title">Absent</div><b class="fw-800" style="font-size:1.3rem;color:var(--red)">${c.A}</b></div>
        <div class="detail-block"><div class="detail-block__title">N/A</div><b class="fw-800" style="font-size:1.3rem">${c.NA}</b></div>
        <div class="detail-block"><div class="detail-block__title">Attendance</div><b class="fw-800" style="font-size:1.3rem">${c.pct}%</b>${HH.ui.progress(c.pct, "var(--green)")}</div>
      </div>
      <div class="detail-block"><div class="detail-block__title">Present (${c.P})</div>${list("P")}</div>
      <div class="detail-block"><div class="detail-block__title">Absent (${c.A})</div>${list("A")}</div>
      <div class="detail-block"><div class="detail-block__title">Not applicable (${c.NA})</div>${list("NA")}</div>
    </div>`;
  }

  hist = HH.CrudPage({
    mount: "#maHistory", actionsHost: "inline", collection: "attendance", entity: "Attendance sheet", entityPlural: "Attendance sheets", icon: "bi-egg-fried",
    searchPlaceholder: "Search date, meal or sheet id…",
    search: (s) => [s.id, s.meal, s.date, U.fmtDate(s.date), U.DAYS[U.parse(s.date).getDay()]].join(" "),
    filters: [
      { key: "meal", label: "All meals", options: () => meals() },
      { key: "branch", label: "All branches (counts)", options: () => L.branchOptions(), match: () => true },
    ],
    dateFilter: { key: "date", label: "Date" },
    defaultSort: { key: "date", dir: "desc" },
    columns: [
      { key: "date", label: "Date", value: (s) => `${s.date}-${mealIdx(s.meal)}`, csv: (s) => s.date, render: (s) => `<div class="cell-strong nowrap">${U.fmtDate(s.date)}</div><div class="cell-muted">${U.DAYS[U.parse(s.date).getDay()]}</div>` },
      { key: "meal", label: "Meal", value: (s) => mealIdx(s.meal), csv: (s) => s.meal, render: (s) => `<span class="badge-hh tone-${["yellow", "blue", "green", "purple", "pink"][mealIdx(s.meal) % 5]}">${esc(s.meal)}</span>` },
      { key: "P", label: "Present", value: (s) => counts(s, histBranch()).P, cls: "t-center", thCls: "t-center" },
      { key: "A", label: "Absent", value: (s) => counts(s, histBranch()).A, cls: "t-center", thCls: "t-center" },
      { key: "NA", label: "N/A", value: (s) => counts(s, histBranch()).NA, cls: "t-center", thCls: "t-center" },
      { key: "pct", label: "% Present", value: (s) => counts(s, histBranch()).pct, csv: (s) => `${counts(s, histBranch()).pct}%`, render: (s) => { const p = counts(s, histBranch()).pct; return `<div class="ma-pct"><b>${p}%</b>${HH.ui.progress(p, "var(--green)")}</div>`; } },
      { key: "updatedAt", label: "Last saved", value: (s) => s.updatedAt || "", render: (s) => `<span class="nowrap">${U.fmtDateTime(s.updatedAt)}</span>${s.updatedBy ? `<div class="cell-muted">${esc(s.updatedBy)}</div>` : ""}` },
    ],
    stats: (all) => {
      const last7 = all.filter((s) => s.date >= U.addDays(today, -6));
      const tot = last7.reduce((t, s) => { const c = counts(s); t.P += c.P; t.m += c.marked; return t; }, { P: 0, m: 0 });
      const todays = all.filter((s) => s.date === today);
      return [
        { label: "Saved Sheets", value: U.fmtNum(all.length), icon: "bi-journal-check", tone: "blue", meta: "All dates and meals" },
        { label: "Today's Sheets", value: `${todays.length}/${meals().length}`, icon: "bi-calendar-check", tone: todays.length === meals().length ? "green" : "orange", meta: todays.length === meals().length ? "All meals recorded" : `Missing: ${meals().filter((m) => !todays.some((s) => s.meal === m)).join(", ")}`, onClick: () => { const miss = meals().find((m) => !todays.some((s) => s.meal === m)) || st.meal; editSheet({ date: today, meal: miss }); } },
        { label: "Avg Attendance (7 days)", value: `${U.pct(tot.P, tot.m)}%`, icon: "bi-graph-up-arrow", tone: "purple", meta: `${tot.P} meals served` },
        { label: "Meals Served Today", value: U.fmtNum(todays.reduce((n, s) => n + counts(s).P, 0)), icon: "bi-egg-fried", tone: "yellow", meta: todays.map((s) => `${s.meal[0]}: ${counts(s).P}`).join(" · ") || "No sheet saved yet" },
      ];
    },
    noAdd: true, noEdit: true,
    toolbarButtons: [{ label: "Mark attendance", icon: "bi-pencil-square", cls: "btn-hh--primary", handler: () => tabs.set("mark") }],
    view: sheetView, viewSize: "lg", viewIcon: "bi-egg-fried",
    viewFooter: () => [
      { label: "Export CSV", icon: "bi-filetype-csv", left: true, onClick: (s) => exportSheet(s) },
      { label: "Print", icon: "bi-printer", left: true, onClick: (s) => printSheet(s) },
      { label: "Edit sheet", icon: "bi-pencil", cls: "btn-hh--soft-blue", onClick: (s) => editSheet(s) },
    ],
    actions: [
      { label: "Edit in Mark Attendance", icon: "bi-pencil", handler: (s) => editSheet(s) },
      { label: "Export sheet CSV", icon: "bi-filetype-csv", handler: (s) => exportSheet(s) },
      { label: "Print sheet", icon: "bi-printer", handler: (s) => printSheet(s) },
    ],
    deleteMessage: (s) => `Delete the <b>${esc(s.meal)}</b> attendance sheet for <b>${U.fmtDate(s.date)}</b> (${Object.keys(s.marks || {}).length} marks)? Meal counts and charges for that meal will no longer include it.`,
    afterDelete: (s) => { if (s.date === st.date && s.meal === st.meal && !dirty()) load(); else renderStatus(); },
    exportName: "meal-attendance", printTitle: "Meal attendance history",
  });

  // ?date= preselects the history filter as well
  if (qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate)) {
    hist.state.from = qDate; hist.state.to = qDate;
    const hr = $("#maHistory");
    hr.querySelector("[data-from]").value = qDate; hr.querySelector("[data-to]").value = qDate;
    hist.refresh(false);
  }

  /* -------------------------------------------------- resident lookup ---- */
  const lk = { q: "", res: "" };
  function lookupOptions() {
    const q = lk.q.toLowerCase();
    return C.activeResidents().filter((r) => !q || [r.name, r.id, roomOf(r)].join(" ").toLowerCase().includes(q)).sort((a, b) => a.name.localeCompare(b.name))
      .map((r) => ({ value: r.id, label: `${r.name} (${r.id}) · ${roomOf(r)}` }));
  }
  function renderLookup() {
    const opts = lookupOptions();
    if (lk.q && opts.length && !opts.some((o) => o.value === lk.res)) lk.res = opts[0].value;
    $("[data-lk-res]").innerHTML = HH.ui.options(opts, lk.res, opts.length ? "Select a resident…" : "No residents match");
    const body = $("[data-lk-body]");
    const r = lk.res && L.resident(lk.res);
    if (!r) { body.innerHTML = HH.ui.empty("Choose a resident to see their meal attendance", "bi-person-lines-fill", "Use the filter box to narrow the list."); return; }
    const from = U.addDays(today, -29);
    const days = U.dateList(from, today);
    const rows = meals().map((m) => {
      const t = { meal: m, P: 0, A: 0, NA: 0, none: 0, cells: [] };
      days.forEach((d) => {
        const s = getSheet(d, m); const v = s ? s.marks[r.id] : null;
        if (v === "P" || v === "A" || v === "NA") t[v]++; else t.none++;
        t.cells.push(`<i class="ma-day is-${v || "none"}" title="${U.fmtDate(d)} · ${v ? MARK[v] : s ? "Not on sheet" : "No sheet"}"></i>`);
      });
      t.pct = U.pct(t.P, t.P + t.A);
      return t;
    });
    const all = rows.reduce((s, x) => { s.P += x.P; s.A += x.A; return s; }, { P: 0, A: 0 });
    body.innerHTML = `<div class="stack">
      <div class="row-between">${HH.ui.person(r.name, `${r.id} · ${roomOf(r)} · ${r.messPlan ? L.planName(r.messPlan) : "No mess plan"}`, r.photo)}
        <div class="row-flex"><span class="badge-hh tone-blue">${U.pct(all.P, all.P + all.A)}% overall</span><a class="btn-hh btn-hh--sm" href="resident-details.html?id=${r.id}#meals"><i class="bi bi-box-arrow-up-right"></i>Resident profile</a></div></div>
      <div class="table-wrap"><table class="table-hh table-compact"><thead><tr><th>Meal</th><th class="t-center">Present</th><th class="t-center">Absent</th><th class="t-center">N/A</th><th class="t-center">No record</th><th>Attendance</th><th>Last 30 days (${U.fmtDate(from)} → today)</th></tr></thead>
        <tbody>${rows.map((x) => `<tr><td class="cell-strong">${esc(x.meal)}</td><td class="t-center">${x.P}</td><td class="t-center">${x.A}</td><td class="t-center">${x.NA}</td><td class="t-center">${x.none}</td><td><div class="ma-pct"><b>${x.pct}%</b>${HH.ui.progress(x.pct, "var(--green)")}</div></td><td><div class="ma-strip">${x.cells.join("")}</div></td></tr>`).join("")}</tbody></table></div>
      <div class="rb-legend ma-legend"><span><i class="ma-day is-P"></i>Present</span><span><i class="ma-day is-A"></i>Absent</span><span><i class="ma-day is-NA"></i>N/A</span><span><i class="ma-day is-none"></i>No record</span></div>
    </div>`;
  }
  $("[data-lk-q]").addEventListener("input", U.debounce((e) => { lk.q = e.target.value.trim(); renderLookup(); }, 160));
  $("[data-lk-res]").addEventListener("change", (e) => { lk.res = e.target.value; renderLookup(); });

  /* -------------------------------------------------------------- tabs --- */
  tabs = HH.ui.tabs($("[data-ma-tabs]"), [
    { key: "mark", label: "Mark Attendance", icon: "bi-pencil-square" },
    { key: "history", label: "Attendance History", icon: "bi-clock-history" },
  ], (k) => { HH.ui.panels(root, k); if (k === "history") { hist && hist.refresh(); renderLookup(); } }, { hash: true, initial: qDate ? "history" : "mark" });

  load();
  renderLookup();
  window.addEventListener("hh:datachange", (e) => {
    const col = e.detail && e.detail.col;
    if (["residents", "messPlans", "rooms", "*", "settings"].includes(col) || (col === "attendance" && e.detail.external)) {
      if (!dirty()) load(); else { renderStatus(); renderCounters(); }
      renderLookup();
    }
  });
})();
