/* ==========================================================================
   HostelHub — Reports module
   Every figure is derived from stored records through HH.calc so totals
   match the dashboard (revenue = payments by payment date, expenses =
   Approved expenses, pending = HH.calc.openInvoices balances, occupancy =
   HH.calc.occupancy / roomStats).
   Deep links: #<group> selects a group, ?report=<key> opens a report.
   ========================================================================== */
(function () {
  "use strict";
  if (!window.HH || !HH.ready) return;
  const U = HH.util, L = HH.lookup, C = HH.calc, esc = U.esc;
  const root = document.getElementById("moduleRoot");

  const money = (n) => U.fmtMoney(n);
  const isLive = (r) => r.status === "Active" || r.status === "On Leave";
  const T = () => U.todayISO();
  const mobile = () => innerWidth < 576;

  const GROUPS = [
    { key: "residents", label: "Residents & Rooms", icon: "bi-people" },
    { key: "mess", label: "Mess & Meals", icon: "bi-egg-fried" },
    { key: "finance", label: "Finance", icon: "bi-cash-stack" },
    { key: "inventory", label: "Inventory", icon: "bi-box-seam" },
    { key: "staff", label: "Staff", icon: "bi-person-badge" },
    { key: "operations", label: "Operations", icon: "bi-tools" },
  ];
  const PERIODS = [["today", "Today"], ["week", "This Week"], ["month", "This Month"], ["lastMonth", "Last Month"], ["year", "This Year"], ["all", "All Time"], ["custom", "Custom"]];

  /* ------------------------------------------------------------ helpers --- */
  const resBranchMap = () => Object.fromEntries(HH.store.all("residents").map((r) => [r.id, r.branch]));
  const staffMap = () => Object.fromEntries(HH.store.all("staff").map((s) => [s.id, s]));
  const countBy = (arr, fn, val) => { const m = {}; arr.forEach((x) => { const k = fn(x) || "—"; m[k] = (m[k] || 0) + (val ? val(x) : 1); }); return m; };
  const topEntry = (m) => Object.entries(m).sort((a, b) => b[1] - a[1])[0] || ["—", 0];
  const minutes = (a, b) => (a && b ? Math.max(0, Math.round((U.parse(b) - U.parse(a)) / 60000)) : null);
  const fmtDur = (m) => (m == null ? "—" : m >= 60 ? `${Math.floor(m / 60)}h ${U.pad(m % 60)}m` : `${m}m`);

  /** Resolve an open ("All time") range against the dates present in the data. */
  function clipRange(r, dates) {
    const ds = dates.filter(Boolean).map((d) => String(d).slice(0, 10)).sort();
    let from = r.from < "1000" ? ds[0] || T() : r.from;
    let to = r.to > "9000" ? (ds.length && ds[ds.length - 1] > T() ? ds[ds.length - 1] : T()) : r.to;
    if (from > to) from = to;
    return { from, to };
  }
  function monthKeys(from, to) {
    const out = []; let y = +from.slice(0, 4), m = +from.slice(5, 7); const end = to.slice(0, 7);
    for (;;) { const k = `${y}-${U.pad(m)}`; out.push(k); if (k >= end || out.length > 240) break; m++; if (m > 12) { m = 1; y++; } }
    return out;
  }
  /** Day buckets for short ranges, month buckets for long ones. */
  function buckets(r, dates, forceMonth) {
    const { from, to } = clipRange(r, dates);
    if (!forceMonth && U.daysBetween(from, to) <= 62) {
      return { mode: "day", from, to, keys: U.dateList(from, to), key: (d) => String(d).slice(0, 10), label: (k) => { const x = U.parse(k); return `${U.pad(x.getDate())} ${U.MONTHS[x.getMonth()]}`; } };
    }
    return { mode: "month", from, to, keys: monthKeys(from, to), key: (d) => String(d).slice(0, 7), label: (k) => U.monthLabel(k) };
  }
  function series(b, items, dateFn, valFn) {
    const m = Object.fromEntries(b.keys.map((k) => [k, 0]));
    items.forEach((x) => { const d = dateFn(x); if (!d) return; const k = b.key(d); if (k in m) m[k] += valFn ? valFn(x) : 1; });
    return b.keys.map((k) => Math.round(m[k] * 100) / 100);
  }

  /* --- chart configs --- */
  function barCfg(labels, datasets, o = {}) {
    const valAxis = o.horizontal ? "x" : "y", catAxis = o.horizontal ? "y" : "x";
    const vTicks = { maxTicksLimit: 6 }; if (o.money) vTicks.callback = (v) => U.fmtCompact(v); else if (o.pct) vTicks.callback = (v) => v + "%"; else vTicks.precision = 0;
    const scales = {};
    scales[catAxis] = { stacked: !!o.stacked, grid: { display: false }, ticks: { maxRotation: 0, autoSkip: true } };
    scales[valAxis] = { stacked: !!o.stacked, beginAtZero: true, border: { display: false }, ticks: vTicks };
    if (o.pct) scales[valAxis].max = 100;
    if (o.y2) scales.y2 = { position: "right", beginAtZero: true, grid: { display: false }, border: { display: false }, ticks: { maxTicksLimit: 6, callback: (v) => v + "%" } };
    const fmt = (v, ds) => (ds && ds.pct) || (o.pct && !(ds && ds.money)) ? `${v}%` : o.money || (ds && ds.money) ? money(v) : U.fmtNum(v);
    return {
      type: "bar",
      data: { labels, datasets: datasets.map((d, i) => Object.assign({ backgroundColor: HH.palette[i % HH.palette.length], borderColor: HH.palette[i % HH.palette.length], borderRadius: 3, barPercentage: 0.78, categoryPercentage: 0.66, maxBarThickness: 46 }, d)) },
      options: {
        indexAxis: o.horizontal ? "y" : "x",
        scales,
        plugins: {
          legend: { display: datasets.length > 1, position: "bottom", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 14 } },
          tooltip: { mode: "index", intersect: false, callbacks: { label: (c) => `${c.dataset.label || ""}: ${fmt(c.raw, c.dataset)}` } },
        },
      },
    };
  }
  function donutCfg(labels, data, colors, isMoney) {
    return {
      type: "doughnut",
      data: { labels, datasets: [{ data, backgroundColor: colors || labels.map((_, i) => HH.palette[i % HH.palette.length]), borderWidth: 0, hoverOffset: 4 }] },
      options: {
        cutout: "62%",
        plugins: {
          legend: { display: true, position: mobile() ? "bottom" : "right", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, padding: 12 } },
          tooltip: { callbacks: { label: (c) => { const tot = c.dataset.data.reduce((s, x) => s + x, 0); return `${c.label}: ${isMoney ? money(c.raw) : U.fmtNum(c.raw)} (${U.pct(c.raw, tot)}%)`; } } },
        },
      },
    };
  }
  const donutFrom = (m, isMoney, colorFn) => { const e = Object.entries(m).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]); return { config: donutCfg(e.map((x) => x[0]), e.map((x) => Math.round(x[1])), colorFn ? e.map((x, i) => colorFn(x[0], i)) : null, isMoney), empty: !e.length }; };
  const STATUS_COLORS = { green: HH.colors.green, blue: HH.colors.blue, orange: HH.colors.orange, red: HH.colors.red, gray: "#94A3B8", purple: HH.colors.purple };
  const statusColor = (s) => STATUS_COLORS[HH.ui.toneOf(s)] || "#94A3B8";
  const expColor = (name, i) => { const c = (HH.store.settings().expenseCategories || []).find((x) => x.name === name); return (c && c.color) || HH.palette[i % HH.palette.length]; };

  /* --- column helpers --- */
  const get = (key, fn) => fn || ((r) => r[key]);
  const tcol = (key, label, fn, extra) => Object.assign({ key, label, value: get(key, fn), render: (r) => { const v = get(key, fn)(r); return v == null || v === "" ? "—" : esc(v); } }, extra || {});
  const mcol = (key, label, fn) => ({ key, label, cls: "t-right money", thCls: "t-right", value: (r) => Number(get(key, fn)(r)) || 0, render: (r) => money(get(key, fn)(r)) });
  const ncol = (key, label, fn) => ({ key, label, cls: "t-right", thCls: "t-right", value: (r) => Number(get(key, fn)(r)) || 0, render: (r) => U.fmtNum(get(key, fn)(r)) });
  const pcol = (key, label, fn) => ({ key, label, cls: "t-right", thCls: "t-right", value: (r) => get(key, fn)(r), render: (r) => { const v = get(key, fn)(r); return v == null ? "—" : `<b>${v}%</b>`; }, csv: (r) => { const v = get(key, fn)(r); return v == null ? "" : v + "%"; } });
  const dcol = (key, label, fn) => ({ key, label, cls: "nowrap", value: (r) => get(key, fn)(r) || "", render: (r) => U.fmtDate(get(key, fn)(r)), csv: (r) => { const v = get(key, fn)(r); return v ? U.fmtDate(v) : ""; } });
  const dtcol = (key, label, fn) => ({ key, label, cls: "nowrap", value: (r) => get(key, fn)(r) || "", render: (r) => U.fmtDateTime(get(key, fn)(r)), csv: (r) => { const v = get(key, fn)(r); return v ? U.fmtDateTime(v) : ""; } });
  const bcol = (key, label, fn) => ({ key, label, value: get(key, fn), render: (r) => HH.ui.badge(get(key, fn)(r)) });
  const idcol = (key, label, href) => ({ key, label, cls: "nowrap", value: (r) => r[key], render: (r) => (href ? `<a class="link-hh" href="${href(r)}">${esc(r[key])}</a>` : `<span class="mono">${esc(r[key])}</span>`) });
  const branchCol = (fn) => tcol("branch", "Branch", (r) => L.branchName(fn ? fn(r) : r.branch), { cls: "nowrap" });
  const P = (p) => U.page(p);

  /* ============================================================ REPORTS === */
  const REPORTS = [
    /* ---------------------------------------------------- residents --- */
    {
      key: "residentList", group: "residents", title: "Resident List", icon: "bi-person-lines-fill", tone: "blue",
      desc: "Every resident with room, contact, rent and dues.", branch: true, period: "all", hint: "Date range applies to the join date.",
      filters: [{ key: "status", label: "All statuses", options: ["Active", "On Leave", "Inactive", "Checked Out"] }],
      build(ctx) {
        const open = C.openInvoices(); const bal = {};
        open.forEach((i) => (bal[i.residentId] = (bal[i.residentId] || 0) + C.invoiceTotals(i).balance));
        const rows = HH.store.all("residents").filter((r) => ctx.inB(r.branch) && U.inRange(r.joinDate, ctx.r) && (!ctx.f.status || r.status === ctx.f.status))
          .map((r) => Object.assign({}, r, { balance: bal[r.id] || 0, bedText: r.roomId ? L.bedLabel(r.roomId, r.bed) : "—" }));
        const st = countBy(rows, (r) => r.status);
        const live = rows.filter(isLive);
        return {
          cards: [
            { label: "Residents", value: U.fmtNum(rows.length), icon: "bi-people-fill", tone: "blue", meta: ctx.all ? "All records" : `Joined · ${ctx.r.label}` },
            { label: "Active", value: U.fmtNum(st.Active || 0), icon: "bi-person-check-fill", tone: "green", meta: `${st["On Leave"] || 0} on leave` },
            { label: "Checked out / Inactive", value: U.fmtNum((st["Checked Out"] || 0) + (st.Inactive || 0)), icon: "bi-box-arrow-right", tone: "red" },
            { label: "Avg. monthly rent", value: money(live.length ? Math.round(U.sum(live, (r) => r.rent) / live.length) : 0), icon: "bi-house-check", tone: "purple", meta: "Active & on-leave residents" },
            { label: "Dues outstanding", value: money(U.sum(rows, (r) => r.balance)), icon: "bi-hourglass-split", tone: "orange", meta: `${rows.filter((r) => r.balance > 0).length} residents` },
          ],
          charts: [
            Object.assign({ title: "Residents by status" }, donutFrom(st, false, (s) => statusColor(s))),
            (() => {
              const by = ctx.branch === "All" ? countBy(rows, (r) => L.branchName(r.branch)) : countBy(rows, (r) => r.course);
              const e = Object.entries(by).sort((a, b) => b[1] - a[1]).slice(0, 8);
              return { title: ctx.branch === "All" ? "Residents by branch" : "Top courses / occupations", empty: !e.length, config: barCfg(e.map((x) => x[0]), [{ label: "Residents", data: e.map((x) => x[1]), backgroundColor: HH.colors.blue }], { horizontal: ctx.branch !== "All" }) };
            })(),
          ],
          columns: [
            idcol("id", "ID", (r) => P(`pages/resident-details.html?id=${r.id}`)),
            { key: "name", label: "Name", value: (r) => r.name, render: (r) => HH.ui.person(r.name, r.course, r.photo) },
            tcol("gender", "Gender"), tcol("course", "Course / Occupation"), branchCol(), tcol("bedText", "Room / Bed", null, { cls: "nowrap" }),
            tcol("phone", "Phone", null, { cls: "nowrap" }), dcol("joinDate", "Joined"), bcol("status", "Status"), mcol("rent", "Rent"), mcol("balance", "Balance"),
          ],
          rows, sort: { key: "name", dir: "asc" },
          footer: (rs) => ({ name: `${rs.length} residents`, rent: money(U.sum(rs, (r) => r.rent)), balance: money(U.sum(rs, (r) => r.balance)) }),
        };
      },
    },
    {
      key: "occupancy", group: "residents", title: "Room Occupancy", icon: "bi-building-check", tone: "green",
      desc: "Occupied, vacant and blocked beds per room.", branch: true, period: "all", hint: "Occupancy is a live snapshot; the date range applies to the Move-ins column.",
      filters: [{ key: "type", label: "All room types", options: () => L.list("roomTypes") }],
      build(ctx) {
        const map = C.bedMap();
        const live = C.activeResidents();
        const rooms = HH.store.all("rooms").filter((r) => ctx.inB(r.branch) && (!ctx.f.type || r.type === ctx.f.type));
        const rows = rooms.map((room) => Object.assign({ id: room.id, number: room.number, branch: room.branch, type: room.type, floor: room.floor, building: room.building, capacity: room.capacity, rent: room.rent, status: room.status,
          moveIns: live.filter((r) => r.roomId === room.id && U.inRange(r.checkIn || r.joinDate, ctx.r)).length }, C.roomStats(room, map)));
        const o = ctx.f.type ? rows.reduce((t, r) => { t.rooms++; t.total += r.total; t.occupied += r.occupied; t.vacant += r.vacant; t.blocked += r.blocked; return t; }, { rooms: 0, total: 0, occupied: 0, vacant: 0, blocked: 0 }) : C.occupancy(ctx.branch);
        o.pct = U.pct(o.occupied, o.total);
        const types = L.list("roomTypes"); rows.forEach((r) => { if (!types.includes(r.type)) types.push(r.type); });
        const byType = types.map((t) => rows.filter((r) => r.type === t)).filter((g) => g.length);
        return {
          cards: [
            { label: "Rooms", value: U.fmtNum(o.rooms), icon: "bi-door-open-fill", tone: "blue", meta: `${rows.filter((r) => r.status !== "Available").length} under maintenance` },
            { label: "Total beds", value: U.fmtNum(o.total), icon: "bi-grid-3x3-gap-fill", tone: "navy" },
            { label: "Occupied beds", value: `${U.fmtNum(o.occupied)} <small class="text-2">(${o.pct}%)</small>`, icon: "bi-person-fill-check", tone: "yellow" },
            { label: "Vacant beds", value: U.fmtNum(o.vacant), icon: "bi-check2-square", tone: "green" },
            { label: "Blocked beds", value: U.fmtNum(o.blocked), icon: "bi-slash-circle", tone: "red", meta: "Maintenance / unavailable" },
          ],
          charts: [
            { title: "Bed status", sub: `${o.pct}% occupied`, empty: !o.total, config: donutCfg(["Occupied", "Vacant", "Blocked"], [o.occupied, o.vacant, o.blocked], [HH.colors.yellow, HH.colors.gray, HH.colors.red]) },
            { title: "Beds by room type", empty: !byType.length, config: barCfg(byType.map((g) => g[0].type), [
              { label: "Occupied", data: byType.map((g) => U.sum(g, (r) => r.occupied)), backgroundColor: HH.colors.yellow },
              { label: "Vacant", data: byType.map((g) => U.sum(g, (r) => r.vacant)), backgroundColor: HH.colors.gray },
              { label: "Blocked", data: byType.map((g) => U.sum(g, (r) => r.blocked)), backgroundColor: HH.colors.red }], { stacked: true }) },
          ],
          columns: [
            idcol("number", "Room", (r) => P(`pages/rooms-beds.html?view=${r.id}`)), branchCol(), tcol("type", "Type"), tcol("floor", "Floor"),
            ncol("total", "Beds"), ncol("occupied", "Occupied"), ncol("vacant", "Vacant"), ncol("blocked", "Blocked"),
            { key: "pct", label: "Occupancy", value: (r) => r.pct, render: (r) => `<div class="rep-meter">${HH.ui.progress(r.pct, "var(--yellow-600)")}<b>${r.pct}%</b></div>`, csv: (r) => r.pct + "%" },
            bcol("status", "Room status"), ncol("moveIns", "Move-ins"), mcol("rent", "Rent / bed"),
          ],
          rows, sort: { key: "number", dir: "asc" },
          footer: (rs) => { const tot = U.sum(rs, (r) => r.total), occ = U.sum(rs, (r) => r.occupied); return { number: `${rs.length} rooms`, total: U.fmtNum(tot), occupied: U.fmtNum(occ), vacant: U.fmtNum(U.sum(rs, (r) => r.vacant)), blocked: U.fmtNum(U.sum(rs, (r) => r.blocked)), pct: U.pct(occ, tot) + "%", moveIns: U.fmtNum(U.sum(rs, (r) => r.moveIns)) }; },
        };
      },
    },
    {
      key: "vacantBeds", group: "residents", title: "Vacant Beds", icon: "bi-door-open", tone: "orange",
      desc: "Beds ready to allot, with potential rent.", branch: true, period: "all", hint: "Live snapshot; the date range applies to the date a bed was last vacated.",
      filters: [{ key: "type", label: "All room types", options: () => L.list("roomTypes") }],
      build(ctx) {
        const map = C.bedMap();
        const lastOut = {};
        HH.store.all("residents").forEach((r) => { if (r.lastRoom && r.lastBed && r.checkOut) { const k = `${r.lastRoom}|${r.lastBed}`; if (!lastOut[k] || r.checkOut > lastOut[k]) lastOut[k] = r.checkOut; } });
        const rows = [];
        HH.store.all("rooms").filter((r) => ctx.inB(r.branch) && r.status === "Available" && (!ctx.f.type || r.type === ctx.f.type)).forEach((room) => room.beds.forEach((b) => {
          if (b.status !== "Available" || map[`${room.id}|${b.id}`]) return;
          const since = lastOut[`${room.id}|${b.id}`] || "";
          if (!ctx.all && !(since && U.inRange(since, ctx.r))) return;
          rows.push({ id: `${room.id}|${b.id}`, roomId: room.id, room: room.number, bed: b.label, branch: room.branch, type: room.type, floor: room.floor, rent: room.rent, facilities: (room.facilities || []).join(", "), since, days: since ? U.daysBetween(since, T()) : null });
        }));
        const known = rows.filter((r) => r.days != null);
        const byB = ctx.branch === "All" ? countBy(rows, (r) => L.branchName(r.branch)) : countBy(rows, (r) => `Floor ${r.floor}`);
        const eb = Object.entries(byB);
        return {
          cards: [
            { label: "Vacant beds", value: U.fmtNum(rows.length), icon: "bi-door-open-fill", tone: "green", meta: ctx.all && !ctx.f.type ? `of ${C.occupancy(ctx.branch).total} beds` : "" },
            { label: "Rooms with vacancy", value: U.fmtNum(new Set(rows.map((r) => r.roomId)).size), icon: "bi-building", tone: "blue" },
            { label: "Potential rent / month", value: money(U.sum(rows, (r) => r.rent)), icon: "bi-currency-rupee", tone: "yellow", meta: "If every vacant bed is allotted" },
            { label: "Avg. days vacant", value: known.length ? Math.round(U.sum(known, (r) => r.days) / known.length) : "—", icon: "bi-calendar-x", tone: "orange", meta: `${known.length} beds with a known check-out` },
          ],
          charts: [
            Object.assign({ title: "Vacant beds by room type" }, donutFrom(countBy(rows, (r) => r.type))),
            { title: ctx.branch === "All" ? "Vacant beds by branch" : "Vacant beds by floor", empty: !eb.length, config: barCfg(eb.map((x) => x[0]), [{ label: "Vacant beds", data: eb.map((x) => x[1]), backgroundColor: HH.colors.green }]) },
          ],
          columns: [
            idcol("room", "Room", (r) => P(`pages/rooms-beds.html?view=${r.roomId}`)), tcol("bed", "Bed"), branchCol(), tcol("type", "Type"), tcol("floor", "Floor"),
            tcol("facilities", "Facilities"), mcol("rent", "Rent / bed"), dcol("since", "Vacant since"), { key: "days", label: "Days vacant", cls: "t-right", thCls: "t-right", value: (r) => (r.days == null ? -1 : r.days), render: (r) => (r.days == null ? "—" : U.fmtNum(r.days)), csv: (r) => (r.days == null ? "" : r.days) },
          ],
          rows, sort: { key: "room", dir: "asc" },
          footer: (rs) => ({ room: `${rs.length} beds`, rent: money(U.sum(rs, (r) => r.rent)) }),
        };
      },
    },

    /* --------------------------------------------------------- mess --- */
    {
      key: "mealAttendance", group: "mess", title: "Meal Attendance", icon: "bi-egg-fried", tone: "orange",
      desc: "Per-meal headcount against subscribers.", branch: true, period: "week", hint: "Branch filter uses each resident's branch.",
      filters: [{ key: "meal", label: "All meals", options: () => L.list("mealTypes") }],
      build(ctx) {
        const rb = resBranchMap();
        const rows = HH.store.all("attendance").filter((s) => U.inRange(s.date, ctx.r) && (!ctx.f.meal || s.meal === ctx.f.meal)).map((s) => {
          let sub = 0, p = 0, a = 0;
          Object.entries(s.marks || {}).forEach(([id, v]) => { if (v === "NA" || !ctx.inB(rb[id])) return; sub++; if (v === "P") p++; else if (v === "A") a++; });
          return { id: s.id, date: s.date, meal: s.meal, subscribers: sub, present: p, absent: a, pct: U.pct(p, sub) };
        });
        const meals = L.list("mealTypes").filter((m) => !ctx.f.meal || m === ctx.f.meal);
        rows.forEach((r) => { if (!meals.includes(r.meal)) meals.push(r.meal); });
        const b = buckets(ctx.r, rows.map((r) => r.date));
        const served = U.sum(rows, (r) => r.present), subs = U.sum(rows, (r) => r.subscribers);
        const perMeal = meals.map((m) => ({ m, p: U.sum(rows.filter((r) => r.meal === m), (r) => r.present), s: U.sum(rows.filter((r) => r.meal === m), (r) => r.subscribers) }));
        const best = perMeal.slice().sort((x, y) => U.pct(y.p, y.s) - U.pct(x.p, x.s))[0];
        const mealColor = (i) => [HH.colors.yellow, HH.colors.blue, HH.colors.green][i] || HH.palette[(i + 3) % 10];
        return {
          cards: [
            { label: "Meals served", value: U.fmtNum(served), icon: "bi-egg-fried", tone: "orange", meta: perMeal.map((x) => `${esc(x.m)} ${U.fmtNum(x.p)}`).join(" · ") },
            { label: "Avg. attendance", value: `${U.pct(served, subs)}%`, icon: "bi-percent", tone: "green", meta: `${U.fmtNum(subs)} subscribed meals` },
            { label: "Absences", value: U.fmtNum(U.sum(rows, (r) => r.absent)), icon: "bi-person-x-fill", tone: "red" },
            { label: "Best attended meal", value: best && best.s ? esc(best.m) : "—", icon: "bi-trophy-fill", tone: "yellow", meta: best && best.s ? `${U.pct(best.p, best.s)}% attendance` : "" },
            { label: "Sheets recorded", value: U.fmtNum(rows.length), icon: "bi-clipboard-check-fill", tone: "blue", meta: `${b.mode === "day" ? b.keys.length + " days" : b.keys.length + " months"} in range` },
          ],
          charts: [
            { title: `Meals served per ${b.mode}`, wide: true, empty: !rows.length, config: barCfg(b.keys.map(b.label), meals.map((m, i) => ({ label: m, data: series(b, rows.filter((r) => r.meal === m), (r) => r.date, (r) => r.present), backgroundColor: mealColor(i) }))) },
            { title: "Present vs subscribers by meal", empty: !rows.length, config: barCfg(perMeal.map((x) => x.m), [{ label: "Subscribers", data: perMeal.map((x) => x.s), backgroundColor: HH.colors.gray }, { label: "Present", data: perMeal.map((x) => x.p), backgroundColor: HH.colors.blue }]) },
            Object.assign({ title: "Share of meals served" }, donutFrom(Object.fromEntries(perMeal.map((x) => [x.m, x.p])), false, (k) => mealColor(meals.indexOf(k)))),
          ],
          columns: [dcol("date", "Date"), tcol("meal", "Meal"), ncol("subscribers", "Subscribers"), ncol("present", "Present"), ncol("absent", "Absent"),
            { key: "pct", label: "Attendance", value: (r) => r.pct, render: (r) => `<div class="rep-meter">${HH.ui.progress(r.pct, r.pct >= 75 ? "var(--green)" : r.pct >= 50 ? "var(--yellow-600)" : "var(--red)")}<b>${r.pct}%</b></div>`, csv: (r) => r.pct + "%" }],
          rows, sort: { key: "date", dir: "desc" },
          footer: (rs) => ({ date: `${rs.length} sheets`, subscribers: U.fmtNum(U.sum(rs, (r) => r.subscribers)), present: U.fmtNum(U.sum(rs, (r) => r.present)), absent: U.fmtNum(U.sum(rs, (r) => r.absent)), pct: U.pct(U.sum(rs, (r) => r.present), U.sum(rs, (r) => r.subscribers)) + "%" }),
        };
      },
    },
    {
      key: "messConsumption", group: "mess", title: "Mess Consumption", icon: "bi-basket2", tone: "yellow",
      desc: "Plates served, planned servings and food cost.", branch: true, period: "month", hint: "Cost = menu cost per plate × residents present.",
      filters: [{ key: "meal", label: "All meals", options: () => L.list("mealTypes") }],
      build(ctx) {
        const rb = resBranchMap();
        const menus = {}; HH.store.all("menus").forEach((m) => (menus[`${m.date}|${m.meal}`] = m));
        const sheets = {}; HH.store.all("attendance").forEach((s) => (sheets[`${s.date}|${s.meal}`] = s));
        const keys = new Set();
        Object.values(sheets).forEach((s) => { if (U.inRange(s.date, ctx.r)) keys.add(`${s.date}|${s.meal}`); });
        Object.values(menus).forEach((m) => { if (U.inRange(m.date, ctx.r) && m.date <= T()) keys.add(`${m.date}|${m.meal}`); });
        const rows = [...keys].map((k) => {
          const [date, meal] = k.split("|"); const s = sheets[k], m = menus[k];
          let sub = 0, p = 0;
          if (s) Object.entries(s.marks || {}).forEach(([id, v]) => { if (v === "NA" || !ctx.inB(rb[id])) return; sub++; if (v === "P") p++; });
          const cost = m ? Number(m.cost) || 0 : 0;
          return { id: k, date, meal, items: m ? m.items : "", menuId: m ? m.id : "", subscribers: sub, present: p, servings: m ? Number(m.servings) || 0 : 0, cost, total: cost * p, util: m && m.servings ? U.pct(p, m.servings) : null, marked: !!s };
        }).filter((r) => !ctx.f.meal || r.meal === ctx.f.meal);
        const meals = L.list("mealTypes").filter((m) => !ctx.f.meal || m === ctx.f.meal); rows.forEach((r) => { if (!meals.includes(r.meal)) meals.push(r.meal); });
        const total = U.sum(rows, (r) => r.total), plates = U.sum(rows, (r) => r.present);
        const withMenu = rows.filter((r) => r.menuId && r.marked);
        const b = buckets(ctx.r, rows.map((r) => r.date));
        const byMeal = meals.map((m) => ({ m, cost: U.sum(rows.filter((r) => r.meal === m), (r) => r.total), p: U.sum(rows.filter((r) => r.meal === m), (r) => r.present), s: U.sum(rows.filter((r) => r.meal === m), (r) => r.subscribers) }));
        const mealColor = (i) => [HH.colors.yellow, HH.colors.blue, HH.colors.green][i] || HH.palette[(i + 3) % 10];
        return {
          cards: [
            { label: "Food cost", value: money(total), icon: "bi-currency-rupee", tone: "yellow", meta: byMeal.map((x) => `${esc(x.m)} ${money(x.cost)}`).join(" · ") },
            { label: "Plates served", value: U.fmtNum(plates), icon: "bi-egg-fried", tone: "orange", meta: `of ${U.fmtNum(U.sum(rows, (r) => r.subscribers))} subscribed` },
            { label: "Avg. cost per plate", value: U.fmtMoney(plates ? total / plates : 0, { decimals: 2 }), icon: "bi-calculator", tone: "blue" },
            { label: "Servings utilisation", value: `${U.pct(U.sum(withMenu, (r) => r.present), U.sum(withMenu, (r) => r.servings))}%`, icon: "bi-pie-chart-fill", tone: "green", meta: `${U.fmtNum(U.sum(withMenu, (r) => r.servings))} planned servings` },
            { label: "Meals without menu", value: U.fmtNum(rows.filter((r) => r.marked && !r.menuId).length), icon: "bi-journal-x", tone: "red", meta: "Cost not counted" },
          ],
          charts: [
            { title: `Food cost per ${b.mode}`, wide: true, empty: !total, config: barCfg(b.keys.map(b.label), meals.map((m, i) => ({ label: m, data: series(b, rows.filter((r) => r.meal === m), (r) => r.date, (r) => r.total), backgroundColor: mealColor(i) })), { money: true, stacked: true }) },
            { title: "Served vs subscribers by meal", empty: !rows.length, config: barCfg(byMeal.map((x) => x.m), [{ label: "Subscribers", data: byMeal.map((x) => x.s), backgroundColor: HH.colors.gray }, { label: "Served", data: byMeal.map((x) => x.p), backgroundColor: HH.colors.orange }]) },
            Object.assign({ title: "Cost share by meal" }, donutFrom(Object.fromEntries(byMeal.map((x) => [x.m, x.cost])), true, (k) => mealColor(meals.indexOf(k)))),
          ],
          columns: [dcol("date", "Date"), tcol("meal", "Meal"),
            { key: "items", label: "Menu", value: (r) => r.items, render: (r) => (r.menuId ? `<a class="link-hh truncate d-inline-block" style="max-width:240px" href="${P(`pages/menu-management.html?view=${r.menuId}`)}">${esc(r.items)}</a>` : '<span class="text-3">No menu</span>') },
            ncol("subscribers", "Subscribers"), ncol("present", "Served"), ncol("servings", "Planned"), { key: "util", label: "Utilisation", cls: "t-right", thCls: "t-right", value: (r) => (r.util == null ? -1 : r.util), render: (r) => (r.util == null ? "—" : r.util + "%"), csv: (r) => (r.util == null ? "" : r.util + "%") },
            mcol("cost", "Cost / plate"), mcol("total", "Total cost")],
          rows, sort: { key: "date", dir: "desc" },
          footer: (rs) => ({ date: `${rs.length} meals`, subscribers: U.fmtNum(U.sum(rs, (r) => r.subscribers)), present: U.fmtNum(U.sum(rs, (r) => r.present)), servings: U.fmtNum(U.sum(rs, (r) => r.servings)), total: money(U.sum(rs, (r) => r.total)) }),
        };
      },
    },

    /* ------------------------------------------------------ finance --- */
    {
      key: "feesCollection", group: "finance", title: "Fees Collection", icon: "bi-cash-coin", tone: "green",
      desc: "Every payment received, by date and method.", branch: true, period: "month", hint: "Date range applies to the payment date.",
      filters: [{ key: "method", label: "All methods", options: () => L.list("paymentMethods") }],
      build(ctx) {
        const rb = resBranchMap();
        const rows = C.payments(ctx.r).filter((p) => ctx.inB(rb[p.residentId]) && (!ctx.f.method || p.method === ctx.f.method))
          .map((p) => ({ id: p.id, date: p.date, residentId: p.residentId, resident: L.residentName(p.residentId), branch: rb[p.residentId], invoiceId: p.invoiceId, method: p.method, reference: p.reference || "", amount: p.amount, cats: [...new Set((p.items || []).map((i) => i.category))].join(", ") }));
        const total = U.sum(rows, (r) => r.amount);
        const byM = countBy(rows, (r) => r.method, (r) => r.amount);
        const top = topEntry(byM);
        const b = buckets(ctx.r, rows.map((r) => r.date));
        return {
          cards: [
            { label: "Collected", value: money(total), icon: "bi-cash-stack", tone: "green", meta: ctx.r.label },
            { label: "Payments", value: U.fmtNum(rows.length), icon: "bi-receipt", tone: "blue" },
            { label: "Avg. payment", value: money(rows.length ? Math.round(total / rows.length) : 0), icon: "bi-calculator", tone: "purple" },
            { label: "Residents paid", value: U.fmtNum(new Set(rows.map((r) => r.residentId)).size), icon: "bi-people-fill", tone: "yellow" },
            { label: "Top method", value: esc(top[0]), icon: "bi-credit-card-fill", tone: "orange", meta: total ? `${U.pct(top[1], total)}% of collections` : "" },
          ],
          charts: [
            { title: `Collections per ${b.mode}`, empty: !total, config: barCfg(b.keys.map(b.label), [{ label: "Collected", data: series(b, rows, (r) => r.date, (r) => r.amount), backgroundColor: HH.colors.green }], { money: true }) },
            Object.assign({ title: "By payment method" }, donutFrom(byM, true)),
          ],
          columns: [idcol("id", "Payment"), dcol("date", "Date"), tcol("resident", "Resident"), branchCol(), idcol("invoiceId", "Invoice", (r) => P(`pages/invoices.html?view=${r.invoiceId}`)),
            tcol("cats", "Fee items"), tcol("method", "Method"), tcol("reference", "Reference", null, { cls: "mono" }), mcol("amount", "Amount")],
          rows, sort: { key: "date", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} payments`, amount: money(U.sum(rs, (r) => r.amount)) }),
        };
      },
    },
    {
      key: "pendingFees", group: "finance", title: "Pending Fees", icon: "bi-hourglass-split", tone: "red",
      desc: "Open invoice balances with ageing.", branch: true, period: "all", hint: "Date range applies to the invoice due date.",
      filters: [{ key: "status", label: "All statuses", options: ["Unpaid", "Partial", "Overdue"] }],
      build(ctx) {
        const rb = resBranchMap();
        const rows = C.openInvoices().filter((i) => ctx.inB(rb[i.residentId]) && U.inRange(i.dueDate, ctx.r)).map((i) => {
          const t = C.invoiceTotals(i); const st = C.invoiceStatus(i); const od = U.daysBetween(i.dueDate, T());
          const res = L.resident(i.residentId) || {};
          return { id: i.id, inv: i, residentId: i.residentId, resident: L.residentName(i.residentId), room: res.roomId ? L.bedLabel(res.roomId, res.bed) : "—", phone: res.phone || "", branch: rb[i.residentId], period: i.period || "", issueDate: i.issueDate, dueDate: i.dueDate, total: t.total, paid: t.paid, balance: t.balance, overdue: od > 0 ? od : 0, status: st };
        }).filter((r) => !ctx.f.status || r.status === ctx.f.status);
        const total = U.sum(rows, (r) => r.balance);
        const overdue = rows.filter((r) => r.overdue > 0);
        const AG = [["Not yet due", (d) => d <= 0], ["1–30 days", (d) => d >= 1 && d <= 30], ["31–60 days", (d) => d > 30 && d <= 60], ["61–90 days", (d) => d > 60 && d <= 90], ["90+ days", (d) => d > 90]];
        const aging = AG.map(([l, f]) => U.sum(rows.filter((r) => f(U.daysBetween(r.dueDate, T()))), (r) => r.balance));
        const byCat = {};
        rows.forEach((r) => { const t = C.invoiceTotals(r.inv); const k = t.total ? t.balance / t.total : 0; (r.inv.items || []).forEach((it) => (byCat[it.category] = (byCat[it.category] || 0) + it.amount * k)); if (t.lateFee) byCat["Late Fee"] = (byCat["Late Fee"] || 0) + t.lateFee * k; });
        return {
          cards: [
            { label: "Total pending", value: money(total), icon: "bi-hourglass-split", tone: "red", meta: `${rows.length} open invoices` },
            { label: "Overdue", value: money(U.sum(overdue, (r) => r.balance)), icon: "bi-exclamation-triangle-fill", tone: "orange", meta: `${overdue.length} invoices past due` },
            { label: "Residents with dues", value: U.fmtNum(new Set(rows.map((r) => r.residentId)).size), icon: "bi-people-fill", tone: "blue" },
            { label: "Avg. balance", value: money(rows.length ? Math.round(total / rows.length) : 0), icon: "bi-calculator", tone: "purple" },
            { label: "Mess fee pending", value: money(Math.round(byCat["Mess Fee"] || 0)), icon: "bi-egg-fried", tone: "yellow", meta: `Hostel & other ${money(Math.round(total - (byCat["Mess Fee"] || 0)))}` },
          ],
          charts: [
            { title: "Ageing of dues", empty: !total, config: barCfg(AG.map((a) => a[0]), [{ label: "Pending", data: aging.map(Math.round), backgroundColor: [HH.colors.blue, HH.colors.yellow, HH.colors.orange, HH.colors.red, "#B91C1C"] }], { money: true }) },
            Object.assign({ title: "Pending by fee category" }, donutFrom(byCat, true)),
          ],
          columns: [idcol("id", "Invoice", (r) => P(`pages/invoices.html?view=${r.id}`)), tcol("resident", "Resident"), tcol("room", "Room / Bed", null, { cls: "nowrap" }), branchCol(), tcol("period", "Period"),
            dcol("dueDate", "Due date"), mcol("total", "Total"), mcol("paid", "Paid"), mcol("balance", "Balance"), ncol("overdue", "Days overdue"), bcol("status", "Status")],
          rows, sort: { key: "overdue", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} invoices`, total: money(U.sum(rs, (r) => r.total)), paid: money(U.sum(rs, (r) => r.paid)), balance: money(U.sum(rs, (r) => r.balance)) }),
        };
      },
    },
    {
      key: "revenue", group: "finance", title: "Revenue", icon: "bi-graph-up-arrow", tone: "yellow",
      desc: "Income received by period and fee category.", branch: true, period: "year", hint: "Revenue = payments received, by payment date (same as the dashboard).",
      build(ctx) {
        const rb = resBranchMap();
        const pays = C.payments(ctx.r).filter((p) => ctx.inB(rb[p.residentId]));
        const alloc = (p) => { const items = p.items || []; const sub = U.sum(items, (i) => i.amount); const out = {}; if (!sub) out.Other = p.amount; else items.forEach((i) => (out[i.category] = (out[i.category] || 0) + (p.amount * i.amount) / sub)); return out; };
        const byCat = {}; pays.forEach((p) => Object.entries(alloc(p)).forEach(([k, v]) => (byCat[k] = (byCat[k] || 0) + v)));
        const cats = Object.entries(byCat).sort((a, b) => b[1] - a[1]).map((x) => x[0]);
        const main = cats.slice(0, 3); const hasOther = cats.length > 3;
        const b = buckets(ctx.r, pays.map((p) => p.date));
        let cum = 0;
        const rows = b.keys.map((k) => {
          const list = pays.filter((p) => b.key(p.date) === k);
          const row = { id: k, period: k, label: b.label(k), count: list.length, amount: U.sum(list, (p) => p.amount) };
          main.forEach((c) => (row["c:" + c] = 0)); row["c:Others"] = 0;
          list.forEach((p) => Object.entries(alloc(p)).forEach(([c, v]) => { const key = main.includes(c) ? "c:" + c : "c:Others"; row[key] += v; }));
          Object.keys(row).forEach((x) => { if (x.startsWith("c:")) row[x] = Math.round(row[x]); });
          cum += row.amount; row.cum = cum; return row;
        });
        const total = U.sum(pays, (p) => p.amount);
        const best = rows.slice().sort((x, y) => y.amount - x.amount)[0];
        const days = U.daysBetween(b.from, b.to > T() ? T() : b.to) + 1;
        const top = topEntry(byCat);
        const catCols = main.map((c) => mcol("c:" + c, c)).concat(hasOther ? [mcol("c:Others", "Others")] : []);
        return {
          cards: [
            { label: "Total revenue", value: money(total), icon: "bi-graph-up-arrow", tone: "yellow", meta: ctx.r.label },
            { label: "Payments received", value: U.fmtNum(pays.length), icon: "bi-receipt", tone: "blue" },
            { label: "Avg. per day", value: money(days > 0 ? Math.round(total / days) : 0), icon: "bi-calendar-day", tone: "green", meta: `${days} days` },
            { label: `Best ${b.mode}`, value: best && best.amount ? esc(best.label) : "—", icon: "bi-trophy-fill", tone: "purple", meta: best && best.amount ? money(best.amount) : "" },
            { label: "Top category", value: esc(top[0]), icon: "bi-tags-fill", tone: "orange", meta: total ? `${U.pct(top[1], total)}% of revenue` : "" },
          ],
          charts: [
            { title: `Revenue per ${b.mode}`, wide: true, empty: !total, config: barCfg(b.keys.map(b.label), main.concat(hasOther ? ["Others"] : []).map((c, i) => ({ label: c, data: rows.map((r) => r["c:" + c]), backgroundColor: HH.palette[i % 10] })), { money: true, stacked: true }) },
            Object.assign({ title: "Revenue by fee category" }, donutFrom(byCat, true)),
          ],
          columns: [{ key: "period", label: b.mode === "day" ? "Date" : "Month", cls: "nowrap", value: (r) => r.period, render: (r) => esc(b.mode === "day" ? U.fmtDate(r.period) : r.label), csv: (r) => (b.mode === "day" ? U.fmtDate(r.period) : r.label) },
            ncol("count", "Payments"), ...catCols, mcol("amount", "Total"), mcol("cum", "Cumulative")],
          rows, sort: { key: "period", dir: "asc" },
          footer: (rs) => { const f = { period: "Total", count: U.fmtNum(U.sum(rs, (r) => r.count)), amount: money(U.sum(rs, (r) => r.amount)) }; catCols.forEach((c) => (f[c.key] = money(U.sum(rs, (r) => r[c.key])))); return f; },
        };
      },
    },
    {
      key: "expenses", group: "finance", title: "Expenses", icon: "bi-receipt-cutoff", tone: "blue",
      desc: "Approved spending by category and vendor.", branch: true, period: "month", hint: "Only Approved expenses are counted (same as the dashboard).",
      filters: [{ key: "category", label: "All categories", options: () => L.list("expenseCategories") }],
      build(ctx) {
        const rows = C.expenses(ctx.r).filter((e) => ctx.inB(e.branch) && (!ctx.f.category || e.category === ctx.f.category));
        const pending = C.expenses(ctx.r, true).filter((e) => e.status === "Pending" && ctx.inB(e.branch) && (!ctx.f.category || e.category === ctx.f.category));
        const total = U.sum(rows, (e) => e.amount);
        const byC = countBy(rows, (e) => e.category, (e) => e.amount);
        const top = topEntry(byC);
        const b = buckets(ctx.r, rows.map((e) => e.date));
        return {
          cards: [
            { label: "Total expenses", value: money(total), icon: "bi-wallet-fill", tone: "blue", meta: ctx.r.label },
            { label: "Entries", value: U.fmtNum(rows.length), icon: "bi-list-check", tone: "purple" },
            { label: "Largest category", value: esc(top[0]), icon: "bi-tags-fill", tone: "orange", meta: total ? `${money(top[1])} · ${U.pct(top[1], total)}%` : "" },
            { label: "Avg. per entry", value: money(rows.length ? Math.round(total / rows.length) : 0), icon: "bi-calculator", tone: "green" },
            { label: "Awaiting approval", value: money(U.sum(pending, (e) => e.amount)), icon: "bi-hourglass", tone: "yellow", meta: `${pending.length} pending · not included` },
          ],
          charts: [
            Object.assign({ title: "Expenses by category" }, donutFrom(byC, true, expColor)),
            { title: `Expenses per ${b.mode}`, empty: !total, config: barCfg(b.keys.map(b.label), [{ label: "Expenses", data: series(b, rows, (e) => e.date, (e) => e.amount), backgroundColor: HH.colors.blue }], { money: true }) },
          ],
          columns: [idcol("id", "Expense", (r) => P(`pages/expenses.html?view=${r.id}`)), dcol("date", "Date"), tcol("category", "Category"), tcol("description", "Description"), tcol("vendor", "Vendor"),
            tcol("method", "Method"), branchCol(), tcol("approvedBy", "Approved by"), mcol("amount", "Amount")],
          rows, sort: { key: "date", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} entries`, amount: money(U.sum(rs, (r) => r.amount)) }),
        };
      },
    },
    {
      key: "pnl", group: "finance", title: "Profit / Loss Summary", icon: "bi-bar-chart-line", tone: "purple",
      desc: "Revenue minus expenses by month, with margin.", branch: true, period: "year", hint: "Revenue = payments received; expenses = Approved expenses. Grouped by month.",
      build(ctx) {
        const rb = resBranchMap();
        const pays = C.payments(ctx.r).filter((p) => ctx.inB(rb[p.residentId]));
        const exps = C.expenses(ctx.r).filter((e) => ctx.inB(e.branch));
        const b = buckets(ctx.r, pays.map((p) => p.date).concat(exps.map((e) => e.date)), true);
        const rev = series(b, pays, (p) => p.date, (p) => p.amount), exp = series(b, exps, (e) => e.date, (e) => e.amount);
        const rows = b.keys.map((k, i) => ({ id: k, month: k, revenue: rev[i], expenses: exp[i], net: rev[i] - exp[i], margin: rev[i] ? Math.round(((rev[i] - exp[i]) / rev[i]) * 1000) / 10 : null }));
        const R = U.sum(pays, (p) => p.amount), E = U.sum(exps, (e) => e.amount), N = R - E;
        const best = rows.slice().sort((x, y) => y.net - x.net)[0];
        return {
          cards: [
            { label: "Revenue", value: money(R), icon: "bi-graph-up-arrow", tone: "yellow", meta: ctx.r.label },
            { label: "Expenses", value: money(E), icon: "bi-wallet-fill", tone: "blue" },
            { label: N >= 0 ? "Net profit" : "Net loss", value: `<span style="color:${N >= 0 ? "var(--green)" : "var(--red)"}">${money(N)}</span>`, icon: N >= 0 ? "bi-arrow-up-right-circle-fill" : "bi-arrow-down-right-circle-fill", tone: N >= 0 ? "green" : "red" },
            { label: "Profit margin", value: R ? `${Math.round((N / R) * 1000) / 10}%` : "—", icon: "bi-percent", tone: "purple" },
            { label: "Best month", value: best ? esc(U.monthLabel(best.month)) : "—", icon: "bi-trophy-fill", tone: "orange", meta: best ? `Net ${money(best.net)}` : "" },
          ],
          charts: [
            { title: "Revenue vs expenses", wide: true, empty: !R && !E, config: (() => {
              const c = barCfg(b.keys.map(b.label), [{ label: "Revenue", data: rev, backgroundColor: HH.colors.yellow }, { label: "Expenses", data: exp, backgroundColor: HH.colors.blue }], { money: true });
              c.data.datasets.push({ type: "line", label: "Net", data: rows.map((r) => r.net), borderColor: HH.colors.green, backgroundColor: HH.colors.green, borderWidth: 2, tension: 0.35, pointRadius: 3 });
              return c;
            })() },
            { title: "Profit margin by month", empty: !R, config: (() => {
              const c = barCfg(b.keys.map(b.label), [{ label: "Margin", pct: true, data: rows.map((r) => r.margin || 0), backgroundColor: rows.map((r) => ((r.margin || 0) >= 0 ? HH.colors.green : HH.colors.red)) }]);
              c.options.scales.y.ticks.callback = (v) => v + "%"; delete c.options.scales.y.ticks.precision; return c;
            })() },
          ],
          columns: [{ key: "month", label: "Month", value: (r) => r.month, render: (r) => esc(U.monthLabel(r.month)), csv: (r) => U.monthLabel(r.month) }, mcol("revenue", "Revenue"), mcol("expenses", "Expenses"),
            { key: "net", label: "Profit / Loss", cls: "t-right money", thCls: "t-right", value: (r) => r.net, render: (r) => `<b style="color:${r.net >= 0 ? "var(--green)" : "var(--red)"}">${money(r.net)}</b>`, csv: (r) => r.net },
            pcol("margin", "Margin")],
          rows, sort: { key: "month", dir: "asc" },
          footer: (rs) => { const r = U.sum(rs, (x) => x.revenue), e = U.sum(rs, (x) => x.expenses); return { month: "Total", revenue: money(r), expenses: money(e), net: money(r - e), margin: r ? `${Math.round(((r - e) / r) * 1000) / 10}%` : "—" }; },
        };
      },
    },

    /* ---------------------------------------------------- inventory --- */
    {
      key: "inventoryValue", group: "inventory", title: "Inventory Valuation", icon: "bi-box-seam", tone: "purple",
      desc: "Stock value by category with purchases and usage.", branch: false, period: "month", hint: "Stock value is current; the date range applies to the purchased / consumed columns.",
      filters: [{ key: "category", label: "All categories", options: () => [...new Set(HH.store.all("inventory").map((i) => i.category))].sort() }],
      build(ctx) {
        const tx = HH.store.all("stockTx").filter((t) => U.inRange(t.date, ctx.r));
        const agg = {}; tx.forEach((t) => { const a = (agg[t.itemId] = agg[t.itemId] || { pq: 0, pv: 0, cq: 0, cv: 0 }); const v = (Number(t.qty) || 0) * (Number(t.unitPrice) || 0); if (t.type === "Purchase") { a.pq += Number(t.qty) || 0; a.pv += v; } if (t.type === "Consumption") { a.cq += Number(t.qty) || 0; a.cv += v; } });
        const rows = HH.store.all("inventory").filter((i) => !ctx.f.category || i.category === ctx.f.category).map((i) => {
          const a = agg[i.id] || { pq: 0, pv: 0, cq: 0, cv: 0 };
          const status = Number(i.stock) <= 0 ? "Out of Stock" : C.isLowStock(i) ? "Low Stock" : C.expiresInDays(i) <= 7 ? "Expiring" : "In Stock";
          return { id: i.id, name: i.name, category: i.category, unit: i.unit, stock: Number(i.stock) || 0, price: Number(i.price) || 0, value: C.stockValue(i), pq: a.pq, pv: Math.round(a.pv), cq: a.cq, cv: Math.round(a.cv), status };
        });
        const val = countBy(rows, (r) => r.category, (r) => r.value);
        const cats = Object.keys(val).sort((a, b) => val[b] - val[a]);
        const total = U.sum(rows, (r) => r.value);
        return {
          cards: [
            { label: "Stock value", value: money(total), icon: "bi-currency-rupee", tone: "purple", meta: `${rows.length} items` },
            { label: "Categories", value: U.fmtNum(cats.length), icon: "bi-tags-fill", tone: "blue", meta: cats[0] ? `Largest: ${esc(cats[0])}` : "" },
            { label: "Purchased", value: money(U.sum(rows, (r) => r.pv)), icon: "bi-cart-plus-fill", tone: "green", meta: ctx.r.label },
            { label: "Consumed", value: money(U.sum(rows, (r) => r.cv)), icon: "bi-fire", tone: "orange", meta: ctx.r.label },
            { label: "Low / out of stock", value: U.fmtNum(rows.filter((r) => r.status === "Low Stock" || r.status === "Out of Stock").length), icon: "bi-exclamation-triangle-fill", tone: "red" },
          ],
          charts: [
            Object.assign({ title: "Stock value by category" }, donutFrom(val, true)),
            { title: "Purchases vs consumption by category", empty: !rows.some((r) => r.pv || r.cv), config: barCfg(cats, [{ label: "Purchased", data: cats.map((c) => U.sum(rows.filter((r) => r.category === c), (r) => r.pv)), backgroundColor: HH.colors.green }, { label: "Consumed", data: cats.map((c) => U.sum(rows.filter((r) => r.category === c), (r) => r.cv)), backgroundColor: HH.colors.orange }], { money: true }) },
          ],
          columns: [idcol("id", "Item", (r) => P(`pages/kitchen-inventory.html?view=${r.id}`)), tcol("name", "Name", null, { cls: "cell-strong" }), tcol("category", "Category"),
            { key: "stock", label: "In stock", cls: "t-right nowrap", thCls: "t-right", value: (r) => r.stock, render: (r) => `${U.fmtNum(r.stock)} <span class="text-2">${esc(r.unit)}</span>`, csv: (r) => `${r.stock} ${r.unit}` },
            mcol("price", "Unit price"), mcol("value", "Stock value"), ncol("pq", "Purchased qty"), ncol("cq", "Consumed qty"), bcol("status", "Status")],
          rows, sort: { key: "value", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} items`, value: money(U.sum(rs, (r) => r.value)) }),
        };
      },
    },
    {
      key: "lowStock", group: "inventory", title: "Low Stock", icon: "bi-exclamation-octagon", tone: "red",
      desc: "Items at or below minimum with reorder cost.", branch: false, period: "month", hint: "Live snapshot; the date range applies to the Used column.",
      build(ctx) {
        const used = {}; HH.store.all("stockTx").filter((t) => t.type === "Consumption" && U.inRange(t.date, ctx.r)).forEach((t) => (used[t.itemId] = (used[t.itemId] || 0) + (Number(t.qty) || 0)));
        const all = HH.store.all("inventory");
        const rows = all.filter(C.isLowStock).map((i) => {
          const stock = Number(i.stock) || 0, min = Number(i.minStock) || 0; const reorder = Math.max(0, min * 2 - stock);
          return { id: i.id, name: i.name, category: i.category, unit: i.unit, stock, min, shortfall: Math.max(0, min - stock), reorder, cost: reorder * (Number(i.price) || 0), supplier: L.vendorName(i.supplier), used: used[i.id] || 0, purchaseDate: i.purchaseDate, status: stock <= 0 ? "Out of Stock" : "Low Stock", level: min ? Math.round((stock / min) * 100) : 0 };
        });
        const expiring = all.filter((i) => C.expiresInDays(i) <= 7 && Number(i.stock) > 0);
        const chartRows = rows.slice().sort((a, b) => a.level - b.level).slice(0, 12);
        return {
          cards: [
            { label: "Low stock items", value: U.fmtNum(rows.length), icon: "bi-exclamation-triangle-fill", tone: "orange", meta: `of ${all.length} items` },
            { label: "Out of stock", value: U.fmtNum(rows.filter((r) => r.stock <= 0).length), icon: "bi-x-octagon-fill", tone: "red" },
            { label: "Reorder cost", value: money(U.sum(rows, (r) => r.cost)), icon: "bi-cart-check-fill", tone: "blue", meta: "To refill to 2 × minimum" },
            { label: "Expiring in 7 days", value: U.fmtNum(expiring.length), icon: "bi-hourglass-split", tone: "purple" },
          ],
          charts: [
            { title: "Stock vs minimum level", wide: true, empty: !rows.length, config: barCfg(chartRows.map((r) => r.name), [{ label: "In stock", data: chartRows.map((r) => r.stock), backgroundColor: HH.colors.orange }, { label: "Minimum", data: chartRows.map((r) => r.min), backgroundColor: HH.colors.gray }], { horizontal: true }) },
            Object.assign({ title: "Low stock items by category" }, donutFrom(countBy(rows, (r) => r.category))),
          ],
          columns: [idcol("id", "Item", (r) => P(`pages/kitchen-inventory.html?view=${r.id}`)), tcol("name", "Name", null, { cls: "cell-strong" }), tcol("category", "Category"),
            { key: "stock", label: "In stock", cls: "t-right nowrap", thCls: "t-right", value: (r) => r.stock, render: (r) => `${U.fmtNum(r.stock)} <span class="text-2">${esc(r.unit)}</span>`, csv: (r) => `${r.stock} ${r.unit}` },
            ncol("min", "Minimum"), ncol("shortfall", "Shortfall"), ncol("reorder", "Reorder qty"), mcol("cost", "Est. cost"), ncol("used", "Used in period"), tcol("supplier", "Supplier"), dcol("purchaseDate", "Last purchase"), bcol("status", "Status")],
          rows, sort: { key: "shortfall", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} items`, cost: money(U.sum(rs, (r) => r.cost)) }),
        };
      },
    },

    /* -------------------------------------------------------- staff --- */
    {
      key: "staffAttendance", group: "staff", title: "Staff Attendance", icon: "bi-calendar2-check", tone: "green",
      desc: "Present, absent and leave days per staff member.", branch: true, period: "month", hint: "Attendance % = present ÷ (present + absent + leave); holidays excluded.",
      filters: [{ key: "department", label: "All departments", options: () => L.list("departments") }],
      build(ctx) {
        const sheets = HH.store.all("staffAttendance").filter((s) => U.inRange(s.date, ctx.r));
        const staff = HH.store.all("staff").filter((s) => ctx.inB(s.branch) && (!ctx.f.department || s.department === ctx.f.department));
        const ids = new Set(staff.map((s) => s.id));
        const rows = staff.map((s) => {
          const c = { P: 0, A: 0, L: 0, H: 0 }; sheets.forEach((sh) => { const v = (sh.marks || {})[s.id]; if (v && v in c) c[v]++; });
          const base = c.P + c.A + c.L;
          return { id: s.id, name: s.name, designation: s.designation, department: s.department, branch: s.branch, staffStatus: s.status, p: c.P, a: c.A, l: c.L, h: c.H, days: base + c.H, pct: base ? U.pct(c.P, base) : null };
        }).filter((r) => r.days > 0 || r.staffStatus !== "Resigned");
        const P_ = U.sum(rows, (r) => r.p), A_ = U.sum(rows, (r) => r.a), L_ = U.sum(rows, (r) => r.l);
        const b = buckets(ctx.r, sheets.map((s) => s.date));
        const cnt = (v) => series(b, sheets, (s) => s.date, (s) => Object.entries(s.marks || {}).filter(([id, x]) => ids.has(id) && x === v).length);
        const depts = [...new Set(rows.map((r) => r.department))];
        return {
          cards: [
            { label: "Staff", value: U.fmtNum(rows.length), icon: "bi-people-fill", tone: "blue", meta: `${sheets.length} days recorded` },
            { label: "Avg. attendance", value: `${U.pct(P_, P_ + A_ + L_)}%`, icon: "bi-percent", tone: "green" },
            { label: "Present days", value: U.fmtNum(P_), icon: "bi-person-check-fill", tone: "yellow" },
            { label: "Absent days", value: U.fmtNum(A_), icon: "bi-person-x-fill", tone: "red" },
            { label: "Leave days", value: U.fmtNum(L_), icon: "bi-airplane-fill", tone: "purple" },
          ],
          charts: [
            { title: `Daily attendance${b.mode === "month" ? " (per month)" : ""}`, wide: true, empty: !sheets.length, config: barCfg(b.keys.map(b.label), [{ label: "Present", data: cnt("P"), backgroundColor: HH.colors.green }, { label: "Absent", data: cnt("A"), backgroundColor: HH.colors.red }, { label: "Leave", data: cnt("L"), backgroundColor: HH.colors.blue }], { stacked: true }) },
            { title: "Attendance % by department", empty: !P_, config: barCfg(depts, [{ label: "Attendance", pct: true, data: depts.map((d) => { const g = rows.filter((r) => r.department === d); const p = U.sum(g, (r) => r.p); return U.pct(p, p + U.sum(g, (r) => r.a + r.l)); }), backgroundColor: HH.colors.green }], { pct: true, horizontal: true }) },
          ],
          columns: [idcol("id", "ID", (r) => P(`pages/staff-management.html?view=${r.id}`)), { key: "name", label: "Name", value: (r) => r.name, render: (r) => HH.ui.person(r.name, r.designation) },
            tcol("department", "Department"), branchCol(), ncol("p", "Present"), ncol("a", "Absent"), ncol("l", "Leave"), ncol("h", "Holiday"),
            { key: "pct", label: "Attendance", value: (r) => (r.pct == null ? -1 : r.pct), render: (r) => (r.pct == null ? "—" : `<div class="rep-meter">${HH.ui.progress(r.pct, r.pct >= 90 ? "var(--green)" : r.pct >= 75 ? "var(--yellow-600)" : "var(--red)")}<b>${r.pct}%</b></div>`), csv: (r) => (r.pct == null ? "" : r.pct + "%") }],
          rows, sort: { key: "name", dir: "asc" },
          footer: (rs) => { const p = U.sum(rs, (r) => r.p), a = U.sum(rs, (r) => r.a), l = U.sum(rs, (r) => r.l); return { id: `${rs.length} staff`, p: U.fmtNum(p), a: U.fmtNum(a), l: U.fmtNum(l), h: U.fmtNum(U.sum(rs, (r) => r.h)), pct: U.pct(p, p + a + l) + "%" }; },
        };
      },
    },
    {
      key: "salary", group: "staff", title: "Salary", icon: "bi-wallet2", tone: "blue",
      desc: "Payroll by month with allowances and deductions.", branch: true, period: "year", hint: "Salary months that fall inside the date range are included.",
      filters: [{ key: "status", label: "All statuses", options: () => [...new Set(HH.store.all("salaries").map((s) => s.status).concat(["Paid", "Pending"]))] }, { key: "department", label: "All departments", options: () => L.list("departments") }],
      build(ctx) {
        const sm = staffMap();
        const { from, to } = clipRange(ctx.r, HH.store.all("salaries").map((s) => s.month + "-01"));
        const m0 = U.monthKey(from), m1 = U.monthKey(to);
        const rows = HH.store.all("salaries").filter((s) => { const st = sm[s.staffId] || {}; return s.month >= m0 && s.month <= m1 && ctx.inB(st.branch) && (!ctx.f.status || s.status === ctx.f.status) && (!ctx.f.department || st.department === ctx.f.department); })
          .map((s) => { const st = sm[s.staffId] || {}; return Object.assign({}, s, { name: st.name || "(removed)", designation: st.designation || "", department: st.department || "", branch: st.branch || "" }); });
        const total = U.sum(rows, (r) => r.net); const paid = rows.filter((r) => r.status === "Paid");
        const months = [...new Set(rows.map((r) => r.month))].sort();
        return {
          cards: [
            { label: "Net payroll", value: money(total), icon: "bi-wallet-fill", tone: "blue", meta: `${months.length} month(s)` },
            { label: "Paid", value: money(U.sum(paid, (r) => r.net)), icon: "bi-check-circle-fill", tone: "green", meta: `${paid.length} slips` },
            { label: "Pending", value: money(total - U.sum(paid, (r) => r.net)), icon: "bi-hourglass-split", tone: "orange", meta: `${rows.length - paid.length} slips` },
            { label: "Staff paid", value: U.fmtNum(new Set(rows.map((r) => r.staffId)).size), icon: "bi-people-fill", tone: "purple" },
            { label: "Avg. net salary", value: money(rows.length ? Math.round(total / rows.length) : 0), icon: "bi-calculator", tone: "yellow" },
          ],
          charts: [
            { title: "Payroll by month", empty: !rows.length, config: barCfg(months.map(U.monthLabel), [{ label: "Paid", data: months.map((m) => U.sum(paid.filter((r) => r.month === m), (r) => r.net)), backgroundColor: HH.colors.green }, { label: "Pending", data: months.map((m) => U.sum(rows.filter((r) => r.month === m && r.status !== "Paid"), (r) => r.net)), backgroundColor: HH.colors.orange }], { money: true, stacked: true }) },
            Object.assign({ title: "Payroll by department" }, donutFrom(countBy(rows, (r) => r.department, (r) => r.net), true)),
          ],
          columns: [idcol("id", "Slip"), { key: "name", label: "Staff", value: (r) => r.name, render: (r) => HH.ui.person(r.name, r.designation) }, tcol("department", "Department"), branchCol(),
            { key: "month", label: "Month", cls: "nowrap", value: (r) => r.month, render: (r) => esc(U.monthLabel(r.month)), csv: (r) => U.monthLabel(r.month) },
            mcol("basic", "Basic"), mcol("allowances", "Allowances"), mcol("deductions", "Deductions"), mcol("net", "Net"), bcol("status", "Status"), dcol("paidOn", "Paid on"), tcol("method", "Method")],
          rows, sort: { key: "month", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} slips`, basic: money(U.sum(rs, (r) => r.basic)), allowances: money(U.sum(rs, (r) => r.allowances)), deductions: money(U.sum(rs, (r) => r.deductions)), net: money(U.sum(rs, (r) => r.net)) }),
        };
      },
    },

    /* --------------------------------------------------- operations --- */
    {
      key: "maintenance", group: "operations", title: "Maintenance", icon: "bi-wrench-adjustable", tone: "orange",
      desc: "Repair tickets, overdue work and cost.", branch: true, period: "month", hint: "Date range applies to the reported date.",
      filters: [{ key: "status", label: "All statuses", options: ["Open", "In Progress", "On Hold", "Resolved", "Closed"] }, { key: "priority", label: "All priorities", options: ["Low", "Medium", "High", "Critical"] }],
      build(ctx) {
        const rows = HH.store.all("maintenance").filter((t) => ctx.inB(t.branch) && U.inRange(t.reportedOn, ctx.r) && (!ctx.f.status || t.status === ctx.f.status) && (!ctx.f.priority || t.priority === ctx.f.priority))
          .map((t) => Object.assign({}, t, { room: L.roomLabel(t.roomId), assignee: t.assignedTo ? L.staffName(t.assignedTo) : "Unassigned", overdue: C.isOverdueTicket(t) }));
        const done = rows.filter((t) => ["Resolved", "Closed"].includes(t.status));
        const tat = done.filter((t) => t.completedOn);
        return {
          cards: [
            { label: "Tickets", value: U.fmtNum(rows.length), icon: "bi-tools", tone: "blue", meta: ctx.r.label },
            { label: "Open", value: U.fmtNum(rows.length - done.length), icon: "bi-hourglass-split", tone: "orange" },
            { label: "Overdue", value: U.fmtNum(rows.filter((t) => t.overdue).length), icon: "bi-alarm-fill", tone: "red" },
            { label: "Resolved / Closed", value: U.fmtNum(done.length), icon: "bi-check-circle-fill", tone: "green", meta: tat.length ? `Avg. ${Math.round((U.sum(tat, (t) => U.daysBetween(t.reportedOn, t.completedOn)) / tat.length) * 10) / 10} days to fix` : "" },
            { label: "Actual cost", value: money(U.sum(rows, (t) => t.actualCost)), icon: "bi-currency-rupee", tone: "purple", meta: `Estimated ${money(U.sum(rows, (t) => t.estCost))}` },
          ],
          charts: [
            Object.assign({ title: "Tickets by status" }, donutFrom(countBy(rows, (t) => t.status), false, (s) => statusColor(s))),
            (() => { const by = countBy(rows, (t) => t.category); const e = Object.entries(by).sort((a, b) => b[1] - a[1]); return { title: "Tickets by category", empty: !e.length, config: barCfg(e.map((x) => x[0]), [{ label: "Tickets", data: e.map((x) => x[1]), backgroundColor: HH.colors.orange }]) }; })(),
          ],
          columns: [idcol("id", "Ticket", (r) => P(`pages/maintenance.html?view=${r.id}`)), tcol("title", "Issue", null, { cls: "cell-strong" }), tcol("category", "Category"), branchCol(), tcol("room", "Room"),
            bcol("priority", "Priority"), tcol("assignee", "Assigned to"), dcol("reportedOn", "Reported"), { key: "dueDate", label: "Due", cls: "nowrap", value: (r) => r.dueDate || "", render: (r) => `${U.fmtDate(r.dueDate)}${r.overdue ? ` ${HH.ui.badge("Overdue")}` : ""}`, csv: (r) => (r.dueDate ? U.fmtDate(r.dueDate) : "") },
            bcol("status", "Status"), mcol("estCost", "Est. cost"), mcol("actualCost", "Actual cost")],
          rows, sort: { key: "reportedOn", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} tickets`, estCost: money(U.sum(rs, (r) => r.estCost)), actualCost: money(U.sum(rs, (r) => r.actualCost)) }),
        };
      },
    },
    {
      key: "visitors", group: "operations", title: "Visitors", icon: "bi-person-badge", tone: "purple",
      desc: "Visitor log with purpose and visit duration.", branch: true, period: "month", hint: "Date range applies to the check-in date.",
      build(ctx) {
        const rows = HH.store.all("visitors").filter((v) => ctx.inB(v.branch) && U.inRange(v.checkIn, ctx.r))
          .map((v) => Object.assign({}, v, { resident: L.residentName(v.residentId), duration: minutes(v.checkIn, v.checkOut), state: v.checkOut ? "Checked Out" : "Inside" }));
        const withDur = rows.filter((r) => r.duration != null);
        const b = buckets(ctx.r, rows.map((r) => r.checkIn));
        return {
          cards: [
            { label: "Visits", value: U.fmtNum(rows.length), icon: "bi-person-badge-fill", tone: "purple", meta: ctx.r.label },
            { label: "Unique visitors", value: U.fmtNum(new Set(rows.map((r) => r.phone || r.name)).size), icon: "bi-person-vcard-fill", tone: "blue" },
            { label: "Currently inside", value: U.fmtNum(rows.filter((r) => !r.checkOut).length), icon: "bi-door-open-fill", tone: "green" },
            { label: "Avg. visit duration", value: fmtDur(withDur.length ? Math.round(U.sum(withDur, (r) => r.duration) / withDur.length) : null), icon: "bi-stopwatch-fill", tone: "orange" },
            { label: "Residents visited", value: U.fmtNum(new Set(rows.map((r) => r.residentId)).size), icon: "bi-people-fill", tone: "yellow" },
          ],
          charts: [
            { title: `Visits per ${b.mode}`, empty: !rows.length, config: barCfg(b.keys.map(b.label), [{ label: "Visits", data: series(b, rows, (r) => r.checkIn), backgroundColor: HH.colors.purple }]) },
            Object.assign({ title: "Visits by purpose" }, donutFrom(countBy(rows, (r) => r.purpose))),
          ],
          columns: [idcol("id", "Pass", (r) => P(`pages/visitors.html?view=${r.id}`)), tcol("name", "Visitor", null, { cls: "cell-strong" }), tcol("phone", "Phone", null, { cls: "nowrap" }), tcol("resident", "Visiting"), tcol("purpose", "Purpose"),
            tcol("idProof", "ID proof"), branchCol(), dtcol("checkIn", "Check-in"), dtcol("checkOut", "Check-out"), { key: "duration", label: "Duration", cls: "t-right nowrap", thCls: "t-right", value: (r) => (r.duration == null ? -1 : r.duration), render: (r) => (r.checkOut ? fmtDur(r.duration) : HH.ui.badge("Inside")), csv: (r) => (r.checkOut ? fmtDur(r.duration) : "Inside") }],
          rows, sort: { key: "checkIn", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} visits` }),
        };
      },
    },
    {
      key: "complaints", group: "operations", title: "Complaints", icon: "bi-chat-square-text", tone: "pink",
      desc: "Complaints by category, status and resolution time.", branch: true, period: "month", hint: "Date range applies to the date raised; branch uses the resident's branch.",
      filters: [{ key: "status", label: "All statuses", options: ["Open", "In Progress", "Resolved", "Closed"] }],
      build(ctx) {
        const rb = resBranchMap();
        const rows = HH.store.all("complaints").filter((c) => ctx.inB(rb[c.residentId]) && U.inRange(c.createdAt, ctx.r) && (!ctx.f.status || c.status === ctx.f.status))
          .map((c) => Object.assign({}, c, { resident: L.residentName(c.residentId), branch: rb[c.residentId], assignee: c.assignedTo ? L.staffName(c.assignedTo) : "Unassigned", days: c.resolvedAt ? U.daysBetween(c.createdAt, c.resolvedAt) : null }));
        const st = countBy(rows, (c) => c.status);
        const res = rows.filter((c) => c.days != null);
        return {
          cards: [
            { label: "Complaints", value: U.fmtNum(rows.length), icon: "bi-chat-square-text-fill", tone: "pink", meta: ctx.r.label },
            { label: "Open", value: U.fmtNum(st.Open || 0), icon: "bi-envelope-open-fill", tone: "orange" },
            { label: "In progress", value: U.fmtNum(st["In Progress"] || 0), icon: "bi-arrow-repeat", tone: "blue" },
            { label: "Resolved / Closed", value: U.fmtNum((st.Resolved || 0) + (st.Closed || 0)), icon: "bi-check-circle-fill", tone: "green" },
            { label: "Avg. resolution", value: res.length ? `${Math.round((U.sum(res, (c) => c.days) / res.length) * 10) / 10} days` : "—", icon: "bi-stopwatch-fill", tone: "purple" },
          ],
          charts: [
            Object.assign({ title: "Complaints by status" }, donutFrom(st, false, (s) => statusColor(s))),
            (() => { const e = Object.entries(countBy(rows, (c) => c.category)).sort((a, b) => b[1] - a[1]); return { title: "Complaints by category", empty: !e.length, config: barCfg(e.map((x) => x[0]), [{ label: "Complaints", data: e.map((x) => x[1]), backgroundColor: HH.colors.pink }]) }; })(),
          ],
          columns: [idcol("id", "ID", (r) => P(`pages/complaints.html?view=${r.id}`)), tcol("subject", "Subject", null, { cls: "cell-strong" }), tcol("category", "Category"), tcol("resident", "Resident"), branchCol(),
            bcol("priority", "Priority"), tcol("assignee", "Assigned to"), bcol("status", "Status"), dcol("createdAt", "Raised"), dcol("resolvedAt", "Resolved"),
            { key: "days", label: "Days to resolve", cls: "t-right", thCls: "t-right", value: (r) => (r.days == null ? -1 : r.days), render: (r) => (r.days == null ? "—" : U.fmtNum(r.days)), csv: (r) => (r.days == null ? "" : r.days) }],
          rows, sort: { key: "createdAt", dir: "desc" },
          footer: (rs) => ({ id: `${rs.length} complaints` }),
        };
      },
    },
  ];
  const byKey = Object.fromEntries(REPORTS.map((r) => [r.key, r]));
  const inGroup = (g) => REPORTS.filter((r) => r.group === g);
  HH.reports = { REPORTS };

  /* ------------------------------------------------------------- state --- */
  const sel = Object.assign({}, HH.store.pref("rep:sel", {}));
  const qReport = byKey[U.qs("report")];
  let group = qReport ? qReport.group : null;
  let current = null, table = null, built = null;

  function filtersFor(rep) {
    const saved = HH.store.pref("rep:f:" + rep.key, {}) || {};
    const f = Object.assign({ period: rep.period || "month", custom: null, branch: "All" }, saved);
    if (!rep.branch) f.branch = "All";
    if (f.branch !== "All" && !L.branches().some((b) => b.id === f.branch)) f.branch = "All";
    if (f.period === "custom" && !(f.custom && f.custom.from && f.custom.to)) f.period = rep.period || "month";
    f.extra = Object.assign({}, f.extra || {});
    return f;
  }
  const saveFilters = (rep, f) => HH.store.setPref("rep:f:" + rep.key, { period: f.period, custom: f.custom, branch: f.branch, extra: f.extra });
  const ctxFor = (rep, f) => {
    const r = U.range(f.period === "all" ? "" : f.period, f.custom);
    if (f.period === "all") r.label = "All time";
    return { r, all: f.period === "all", branch: f.branch, inB: (b) => f.branch === "All" || b === f.branch, f: f.extra };
  };

  /* ------------------------------------------------------------ layout --- */
  root.innerHTML = `
    <section class="card-hh card-hh--flush rep-nav">
      <div class="rep-tabs" data-group-tabs></div>
      <div class="rep-picker" data-picker role="listbox" aria-label="Choose a report"></div>
    </section>
    <section class="card-hh rep-head" data-head></section>
    <div data-cards></div>
    <div class="rep-charts" data-charts></div>
    <section class="card-hh card-hh--flush list-card">
      <div class="card-hh__head"><span class="chip-icon tone-navy"><i class="bi bi-table"></i></span><div><div class="card-hh__title" data-table-title>Details</div><div class="card-hh__sub" data-table-sub></div></div>
        <div class="card-hh__tools"><button type="button" class="btn-hh btn-hh--sm" data-act="csv"><i class="bi bi-filetype-csv"></i>Export CSV</button><button type="button" class="btn-hh btn-hh--sm" data-act="print"><i class="bi bi-printer"></i>Print</button></div></div>
      <div data-table></div>
    </section>`;
  const $ = (s) => root.querySelector(s);
  document.getElementById("pageActions").innerHTML = `<button type="button" class="btn-hh" data-act="csv"><i class="bi bi-filetype-csv"></i><span>Export CSV</span></button><button type="button" class="btn-hh btn-hh--dark" data-act="print"><i class="bi bi-printer"></i><span>Print report</span></button>`;
  document.getElementById("pageActions").addEventListener("click", onAction);
  root.addEventListener("click", onAction);
  function onAction(e) {
    const b = e.target.closest("[data-act]"); if (!b) return;
    if (b.dataset.act === "csv") exportCSV();
    if (b.dataset.act === "print") printReport();
  }

  const tabs = HH.ui.tabs($("[data-group-tabs]"), GROUPS.map((g) => ({ key: g.key, label: g.label, icon: g.icon, count: inGroup(g.key).length })), (k) => {
    group = k; HH.store.setPref("rep:group", k);
    const key = sel[k] && byKey[sel[k]] && byKey[sel[k]].group === k ? sel[k] : inGroup(k)[0].key;
    renderPicker(); open(key);
  }, { hash: true, initial: group || HH.store.pref("rep:group", "residents") });
  if (qReport && location.hash.slice(1) !== qReport.group) tabs.set(qReport.group);
  if (qReport) { open(qReport.key); U.setQS({ report: null }); }

  function renderPicker() {
    $("[data-picker]").innerHTML = inGroup(group).map((r) => `<button type="button" class="rep-tile" role="option" data-report="${r.key}" aria-selected="false">
      <span class="chip-icon tone-${r.tone}"><i class="bi ${r.icon}"></i></span>
      <span class="rep-tile__text"><span class="rep-tile__title">${esc(r.title)}</span><span class="rep-tile__desc">${esc(r.desc)}</span></span>
      <i class="bi bi-check-circle-fill rep-tile__tick"></i></button>`).join("");
  }
  $("[data-picker]").addEventListener("click", (e) => { const b = e.target.closest("[data-report]"); if (b) open(b.dataset.report); });

  function open(key) {
    const rep = byKey[key]; if (!rep) return;
    if (rep.group !== group) { group = rep.group; }
    sel[group] = key; HH.store.setPref("rep:sel", Object.assign({}, sel));
    const changed = !current || current.key !== key;
    current = rep;
    root.querySelectorAll("[data-report]").forEach((b) => { const on = b.dataset.report === key; b.classList.toggle("is-active", on); b.setAttribute("aria-selected", String(on)); });
    renderHead();
    render(changed);
  }

  function renderHead() {
    const rep = current, f = filtersFor(rep);
    const exFilters = (rep.filters || []).map((x) => { const opts = typeof x.options === "function" ? x.options() : x.options; return `<select class="select-hh" data-extra="${x.key}" aria-label="${esc(x.label)}">${HH.ui.options(opts, f.extra[x.key] || "", x.label)}</select>`; }).join("");
    $("[data-head]").innerHTML = `
      <div class="rep-head__top">
        <span class="chip-icon chip-icon--lg tone-${rep.tone}"><i class="bi ${rep.icon}"></i></span>
        <div class="rep-head__title"><h2>${esc(rep.title)} report</h2><p>${esc(rep.desc)}</p></div>
        <div class="rep-head__range"><span class="text-2">Period</span><b data-range-label></b></div>
      </div>
      <div class="rep-filters">
        <div class="segmented rep-periods" role="group" aria-label="Period">${PERIODS.map(([k, l]) => `<button type="button" data-period="${k}" class="${f.period === k ? "is-active" : ""}">${l}</button>`).join("")}</div>
        <div class="rep-custom" data-custom ${f.period === "custom" ? "" : "hidden"}>
          <input type="date" class="input-hh" data-from aria-label="From date" value="${esc((f.custom && f.custom.from) || "")}">
          <span class="text-2">to</span>
          <input type="date" class="input-hh" data-to aria-label="To date" value="${esc((f.custom && f.custom.to) || "")}">
          <button type="button" class="btn-hh btn-hh--sm btn-hh--dark" data-apply>Apply</button>
        </div>
        ${rep.branch ? `<select class="select-hh" data-branch aria-label="Branch">${HH.ui.options(L.branchOptions(true), f.branch)}</select>` : ""}
        ${exFilters}
        <button type="button" class="btn-hh btn-hh--sm btn-hh--ghost" data-reset><i class="bi bi-arrow-counterclockwise"></i>Reset filters</button>
      </div>
      <div class="rep-hint"><i class="bi bi-info-circle"></i><span>${esc(rep.hint || "")}</span></div>`;
  }

  // Filter interactions
  $("[data-head]").addEventListener("click", (e) => {
    const rep = current; if (!rep) return;
    const f = filtersFor(rep);
    const p = e.target.closest("[data-period]");
    if (p) {
      root.querySelectorAll("[data-period]").forEach((b) => b.classList.toggle("is-active", b === p));
      const box = $("[data-custom]");
      if (p.dataset.period === "custom") {
        box.hidden = false;
        const fr = box.querySelector("[data-from]"), to = box.querySelector("[data-to]");
        if (!fr.value) { const r = U.range(f.period === "all" ? "month" : f.period, f.custom); fr.value = r.from; to.value = r.to; }
        fr.focus(); return;
      }
      box.hidden = true; f.period = p.dataset.period; f.custom = null; saveFilters(rep, f); render(false); return;
    }
    if (e.target.closest("[data-apply]")) {
      const fr = $("[data-from]").value, to = $("[data-to]").value;
      if (!fr || !to) return HH.toast("Choose both a start and an end date.", "error");
      if (fr > to) return HH.toast("The start date must be on or before the end date.", "error");
      f.period = "custom"; f.custom = { from: fr, to }; saveFilters(rep, f); render(false); return;
    }
    if (e.target.closest("[data-reset]")) { HH.store.setPref("rep:f:" + rep.key, null); renderHead(); render(false); HH.toast("Filters reset to the report defaults.", "info"); }
  });
  $("[data-head]").addEventListener("change", (e) => {
    const rep = current; const f = filtersFor(rep);
    if (e.target.matches("[data-branch]")) { f.branch = e.target.value; saveFilters(rep, f); render(false); }
    if (e.target.matches("[data-extra]")) { f.extra[e.target.dataset.extra] = e.target.value; saveFilters(rep, f); render(false); }
  });

  /* ------------------------------------------------------------ render --- */
  function render(resetSort) {
    const rep = current; if (!rep) return;
    const f = filtersFor(rep), ctx = ctxFor(rep, f);
    let out;
    try { out = rep.build(ctx); } catch (err) { console.error(err); HH.toast(`Could not build ${rep.title} report: ${err.message}`, "error"); return; }
    built = { rep, ctx, f, out };
    $("[data-range-label]").textContent = `${ctx.r.label}${rep.branch ? " · " + L.branchName(f.branch) : ""}`;
    // cards
    $("[data-cards]").innerHTML = HH.ui.statCards(out.cards);
    // charts
    const charts = (out.charts || []).filter(Boolean);
    $("[data-charts]").innerHTML = charts.map((c, i) => `<section class="card-hh rep-chart ${c.wide ? "rep-chart--wide" : ""}">
      <div class="card-hh__head"><div><div class="card-hh__title">${esc(c.title)}</div>${c.sub ? `<div class="card-hh__sub">${esc(c.sub)}</div>` : ""}</div></div>
      ${c.empty ? HH.ui.empty("No data for this period", "bi-bar-chart", "Try a wider date range or another branch.") : `<div class="chart-box chart-box--lg ${c.config && c.config.type === "doughnut" ? "rep-donut" : ""}"><canvas data-chart="${i}" aria-label="${esc(c.title)} chart" role="img"></canvas></div>`}</section>`).join("");
    charts.forEach((c, i) => { if (!c.empty) HH.chart($(`[data-chart="${i}"]`), c.config); });
    // table
    $("[data-table-title]").textContent = `${rep.title} — details`;
    $("[data-table-sub]").textContent = `${out.rows.length} row${out.rows.length === 1 ? "" : "s"} · ${ctx.r.label}${rep.branch ? " · " + L.branchName(f.branch) : ""}`;
    const prevSort = !resetSort && table ? table.sort : null;
    const host = $("[data-table]"); host.innerHTML = ""; const el = document.createElement("div"); host.appendChild(el);
    const cols = out.columns;
    table = new HH.Table(el, {
      id: "rep:" + rep.key, columns: cols, rows: out.rows, pageSize: 10, sort: prevSort || out.sort || null, compact: true,
      empty: "No records for the selected filters", emptySub: "Try a wider date range, another branch or clear the filters.",
      footerRow: out.footer ? (rows) => { const ft = out.footer(rows); return `<tr>${cols.map((c) => `<td class="${c.cls || ""}">${ft[c.key] != null ? ft[c.key] : ""}</td>`).join("")}</tr>`; } : null,
    });
  }

  const csvCols = () => built.out.columns.map((c) => ({ label: c.label, value: c.csv || c.value || ((r) => r[c.key]) }));
  function exportCSV() {
    if (!built) return;
    const rows = table.sortedRows();
    if (!rows.length) return HH.toast("Nothing to export with the current filters.", "warning");
    const r = built.ctx.r;
    HH.exportCSV(`report-${built.rep.key}-${built.ctx.all ? "all-time" : r.from + "_" + r.to}.csv`, csvCols(), rows);
  }
  function printReport() {
    if (!built) return;
    const { rep, ctx, f, out } = built;
    const rows = table.sortedRows();
    const cols = csvCols();
    const cards = `<div class="cards">${out.cards.map((c) => `<div class="card"><span class="muted">${esc(c.label)}</span><b>${c.value}</b>${c.meta ? `<small class="muted">${c.meta}</small>` : ""}</div>`).join("")}</div>`;
    const imgs = [...root.querySelectorAll("[data-chart]")].map((cv, i) => { try { const c = out.charts.filter(Boolean)[+cv.dataset.chart]; return `<figure><figcaption>${esc(c.title)}</figcaption><img src="${cv.toDataURL("image/png")}" alt=""></figure>`; } catch (err) { return ""; } }).join("");
    const strip = (v) => { const d = document.createElement("div"); d.innerHTML = v == null ? "" : String(v); return d.textContent; };
    const ft = out.footer && rows.length ? out.footer(rows) : null;
    const tableHTML = rows.length ? `<table><thead><tr>${cols.map((c, i) => `<th class="${/t-right/.test(out.columns[i].cls || "") ? "r" : ""}">${esc(c.label)}</th>`).join("")}</tr></thead><tbody>
      ${rows.map((r) => `<tr>${cols.map((c, i) => { const col = out.columns[i]; const v = col.render && /money/.test(col.cls || "") ? strip(col.render(r)) : c.value(r); return `<td class="${/t-right/.test(col.cls || "") ? "r" : ""}">${esc(strip(v))}</td>`; }).join("")}</tr>`).join("")}</tbody>
      ${ft ? `<tfoot><tr class="tot">${out.columns.map((c) => `<td class="${/t-right/.test(c.cls || "") ? "r" : ""}">${esc(strip(ft[c.key] != null ? ft[c.key] : ""))}</td>`).join("")}</tr></tfoot>` : ""}</table>` : `<p class="muted">No records for the selected filters.</p>`;
    HH.printHTML(`${rep.title} Report`, `${cards}${imgs ? `<div class="charts">${imgs}</div>` : ""}<h2>Details <span class="muted">(${rows.length} rows)</span></h2>${tableHTML}<p class="muted" style="margin-top:8px">${esc(rep.hint || "")}</p>`, {
      subtitle: `${ctx.r.label}${ctx.all ? "" : ` (${U.fmtDate(ctx.r.from)} – ${U.fmtDate(ctx.r.to)})`}${rep.branch ? " · " + L.branchName(f.branch) : ""}`,
      css: ".card small{display:block;font-size:10px;margin-top:2px}.charts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:10px 0}figure{margin:0;border:1px solid #E1EAF5;border-radius:8px;padding:8px;break-inside:avoid}figcaption{font-weight:700;font-size:11px;margin-bottom:4px}figure img{width:100%;height:auto}table{font-size:10.5px}",
    });
  }

  window.addEventListener("hh:datachange", U.debounce(() => { if (current) { renderHead(); render(false); } }, 250));
  let rw = innerWidth;
  window.addEventListener("resize", U.debounce(() => { if ((rw < 576) !== (innerWidth < 576) && current) render(false); rw = innerWidth; }, 250));
})();
