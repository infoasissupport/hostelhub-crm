# HostelHub CRM — Functional Demo

A multi-page hostel management CRM built with **HTML5, custom CSS (Grid + Flexbox), Bootstrap 5.3 (modals, offcanvas, dropdowns, tooltips only), vanilla JavaScript, Bootstrap Icons and Chart.js**. Every screen works against a realistic sample dataset stored in the browser's `localStorage`. There is no backend.

> **Demo mode.** Payments are simulated and no e-mail, SMS or WhatsApp message is ever sent. All records live only in the browser you use.

---

## 1. Running the demo

The app is static files. Serve the folder with any simple local web server and open `index.html`.

**VS Code Live Server (recommended)**
1. Open the `HostelHub-CRM` folder in VS Code.
2. Install the *Live Server* extension (Ritwick Dey).
3. Right-click `index.html` → **Open with Live Server**.

**Alternatives**
```bash
# Python 3
cd HostelHub-CRM
python -m http.server 5500        # then open http://localhost:5500/

# Node
npx serve HostelHub-CRM
```

**Sign-in.** The demo credentials are pre-filled (`admin@hostelhub.demo`, any password of 4+ characters). Signing in only starts a demo session; it does not authenticate anyone.

**Internet access.** Bootstrap, Bootstrap Icons, Chart.js and the Google Fonts load from CDNs (jsDelivr and Google Fonts), so the first load needs a connection.

> The app does not rely on `fetch()` or ES modules, so it also opens from `file://`. A local server is still recommended: some browsers isolate `localStorage` per file path under `file://`, which can make data appear to reset between pages.

---

## 2. Demo data & persistence

* On first load, `js/demo-data.js` generates a consistent, related dataset. It is seeded relative to *today*, so the dashboard always shows current activity:
  * 232 residents and 84 rooms with 242 beds across 3 branches
  * 14 days of meal attendance and 3 weeks of menus
  * 10 months of invoices and payments, and 10 months of expenses
  * staff, salaries, inventory and stock history, maintenance tickets, visitors, complaints and notices
* Data is stored under `hh:*` keys in `localStorage` and persists across navigation, refreshes and browser restarts.
* Sample data is seeded **only** when no data exists or when the schema version changes. Existing records are never overwritten on page load.
* **Reset Demo Data** asks for confirmation, then restores the original dataset in every module. **Load Sample Data** does the same but keeps display preferences. Both are in the profile menu (top right), on the sign-in screen and under **Settings → Demo Data**.
* `data/demo-data.json` is a snapshot of the generated dataset for reference or backup. You can export a full backup and import it again from **Settings → Demo Data**.
* Dashboard cards, charts, reports, notifications and module tables all read the same stored records. A change in any module shows up everywhere.

---

## 3. Project structure

```
HostelHub-CRM/
├── index.html              Sign-in screen (demo)
├── dashboard.html          Dashboard
├── pages/                  One HTML page per module (+ resident-details.html)
├── css/
│   ├── variables.css       Design tokens (colours, spacing, type, radius, shadows, motion)
│   ├── reset.css · layout.css · sidebar.css · header.css · dashboard.css
│   ├── components.css · forms.css · tables.css · charts.css · modals.css
│   ├── responsive.css      Breakpoints: 1480 / 1280 / 1100 / 992 / 768 / 576 + print
│   └── modules/*.css       Module-specific styles
├── js/
│   ├── demo-data.js        Seeded data generator (documents every collection's schema)
│   ├── storage.js          HH.store — localStorage CRUD, ids, versioning, reset
│   ├── common.js           Utilities, lookups, business calculations, modal/drawer/confirm,
│   │                       form builder, sortable/paginated table, CrudPage engine
│   ├── validation.js       Form validation & messages
│   ├── notifications.js    Toasts + header notification centre (derived from data)
│   ├── export.js           CSV export & print layouts
│   ├── navigation.js       Sidebar, header, mobile offcanvas, global search (Ctrl+K)
│   ├── app.js              Bootstrap: seeding, session, Chart.js theme, chrome
│   ├── dashboard.js        Dashboard KPIs & charts
│   └── modules/*.js        One script per module
├── assets/images/          logo, hostel, food, avatars (+ residents/staff placeholders)
└── data/demo-data.json     Snapshot of the sample dataset
```

Script load order on every page (all `defer`): Bootstrap bundle → Chart.js → `demo-data` → `storage` → `common` → `validation` → `notifications` → `export` → `navigation` → `app` → page script.

---

## 4. Modules

