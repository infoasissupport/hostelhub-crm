/* ==========================================================================
   HostelHub — Centralised localStorage persistence
   --------------------------------------------------------------------------
   HH.store.all(col)            -> array (live copy, do not mutate in place)
   HH.store.get(col, id)        -> record | undefined
   HH.store.insert(col, rec)    -> saved record (auto id if missing)
   HH.store.update(col, id, p)  -> merged record
   HH.store.upsert(col, rec)
   HH.store.remove(col, id)
   HH.store.setAll(col, arr)
   HH.store.settings() / saveSettings(obj)
   HH.store.pref(key, default) / setPref(key, value)    — UI preferences
   HH.store.nextId(col)         -> e.g. "RES-0233"
   HH.store.reset() / loadSample()
   Every write fires a "hh:datachange" event on window with detail { col }.
   ========================================================================== */
(function () {
  "use strict";
  const HH = (window.HH = window.HH || {});

  const NS = "hh:";
  const VERSION_KEY = NS + "__version";
  const COLLECTIONS = [
    "residents", "rooms", "messPlans", "messSubscriptions", "attendance", "menus", "vendors", "inventory",
    "stockTx", "invoices", "expenses", "staff", "staffAttendance", "salaries", "maintenance", "visitors",
    "complaints", "notices",
  ];
  const PREFIX = {
    residents: ["RES-", 4], rooms: ["RM-", 4], messPlans: ["MP-", 2], messSubscriptions: ["MS-", 4],
    menus: ["MN-", 4], vendors: ["VEN-", 2], inventory: ["ITM-", 3], stockTx: ["STX-", 4], invoices: ["INV-", 4],
    expenses: ["EXP-", 4], staff: ["STF-", 3], salaries: ["SAL-", 4], maintenance: ["MT-", 4], visitors: ["VIS-", 4],
    complaints: ["CMP-", 4], notices: ["NTC-", 3], payments: ["PAY-", 5],
  };

  const cache = {};
  let memoryOnly = false;

  function read(key, fallback) {
    if (key in cache) return cache[key];
    let val = fallback;
    try {
      const raw = localStorage.getItem(NS + key);
      if (raw != null) val = JSON.parse(raw);
    } catch (e) { /* storage blocked or corrupt — fall back */ }
    cache[key] = val;
    return val;
  }

  function write(key, val, silent) {
    cache[key] = val;
    if (!memoryOnly) {
      try { localStorage.setItem(NS + key, JSON.stringify(val)); }
      catch (e) {
        memoryOnly = true;
        console.warn("HostelHub: localStorage unavailable, changes kept in memory only.", e);
        HH.toast && HH.toast("Browser storage is full or blocked — changes will not survive a refresh.", "warning");
      }
    }
    if (!silent) window.dispatchEvent(new CustomEvent("hh:datachange", { detail: { col: key } }));
  }

  const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

  function seed(data) {
    COLLECTIONS.forEach((c) => write(c, data[c] || [], true));
    write("settings", data.settings, true);
    write("meta", data.meta, true);
    try { localStorage.setItem(VERSION_KEY, String(window.HH_DEMO.VERSION)); } catch (e) { /* ignore */ }
    window.dispatchEvent(new CustomEvent("hh:datachange", { detail: { col: "*" } }));
  }

  const store = {
    COLLECTIONS,
    init() {
      let v = null;
      try { v = localStorage.getItem(VERSION_KEY); } catch (e) { memoryOnly = true; }
      const hasData = (() => { try { return localStorage.getItem(NS + "residents") != null; } catch (e) { return false; } })();
      if (!hasData || String(v) !== String(window.HH_DEMO.VERSION)) {
        seed(window.HH_DEMO.build());
        return true; // freshly seeded
      }
      return false;
    },
    isMemoryOnly: () => memoryOnly,
    meta: () => read("meta", {}),

    all(col) { return read(col, []); },
    get(col, id) { return read(col, []).find((r) => r.id === id); },
    find(col, fn) { return read(col, []).find(fn); },
    filter(col, fn) { return read(col, []).filter(fn); },

    nextId(col, prefixOverride) {
      const [prefix, width] = prefixOverride ? [prefixOverride, 4] : PREFIX[col] || [col.slice(0, 3).toUpperCase() + "-", 4];
      const list = col === "payments" ? read("invoices", []).flatMap((i) => i.payments || []) : read(col, []);
      let max = 0;
      list.forEach((r) => {
        if (typeof r.id === "string" && r.id.startsWith(prefix)) {
          const n = parseInt(r.id.slice(prefix.length).replace(/\D/g, ""), 10);
          if (!isNaN(n) && n > max) max = n;
        }
      });
      return prefix + String(max + 1).padStart(width, "0");
    },

    insert(col, rec) {
      const list = read(col, []).slice();
      const item = clone(rec);
      if (!item.id) item.id = store.nextId(col);
      if (list.some((r) => r.id === item.id)) throw new Error(`Duplicate id ${item.id} in ${col}`);
      item.createdAt = item.createdAt || HH.util.todayISO();
      item.updatedAt = HH.util.nowISO();
      list.push(item);
      write(col, list);
      return item;
    },
    update(col, id, patch) {
      const list = read(col, []).slice();
      const idx = list.findIndex((r) => r.id === id);
      if (idx < 0) throw new Error(`Record ${id} not found in ${col}`);
      list[idx] = Object.assign({}, list[idx], clone(patch), { id, updatedAt: HH.util.nowISO() });
      write(col, list);
      return list[idx];
    },
    upsert(col, rec) {
      return rec.id && store.get(col, rec.id) ? store.update(col, rec.id, rec) : store.insert(col, rec);
    },
    remove(col, id) {
      const list = read(col, []);
      const next = list.filter((r) => r.id !== id);
      write(col, next);
      return list.length !== next.length;
    },
    setAll(col, arr) { write(col, arr); },

    settings() { return read("settings", {}); },
    saveSettings(obj) { write("settings", obj); },

    pref(key, def) { const p = read("prefs", {}); return key in p && p[key] != null ? p[key] : def; },
    setPref(key, value) { const p = Object.assign({}, read("prefs", {})); p[key] = value; write("prefs", p, true); },

    reset() {
      try {
        Object.keys(localStorage).filter((k) => k.startsWith(NS) && k !== NS + "session").forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* ignore */ }
      Object.keys(cache).forEach((k) => delete cache[k]);
      memoryOnly = false;
      seed(window.HH_DEMO.build());
    },
    /** Re-imports sample data but keeps UI preferences. */
    loadSample() {
      const prefs = read("prefs", {});
      store.reset();
      write("prefs", prefs, true);
    },
    exportAll() {
      const out = { meta: store.meta(), settings: store.settings() };
      COLLECTIONS.forEach((c) => (out[c] = store.all(c)));
      return out;
    },
    usageKB() {
      try { let n = 0; Object.keys(localStorage).forEach((k) => { if (k.startsWith(NS)) n += (localStorage.getItem(k) || "").length; }); return Math.round(n / 1024); }
      catch (e) { return 0; }
    },
  };

  // Keep other open tabs in sync
  window.addEventListener("storage", (e) => {
    if (!e.key || !e.key.startsWith(NS)) return;
    const k = e.key.slice(NS.length);
    delete cache[k];
    window.dispatchEvent(new CustomEvent("hh:datachange", { detail: { col: k, external: true } }));
  });

  HH.store = store;
})();
