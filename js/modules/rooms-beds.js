/* ==========================================================================
   HostelHub — Rooms & Beds module
   Tabs: #rooms (room CRUD) · #beds (visual bed map) · #occupancy (analytics)
   Bed occupancy is always DERIVED from active residents' roomId + bed.
   Requires js/modules/residents.js (HH.residents.checkBed / logHistory).
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const R = HH.residents;
  const root = document.getElementById("moduleRoot");
  const STATUSES = ["Available", "Maintenance", "Closed"];
  const BASE_FAC = ["Wi-Fi", "Attached Bath", "AC", "Study Table", "Wardrobe", "Balcony", "Geyser", "Fan"];
  const isLive = (r) => r.status === "Active" || r.status === "On Leave";
  const me = () => (HH.store.settings().currentUser || {}).name || "Admin";

  const facilities = () => Array.from(new Set(BASE_FAC.concat(...HH.store.all("rooms").map((r) => r.facilities || []))));
  const roomTypes = () => HH.store.settings().roomTypes || [];
  const typeOf = (name) => roomTypes().find((t) => t.name === name);
  const floorLabel = (f) => (Number(f) === 0 ? "Ground floor" : `Floor ${f}`);
  const byNumber = (a, b) => String(a.number).localeCompare(String(b.number), undefined, { numeric: true });
  const occupantsOf = (room, map) => room.beds.map((b) => map[`${room.id}|${b.id}`]).filter(Boolean);
  const occupiedCount = (room) => occupantsOf(room, C.bedMap()).length;
  const floorOptions = () => Array.from(new Set(HH.store.all("rooms").map((r) => Number(r.floor)))).sort((a, b) => a - b).map((f) => ({ value: String(f), label: floorLabel(f) }));
  const buildingOptions = (branch) => Array.from(new Set(HH.store.all("rooms").filter((r) => !branch || r.branch === branch).map((r) => r.building))).sort();
  const openTickets = (roomId) => HH.store.all("maintenance").filter((t) => t.roomId === roomId && !["Resolved", "Closed"].includes(t.status));

  /* ------------------------------------------------------------ shell --- */
  root.innerHTML = `
    <div data-rb-stats></div>
    <div class="card-hh card-hh--flush mod-tabs"><div data-rb-tabs></div></div>
    <div class="tab-panel" data-panel="rooms"><div id="rbRooms" class="stack" style="gap:var(--gutter)"></div></div>
    <div class="tab-panel stack" data-panel="beds" style="gap:var(--gutter)">
      <section class="card-hh">
        <div class="toolbar">
          <div class="input-icon"><i class="bi bi-search"></i><input type="search" class="input-hh" data-bm="q" placeholder="Search room or resident…" aria-label="Search bed map"></div>
          <select class="select-hh" data-bm="branch" aria-label="Branch"></select>
          <select class="select-hh" data-bm="building" aria-label="Building"></select>
          <select class="select-hh" data-bm="floor" aria-label="Floor"></select>
          <select class="select-hh" data-bm="type" aria-label="Room type"></select>
          <select class="select-hh" data-bm="status" aria-label="Room status"></select>
          <label class="switch-hh"><input type="checkbox" data-bm="vacant"> <span>Vacant only</span></label>
          <button type="button" class="btn-hh btn-hh--ghost btn-hh--sm" data-bm-clear><i class="bi bi-x-circle"></i>Clear</button>
        </div>
        <div class="rb-legend">
          <span><i class="rb-dot is-occ"></i>Occupied <small>(click to open resident)</small></span>
          <span><i class="rb-dot is-free"></i>Vacant <small>(click to assign)</small></span>
          <span><i class="rb-dot is-maint"></i>Bed under maintenance</span>
          <span><i class="rb-dot is-blocked"></i>Room closed / under maintenance</span>
          <span class="spacer"></span><span data-bm-summary class="text-2"></span>
        </div>
      </section>
      <div data-bm-body class="stack" style="gap:var(--gutter)"></div>
    </div>
    <div class="tab-panel stack" data-panel="occupancy" style="gap:var(--gutter)">
      <section class="card-hh">
        <div class="card-hh__head"><span class="chip-icon tone-yellow"><i class="bi bi-bar-chart-fill"></i></span>
          <div><h2 class="card-hh__title">Occupancy analysis</h2><div class="card-hh__sub">Occupied beds as a share of all beds. Blocked = bed or room under maintenance / closed.</div></div>
          <div class="card-hh__tools">
            <div class="segmented" data-occ-group role="tablist" aria-label="Group occupancy by">
              <button type="button" data-g="branch" class="is-active">Branch</button><button type="button" data-g="building">Building</button><button type="button" data-g="floor">Floor</button><button type="button" data-g="type">Room type</button>
            </div>
            <select class="select-hh" data-occ-branch aria-label="Branch"></select>
          </div>
        </div>
        <div class="chart-legend" style="justify-content:flex-end"><span><i style="background:${HH.colors.blue}"></i>Occupied</span><span><i style="background:${HH.colors.green}"></i>Vacant</span><span><i style="background:${HH.colors.gray}"></i>Blocked</span></div>
        <div class="chart-box chart-box--lg"><canvas id="rbOccChart" role="img" aria-label="Occupancy bar chart"></canvas></div>
      </section>
      <section class="card-hh card-hh--flush">
        <div class="card-hh__head"><div><h2 class="card-hh__title">Occupancy table</h2><div class="card-hh__sub" data-occ-sub></div></div>
          <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--sm" data-occ-export><i class="bi bi-filetype-csv"></i>Export CSV</button><button type="button" class="btn-hh btn-hh--sm" data-occ-print><i class="bi bi-printer"></i>Print</button></div></div>
        <div data-occ-table></div>
      </section>
    </div>`;
  const $ = (s) => root.querySelector(s);

  /* ------------------------------------------------------------ stats --- */
  function renderStats() {
    const rooms = HH.store.all("rooms");
    const o = C.occupancy();
    const cards = [
      { label: "Total Rooms", value: U.fmtNum(rooms.length), icon: "bi-door-closed-fill", tone: "blue", meta: `${rooms.filter((r) => r.status !== "Available").length} under maintenance / closed`, onClick: () => go("rooms") },
      { label: "Total Beds", value: U.fmtNum(o.total), icon: "bi-grid-3x3-gap-fill", tone: "purple", meta: `${o.blocked} blocked`, onClick: () => go("beds") },
      { label: "Occupied Beds", value: U.fmtNum(o.occupied), icon: "bi-person-fill-check", tone: "green", meta: "Held by active residents", onClick: () => go("beds") },
      { label: "Vacant Beds", value: U.fmtNum(o.vacant), icon: "bi-door-open-fill", tone: "orange", meta: "Ready to assign", onClick: () => { bm.vacant = true; syncBedControls(); go("beds"); renderBeds(); } },
      { label: "Occupancy", value: `${o.pct}%`, icon: "bi-pie-chart-fill", tone: "yellow", meta: `${o.occupied} of ${o.total} beds`, onClick: () => go("occupancy") },
    ];
    const host = $("[data-rb-stats]");
    host.innerHTML = HH.ui.statCards(cards);
    HH.ui.bindStatCards(host, cards);
  }

  /* ---------------------------------------------------- assignment ------ */
  /** Assign / transfer a resident into a specific bed (or any free bed of the room). */
  function assignToBed(roomId, bedId, onDone) {
    const room = L.room(roomId); if (!room) return HH.toast("Room not found.", "error");
    if (room.status !== "Available") return HH.toast(`Room ${room.number} is ${room.status.toLowerCase()} — residents cannot be assigned.`, "error");
    const free = C.freeBeds(roomId);
    if (!free.length) return HH.toast(`Room ${room.number} has no vacant bed.`, "warning");
    if (bedId && !free.some((b) => b.id === bedId)) return HH.toast("That bed is no longer vacant.", "error");
    const live = C.activeResidents().sort((a, b) => a.name.localeCompare(b.name));
    const unassigned = live.filter((r) => !r.roomId).map((r) => ({ value: r.id, label: `${r.name} (${r.id}) — no bed` }));
    const others = live.filter((r) => r.roomId && r.roomId !== roomId).map((r) => ({ value: r.id, label: `${r.name} (${r.id}) — transfer from ${L.bedLabel(r.roomId, r.bed)}` }));
    const same = live.filter((r) => r.roomId === roomId).map((r) => ({ value: r.id, label: `${r.name} (${r.id}) — move within room from ${L.bedLabel(r.roomId, r.bed)}` }));
    const residentOpts = unassigned.concat(others, same);
    if (!residentOpts.length) return HH.toast("There are no active residents to assign.", "warning");
    const fields = [
      { type: "html", html: `<div class="alert-hh tone-blue"><i class="bi bi-door-open"></i><span>Room <b>${esc(room.number)}</b> · ${esc(room.type)} · ${esc(L.branchName(room.branch))} · ${free.length} vacant bed(s). ${unassigned.length} resident(s) are waiting without a bed.</span><span></span></div>` },
      { name: "residentId", label: "Resident", type: "select", required: true, col: 12, options: residentOpts, placeholder: "Select resident…", help: "Residents without a bed are listed first. Choosing someone who already has a bed transfers them." },
      { name: "bed", label: "Bed", type: "select", required: true, col: 6, options: free.map((b) => ({ value: b.id, label: b.label })), default: bedId || (free[0] && free[0].id) },
      { name: "rent", label: "Monthly rent (₹)", type: "number", required: true, col: 6, min: 0, step: 100, default: room.rent },
      { name: "date", label: "Effective date", type: "date", required: true, col: 6, default: U.todayISO() },
      { name: "note", label: "Note", type: "text", col: 6, placeholder: "Reason for assignment / transfer", maxlength: 160 },
    ];
    const extra = bedId ? [{ label: "Mark bed under maintenance", icon: "bi-wrench", cls: "btn-hh--ghost", left: true, onClick: (ctx) => { if (setBedStatus(roomId, bedId, "Maintenance")) { ctx.close(); onDone && onDone(); } } }] : [];
    HH.formModal({
      title: `Assign bed · ${room.number}`, icon: "bi-person-plus", size: "lg", fields, values: {}, submitText: "Assign bed", extraButtons: extra,
      onSubmit: (d) => {
        const r = L.resident(d.residentId);
        if (!r || !isLive(r)) return "Choose an active resident.";
        const err = R.checkBed(roomId, d.bed, r.id); if (err) return err;
        const from = r.roomId ? L.bedLabel(r.roomId, r.bed) : "none";
        const to = L.bedLabel(roomId, d.bed);
        const action = r.roomId ? "Room transferred" : "Room assigned";
        HH.store.update("residents", r.id, {
          branch: room.branch, roomId, bed: d.bed, rent: Number(d.rent),
          history: R.logHistory(r, action, `${from} → ${to}${d.note ? " · " + d.note : ""}`),
        });
        HH.toast(`${esc(r.name)}: ${action.toLowerCase()} to ${esc(to)}.`, "success");
        onDone && onDone();
        return true;
      },
    });
  }

  /** Change a bed's status. Returns true on success. */
  function setBedStatus(roomId, bedId, status) {
    const room = L.room(roomId); if (!room) return false;
    const bed = room.beds.find((b) => b.id === bedId); if (!bed) return false;
    const occ = C.bedMap()[`${roomId}|${bedId}`];
    if (status === "Maintenance" && occ) { HH.toast(`${bed.label} is occupied by ${esc(occ.name)}. Move the resident before marking it under maintenance.`, "error"); return false; }
    HH.store.update("rooms", roomId, { beds: room.beds.map((b) => (b.id === bedId ? Object.assign({}, b, { status }) : Object.assign({}, b))) });
    HH.toast(`${room.number} / ${bed.label} marked ${status}.`, "success");
    return true;
  }

  function addBed(roomId) {
    const room = L.room(roomId); if (!room) return false;
    const n = room.beds.reduce((m, b) => Math.max(m, parseInt(String(b.id).replace(/\D/g, ""), 10) || 0), 0) + 1;
    const beds = room.beds.map((b) => Object.assign({}, b)).concat([{ id: `B${n}`, label: `Bed ${n}`, status: "Available" }]);
    HH.store.update("rooms", roomId, { beds, capacity: beds.length });
    HH.toast(`Bed ${n} added to ${room.number}. Capacity is now ${beds.length}.`, "success");
    return true;
  }

  async function removeBed(roomId, bedId) {
    const room = L.room(roomId); if (!room) return false;
    const bed = room.beds.find((b) => b.id === bedId); if (!bed) return false;
    const occ = C.bedMap()[`${roomId}|${bedId}`];
    if (occ) { HH.toast(`${bed.label} is occupied by ${esc(occ.name)} and cannot be removed.`, "error"); return false; }
    if (room.beds.length <= 1) { HH.toast("A room must keep at least one bed. Delete or close the room instead.", "error"); return false; }
    const ok = await HH.confirm(`Remove <b>${esc(bed.label)}</b> from room <b>${esc(room.number)}</b>? Capacity will drop to ${room.beds.length - 1}.`, { title: "Remove bed", danger: true, okText: "Remove bed" });
    if (!ok) return false;
    const beds = room.beds.filter((b) => b.id !== bedId).map((b) => Object.assign({}, b));
    HH.store.update("rooms", roomId, { beds, capacity: beds.length });
    HH.toast(`${bed.label} removed from ${room.number}.`, "success");
    return true;
  }

  async function setRoomStatus(roomId, status) {
    const room = L.room(roomId); if (!room) return;
    const occ = occupiedCount(room);
    if (status !== "Available" && occ) return HH.toast(`Room ${room.number} has ${occ} resident(s). Move them out before setting it to ${status}.`, "error");
    const ok = await HH.confirm(`Set room <b>${esc(room.number)}</b> to <b>${status}</b>?`, { title: "Change room status", okText: "Update" });
    if (!ok) return;
    HH.store.update("rooms", roomId, { status });
    HH.toast(`Room ${room.number} is now ${status}.`, "success");
  }

  /* ----------------------------------------------------------- room view - */
  function roomView(room) {
    const map = C.bedMap();
    const s = C.roomStats(room, map);
    const tickets = openTickets(room.id);
    const bedsHTML = room.beds.map((b) => {
      const occ = map[`${room.id}|${b.id}`];
      const state = occ ? "Occupied" : b.status !== "Available" ? "Maintenance" : room.status !== "Available" ? "Blocked" : "Vacant";
      const who = occ ? `<a class="link-hh" href="resident-details.html?id=${occ.id}">${esc(occ.name)}</a> <span class="text-3">${occ.id}${occ.status === "On Leave" ? " · on leave" : ""}</span>` : `<span class="text-3">${state === "Blocked" ? `Room ${esc(room.status.toLowerCase())}` : state === "Maintenance" ? "Out of service" : "Available"}</span>`;
      const btns = [];
      if (!occ && state === "Vacant") btns.push(`<button type="button" class="btn-hh btn-hh--sm btn-hh--soft-blue" data-rv="assign" data-bed="${b.id}"><i class="bi bi-person-plus"></i>Assign</button>`);
      if (!occ && b.status === "Available") btns.push(`<button type="button" class="btn-hh btn-hh--sm" data-rv="maint" data-bed="${b.id}"><i class="bi bi-wrench"></i>Maintenance</button>`);
      if (!occ && b.status !== "Available") btns.push(`<button type="button" class="btn-hh btn-hh--sm btn-hh--green" data-rv="avail" data-bed="${b.id}"><i class="bi bi-check2"></i>Mark available</button>`);
      if (!occ) btns.push(`<button type="button" class="btn-hh btn-hh--sm btn-hh--icon btn-hh--ghost" data-rv="remove" data-bed="${b.id}" aria-label="Remove ${esc(b.label)}" title="Remove bed"><i class="bi bi-trash"></i></button>`);
      return `<tr><td class="nowrap cell-strong">${esc(b.label)}</td><td>${HH.ui.badge(state, state === "Occupied" ? "blue" : state === "Vacant" ? "green" : state === "Maintenance" ? "orange" : "gray")}</td><td>${who}</td><td class="t-right"><div class="row-flex" style="justify-content:flex-end">${btns.join("")}</div></td></tr>`;
    }).join("");
    return `<div class="stack">
      <div class="detail-head"><span class="chip-icon chip-icon--lg tone-blue"><i class="bi bi-door-closed"></i></span>
        <div><h3>Room ${esc(room.number)}</h3><div class="text-2">${esc(room.type)} · ${esc(room.building)} · ${floorLabel(room.floor)} · ${esc(L.branchName(room.branch))}</div></div>
        <div>${HH.ui.badge(room.status)}</div></div>
      <div class="grid grid-3 grid-gap-sm">
        <div class="detail-block"><div class="detail-block__title">Occupancy</div><div class="row-between"><b class="fw-800" style="font-size:1.3rem">${s.pct}%</b><span class="text-2">${s.occupied}/${s.total} beds</span></div>${HH.ui.progress(s.pct, "var(--blue)")}</div>
        <div class="detail-block"><div class="detail-block__title">Monthly rent</div><b class="fw-800 money" style="font-size:1.3rem">${U.fmtMoney(room.rent)}</b><span class="text-2">per bed · capacity ${room.capacity}</span></div>
        <div class="detail-block"><div class="detail-block__title">Vacancy</div><b class="fw-800" style="font-size:1.3rem">${s.vacant}</b><span class="text-2">vacant · ${s.blocked} blocked</span></div>
      </div>
      <div class="detail-block"><div class="row-between"><div class="detail-block__title">Beds & occupants</div><button type="button" class="btn-hh btn-hh--sm" data-rv="addbed"><i class="bi bi-plus-lg"></i>Add bed</button></div>
        <div class="table-wrap"><table class="table-hh table-compact"><tbody>${bedsHTML}</tbody></table></div></div>
      <div class="detail-block"><div class="detail-block__title">Facilities</div><div class="row-flex">${(room.facilities || []).length ? room.facilities.map((f) => `<span class="badge-hh tone-blue">${esc(f)}</span>`).join("") : '<span class="text-3">No facilities listed</span>'}</div></div>
      <div class="detail-block"><div class="row-between"><div class="detail-block__title">Open maintenance tickets (${tickets.length})</div><a class="btn-hh btn-hh--sm" href="maintenance.html?action=add&roomId=${room.id}&branch=${room.branch}"><i class="bi bi-tools"></i>New ticket</a></div>
        ${tickets.length ? `<div class="stack-sm">${tickets.map((t) => `<a class="rb-ticket" href="maintenance.html?view=${t.id}"><span class="mono text-2">${t.id}</span><span class="truncate">${esc(t.title)}</span>${HH.ui.badge(t.priority)}${HH.ui.badge(t.status)}</a>`).join("")}</div>` : '<span class="text-3">No open tickets for this room.</span>'}</div>
      ${room.notes ? `<div class="detail-block"><div class="detail-block__title">Notes</div><div>${esc(room.notes)}</div></div>` : ""}
    </div>`;
  }

  function bindRoomView(m, roomId) {
    const rerender = () => { const r = L.room(roomId); if (!r) return m.close(); m.body.innerHTML = roomView(r); };
    m.body.addEventListener("click", async (e) => {
      const b = e.target.closest("[data-rv]"); if (!b) return;
      const bed = b.dataset.bed;
      switch (b.dataset.rv) {
        case "assign": assignToBed(roomId, bed, rerender); break;
        case "maint": if (setBedStatus(roomId, bed, "Maintenance")) rerender(); break;
        case "avail": if (setBedStatus(roomId, bed, "Available")) rerender(); break;
        case "remove": if (await removeBed(roomId, bed)) rerender(); break;
        case "addbed": if (addBed(roomId)) rerender(); break;
      }
    });
  }

  /* --------------------------------------------------------- room CRUD --- */
  function fields(rec) {
    const id = rec && rec.id;
    return [
      { type: "section", label: "Location", icon: "bi-geo-alt" },
      { name: "branch", label: "Hostel branch", type: "select", required: true, col: 4, options: L.branchOptions(), default: "BR-1" },
      { name: "building", label: "Building / block", required: true, col: 4, maxlength: 40, placeholder: "e.g. Block A", help: "Pick an existing block or type a new one." },
      { name: "floor", label: "Floor", type: "number", required: true, col: 4, min: 0, max: 50, step: 1, default: 1, help: "0 = ground floor",
        validate: (v) => (Number.isInteger(Number(v)) ? "" : "Floor must be a whole number.") },
      { name: "number", label: "Room number", required: true, col: 4, maxlength: 12, placeholder: "e.g. A-109", pattern: "[A-Za-z0-9 /-]+", patternMsg: "Use letters, digits, spaces, '-' or '/'.",
        validate: (v, vals) => {
          const branch = vals.branch; if (!branch) return "";
          const dup = HH.store.all("rooms").find((r) => r.id !== id && r.branch === branch && r.number.trim().toLowerCase() === v.trim().toLowerCase());
          return dup ? `Room ${dup.number} already exists in ${L.branchName(branch)} (${dup.id}).` : "";
        } },
      { name: "type", label: "Room type", type: "select", required: true, col: 4, options: roomTypes().map((t) => ({ value: t.name, label: `${t.name} (${t.capacity} bed${t.capacity > 1 ? "s" : ""})` })),
        onChange: (v, f) => { const t = typeOf(v); if (!t) return; f.elements.capacity.value = t.capacity; f.elements.rent.value = t.rent; } },
      { name: "status", label: "Room status", type: "select", required: true, col: 4, options: STATUSES, default: "Available" },
      { type: "section", label: "Capacity & rent", icon: "bi-currency-rupee" },
      { name: "capacity", label: "Capacity (beds)", type: "number", required: true, col: 6, min: 1, max: 20, step: 1,
        help: rec ? `Changing capacity adds or removes vacant beds. ${occupiedCount(rec)} bed(s) are occupied now.` : "One bed is created per unit of capacity.",
        validate: (v) => (Number.isInteger(Number(v)) ? "" : "Capacity must be a whole number.") },
      { name: "rent", label: "Monthly rent per bed (₹)", type: "number", required: true, col: 6, min: 0, max: 200000, step: 100 },
      { type: "section", label: "Facilities & notes", icon: "bi-stars" },
      { name: "facilities", label: "", type: "checks", col: 12, options: facilities() },
      { name: "notes", label: "Notes", type: "textarea", rows: 2, col: 12, maxlength: 400, placeholder: "e.g. Ceiling leak repair in progress" },
    ];
  }

  function beforeSave(d, prev) {
    d.floor = Number(d.floor); d.capacity = Number(d.capacity); d.rent = Number(d.rent);
    d.number = d.number.trim().toUpperCase(); d.building = d.building.trim();
    const dup = HH.store.all("rooms").find((r) => (!prev || r.id !== prev.id) && r.branch === d.branch && r.number.toLowerCase() === d.number.toLowerCase());
    if (dup) return `Room ${dup.number} already exists in ${L.branchName(d.branch)}.`;
    if (!prev) {
      d.beds = Array.from({ length: d.capacity }, (_, i) => ({ id: `B${i + 1}`, label: `Bed ${i + 1}`, status: "Available" }));
      const cand = `RM-${d.number.replace(/[^A-Z0-9]/g, "")}`;
      if (!HH.store.get("rooms", cand)) d.id = cand;
      return;
    }
    const map = C.bedMap();
    const occ = prev.beds.filter((b) => map[`${prev.id}|${b.id}`]);
    if (occ.length && d.status !== "Available") return `Room ${prev.number} has ${occ.length} resident(s). Move them out before setting it to ${d.status}.`;
    if (occ.length && d.branch !== prev.branch) return `Room ${prev.number} has residents — move them out before changing its branch.`;
    if (d.capacity < occ.length) return `Capacity cannot be lower than the ${occ.length} occupied bed(s).`;
    let beds = prev.beds.map((b) => Object.assign({}, b));
    if (d.capacity > beds.length) {
      let n = beds.reduce((m, b) => Math.max(m, parseInt(String(b.id).replace(/\D/g, ""), 10) || 0), 0);
      while (beds.length < d.capacity) { n++; beds.push({ id: `B${n}`, label: `Bed ${n}`, status: "Available" }); }
    } else if (d.capacity < beds.length) {
      // drop vacant beds from the end (never an occupied one)
      for (let i = beds.length - 1; i >= 0 && beds.length > d.capacity; i--) if (!map[`${prev.id}|${beds[i].id}`]) beds.splice(i, 1);
    }
    d.beds = beds;
  }

  const rooms = HH.CrudPage({
    mount: "#rbRooms", collection: "rooms", entity: "Room", icon: "bi-door-closed",
    searchPlaceholder: "Search room no., building, type, resident…",
    search: (r) => [r.id, r.number, r.building, r.type, L.branchName(r.branch), (r.facilities || []).join(" "), occupantsOf(r, C.bedMap()).map((x) => x.name).join(" ")].join(" "),
    filters: [
      { key: "branch", label: "All branches", options: () => L.branchOptions() },
      { key: "floor", label: "All floors", options: floorOptions },
      { key: "type", label: "All room types", options: () => roomTypes().map((t) => t.name) },
      { key: "status", label: "Any status", options: STATUSES },
      { key: "occ", label: "Any occupancy", options: ["Has vacancy", "Full", "Empty"], match: (r, v) => { const s = C.roomStats(r); return v === "Full" ? s.vacant === 0 && s.occupied > 0 : v === "Empty" ? s.occupied === 0 : s.vacant > 0; } },
    ],
    defaultSort: { key: "number", dir: "asc" },
    columns: [
      { key: "number", label: "Room", value: (r) => r.number, render: (r) => `<div class="cell-strong">${esc(r.number)}</div><div class="cell-muted">${r.id}</div>` },
      { key: "branch", label: "Branch", value: (r) => L.branchName(r.branch), cls: "nowrap" },
      { key: "building", label: "Building", cls: "nowrap" },
      { key: "floor", label: "Floor", value: (r) => Number(r.floor), render: (r) => floorLabel(r.floor), cls: "nowrap" },
      { key: "type", label: "Type" },
      { key: "occ", label: "Occupancy", value: (r) => C.roomStats(r).pct, csv: (r) => { const s = C.roomStats(r); return `${s.occupied}/${s.total}`; },
        render: (r) => { const s = C.roomStats(r); return `<div class="rb-occ"><span class="nowrap"><b>${s.occupied}</b>/${s.total}</span>${HH.ui.progress(s.pct, "var(--blue)")}</div>`; } },
      { key: "vacant", label: "Vacant", value: (r) => C.roomStats(r).vacant, cls: "t-center", thCls: "t-center" },
      { key: "rent", label: "Rent", value: (r) => Number(r.rent) || 0, render: (r) => `<span class="money">${U.fmtMoney(r.rent)}</span>`, cls: "t-right", thCls: "t-right" },
      { key: "status", label: "Status", render: (r) => HH.ui.badge(r.status) },
    ],
    csvColumns: [
      ["Room ID", (r) => r.id], ["Room No.", (r) => r.number], ["Branch", (r) => L.branchName(r.branch)], ["Building", (r) => r.building], ["Floor", (r) => r.floor],
      ["Type", (r) => r.type], ["Capacity", (r) => r.capacity], ["Occupied", (r) => C.roomStats(r).occupied], ["Vacant", (r) => C.roomStats(r).vacant],
      ["Occupancy %", (r) => C.roomStats(r).pct], ["Rent", (r) => r.rent], ["Facilities", (r) => (r.facilities || []).join("; ")], ["Status", (r) => r.status],
      ["Residents", (r) => occupantsOf(r, C.bedMap()).map((x) => `${x.name} (${x.bed})`).join("; ")], ["Notes", (r) => r.notes],
    ].map(([label, value]) => ({ label, value })),
    fields, formSize: "lg",
    defaults: () => { const t = roomTypes()[0] || { name: "", capacity: 1, rent: 0 }; return { branch: "BR-1", floor: 1, type: t.name, capacity: t.capacity, rent: t.rent, status: "Available", facilities: ["Wi-Fi", "Study Table", "Wardrobe", "Fan"], notes: "" }; },
    presetsFromQuery: (p) => { const out = Object.assign({}, p); const t = typeOf(p.type); if (t) { out.capacity = out.capacity || t.capacity; out.rent = out.rent || t.rent; } return out; },
    onFormReady: (f) => {
      const inp = f.elements.building;
      const dl = document.createElement("datalist"); dl.id = "rbBuildings_" + Math.random().toString(36).slice(2, 7);
      const fill = () => (dl.innerHTML = buildingOptions(f.elements.branch.value).map((b) => `<option value="${esc(b)}">`).join(""));
      fill(); f.appendChild(dl); inp.setAttribute("list", dl.id);
      f.elements.branch.addEventListener("change", fill);
    },
    beforeSave,
    beforeDelete: (r) => { const n = occupiedCount(r); return n ? `Room ${r.number} has ${n} resident(s). Move them out before deleting the room.` : undefined; },
    deleteMessage: (r) => { const t = openTickets(r.id).length; return `Delete room <b>${esc(r.number)}</b> (${r.id}) with ${r.beds.length} bed(s)? ${t ? `${t} open maintenance ticket(s) reference this room and will keep the room id for audit. ` : ""}This cannot be undone.`; },
    titleOf: (r) => `Room ${r.number}`,
    view: roomView, viewSize: "lg", viewIcon: "bi-door-closed",
    onViewReady: (m, r) => bindRoomView(m, r.id),
    viewFooter: (r) => [{ label: "Show on bed map", icon: "bi-grid-3x3-gap", left: true, onClick: (rec, ctx) => { ctx.close(); focusRoom(rec); } }],
    actions: [
      { label: "Assign resident", icon: "bi-person-plus", show: (r) => r.status === "Available" && C.roomStats(r).vacant > 0, handler: (r) => assignToBed(r.id, null, refreshAll) },
      { label: "Add bed", icon: "bi-plus-square", handler: (r) => addBed(r.id) },
      { label: "Show on bed map", icon: "bi-grid-3x3-gap", handler: (r) => focusRoom(r) },
      { label: "Set Available", icon: "bi-check2-circle", show: (r) => r.status !== "Available", handler: (r) => setRoomStatus(r.id, "Available") },
      { label: "Set Maintenance", icon: "bi-wrench", show: (r) => r.status !== "Maintenance", handler: (r) => setRoomStatus(r.id, "Maintenance") },
      { label: "Set Closed", icon: "bi-slash-circle", show: (r) => r.status !== "Closed", handler: (r) => setRoomStatus(r.id, "Closed") },
      { label: "New maintenance ticket", icon: "bi-tools", handler: (r) => (location.href = `maintenance.html?action=add&roomId=${r.id}&branch=${r.branch}`) },
    ],
    exportName: "rooms", printTitle: "Rooms & Beds",
  });

  /* ------------------------------------------------------------ bed map -- */
  const bm = { q: "", branch: "", building: "", floor: "", type: "", status: "", vacant: false };
  function syncBedControls() {
    const sel = (k, opts, ph) => { const el = $(`[data-bm="${k}"]`); el.innerHTML = HH.ui.options(opts, bm[k], ph); };
    sel("branch", L.branchOptions(), "All branches");
    const bOpts = buildingOptions(bm.branch);
    if (bm.building && !bOpts.includes(bm.building)) bm.building = "";
    sel("building", bOpts, "All buildings");
    sel("floor", floorOptions(), "All floors");
    sel("type", roomTypes().map((t) => t.name), "All room types");
    sel("status", STATUSES, "Any room status");
    $('[data-bm="vacant"]').checked = bm.vacant;
    $('[data-bm="q"]').value = bm.q;
  }

  function renderBeds() {
    const map = C.bedMap();
    const q = bm.q.toLowerCase();
    let list = HH.store.all("rooms").filter((r) =>
      (!bm.branch || r.branch === bm.branch) && (!bm.building || r.building === bm.building) && (!bm.floor || String(r.floor) === bm.floor) &&
      (!bm.type || r.type === bm.type) && (!bm.status || r.status === bm.status));
    if (bm.vacant) list = list.filter((r) => C.roomStats(r, map).vacant > 0);
    if (q) list = list.filter((r) => [r.number, r.id, r.building, r.type].join(" ").toLowerCase().includes(q) || occupantsOf(r, map).some((x) => (x.name + " " + x.id).toLowerCase().includes(q)));
    list.sort(byNumber);
    const tot = list.reduce((t, r) => { const s = C.roomStats(r, map); t.occ += s.occupied; t.vac += s.vacant; t.all += s.total; return t; }, { occ: 0, vac: 0, all: 0 });
    $("[data-bm-summary]").innerHTML = `${list.length} room(s) · <b>${tot.occ}</b> occupied · <b>${tot.vac}</b> vacant · ${tot.all} beds`;
    const body = $("[data-bm-body]");
    if (!list.length) { body.innerHTML = `<section class="card-hh">${HH.ui.empty("No rooms match these filters", "bi-grid-3x3-gap", "Clear the filters or turn off “Vacant only”.")}</section>`; return; }
    const byBranch = U.groupBy(list, (r) => r.branch);
    const branchOrder = L.branches().map((b) => b.id).concat(Object.keys(byBranch)).filter((v, i, a) => a.indexOf(v) === i && byBranch[v]);
    body.innerHTML = branchOrder.map((br) => {
      const rs = byBranch[br];
      const st = rs.reduce((t, r) => { const s = C.roomStats(r, map); t.occ += s.occupied; t.all += s.total; t.vac += s.vacant; return t; }, { occ: 0, all: 0, vac: 0 });
      const byBld = U.groupBy(rs, (r) => r.building);
      return `<section class="card-hh">
        <div class="card-hh__head"><span class="chip-icon tone-blue"><i class="bi bi-building"></i></span>
          <div><h2 class="card-hh__title">${esc(L.branchName(br))}</h2><div class="card-hh__sub">${rs.length} rooms · ${st.occ}/${st.all} beds occupied · ${st.vac} vacant</div></div>
          <div class="card-hh__tools"><span class="badge-hh tone-yellow">${U.pct(st.occ, st.all)}% occupied</span></div></div>
        ${Object.keys(byBld).sort().map((bld) => {
          const byFloor = U.groupBy(byBld[bld], (r) => Number(r.floor));
          return `<div class="rb-building"><div class="rb-building__title"><i class="bi bi-buildings"></i>${esc(bld)}</div>
            ${Object.keys(byFloor).map(Number).sort((a, b) => a - b).map((f) => `<div class="rb-floor"><div class="rb-floor__label">${floorLabel(f)}</div><div class="rb-rooms">${byFloor[f].map((r) => roomTile(r, map)).join("")}</div></div>`).join("")}
          </div>`;
        }).join("")}
      </section>`;
    }).join("");
  }

  function roomTile(r, map) {
    const s = C.roomStats(r, map);
    const closed = r.status !== "Available";
    const beds = r.beds.map((b) => {
      const occ = map[`${r.id}|${b.id}`];
      const key = `${r.id}|${b.id}`;
      if (occ) return `<a class="rb-bed is-occ" href="resident-details.html?id=${occ.id}" title="${esc(b.label)} · ${esc(occ.name)} (${occ.id})${occ.status === "On Leave" ? " · on leave" : ""}"><i class="bi ${occ.status === "On Leave" ? "bi-airplane" : "bi-person-fill"}"></i><span>${esc(b.label)}</span><b>${esc(occ.name.split(" ")[0])}</b></a>`;
      if (b.status !== "Available") return `<button type="button" class="rb-bed is-maint" data-bed-menu="${key}" title="${esc(b.label)} · under maintenance"><i class="bi bi-wrench"></i><span>${esc(b.label)}</span><b>Repair</b></button>`;
      if (closed) return `<button type="button" class="rb-bed is-blocked" data-room-view="${r.id}" title="Room ${esc(r.status.toLowerCase())}"><i class="bi bi-slash-circle"></i><span>${esc(b.label)}</span><b>Blocked</b></button>`;
      return `<button type="button" class="rb-bed is-free" data-assign="${key}" title="${esc(b.label)} · vacant — click to assign"><i class="bi bi-plus-circle"></i><span>${esc(b.label)}</span><b>Vacant</b></button>`;
    }).join("");
    return `<div class="rb-room ${closed ? "is-closed" : ""}" data-room-id="${r.id}">
      <div class="rb-room__head"><button type="button" class="rb-room__no" data-room-view="${r.id}" title="Open room ${esc(r.number)}">${esc(r.number)}</button>
        <span class="rb-room__meta">${esc(r.type)} · ${s.occupied}/${s.total}</span>${closed ? HH.ui.badge(r.status) : ""}</div>
      <div class="rb-beds">${beds}</div></div>`;
  }

  function focusRoom(r) {
    Object.assign(bm, { q: "", branch: r.branch, building: r.building, floor: String(r.floor), type: "", status: "", vacant: false });
    syncBedControls(); go("beds"); renderBeds();
    setTimeout(() => { const el = root.querySelector(`[data-room-id="${r.id}"]`); if (el) { el.scrollIntoView({ block: "center", behavior: "smooth" }); el.classList.add("is-flash"); setTimeout(() => el.classList.remove("is-flash"), 1800); } }, 80);
  }

  const bmPanel = root.querySelector('[data-panel="beds"]');
  bmPanel.addEventListener("input", U.debounce((e) => { if (e.target.matches('[data-bm="q"]')) { bm.q = e.target.value.trim(); renderBeds(); } }, 180));
  bmPanel.addEventListener("change", (e) => {
    const k = e.target.dataset.bm; if (!k || k === "q") return;
    bm[k] = k === "vacant" ? e.target.checked : e.target.value;
    if (k === "branch") { bm.building = ""; syncBedControls(); }
    renderBeds();
  });
  bmPanel.addEventListener("click", (e) => {
    if (e.target.closest("[data-bm-clear]")) { Object.assign(bm, { q: "", branch: "", building: "", floor: "", type: "", status: "", vacant: false }); syncBedControls(); renderBeds(); return; }
    const a = e.target.closest("[data-assign]");
    if (a) { const [roomId, bedId] = a.dataset.assign.split("|"); assignToBed(roomId, bedId); return; }
    const v = e.target.closest("[data-room-view]");
    if (v) { rooms.openView(v.dataset.roomView); return; }
    const mb = e.target.closest("[data-bed-menu]");
    if (mb) {
      const [roomId, bedId] = mb.dataset.bedMenu.split("|");
      HH.menu.open(mb, [
        { label: "Mark bed available", icon: "bi-check2-circle", onClick: () => setBedStatus(roomId, bedId, "Available") },
        { label: "View room", icon: "bi-eye", onClick: () => rooms.openView(roomId) },
        { label: "New maintenance ticket", icon: "bi-tools", onClick: () => { const r = L.room(roomId); location.href = `maintenance.html?action=add&roomId=${roomId}&branch=${r ? r.branch : ""}`; } },
      ]);
    }
  });

  /* ---------------------------------------------------------- occupancy -- */
  const occ = { group: "branch", branch: "" };
  let occTable = null;
  function occRows() {
    const map = C.bedMap();
    const list = HH.store.all("rooms").filter((r) => !occ.branch || r.branch === occ.branch);
    const keyOf = {
      branch: (r) => L.branchName(r.branch),
      building: (r) => (occ.branch ? r.building : `${r.building} · ${L.branchName(r.branch)}`),
      floor: (r) => `${r.building} · ${floorLabel(r.floor)}`,
      type: (r) => r.type,
    }[occ.group];
    const groups = U.groupBy(list.slice().sort((a, b) => a.building.localeCompare(b.building) || a.floor - b.floor), keyOf);
    const rows = Object.entries(groups).map(([label, rs]) => {
      const t = { id: label, label, rooms: rs.length, total: 0, occupied: 0, vacant: 0, blocked: 0 };
      rs.forEach((r) => { const s = C.roomStats(r, map); t.total += s.total; t.occupied += s.occupied; t.vacant += s.vacant; t.blocked += s.blocked; });
      t.pct = U.pct(t.occupied, t.total);
      return t;
    });
    if (occ.group === "type") { const order = roomTypes().map((t) => t.name); rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)); }
    if (occ.group === "branch") { const order = L.branches().map((b) => b.name); rows.sort((a, b) => order.indexOf(a.label) - order.indexOf(b.label)); }
    return rows;
  }
  const occColumns = [
    { key: "label", label: { branch: "Branch", building: "Building", floor: "Floor", type: "Room type" }.branch, cls: "cell-strong" },
    { key: "rooms", label: "Rooms", cls: "t-center", thCls: "t-center" },
    { key: "total", label: "Total beds", cls: "t-center", thCls: "t-center" },
    { key: "occupied", label: "Occupied", cls: "t-center", thCls: "t-center" },
    { key: "vacant", label: "Vacant", cls: "t-center", thCls: "t-center" },
    { key: "blocked", label: "Blocked", cls: "t-center", thCls: "t-center" },
    { key: "pct", label: "Occupancy", render: (r) => `<div class="rb-occ"><b class="nowrap">${r.pct}%</b>${HH.ui.progress(r.pct, "var(--yellow-600)")}</div>` },
  ];
  function renderOccupancy() {
    root.querySelectorAll("[data-occ-group] [data-g]").forEach((b) => b.classList.toggle("is-active", b.dataset.g === occ.group));
    const bs = $("[data-occ-branch]"); bs.innerHTML = HH.ui.options(L.branchOptions(), occ.branch, "All branches");
    const rows = occRows();
    occColumns[0].label = { branch: "Branch", building: "Building", floor: "Floor", type: "Room type" }[occ.group];
    const footer = (all) => { const t = all.reduce((s, r) => { ["rooms", "total", "occupied", "vacant", "blocked"].forEach((k) => (s[k] += r[k])); return s; }, { rooms: 0, total: 0, occupied: 0, vacant: 0, blocked: 0 }); return `<tr><td>Total</td><td class="t-center">${t.rooms}</td><td class="t-center">${t.total}</td><td class="t-center">${t.occupied}</td><td class="t-center">${t.vacant}</td><td class="t-center">${t.blocked}</td><td>${U.pct(t.occupied, t.total)}%</td></tr>`; };
    if (!occTable) occTable = new HH.Table($("[data-occ-table]"), { id: "rb-occ", columns: occColumns, rows, paginate: false, footerRow: footer, empty: "No rooms in this selection" });
    else occTable.setRows(rows);
    $("[data-occ-sub]").textContent = `${rows.length} group(s) · ${occ.branch ? L.branchName(occ.branch) : "All branches"}`;
    if (root.querySelector('[data-panel="occupancy"]').hidden) return;
    HH.chart("#rbOccChart", {
      type: "bar",
      data: { labels: rows.map((r) => r.label), datasets: [
        { label: "Occupied", data: rows.map((r) => r.occupied), backgroundColor: HH.colors.blue, borderRadius: 3, stack: "s", maxBarThickness: 46 },
        { label: "Vacant", data: rows.map((r) => r.vacant), backgroundColor: HH.colors.green, borderRadius: 3, stack: "s", maxBarThickness: 46 },
        { label: "Blocked", data: rows.map((r) => r.blocked), backgroundColor: HH.colors.gray, borderRadius: 3, stack: "s", maxBarThickness: 46 }] },
      options: {
        scales: { x: { stacked: true, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } }, y: { stacked: true, beginAtZero: true, ticks: { precision: 0, maxTicksLimit: 6 }, border: { display: false }, title: { display: true, text: "Beds" } } },
        plugins: { tooltip: { mode: "index", intersect: false, callbacks: { footer: (items) => { const r = rows[items[0].dataIndex]; return `Occupancy: ${r.pct}% (${r.occupied}/${r.total})`; } } } },
      },
    });
  }
  const occPanel = root.querySelector('[data-panel="occupancy"]');
  occPanel.addEventListener("click", (e) => {
    const g = e.target.closest("[data-g]"); if (g) { occ.group = g.dataset.g; renderOccupancy(); return; }
    const cols = () => occColumns.map((c) => ({ label: c.label, value: (r) => (c.key === "pct" ? `${r.pct}%` : r[c.key]) }));
    if (e.target.closest("[data-occ-export]")) HH.exportCSV(`occupancy-by-${occ.group}-${U.todayISO()}.csv`, cols(), occRows());
    if (e.target.closest("[data-occ-print]")) HH.printTable(`Occupancy by ${occColumns[0].label.toLowerCase()}`, cols(), occRows(), occ.branch ? L.branchName(occ.branch) : "All branches");
  });
  occPanel.addEventListener("change", (e) => { if (e.target.matches("[data-occ-branch]")) { occ.branch = e.target.value; renderOccupancy(); } });

  /* --------------------------------------------------------------- tabs --- */
  let current = "rooms";
  syncBedControls();
  renderStats();
  const tabs = HH.ui.tabs($("[data-rb-tabs]"), [
    { key: "rooms", label: "All Rooms", icon: "bi-door-closed" },
    { key: "beds", label: "Bed Map", icon: "bi-grid-3x3-gap" },
    { key: "occupancy", label: "Occupancy", icon: "bi-pie-chart" },
  ], (k) => { current = k; HH.ui.panels(root, k); if (k === "beds") renderBeds(); if (k === "occupancy") renderOccupancy(); }, { hash: true });
  function go(k) { tabs.set(k); }

  function refreshAll() {
    renderStats();
    rooms.refresh();
    if (current === "beds") renderBeds();
    if (current === "occupancy") renderOccupancy();
  }
  const queueRefresh = U.debounce(() => { syncBedControls(); refreshAll(); }, 60);
  window.addEventListener("hh:datachange", (e) => { if (["rooms", "residents", "*", "settings", "maintenance"].includes(e.detail && e.detail.col)) queueRefresh(); });

  const pa = document.getElementById("pageActions");
  if (pa) pa.insertAdjacentHTML("afterbegin", `<a class="btn-hh" href="residents.html#unassigned"><i class="bi bi-person-exclamation"></i><span>Residents without bed</span></a>`);
})();