| Page | What you can do |
|---|---|
| **Dashboard** | KPI cards with trends and sparklines; meal attendance, occupancy, revenue vs expenses and expense breakdown charts; today's menu; quick actions; recent residents and transactions. Filters for branch, Today / This Week / This Month / This Year and a custom date range. Customisable widgets and quick actions, saved per browser. Every card, row and chart opens the related module. |
| **Residents** | Full CRUD with photo, guardian and emergency contacts, documents, branch, room and bed. Auto IDs. Search, tabs, filters, date range, sort, pagination, bulk actions, CSV export and print. Assign or transfer a room, check in, check out, change status. |
| **Resident profile** | Overview, fee history (invoices and payments), 14-day meal grid with 30-day attendance %, complaints, visitors, document upload and download, activity timeline, printable profile. |
| **Rooms & Beds** | Rooms CRUD, add or remove beds, bed map, occupancy analytics, assign or transfer residents. No double booking, no exceeding capacity. |
| **Mess Management** | Meal plans, subscriptions, daily meal counts, per-resident meal charges, mess invoice generation. |
| **Meal Attendance** | Mark Present / Absent / N/A by date and meal, individually or in bulk, with search and filters. One sheet per date and meal, so there are no duplicates. History with view, edit, delete, export and print. |
| **Menu Management** | Daily menus (unique per date and meal), copy a menu, day or week, weekly planner. |
| **Kitchen & Inventory** | Items, purchases, consumption (stock cannot go negative), authorised adjustments, history, vendors, low-stock and expiry alerts, valuation, CSV export. |
| **Fees & Payments / Invoices** | Line-item invoices with discount, tax and late fee. Full or partial simulated payments, cancellation, invoice and receipt printing, monthly invoice generation, payment history, outstanding fees report. |
| **Expenses** | CRUD with attachments, approval workflow (approve / reject), vendor payment summary, charts, print and export. |
| **Staff Management** | Staff CRUD, daily attendance sheets, payroll and salary records, reports. |
| **Maintenance** | Tickets with assignment, priority-based due dates, comments, work logs, status updates, overdue alerts, printable work orders. |
| **Visitors** | Registration, check-in and check-out, people currently inside, visit history, printable visitor passes. |
| **Complaints** | CRUD, assignment, status workflow with history, escalation to a maintenance ticket. |
| **Reports** | 17 reports in 6 groups, each with date and branch filters, summary cards, charts, tables, CSV export and print. |
| **Notices** | Create, edit, publish, unpublish, archive, duplicate and delete. Notice board, read/unread status, simulated delivery preview. |
| **Settings** | Hostel profile, branches, all lookup lists (in-use checks), preferences (date format, currency, tax, notifications), demo users and roles, demo data tools. |

**Global features**
* Header search across every record type: Ctrl+K, arrow keys, Enter.
* Notification centre built from live data: low stock, expiry, overdue fees and tickets, high-priority complaints, unread notices, visitors inside, pending approvals.
* Profile menu, collapsible sidebar (state is remembered), Bootstrap offcanvas navigation on mobile.
* Deep links: `?view=ID`, `?edit=ID`, `?action=add` (with prefill parameters) and `#tab` on every module.

---

## 5. Developer notes

* **CRUD engine.** Most list screens are a single `HH.CrudPage({...})` call (see `js/common.js` and `js/modules/residents.js`). It provides stats, tabs, search, filters, date range, a sortable paginated table, a row action menu, view / add / edit / delete with validation, Reset / Cancel / Close, unsaved-change warnings, CSV export of the filtered rows, print, bulk actions and deep links.
* **Business rules.** Rules shared across modules live in `HH.calc`. Examples: invoice totals and status, bed occupancy (derived from active residents, never stored twice), occupancy %, meal counts, stock value, overdue tickets.
* **Settings.** Lookups such as branches, room types, categories, meal types, payment methods and designations come from **Settings**. Modules never hard-code them.
* **Images.** Resident and staff photos use generated initials avatars unless a photo is uploaded. Uploaded photos are resized before storage.
* **Storage limits.** `localStorage` holds about 5 MB per site. The sample data uses about 1.3 MB. Attachments up to 350 KB are stored; larger files keep only their name and size.

---

## 6. Known demo limitations

* There is no real authentication or role-based access control. Roles and users are configurable records only.
* There is no real payment gateway, e-mail, SMS or WhatsApp. These actions are simulated and clearly labelled.
* Data is per browser. Use **Settings → Demo Data → Export / Import** to move it between machines.
* CDN libraries need an internet connection.
